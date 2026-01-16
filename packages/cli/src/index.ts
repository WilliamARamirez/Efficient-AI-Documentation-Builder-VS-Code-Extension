#!/usr/bin/env node

import dotenv from 'dotenv';
import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { updateCommand } from './commands/update.js';
import { statusCommand } from './commands/status.js';

// Load environment variables from .env file
dotenv.config();

const program = new Command();

program
  .name('codebase-docs')
  .description('Intelligent documentation system using Merkle trees and LLMs')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize documentation in the current project')
  .option('-f, --force', 'Force reinitialize even if already initialized')
  .action(async (options) => {
    try {
      await initCommand(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

program
  .command('status')
  .description('Check documentation status and show what needs updating')
  .action(async () => {
    try {
      await statusCommand();
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

program
  .command('update')
  .description('Update documentation for changed files')
  .option('-f, --force', 'Force regenerate all documentation')
  .action(async (options) => {
    try {
      await updateCommand(options);
    } catch (error) {
      console.error(chalk.red(`Error: ${error}`));
      process.exit(1);
    }
  });

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}

program.parse();
