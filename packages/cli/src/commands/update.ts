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

export async function updateCommand(options: { force?: boolean } = {}) {
  const cwd = process.cwd();
  const manifestPath = join(cwd, '.docs', 'manifest.json');

  console.log(chalk.blue('🔍 Scanning codebase...\n'));

  // Load config
  const config = loadConfig(cwd);

  // Build current tree
  const spinner = ora('Building Merkle tree...').start();
  const { tree: currentTree, rootHash } = buildCodeMerkleTree(cwd, config.exclude);
  const fileNodes = getFileNodes(currentTree);
  spinner.succeed(`Found ${fileNodes.length} files`);

  // Load previous manifest
  const manifest = loadManifest(manifestPath);

  if (!manifest) {
    console.log(chalk.yellow('\n⚠️  No manifest found. Run `codebase-docs init` first.\n'));
    return;
  }

  // Detect changes
  const changes = options.force
    ? { new: fileNodes, changed: [], unchanged: [], deleted: [] }
    : detectChanges(currentTree, manifest);

  const filesToProcess = [...changes.new, ...changes.changed].filter(
    node => node.type === 'file'
  );

  if (filesToProcess.length === 0) {
    console.log(chalk.green('\n✅ Documentation is already up to date!\n'));
    return;
  }

  console.log(chalk.bold(`\nFiles to process: ${filesToProcess.length}`));
  console.log(`  ${chalk.blue('New:')} ${changes.new.length}`);
  console.log(`  ${chalk.yellow('Changed:')} ${changes.changed.length}`);
  console.log(`  ${chalk.green('Unchanged:')} ${changes.unchanged.length} (skipping)\n`);

  // Initialize summarizer
  const summarizer = new Summarizer(config);

  // Process each file
  let processedCount = 0;
  let totalTokens = 0;

  for (const node of filesToProcess) {
    processedCount++;
    const prefix = `[${processedCount}/${filesToProcess.length}]`;
    const status = changes.new.includes(node) ? chalk.blue('new') : chalk.yellow('changed');

    const fileSpinner = ora(`${prefix} ${status} ${node.path}`).start();

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

      fileSpinner.succeed(
        `${prefix} ${status} ${node.path} ${chalk.gray(`(${nodeTokens} tokens)`)}`
      );
    } catch (error) {
      fileSpinner.fail(`${prefix} ${status} ${node.path} - ${chalk.red('Error')}`);
      console.error(chalk.red(`   ${error}`));
    }
  }

  // Update manifest
  console.log(chalk.blue('\n💾 Saving manifest...'));
  const updatedManifest = updateManifest(manifest, currentTree, rootHash);
  updatedManifest.stats = calculateStats(currentTree);
  saveManifest(manifestPath, updatedManifest);

  // Display summary
  console.log(chalk.green('\n✅ Documentation updated!\n'));
  console.log(chalk.bold('Statistics:'));
  console.log(`  Files processed: ${filesToProcess.length}`);
  console.log(`  Tokens used: ${totalTokens.toLocaleString()}`);
  console.log(`  Total tokens (all time): ${updatedManifest.stats.totalTokensUsed.toLocaleString()}`);
  console.log(`  Estimated cost this run: $${((totalTokens / 1_000_000) * 9).toFixed(2)}`);
  console.log(`  Total cost (all time): $${updatedManifest.stats.totalCost.toFixed(2)}`);

  if (changes.unchanged.length > 0) {
    const savedTokens = changes.unchanged.length * 1000; // Rough estimate
    const savedCost = (savedTokens / 1_000_000) * 9;
    console.log(
      chalk.green(`  💡 Saved ~$${savedCost.toFixed(2)} by skipping ${changes.unchanged.length} unchanged files!`)
    );
  }

  console.log(chalk.gray(`\n📝 Manifest saved to ${manifestPath}\n`));
}
