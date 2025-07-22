import chalk from 'chalk';
import * as fs from 'fs';
import inquirer from 'inquirer';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { CmdCleanOptions, GlobalCliOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';

/**
 * Cleans unused files: lists, prompts for deletion, or writes changes directly.
 */
export async function clean(
  cliOptions: GlobalCliOptions,
  cmdOptions: CmdCleanOptions,
): Promise<void> {
  const {
    projectRoot,
    verbose,
    verboseLevel,
    miniappRoot,
    appJsonPath,
    appJsonContent,
    exclude,
    essentialFilesList,
    fileTypes,
    includeAssets,
  } = await initializeCommandContext(cliOptions);

  const writeDirectly = cmdOptions.write ?? false;

  if (writeDirectly) logger.info(chalk.yellow('⚠️ 写入模式: 将直接删除未使用文件'));
  else logger.info('🧹 开始清理未使用文件 (变更前会提示确认)...');

  try {
    logger.info('正在分析项目以查找未使用文件...');
    const { unusedFiles } = await analyzeProject(projectRoot, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel,
      miniappRoot,
      appJsonPath,
      appJsonContent,
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
      const prefix = writeDirectly ? chalk.red('[将删除]') : chalk.yellow('[待确认删除]');
      logger.info(`  ${prefix} ${relativePath}`);
    });
    console.log(); // Add spacing

    // Confirmation before action (only if not writeDirectly)
    let proceed = writeDirectly;
    if (!proceed) {
      // Prompt only if not in direct write mode
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceedConfirm',
          message: `是否删除这 ${unusedFiles.length} 个文件?`,
          default: false,
        },
      ]);
      proceed = answers.proceedConfirm;
    }

    if (!proceed) {
      logger.info('操作已取消。');
      return;
    }

    // Perform deletion if confirmed or if writeDirectly was true
    logger.info(`正在删除 ${unusedFiles.length} 个文件...`);
    let processedCount = 0;
    let errorCount = 0;

    for (const file of unusedFiles) {
      try {
        const relativePath = path.relative(projectRoot, file);
        
        // Check if file exists before attempting deletion to avoid race conditions
        if (!fs.existsSync(file)) {
          logger.debug(`文件已不存在，跳过删除: ${relativePath}`);
          processedCount++;
          continue;
        }
        
        fs.unlinkSync(file);
        logger.debug(`已删除: ${relativePath}`);
        processedCount++;
      } catch (err) {
        const errorMessage = (err as Error).message;
        const relativePath = path.relative(projectRoot, file);
        
        // Handle specific error cases more gracefully
        if (errorMessage.includes('ENOENT')) {
          logger.debug(`文件在删除过程中消失，可能被其他进程删除: ${relativePath}`);
          processedCount++;
        } else {
          logger.error(`处理文件 ${relativePath} 失败: ${errorMessage}`);
          errorCount++;
        }
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
