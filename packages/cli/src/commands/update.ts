import { join } from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../core/config.js';
import { buildCodeMerkleTree, getFileNodes } from '../core/merkle-tree.js';
import {
  loadManifest,
  detectChanges,
  updateManifest,
  saveManifest,
  calculateStats,
} from '../core/manifest.js';
import { Summarizer } from '../llm/summarizer.js';
import { MerkleNode } from '../types/index.js';
import { validateApiKey, validateInitialized } from '../core/validation.js';

export async function updateCommand(options: { force?: boolean; quiet?: boolean } = {}) {
  const cwd = process.cwd();
  const manifestPath = join(cwd, '.docs', 'manifest.json');
  const quiet = options.quiet || false;

  // Validate project is initialized
  validateInitialized(cwd);

  // Load config
  const config = loadConfig(cwd);

  // Validate API key is configured (before doing any work)
  validateApiKey(config);

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
  const manifest = loadManifest(manifestPath)!;

  // Detect changes
  const changes = options.force
    ? { new: fileNodes, changed: [], unchanged: [], deleted: [] }
    : detectChanges(currentTree, manifest);

  const filesToProcess = [...changes.new, ...changes.changed].filter(
    node => node.type === 'file'
  );

  if (filesToProcess.length === 0) {
    if (!quiet) {
      console.log(chalk.green('\n✅ Documentation is already up to date!\n'));
    }
    return;
  }

  if (!quiet) {
    console.log(chalk.bold(`\nFiles to process: ${filesToProcess.length}`));
    console.log(`  ${chalk.blue('New:')} ${changes.new.length}`);
    console.log(`  ${chalk.yellow('Changed:')} ${changes.changed.length}`);
    console.log(`  ${chalk.green('Unchanged:')} ${changes.unchanged.length} (skipping)\n`);
  }

  // Initialize summarizer
  const summarizer = new Summarizer(config);

  // Process each file
  let processedCount = 0;
  let totalTokens = 0;

  for (const node of filesToProcess) {
    processedCount++;
    const prefix = `[${processedCount}/${filesToProcess.length}]`;
    const status = changes.new.includes(node) ? chalk.blue('new') : chalk.yellow('changed');

    const fileSpinner = quiet ? null : ora(`${prefix} ${status} ${node.path}`).start();

    try {
      const summaries = await summarizer.generateAllSummaries(node, cwd);
      node.summaries = summaries;
      node.lastAnalyzed = new Date().toISOString();

      // Calculate tokens used
      const nodeTokens = Object.values(summaries).reduce(
        (sum, summary) => sum + (summary?.tokens || 0),
        0
      );
      totalTokens += nodeTokens;

      if (fileSpinner) {
        fileSpinner.succeed(
          `${prefix} ${status} ${node.path} ${chalk.gray(`(${nodeTokens} tokens)`)}`
        );
      }
    } catch (error) {
      if (fileSpinner) {
        fileSpinner.fail(`${prefix} ${status} ${node.path} - ${chalk.red('Error')}`);
      }
      console.error(chalk.red(`❌ Error processing ${node.path}: ${error}`));
    }
  }

  // Update manifest
  if (!quiet) {
    console.log(chalk.blue('\n💾 Saving manifest...'));
  }
  const updatedManifest = updateManifest(manifest, currentTree, rootHash);
  updatedManifest.stats = calculateStats(currentTree);
  saveManifest(manifestPath, updatedManifest);

  // Display summary
  if (quiet) {
    // Minimal output for hooks
    console.log(chalk.green(`✅ Docs updated: ${filesToProcess.length} files, ${totalTokens.toLocaleString()} tokens, $${((totalTokens / 1_000_000) * 3).toFixed(2)}`));
  } else {
    // Full output for manual runs
    console.log(chalk.green('\n✅ Documentation updated!\n'));
    console.log(chalk.bold('Statistics:'));
    console.log(`  Files processed: ${filesToProcess.length}`);
    console.log(`  Tokens used: ${totalTokens.toLocaleString()}`);
    console.log(`  Total tokens (all time): ${updatedManifest.stats.totalTokensUsed.toLocaleString()}`);
    console.log(`  Estimated cost this run: $${((totalTokens / 1_000_000) * 3).toFixed(2)}`);
    console.log(`  Total cost (all time): $${updatedManifest.stats.totalCost.toFixed(2)}`);

    if (changes.unchanged.length > 0) {
      const savedTokens = changes.unchanged.length * 1000; // Rough estimate
      const savedCost = (savedTokens / 1_000_000) * 3;
      console.log(
        chalk.green(`  💡 Saved ~$${savedCost.toFixed(2)} by skipping ${changes.unchanged.length} unchanged files!`)
      );
    }

    console.log(chalk.gray(`\n📝 Manifest saved to ${manifestPath}\n`));
  }
}
