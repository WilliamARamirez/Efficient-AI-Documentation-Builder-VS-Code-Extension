import { writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { getDefaultConfig } from '../core/config.js';
import { createManifest, saveManifest } from '../core/manifest.js';

export async function initCommand(options: { force?: boolean } = {}) {
  const cwd = process.cwd();
  const docsDir = join(cwd, '.docs');
  const manifestPath = join(docsDir, 'manifest.json');
  const configPath = join(cwd, '.codedocs.json');

  console.log(chalk.blue('🚀 Initializing codebase documentation...\n'));

  // Check if already initialized
  if (existsSync(manifestPath) && !options.force) {
    console.log(chalk.yellow('⚠️  Documentation already initialized.'));
    console.log(chalk.gray('   Use --force to reinitialize.\n'));
    return;
  }

  // Create config file if it doesn't exist
  if (!existsSync(configPath)) {
    const defaultConfig = getDefaultConfig();
    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf-8');
    console.log(chalk.green('✓') + ' Created ' + chalk.cyan('.codedocs.json'));
  } else {
    console.log(chalk.gray('  .codedocs.json already exists'));
  }

  // Create empty manifest
  const manifest = createManifest('', undefined);
  saveManifest(manifestPath, manifest);
  console.log(chalk.green('✓') + ' Created ' + chalk.cyan('.docs/manifest.json'));

  // Update .gitignore
  const gitignorePath = join(cwd, '.gitignore');
  if (existsSync(gitignorePath)) {
    const gitignoreContent = require('fs').readFileSync(gitignorePath, 'utf-8');
    if (!gitignoreContent.includes('.docs/')) {
      require('fs').appendFileSync(gitignorePath, '\n# Codebase docs\n.docs/\n');
      console.log(chalk.green('✓') + ' Updated ' + chalk.cyan('.gitignore'));
    }
  }

  console.log(chalk.green('\n✅ Initialization complete!\n'));
  console.log('Next steps:');
  console.log(chalk.cyan('  1. Create a .env file and add your ANTHROPIC_API_KEY'));
  console.log(chalk.gray('     (Copy .env.example from the project root as a template)'));
  console.log(chalk.cyan('  2. Run `codebase-docs update` to generate documentation'));
  console.log(chalk.cyan('  3. Check .docs/manifest.json for results\n'));
}
