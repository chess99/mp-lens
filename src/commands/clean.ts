import chalk from 'chalk';
import * as fs from 'fs';
import inquirer from 'inquirer';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { CommandOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';

// Define the shape of the raw options passed from cli.ts
interface RawCleanOptions {
  // Global
  project: string;
  verbose?: boolean;
  verboseLevel?: number;
  config?: string;
  miniappRoot?: string;
  entryFile?: string;
  trace?: boolean;

  // Command specific
  types?: string;
  exclude?: string[];
  essentialFiles?: string;
  list?: boolean; // New: Replaces dryRun conceptually for listing only
  delete?: boolean; // New: Replaces yes for direct deletion

  [key: string]: any;
}

// Define CleanOptions extending CommandOptions
export interface CleanOptions extends CommandOptions {
  types?: string; // Keep this if types can be specified per command
  list?: boolean;
  delete?: boolean;
  // Allow any other config file options
  [key: string]: any;
}

/**
 * Cleans unused files: lists, prompts for deletion, or deletes directly.
 */
export async function clean(rawOptions: RawCleanOptions): Promise<void> {
  // === Use Shared Initialization ===
  const {
    projectRoot,
    mergedConfig,
    verbose,
    verboseLevel,
    miniappRoot,
    entryFile,
    exclude,
    essentialFilesList,
    fileTypes, // Use fileTypes calculated by init
    keepAssets, // Use keepAssets calculated by init
  } = await initializeCommandContext(rawOptions, 'clean');

  // === Extract Clean-Specific Options ===
  // Cast mergedConfig to CleanOptions for type safety
  const cleanConfig: CleanOptions = mergedConfig as CleanOptions;
  const listOnly = cleanConfig.list ?? false;
  const deleteDirectly = cleanConfig.delete ?? false;
  // Note: `types` is handled by initializeCommandContext now

  // === Log Clean-Specific Info ===
  // Common path/option logging is done in initializeCommandContext
  if (listOnly) logger.info(chalk.blue('ℹ️ List Mode: Files will be listed but NOT deleted.'));
  else if (deleteDirectly)
    logger.info(chalk.yellow('⚠️ Delete Mode: Files will be deleted WITHOUT confirmation.'));
  else logger.info('🧹 Starting unused file cleanup (will prompt before deletion)...');

  try {
    // Analyze project using options from context
    logger.info('Analyzing project to find unused files...');
    const { unusedFiles } = await analyzeProject(projectRoot, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel,
      miniappRoot,
      entryFile,
      entryContent: cleanConfig.entryContent,
      keepAssets,
    });

    if (unusedFiles.length === 0) {
      logger.info('✨ No unused files found.');
      return;
    }

    // Log files found
    logger.info(chalk.yellow(`Found ${unusedFiles.length} unused files:`));
    unusedFiles.forEach((file) => {
      const relativePath = path.relative(projectRoot, file);
      // Adjust log prefix based on mode
      let prefix = '[Action]';
      if (listOnly) prefix = chalk.blue('[List]');
      else if (deleteDirectly) prefix = chalk.red('[Delete]');
      else prefix = chalk.yellow('[Delete (Pending Confirmation)]');
      logger.info(`  ${prefix} ${relativePath}`);
    });
    console.log(); // Add spacing

    // If listOnly mode, we are done after listing
    if (listOnly) {
      logger.info('List mode complete. No files were changed.');
      return;
    }

    // Confirmation before action (only if not deleteDirectly)
    let proceed = deleteDirectly;
    if (!proceed) {
      // Prompt only if not in direct delete mode
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceedConfirm',
          message: `Proceed with deleting ${unusedFiles.length} files?`,
          default: false,
        },
      ]);
      proceed = answers.proceedConfirm;
    }

    if (!proceed) {
      logger.info('Operation cancelled.');
      return;
    }

    // Perform deletion if confirmed or if deleteDirectly was true
    logger.info(`Deleting ${unusedFiles.length} files...`);
    let processedCount = 0;
    let errorCount = 0;

    for (const file of unusedFiles) {
      try {
        const relativePath = path.relative(projectRoot, file);
        fs.unlinkSync(file);
        logger.debug(`Deleted: ${relativePath}`);
        processedCount++;
      } catch (err) {
        logger.error(`Failed to process file ${file}: ${(err as Error).message}`);
        errorCount++;
      }
    }

    // Final summary
    logger.info(chalk.green(`✅ Successfully deleted ${processedCount} files.`));
    if (errorCount > 0) {
      logger.error(chalk.red(` Encountered errors processing ${errorCount} files.`));
    }
  } catch (error) {
    logger.error(`Cleanup failed: ${(error as Error).message}`);
    const stack = (error as Error).stack;
    if (stack) {
      logger.debug(stack);
    }
    throw error; // Re-throw for CLI handler
  }
}
