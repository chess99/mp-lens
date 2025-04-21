import chalk from 'chalk';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { ConfigLoader } from '../utils/config-loader';
import { logger } from '../utils/debug-logger';
import { isString, mergeOptions } from '../utils/options-merger';

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
  dryRun?: boolean;
  backup?: string;
  yes?: boolean;

  [key: string]: any;
}

/**
 * 删除未使用的文件
 */
export async function clean(rawOptions: RawCleanOptions): Promise<void> {
  // 1. Resolve Project Path and Set Logger Root
  const projectRoot = path.resolve(rawOptions.project);
  logger.setProjectRoot(projectRoot);
  logger.info(`Resolved project root: ${projectRoot}`);
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project directory does not exist: ${projectRoot}`);
  }

  // 2. Load config file
  const fileConfig = await ConfigLoader.loadConfig(rawOptions.config, projectRoot);
  logger.debug('Loaded config file content for clean:', fileConfig);

  // 3. Merge options
  const mergedConfig = mergeOptions(rawOptions, fileConfig, projectRoot);
  logger.debug('Final merged options for clean:', mergedConfig);

  // 4. Extract and type final options for this command
  const verbose = mergedConfig.verbose ?? false;
  const verboseLevel = mergedConfig.verboseLevel;
  const types = mergedConfig.types ?? 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs'; // Default types
  const exclude = mergedConfig.exclude ?? [];
  const essentialFilesList = (mergedConfig.essentialFiles as string[] | undefined) ?? [];
  const miniappRoot = mergedConfig.miniappRoot;
  const entryFile = mergedConfig.entryFile;
  const dryRun = mergedConfig.dryRun ?? false;
  const backup = mergedConfig.backup; // Resolved path or undefined
  const yes = mergedConfig.yes ?? false;

  // Validate required options
  if (!types) {
    throw new Error('Missing required option: --types must be provided via CLI or config file.');
  }

  // Log final options
  logger.info(`File types to clean: ${types}`);
  if (dryRun) logger.info(chalk.yellow('Dry Run Mode Enabled'));
  logger.info('🧹 Starting unused file cleanup...');
  logger.info(`Project path: ${projectRoot}`);
  if (miniappRoot) logger.info(`Using Miniapp root directory: ${miniappRoot}`);
  if (entryFile) logger.info(`Using specific entry file: ${entryFile}`);
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
    const { unusedFiles } = await analyzeProject(projectRoot, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel,
      miniappRoot,
      entryFile,
      entryContent: mergedConfig.entryContent,
    });

    if (unusedFiles.length === 0) {
      logger.info('✨ No unused files found.');
      return;
    }

    // Log files to be processed
    logger.info(chalk.yellow(`Found ${unusedFiles.length} unused files to process:`));
    unusedFiles.forEach((file) => {
      const relativePath = path.relative(projectRoot, file);
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
        const relativePath = path.relative(projectRoot, file);
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
