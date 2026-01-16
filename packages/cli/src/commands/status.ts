import { join } from 'path';
import chalk from 'chalk';
import { loadConfig } from '../core/config.js';
import { buildCodeMerkleTree, getFileNodes } from '../core/merkle-tree.js';
import { loadManifest, detectChanges } from '../core/manifest.js';

export async function statusCommand() {
  const cwd = process.cwd();
  const manifestPath = join(cwd, '.docs', 'manifest.json');

  console.log(chalk.blue('📊 Checking documentation status...\n'));

  // Load config and manifest
  const config = loadConfig(cwd);
  const manifest = loadManifest(manifestPath);

  if (!manifest) {
    console.log(chalk.yellow('⚠️  No manifest found. Run `codebase-docs init` first.\n'));
    return;
  }

  // Build current tree
  const { tree: currentTree, rootHash } = buildCodeMerkleTree(cwd, config.exclude);

  // Detect changes
  const changes = detectChanges(currentTree, manifest);

  // Display summary
  console.log(chalk.bold('Summary:'));
  console.log(`  Total files: ${getFileNodes(currentTree).length}`);
  console.log(`  ${chalk.green('Unchanged:')} ${changes.unchanged.length}`);
  console.log(`  ${chalk.yellow('Changed:')} ${changes.changed.length}`);
  console.log(`  ${chalk.blue('New:')} ${changes.new.length}`);
  console.log(`  ${chalk.red('Deleted:')} ${changes.deleted.length}`);

  // Quick check
  if (manifest.codeRootHash === rootHash) {
    console.log(chalk.green('\n✅ Documentation is up to date!\n'));
    return;
  }

  console.log(chalk.yellow('\n⚠️  Documentation needs updating.\n'));

  // Show changed files
  if (changes.changed.length > 0) {
    console.log(chalk.bold('Changed files:'));
    changes.changed.slice(0, 10).forEach(node => {
      console.log(`  ${chalk.yellow('•')} ${node.path}`);
    });
    if (changes.changed.length > 10) {
      console.log(chalk.gray(`  ... and ${changes.changed.length - 10} more`));
    }
    console.log();
  }

  // Show new files
  if (changes.new.length > 0) {
    console.log(chalk.bold('New files:'));
    changes.new.slice(0, 10).forEach(node => {
      console.log(`  ${chalk.blue('•')} ${node.path}`);
    });
    if (changes.new.length > 10) {
      console.log(chalk.gray(`  ... and ${changes.new.length - 10} more`));
    }
    console.log();
  }

  // Show deleted files
  if (changes.deleted.length > 0) {
    console.log(chalk.bold('Deleted files:'));
    changes.deleted.slice(0, 10).forEach(path => {
      console.log(`  ${chalk.red('•')} ${path}`);
    });
    if (changes.deleted.length > 10) {
      console.log(chalk.gray(`  ... and ${changes.deleted.length - 10} more`));
    }
    console.log();
  }

  console.log(chalk.cyan('Run `codebase-docs update` to regenerate documentation.\n'));

  // Show stats
  if (manifest.stats) {
    console.log(chalk.bold('Previous generation stats:'));
    console.log(`  Total tokens used: ${manifest.stats.totalTokensUsed.toLocaleString()}`);
    console.log(`  Estimated cost: $${manifest.stats.totalCost.toFixed(2)}`);
    console.log(`  Last updated: ${new Date(manifest.generatedAt).toLocaleString()}\n`);
  }
}
