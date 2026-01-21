import { join } from 'path';
import { createInterface } from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../core/config.js';
import { buildCodeMerkleTree, getFileNodes, getDirectoryNodes, sortByDepth } from '../core/merkle-tree.js';
import {
  loadManifest,
  detectChanges,
  updateManifest,
  saveManifest,
  calculateStats,
  mergeStaging,
} from '../core/manifest.js';
import { Summarizer } from '../llm/summarizer.js';
import { MerkleNode, VectorDocument, StagingFile } from '../types/index.js';
import { validateApiKey, validateInitialized } from '../core/validation.js';
import { VectorStore } from '../vector/index.js';
import { createEmbeddingProvider } from '../embeddings/index.js';
import {
  loadStaging,
  saveStaging,
  createStaging,
  addCompletedEntry,
  addFailedEntry,
  clearStaging,
  getCompletedPaths,
  getTotalTokensUsed,
} from '../core/staging.js';
import {
  acquireLock,
  releaseLock,
  checkLock,
  getLockInfo,
  setupLockCleanup,
} from '../core/lock.js';
import { withRetry } from '../llm/retry.js';
import { RateLimitError } from '../llm/errors.js';

/**
 * Prompts user for yes/no confirmation
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(message, answer => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

export async function updateCommand(options: { force?: boolean; quiet?: boolean; yes?: boolean } = {}) {
  const cwd = process.cwd();
  const docsDir = join(cwd, '.docs');
  const manifestPath = join(docsDir, 'manifest.json');
  const stagingPath = join(docsDir, 'staging.json');
  const lockPath = join(docsDir, '.update.lock');
  const quiet = options.quiet || false;

  // Validate project is initialized
  validateInitialized(cwd);

  // Load config
  const config = loadConfig(cwd);

  // Validate API key is configured (before doing any work)
  validateApiKey(config);

  // ========== ACQUIRE LOCK ==========
  if (checkLock(lockPath)) {
    const lockInfo = getLockInfo(lockPath);
    console.error(
      chalk.red(`❌ Another update is in progress (PID: ${lockInfo?.pid}, started: ${lockInfo?.startedAt})`)
    );
    console.error(chalk.gray('   If you believe this is stale, delete: ' + lockPath));
    process.exit(1);
  }

  try {
    acquireLock(lockPath);
  } catch (error) {
    console.error(chalk.red(`❌ Failed to acquire lock: ${error}`));
    process.exit(1);
  }

  // Register cleanup handler for SIGINT/SIGTERM
  const removeCleanupHandler = setupLockCleanup(lockPath);

  try {
    if (!quiet) {
      console.log(chalk.blue('🔍 Scanning codebase...\n'));
    }

    // Build current tree
    const spinner = quiet ? null : ora('Building Merkle tree...').start();
    const { tree: currentTree, rootHash } = buildCodeMerkleTree(cwd, config.exclude);
    const fileNodes = getFileNodes(currentTree);
    if (spinner) {
      spinner.succeed(`Found ${fileNodes.length} files`);
    }

    // Load previous manifest (guaranteed to exist after validateInitialized)
    let manifest = loadManifest(manifestPath)!;

    // ========== CRASH RECOVERY CHECK ==========
    let staging = loadStaging(stagingPath);
    let resumingFromCrash = false;

    if (staging) {
      if (staging.rootHash !== rootHash) {
        // Tree has changed since staging was created
        if (!quiet) {
          console.log(chalk.yellow('\n⚠️  Found stale staging file (codebase has changed)'));
        }

        if (!options.yes) {
          const discard = await promptConfirmation(
            chalk.yellow('Discard previous progress and start fresh? (y/n): ')
          );
          if (!discard) {
            console.log(chalk.gray('\nAborted. Please resolve staging file manually.\n'));
            return;
          }
        }

        // Discard stale staging
        clearStaging(stagingPath);
        staging = null;
      } else {
        // Resume from staging
        resumingFromCrash = true;
        const completedCount = staging.completed.length;
        const failedCount = staging.failed.length;

        if (!quiet) {
          console.log(chalk.yellow(`\n🔄 Resuming from previous run (${completedCount} completed, ${failedCount} failed)`));
        }

        // Merge any completed work into manifest before continuing
        if (completedCount > 0) {
          manifest = mergeStaging(manifest, currentTree, staging);
          saveManifest(manifestPath, manifest);

          // Update tree nodes with staged summaries
          for (const entry of staging.completed) {
            if (currentTree[entry.path]) {
              currentTree[entry.path].summaries = entry.summaries;
              currentTree[entry.path].lastAnalyzed = entry.completedAt;
            }
          }
        }
      }
    }

    // Detect changes
    const changes = options.force
      ? { new: fileNodes, changed: [], unchanged: [], deleted: [] }
      : detectChanges(currentTree, manifest);

    let filesToProcess = [...changes.new, ...changes.changed].filter(
      node => node.type === 'file'
    );

    // Filter out already-completed files from staging (for resume)
    if (staging && resumingFromCrash) {
      const completedPaths = getCompletedPaths(staging);
      const originalCount = filesToProcess.length;
      filesToProcess = filesToProcess.filter(node => !completedPaths.has(node.path));

      if (!quiet && originalCount !== filesToProcess.length) {
        console.log(chalk.gray(`   Skipping ${originalCount - filesToProcess.length} already-processed files`));
      }
    }

    if (filesToProcess.length === 0) {
      if (!quiet) {
        console.log(chalk.green('\n✅ Documentation is already up to date!\n'));
      }
      clearStaging(stagingPath);
      return;
    }

    if (!quiet) {
      console.log(chalk.bold(`\nFiles to process: ${filesToProcess.length}`));
      console.log(`  ${chalk.blue('New:')} ${changes.new.length}`);
      console.log(`  ${chalk.yellow('Changed:')} ${changes.changed.length}`);
      console.log(`  ${chalk.green('Unchanged:')} ${changes.unchanged.length} (skipping)\n`);

      // Display file list in copy-pastable format for exclude array
      console.log(chalk.bold('Files that will be documented:'));
      console.log(chalk.gray('(Copy any paths below to add to "exclude" in .codedocsrc.json)\n'));

      for (const node of filesToProcess) {
        console.log(`  "${node.path}",`);
      }
      console.log('');

      // Prompt for confirmation (skip if --yes flag is provided)
      if (!options.yes) {
        const confirmed = await promptConfirmation(
          chalk.yellow('Proceed with documentation generation? (y/n): ')
        );

        if (!confirmed) {
          console.log(chalk.gray('\nAborted. No files were processed.\n'));
          clearStaging(stagingPath);
          return;
        }
        console.log('');
      }
    }

    // Initialize summarizer
    const summarizer = new Summarizer(config);

    // ========== PROCESSING LOOP WITH PERIODIC BUNDLING ==========
    const bundleThreshold = config.bundleThreshold ?? 5;
    let pendingCount = 0;
    let processedCount = 0;
    let totalTokens = staging ? getTotalTokensUsed(staging) : 0;
    let rateLimitHit = false;

    // Create fresh staging if not resuming
    if (!staging) {
      staging = createStaging(rootHash);
    }

    for (const node of filesToProcess) {
      processedCount++;
      const prefix = `[${processedCount}/${filesToProcess.length}]`;
      const status = changes.new.includes(node) ? chalk.blue('new') : chalk.yellow('changed');

      const fileSpinner = quiet ? null : ora(`${prefix} ${status} ${node.path}`).start();

      try {
        // Use retry logic for API calls
        const summaries = await withRetry(
          () => summarizer.generateAllSummaries(node, cwd),
          { maxRetries: 3, initialDelayMs: 1000 }
        );

        node.summaries = summaries;
        node.lastAnalyzed = new Date().toISOString();

        // Calculate tokens used
        const nodeTokens = Object.values(summaries).reduce(
          (sum, summary) => sum + (summary?.tokens || 0),
          0
        );
        totalTokens += nodeTokens;

        // Add to staging
        staging = addCompletedEntry(
          staging,
          node.path,
          node.fileHash || '',
          summaries,
          nodeTokens
        );
        saveStaging(stagingPath, staging);
        pendingCount++;

        if (fileSpinner) {
          fileSpinner.succeed(
            `${prefix} ${status} ${node.path} ${chalk.gray(`(${nodeTokens} tokens)`)}`
          );
        }

        // Periodic bundle every N files
        if (pendingCount >= bundleThreshold) {
          if (!quiet) {
            console.log(chalk.gray(`   💾 Bundling ${pendingCount} files into manifest...`));
          }

          manifest = mergeStaging(manifest, currentTree, staging);
          manifest.stats = calculateStats(currentTree);
          saveManifest(manifestPath, manifest);

          // Reset staging (keep failed entries)
          const failedEntries = staging.failed;
          staging = createStaging(rootHash);
          staging.failed = failedEntries;
          saveStaging(stagingPath, staging);
          pendingCount = 0;
        }
      } catch (error) {
        if (fileSpinner) {
          fileSpinner.fail(`${prefix} ${status} ${node.path} - ${chalk.red('Error')}`);
        }

        // Get existing retry count if any
        const existingFailed = staging.failed.find(f => f.path === node.path);
        const retryCount = (existingFailed?.retryCount || 0) + 1;
        const isRateLimited = error instanceof RateLimitError;

        staging = addFailedEntry(
          staging,
          node.path,
          node.fileHash || '',
          error instanceof Error ? error.message : String(error),
          retryCount,
          isRateLimited
        );
        saveStaging(stagingPath, staging);

        if (isRateLimited) {
          rateLimitHit = true;
          console.error(chalk.yellow(`\n⚠️  Rate limit hit. Progress saved. Re-run to continue.`));
          break;
        } else {
          console.error(chalk.red(`❌ Error processing ${node.path}: ${error}`));
        }
      }
    }

    // ========== DIRECTORY PROCESSING ==========
    // Process directories bottom-up (deepest first) so children are always documented before parents
    if (!rateLimitHit) {
      const allDirectories = getDirectoryNodes(currentTree);
      // Exclude root "." and filter to directories with documented children
      const directoriesToProcess = sortByDepth(
        allDirectories.filter(dir => {
          if (dir.path === '.') return false;
          // Check if any child has summaries
          const hasDocumentedChildren = (dir.children || []).some(childPath => {
            const child = currentTree[childPath];
            return child?.summaries?.engineering;
          });
          if (!hasDocumentedChildren) return false;

          // Check if directory needs updating:
          // 1. Directory doesn't have summaries yet
          // 2. Directory's childrenHash changed from manifest
          const manifestNode = manifest.nodes[dir.path];
          const needsUpdate =
            !dir.summaries?.engineering ||
            !manifestNode ||
            manifestNode.childrenHash !== dir.childrenHash;
          return needsUpdate;
        }),
        true // deepest first
      );

      if (directoriesToProcess.length > 0 && !quiet) {
        console.log(chalk.blue(`\n📁 Processing ${directoriesToProcess.length} directories...`));
      }

      let dirProcessedCount = 0;
      for (const dirNode of directoriesToProcess) {
        dirProcessedCount++;
        const prefix = `[${dirProcessedCount}/${directoriesToProcess.length}]`;

        const dirSpinner = quiet ? null : ora(`${prefix} ${chalk.cyan('dir')} ${dirNode.path}`).start();

        try {
          // Use retry logic for API calls
          const summaries = await withRetry(
            () => summarizer.generateDirectorySummary(dirNode, currentTree),
            { maxRetries: 3, initialDelayMs: 1000 }
          );

          // Skip if no summaries generated (e.g., no children with summaries)
          if (!summaries.engineering) {
            if (dirSpinner) {
              dirSpinner.info(`${prefix} ${chalk.cyan('dir')} ${dirNode.path} ${chalk.gray('(skipped - no children summaries)')}`);
            }
            continue;
          }

          dirNode.summaries = summaries;
          dirNode.lastAnalyzed = new Date().toISOString();

          // Calculate tokens used
          const nodeTokens = Object.values(summaries).reduce(
            (sum, summary) => sum + (summary?.tokens || 0),
            0
          );
          totalTokens += nodeTokens;

          // Add to staging
          staging = addCompletedEntry(
            staging,
            dirNode.path,
            dirNode.childrenHash || '',
            summaries,
            nodeTokens
          );
          saveStaging(stagingPath, staging);
          pendingCount++;

          if (dirSpinner) {
            dirSpinner.succeed(
              `${prefix} ${chalk.cyan('dir')} ${dirNode.path} ${chalk.gray(`(${nodeTokens} tokens)`)}`
            );
          }

          // Periodic bundle every N items
          if (pendingCount >= bundleThreshold) {
            if (!quiet) {
              console.log(chalk.gray(`   💾 Bundling ${pendingCount} items into manifest...`));
            }

            manifest = mergeStaging(manifest, currentTree, staging);
            manifest.stats = calculateStats(currentTree);
            saveManifest(manifestPath, manifest);

            // Reset staging (keep failed entries)
            const failedEntries = staging.failed;
            staging = createStaging(rootHash);
            staging.failed = failedEntries;
            saveStaging(stagingPath, staging);
            pendingCount = 0;
          }
        } catch (error) {
          if (dirSpinner) {
            dirSpinner.fail(`${prefix} ${chalk.cyan('dir')} ${dirNode.path} - ${chalk.red('Error')}`);
          }

          const isRateLimited = error instanceof RateLimitError;

          staging = addFailedEntry(
            staging,
            dirNode.path,
            dirNode.childrenHash || '',
            error instanceof Error ? error.message : String(error),
            1,
            isRateLimited
          );
          saveStaging(stagingPath, staging);

          if (isRateLimited) {
            rateLimitHit = true;
            console.error(chalk.yellow(`\n⚠️  Rate limit hit. Progress saved. Re-run to continue.`));
            break;
          } else {
            console.error(chalk.red(`❌ Error processing directory ${dirNode.path}: ${error}`));
          }
        }
      }
    }

    // ========== FINAL BUNDLE ==========
    if (staging.completed.length > 0) {
      if (!quiet) {
        console.log(chalk.blue('\n💾 Saving final manifest...'));
      }
      manifest = mergeStaging(manifest, currentTree, staging);
      manifest.stats = calculateStats(currentTree);
      saveManifest(manifestPath, manifest);
    }

    // Only clear staging if all files were processed successfully
    if (!rateLimitHit && staging.failed.length === 0) {
      clearStaging(stagingPath);
    }

    // Generate embeddings if enabled (for successfully processed files and directories)
    const successfulFileNodes = filesToProcess.filter(node => node.summaries);
    const successfulDirNodes = getDirectoryNodes(currentTree).filter(
      node => node.path !== '.' && node.summaries?.engineering
    );
    const successfulNodes = [...successfulFileNodes, ...successfulDirNodes];

    if (config.embeddings?.enabled && successfulNodes.length > 0) {
      if (!quiet) {
        console.log(chalk.blue('\n🔗 Generating embeddings...'));
      }

      try {
        const embeddingProvider = createEmbeddingProvider(config);
        const vectorStore = new VectorStore(docsDir);
        await vectorStore.initialize(embeddingProvider.getDimensions());

        const embeddingSpinner = quiet ? null : ora('Embedding documentation...').start();
        const embeddingDocs: VectorDocument[] = [];
        let embeddingTokens = 0;

        for (const node of successfulNodes) {
          // Use fileHash for files, childrenHash for directories
          const nodeHash = node.type === 'file' ? (node.fileHash || '') : (node.childrenHash || '');

          if (node.summaries?.engineering) {
            const embedding = await embeddingProvider.embed(node.summaries.engineering.content);
            embeddingTokens += embedding.tokens;

            embeddingDocs.push({
              id: `${node.path}:engineering`,
              vector: embedding.vector,
              path: node.path,
              content: node.summaries.engineering.content,
              audience: 'engineering',
              fileHash: nodeHash,
              embeddedAt: new Date().toISOString(),
            });
          }

          if (node.summaries?.product) {
            const embedding = await embeddingProvider.embed(node.summaries.product.content);
            embeddingTokens += embedding.tokens;

            embeddingDocs.push({
              id: `${node.path}:product`,
              vector: embedding.vector,
              path: node.path,
              content: node.summaries.product.content,
              audience: 'product',
              fileHash: nodeHash,
              embeddedAt: new Date().toISOString(),
            });
          }

          if (node.summaries?.executive) {
            const embedding = await embeddingProvider.embed(node.summaries.executive.content);
            embeddingTokens += embedding.tokens;

            embeddingDocs.push({
              id: `${node.path}:executive`,
              vector: embedding.vector,
              path: node.path,
              content: node.summaries.executive.content,
              audience: 'executive',
              fileHash: nodeHash,
              embeddedAt: new Date().toISOString(),
            });
          }
        }

        await vectorStore.upsert(embeddingDocs);

        // Handle deleted files - remove from vector store
        for (const deletedPath of changes.deleted) {
          await vectorStore.deleteByPath(deletedPath);
        }

        if (embeddingSpinner) {
          embeddingSpinner.succeed(
            `Embedded ${embeddingDocs.length} documents (${embeddingTokens.toLocaleString()} tokens)`
          );
        }
      } catch (error) {
        console.error(chalk.yellow(`\n⚠️  Warning: Could not generate embeddings: ${error}`));
        console.error(chalk.yellow('   Semantic search will not be available.'));
      }
    }

    // ========== REPORT RESULTS ==========
    const failedFiles = staging?.failed || [];

    if (quiet) {
      // Minimal output for hooks
      const successCount = successfulNodes.length;
      console.log(chalk.green(`✅ Docs updated: ${successCount} files, ${totalTokens.toLocaleString()} tokens, $${((totalTokens / 1_000_000) * 3).toFixed(2)}`));
      if (failedFiles.length > 0) {
        console.log(chalk.yellow(`⚠️  ${failedFiles.length} files failed`));
      }
    } else {
      // Full output for manual runs
      console.log(chalk.green('\n✅ Documentation updated!\n'));
      console.log(chalk.bold('Statistics:'));
      console.log(`  Files processed: ${successfulNodes.length}`);
      console.log(`  Tokens used: ${totalTokens.toLocaleString()}`);
      console.log(`  Total tokens (all time): ${manifest.stats.totalTokensUsed.toLocaleString()}`);
      console.log(`  Estimated cost this run: $${((totalTokens / 1_000_000) * 3).toFixed(2)}`);
      console.log(`  Total cost (all time): $${manifest.stats.totalCost.toFixed(2)}`);

      if (changes.unchanged.length > 0) {
        const savedTokens = changes.unchanged.length * 1000; // Rough estimate
        const savedCost = (savedTokens / 1_000_000) * 3;
        console.log(
          chalk.green(`  💡 Saved ~$${savedCost.toFixed(2)} by skipping ${changes.unchanged.length} unchanged files!`)
        );
      }

      // Report failed files
      if (failedFiles.length > 0) {
        console.log(chalk.yellow(`\n⚠️  ${failedFiles.length} files failed:`));
        for (const failed of failedFiles) {
          const rateLimitTag = failed.isRateLimited ? chalk.red(' [rate-limited]') : '';
          console.log(chalk.gray(`   - ${failed.path}${rateLimitTag}`));
        }
        console.log(chalk.yellow('\n   Re-run the update command to retry failed files.'));
      }

      console.log(chalk.gray(`\n📝 Manifest saved to ${manifestPath}\n`));
    }
  } finally {
    // ========== RELEASE LOCK ==========
    removeCleanupHandler();
    releaseLock(lockPath);
  }
}
