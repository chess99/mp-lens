import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { analyzeProject } from '../analyzer/analyzer.js';
import { CmdCleanOptions, GlobalCliOptions } from '../types/command-options.js';
import { initializeCommandContext } from '../utils/command-init.js';
import { logger } from '../utils/debug-logger.js';

/**
 * Creates a simple yes/no prompt using Node's readline module.
 */
function confirmPrompt(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

/**
 * Cleans unused files: lists, prompts for deletion, or writes changes directly.
 */
export async function clean(
  cliOptions: GlobalCliOptions,
  cmdOptions: CmdCleanOptions,
): Promise<void> {
  const context = await initializeCommandContext(cliOptions);
  const { projectRoot } = context;

  const writeDirectly = cmdOptions.write ?? false;

  if (writeDirectly) logger.info(chalk.yellow('⚠️ 写入模式: 将直接删除未使用文件'));
  else logger.info('🧹 开始清理未使用文件 (变更前会提示确认)...');

  try {
    logger.info('正在分析项目以查找未使用文件...');
    const { unusedFiles } = await analyzeProject(projectRoot, context);

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
      proceed = await confirmPrompt(`是否删除这 ${unusedFiles.length} 个文件?`);
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
        fs.unlinkSync(file);
        logger.debug(`已删除: ${relativePath}`);
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
