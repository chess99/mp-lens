import chalk from 'chalk';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { CommandOptions } from '../types/command-options';
import { ConfigLoader } from '../utils/config-loader';
import { logger } from '../utils/debug-logger';
import { isString, mergeOptions } from '../utils/options-merger';

// Define CleanOptions based on CommandOptions and specific clean args
export interface CleanOptions extends CommandOptions {
  types: string;
  exclude?: string[];
  essentialFiles?: string | string[]; // Allow array from config
  dryRun?: boolean; // Allow undefined initially
  backup?: string;
  yes?: boolean; // Allow undefined initially
  miniappRoot?: string;
  entryFile?: string;
  // Allow any config file options to be present after merge
  [key: string]: any;
}

/**
 * 删除未使用的文件
 */
export async function clean(options: CleanOptions): Promise<void> {
  // 1. Load config
  const fileConfig = await ConfigLoader.loadConfig(undefined, options.project);
  logger.debug('Loaded config file content for clean:', fileConfig);

  // 2. Merge options
  const mergedConfig = mergeOptions(options, fileConfig, options.project);
  logger.debug('Final merged options for clean:', mergedConfig);

  // 3. Extract and type options for this command
  const project = mergedConfig.project;
  const verbose = mergedConfig.verbose ?? false;
  const verboseLevel = mergedConfig.verboseLevel;
  const types = mergedConfig.types;
  const exclude = mergedConfig.exclude ?? [];
  // Essential files are already resolved to string[] | undefined
  const essentialFilesList = (mergedConfig.essentialFiles as string[] | undefined) ?? [];
  const miniappRoot = mergedConfig.miniappRoot;
  const entryFile = mergedConfig.entryFile;
  const dryRun = mergedConfig.dryRun ?? false; // Default to false
  const backup = mergedConfig.backup; // Already resolved path or undefined
  const yes = mergedConfig.yes ?? false; // Default to false

  // Validate required options
  if (!types) {
    throw new Error('Missing required option: --types must be provided via CLI or config file.');
  }

  logger.debug('clean processing with final options:', mergedConfig);
  logger.info('🧹 Starting unused file cleanup...');
  logger.info(`Project path: ${project}`);
  if (miniappRoot) logger.info(`Using Miniapp root directory: ${miniappRoot}`);
  if (entryFile) logger.info(`Using specific entry file: ${entryFile}`);
  logger.info(`File types to analyze: ${types}`);
  if (exclude.length > 0) logger.debug(`Exclude patterns: ${exclude.join(', ')}`);

  if (dryRun) {
    logger.info(chalk.yellow('⚠️ Dry Run Mode: Files will be listed but NOT deleted or moved.'));
  }
  if (backup) {
    logger.info(`Backup directory: ${backup}`);
  }

  try {
    // Safety Check using final options
    if (!dryRun && !backup && !yes) {
      logger.warn('This operation will permanently delete files.');
      logger.warn('Use --dry-run to preview, or --backup <dir> to move files instead.');
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: 'Are you sure you want to continue?',
          default: false,
        },
      ]);
      if (!answers.proceed) {
        logger.info('Operation cancelled.');
        return;
      }
    }

    // Analyze project using final options
    const fileTypes = types.split(',').map((t) => t.trim());
    logger.info('Analyzing project to find unused files...');
    const { unusedFiles } = await analyzeProject(project, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel,
      miniappRoot,
      entryFile,
    });

    if (unusedFiles.length === 0) {
      logger.info('✨ No unused files found.');
      return;
    }

    // Log files to be processed
    logger.info(chalk.yellow(`Found ${unusedFiles.length} unused files to process:`));
    unusedFiles.forEach((file) => {
      const relativePath = path.relative(project, file);
      logger.info(`  ${dryRun ? '[Dry Run] ' : backup ? '[Backup] ' : '[Delete] '}${relativePath}`);
    });
    console.log(); // Add spacing

    // Confirmation before action (using final options)
    let proceed = yes || dryRun;
    if (!proceed && !backup) {
      // Don't ask again if backing up (already warned)
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceedConfirm',
          message: `Proceed with ${backup ? 'backing up' : 'deleting'} ${
            unusedFiles.length
          } files?`,
          default: false,
        },
      ]);
      proceed = answers.proceedConfirm;
    }

    if (!proceed) {
      logger.info('Operation cancelled.');
      return;
    }

    // Perform actions (using final options)
    if (dryRun) {
      logger.info('Dry run complete. No files were changed.');
      return;
    }

    let processedCount = 0;
    let errorCount = 0;

    if (isString(backup)) {
      logger.info(`Backing up files to ${backup}...`);
      if (!fs.existsSync(backup)) {
        fs.mkdirSync(backup, { recursive: true });
      }
    }

    for (const file of unusedFiles) {
      try {
        const relativePath = path.relative(project, file);
        if (isString(backup)) {
          const backupPath = path.join(backup, relativePath);
          const backupDir = path.dirname(backupPath);
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }
          fs.renameSync(file, backupPath);
          logger.debug(`Backed up: ${relativePath} -> ${backupPath}`);
        } else {
          // Deletion logic
          fs.unlinkSync(file);
          logger.debug(`Deleted: ${relativePath}`);
        }
        processedCount++;
      } catch (err) {
        logger.error(`Failed to process file ${file}: ${(err as Error).message}`);
        errorCount++;
      }
    }

    // Final summary (using final options)
    if (isString(backup)) {
      logger.info(chalk.green(`✅ Successfully backed up ${processedCount} files to ${backup}.`));
    } else {
      if (!mergedConfig.backup) {
        logger.info(chalk.green(`✅ Successfully deleted ${processedCount} files.`));
      }
    }
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
