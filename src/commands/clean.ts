import chalk from 'chalk';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { ConfigLoader } from '../utils/config-loader';
import { logger } from '../utils/debug-logger';
import { mergeOptions } from '../utils/options-merger';

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
  const yes = mergedConfig.yes ?? false;

  // Validate required options
  if (!types) {
    throw new Error('Missing required option: --types must be provided via CLI or config file.');
  }

  // Log final options
  logger.info(`File types to clean: ${types}`);
  if (dryRun)
    logger.info(chalk.yellow('⚠️ Dry Run Mode: Files will be listed but NOT deleted or moved.'));
  logger.info('🧹 Starting unused file cleanup...');
  logger.info(`Project path: ${projectRoot}`);
  if (miniappRoot) logger.info(`Using Miniapp root directory: ${miniappRoot}`);
  if (entryFile) logger.info(`Using specific entry file: ${entryFile}`);
  if (exclude.length > 0) logger.debug(`Exclude patterns: ${exclude.join(', ')}`);

  try {
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
      logger.info(`  ${dryRun ? '[Dry Run] ' : '[Delete] '}${relativePath}`);
    });
    console.log(); // Add spacing

    // Confirmation before action (using final options)
    let proceed = yes || dryRun;
    if (!proceed) {
      logger.warn('Use --dry-run to preview.');
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

    // Perform actions (using final options)
    if (dryRun) {
      logger.info('Dry run complete. No files were changed.');
      return;
    }

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

    // Final summary (using final options)
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
