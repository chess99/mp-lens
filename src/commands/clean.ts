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
interface CleanOptions extends CommandOptions {
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
    includeAssets, // Use includeAssets calculated by init
  } = await initializeCommandContext(rawOptions, 'clean');

  // === Extract Clean-Specific Options ===
  // Cast mergedConfig to CleanOptions for type safety
  const cleanConfig: CleanOptions = mergedConfig as CleanOptions;
  const listOnly = cleanConfig.list ?? false;
  const deleteDirectly = cleanConfig.delete ?? false;
  // Note: `types` is handled by initializeCommandContext now

  // === Log Clean-Specific Info ===
  // Common path/option logging is done in initializeCommandContext
  if (listOnly) logger.info(chalk.blue('ℹ️ 列表模式: 文件将被列出但不会被删除。'));
  else if (deleteDirectly) logger.info(chalk.yellow('⚠️ 删除模式: 文件将被直接删除而无需确认。'));
  else logger.info('🧹 开始清理未使用文件 (删除前会提示)...');

  try {
    // Analyze project using options from context
    logger.info('正在分析项目以查找未使用文件...');
    const { unusedFiles } = await analyzeProject(projectRoot, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel,
      miniappRoot,
      entryFile,
      entryContent: cleanConfig.entryContent,
      includeAssets,
    });

    if (unusedFiles.length === 0) {
      logger.info('✨ 未找到未使用文件。');
      return;
    }

    // Log files found
    logger.info(chalk.yellow(`发现 ${unusedFiles.length} 个未使用文件:`));
    unusedFiles.forEach((file) => {
      const relativePath = path.relative(projectRoot, file);
      // Adjust log prefix based on mode
      let prefix = '[Action]';
      if (listOnly) prefix = chalk.blue('[列表]');
      else if (deleteDirectly) prefix = chalk.red('[删除]');
      else prefix = chalk.yellow('[删除 (待确认)]');
      logger.info(`  ${prefix} ${relativePath}`);
    });
    console.log(); // Add spacing

    // If listOnly mode, we are done after listing
    if (listOnly) {
      logger.info('列表模式完成。未更改任何文件。');
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
          message: `是否继续删除 ${unusedFiles.length} 个文件?`,
          default: false,
        },
      ]);
      proceed = answers.proceedConfirm;
    }

    if (!proceed) {
      logger.info('操作已取消。');
      return;
    }

    // Perform deletion if confirmed or if deleteDirectly was true
    logger.info(`正在删除 ${unusedFiles.length} 个文件...`);
    let processedCount = 0;
    let errorCount = 0;

    for (const file of unusedFiles) {
      try {
        const relativePath = path.relative(projectRoot, file);
        fs.unlinkSync(file);
        logger.debug(`Deleted: ${relativePath}`);
        processedCount++;
      } catch (err) {
        logger.error(`处理文件 ${file} 失败: ${(err as Error).message}`);
        errorCount++;
      }
    }

    // Final summary
    logger.info(chalk.green(`✅ 成功删除 ${processedCount} 个文件。`));
    if (errorCount > 0) {
      logger.error(chalk.red(` 处理 ${errorCount} 个文件时遇到错误。`));
    }
  } catch (error) {
    logger.error(`清理失败: ${(error as Error).message}`);
    const stack = (error as Error).stack;
    if (stack) {
      logger.debug(stack);
    }
    throw error; // Re-throw for CLI handler
  }
}
