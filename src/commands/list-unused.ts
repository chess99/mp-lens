import * as fs from 'fs';
import { analyzeProject } from '../analyzer/analyzer';
import { CommandOptions, OutputOptions as FormatterOutputOptions } from '../types/command-options';
import { ConfigLoader } from '../utils/config-loader';
import { logger } from '../utils/debug-logger';
import { isString, mergeOptions } from '../utils/options-merger';
import { formatOutput } from '../utils/output-formatter';

/**
 * 用于list-unused命令的选项接口
 */
export interface ListUnusedOptions extends CommandOptions {
  types: string;
  exclude?: string[];
  outputFormat?: 'text' | 'json';
  output?: string;
  essentialFiles?: string | string[];
  miniappRoot?: string;
  entryFile?: string;
  verboseLevel?: number;
  [key: string]: any;
}

/**
 * 列出未使用的文件
 */
export async function listUnused(options: ListUnusedOptions): Promise<void> {
  const fileConfig = await ConfigLoader.loadConfig(undefined, options.project);
  logger.debug('Loaded config file content:', fileConfig);

  const mergedConfig = mergeOptions(options, fileConfig, options.project);
  logger.debug('Merged config from file and CLI:', mergedConfig);

  const project = mergedConfig.project;
  const verbose = mergedConfig.verbose ?? false;
  const verboseLevel = mergedConfig.verboseLevel;
  const types = mergedConfig.types;
  const exclude = mergedConfig.exclude ?? [];
  const outputFormat = mergedConfig.outputFormat ?? 'text';
  const output = mergedConfig.output;
  const essentialFilesList = (mergedConfig.essentialFiles as string[] | undefined) ?? [];
  const miniappRoot = mergedConfig.miniappRoot;
  const entryFile = mergedConfig.entryFile;

  if (!types) {
    throw new Error('Missing required option: --types must be provided via CLI or config file.');
  }

  logger.debug('list-unused processing with final options:', {
    project,
    verbose,
    types,
    exclude,
    outputFormat,
    output,
    essentialFiles: essentialFilesList,
    miniappRoot,
    entryFile,
    verboseLevel,
  });
  logger.info(`Project path: ${project}`);

  if (miniappRoot) {
    logger.info(`Using Miniapp root directory: ${miniappRoot}`);
  }
  if (entryFile) {
    logger.info(`Using specific entry file: ${entryFile}`);
  }

  logger.info(`File types to analyze: ${types}`);

  if (exclude.length > 0) {
    logger.debug(`Exclude patterns: ${exclude.join(', ')}`);
  }

  if (essentialFilesList.length > 0) {
    logger.debug(`Essential files: ${essentialFilesList.join(', ')}`);
  }

  try {
    const fileTypes = types.split(',').map((t) => t.trim());

    const { unusedFiles } = await analyzeProject(project, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel: verboseLevel,
      miniappRoot,
      entryFile,
    });

    const formatterOptions: FormatterOutputOptions = {
      format: outputFormat,
      projectRoot: project,
      miniappRoot: miniappRoot,
    };
    const formattedOutput = formatOutput(unusedFiles, formatterOptions);

    if (isString(output)) {
      fs.writeFileSync(output, formattedOutput);
      logger.info(`✅ Unused files list saved to: ${output}`);
    } else {
      console.log(formattedOutput);
    }

    logger.info(`Found ${unusedFiles.length} unused files`);
  } catch (error) {
    logger.error(`Analysis failed: ${(error as Error).message}`);
    const stack = (error as Error).stack;
    if (stack) {
      logger.debug(stack);
    }
    throw error;
  }
}
