import * as path from 'path';
import { analyzeProject } from '../../analyzer/analyzer';
import { CmdGraphOptions, GlobalCliOptions } from '../../types/command-options';
import { initializeCommandContext } from '../../utils/command-init';
import { logger } from '../../utils/debug-logger';
import { HandledError } from '../../utils/errors';
import { generateHtmlGraph, generateJsonGraph } from './graph-utils';

/**
 * 生成项目依赖图
 */
export async function graph(
  cliOptions: GlobalCliOptions,
  cmdOptions: CmdGraphOptions,
): Promise<void> {
  const context = await initializeCommandContext(cliOptions);
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
  } = context;

  // === Extract Graph-Specific Options (Now correctly typed) ===
  const format = cmdOptions.format ?? 'html';
  const output = cmdOptions.output;

  // === Handle Output Path (Graph Specific) ===
  let outputPathAbsolute: string | undefined = undefined;
  if (output) {
    outputPathAbsolute = path.isAbsolute(output) ? output : path.resolve(process.cwd(), output);
    logger.info(`已解析输出路径: ${outputPathAbsolute}`);
  }

  // === Log Graph-Specific Options ===
  logger.info(`输出格式: ${format}`);
  // Note: Common path logging is done in initializeCommandContext
  if (outputPathAbsolute) logger.info(`输出文件: ${outputPathAbsolute}`);

  try {
    logger.info('正在分析项目依赖...');
    // No need to recalculate fileTypes

    // Call analyzeProject with options from context
    const { projectStructure, reachableNodeIds, unusedFiles } = await analyzeProject(projectRoot, {
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

    logger.info('正在渲染依赖图...');

    // Generate output based on format
    if (format === 'html') {
      await generateHtmlGraph(
        projectStructure,
        reachableNodeIds,
        unusedFiles,
        projectRoot,
        outputPathAbsolute,
      );
    } else if (format === 'json') {
      generateJsonGraph(projectStructure, outputPathAbsolute);
    } else {
      throw new HandledError(`不支持的输出格式: ${format}`);
    }
  } catch (error) {
    logger.error(`依赖图生成失败: ${(error as Error).message}`);
    const stack = (error as Error).stack;
    if (stack) {
      logger.debug(stack);
    }
    throw error;
  }
}
