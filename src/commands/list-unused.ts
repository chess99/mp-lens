import * as fs from 'fs';
import { analyzeProject } from '../analyzer/analyzer';
import { CommandOptions } from '../types/command-options';
import { logger } from '../utils/debug-logger';
import { formatOutput } from '../utils/output-formatter';

/**
 * 用于list-unused命令的选项接口
 */
export interface ListUnusedOptions extends CommandOptions {
  types: string;
  exclude: string[];
  outputFormat: 'text' | 'json';
  output?: string;
  essentialFiles?: string;
  miniappRoot?: string;
  entryFile?: string;
  verboseLevel?: number;
}

/**
 * 列出未使用的文件
 */
export async function listUnused(options: ListUnusedOptions): Promise<void> {
  const {
    project,
    verbose,
    types,
    exclude,
    outputFormat,
    output,
    essentialFiles,
    miniappRoot,
    entryFile,
  } = options;

  // Log passed options at debug level
  logger.debug('list-unused received options:', options);
  logger.debug('Project path:', project);
  logger.debug('File types:', types);

  if (miniappRoot) {
    logger.debug('Miniapp root:', miniappRoot);
  }

  if (entryFile) {
    logger.debug('Entry file:', entryFile);
  }

  logger.info('🔍 Starting project dependency analysis...');
  logger.info(`Project path: ${project}`);

  if (miniappRoot) {
    logger.info(`Miniapp root directory: ${miniappRoot}`);
  }

  logger.info(`File types to analyze: ${types}`);

  if (exclude && exclude.length > 0) {
    logger.debug(`Exclude patterns: ${exclude.join(', ')}`);
  }

  if (essentialFiles) {
    logger.debug(`Essential files: ${essentialFiles}`);
  }

  if (entryFile) {
    logger.debug(`Entry file: ${entryFile}`);
  }

  try {
    // 分析项目获取未使用文件列表
    const fileTypes = types.split(',').map((t) => t.trim());

    // 处理必要文件选项
    const essentialFilesList = essentialFiles ? essentialFiles.split(',').map((f) => f.trim()) : [];

    // 使用analyzer模块分析项目
    const { unusedFiles } = await analyzeProject(project, {
      fileTypes,
      excludePatterns: exclude || [],
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel: options.verboseLevel,
      miniappRoot,
      entryFile,
    });

    // 格式化输出
    const formattedOutput = formatOutput(unusedFiles, {
      format: outputFormat,
      projectRoot: project,
    });

    // 判断是否需要输出到文件
    if (output) {
      fs.writeFileSync(output, formattedOutput);
      logger.info(`✅ Unused files list saved to: ${output}`);
    } else {
      // 输出到控制台
      console.log(formattedOutput);
    }

    // 输出统计信息
    logger.info(`Found ${unusedFiles.length} unused files`);
  } catch (error) {
    logger.error(`Analysis failed: ${(error as Error).message}`);
    throw error;
  }
}
