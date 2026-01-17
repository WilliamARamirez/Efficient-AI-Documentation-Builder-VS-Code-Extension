import { existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';
import { Config } from '../types/index.js';

/**
 * Validates that an API key is available
 * Throws a helpful error if not found
 */
export function validateApiKey(config: Config): string {
  const apiKey = config.llm?.apiKey || process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.error(chalk.red('\n❌ Error: Anthropic API key not found!\n'));
    console.error('Please set your API key using one of these methods:\n');

    console.error(chalk.bold('Option 1: Environment file (Recommended)'));
    console.error('  1. Create a .env file in your project root');
    console.error('  2. Add the following line:');
    console.error(chalk.cyan('     ANTHROPIC_API_KEY=your-api-key-here'));
    console.error('  3. Get your API key from: https://console.anthropic.com/settings/keys\n');

    console.error(chalk.bold('Option 2: Environment variable'));
    console.error(chalk.cyan('  export ANTHROPIC_API_KEY="your-api-key-here"\n'));

    console.error(chalk.bold('Option 3: Config file (not recommended for security)'));
    console.error('  Add to .codedocs.json:');
    console.error(chalk.cyan('  { "llm": { "apiKey": "your-api-key-here" } }\n'));

    throw new Error('API key not configured');
  }

  return apiKey;
}

/**
 * Checks if the project is initialized
 */
export function validateInitialized(cwd: string): void {
  const manifestPath = join(cwd, '.docs', 'manifest.json');

  if (!existsSync(manifestPath)) {
    console.error(chalk.red('\n❌ Error: Project not initialized!\n'));
    console.error('Please run the following command first:');
    console.error(chalk.cyan('  codebase-docs init\n'));
    throw new Error('Project not initialized');
  }
}
