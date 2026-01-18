import { writeFileSync, existsSync, readFileSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { getDefaultConfig } from '../core/config.js';
import { createManifest, saveManifest } from '../core/manifest.js';

// Get the CLI's dist directory path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_INDEX_PATH = join(__dirname, '..', 'index.js');

export async function initCommand(options: { force?: boolean } = {}) {
  const cwd = process.cwd();
  const docsDir = join(cwd, '.docs');
  const manifestPath = join(docsDir, 'manifest.json');
  const configPath = join(cwd, '.codedocsrc.json');

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
    console.log(chalk.green('✓') + ' Created ' + chalk.cyan('.codedocsrc.json'));
  } else {
    console.log(chalk.gray('  .codedocsrc.json already exists'));
  }

  // Create empty manifest
  const manifest = createManifest('', undefined);
  saveManifest(manifestPath, manifest);
  console.log(chalk.green('✓') + ' Created ' + chalk.cyan('.docs/manifest.json'));

  // Create .mcp.json for Claude Code integration
  const mcpConfigPath = join(cwd, '.mcp.json');
  if (!existsSync(mcpConfigPath)) {
    const mcpConfig = {
      mcpServers: {
        'codebase-docs': {
          command: 'node',
          args: [CLI_INDEX_PATH, 'serve'],
        },
      },
    };
    writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');
    console.log(chalk.green('✓') + ' Created ' + chalk.cyan('.mcp.json') + chalk.gray(' (for Claude Code MCP integration)'));
  } else {
    console.log(chalk.gray('  .mcp.json already exists'));
  }

  // Update .gitignore
  const gitignorePath = join(cwd, '.gitignore');
  const gitignoreEntries: string[] = [];

  if (existsSync(gitignorePath)) {
    const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
    if (!gitignoreContent.includes('.docs/')) {
      gitignoreEntries.push('.docs/');
    }
    if (!gitignoreContent.includes('.mcp.json')) {
      gitignoreEntries.push('.mcp.json');
    }
    if (gitignoreEntries.length > 0) {
      appendFileSync(gitignorePath, '\n# Codebase docs\n' + gitignoreEntries.join('\n') + '\n');
      console.log(chalk.green('✓') + ' Updated ' + chalk.cyan('.gitignore'));
    }
  }

  console.log(chalk.green('\n✅ Initialization complete!\n'));
  console.log('Next steps:');
  console.log(chalk.cyan('  1. Create a .env file and add your ANTHROPIC_API_KEY'));
  console.log(chalk.gray('     (Copy .env.example from the project root as a template)'));
  console.log(chalk.cyan('  2. Run: `codebase-docs update`'));
  console.log(chalk.cyan('  3. Restart Claude Code to enable MCP integration'));
  console.log(chalk.gray('     The .mcp.json file was created for automatic discovery'));
  console.log(chalk.cyan('  4. (Optional) Install git hook: `codebase-docs install-hook`'));
  console.log(chalk.gray('     This auto-updates docs after each commit\n'));
}
