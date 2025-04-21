import * as fs from 'fs';
import path from 'path';
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

// Define the shape of the raw options passed from cli.ts
// Includes global options and command-specific options
interface RawListUnusedOptions {
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
  outputFormat?: 'text' | 'json';
  output?: string;

  [key: string]: any; // Allow other properties from commander
}

/**
 * 列出未使用的文件
 */
export async function listUnused(rawOptions: RawListUnusedOptions): Promise<void> {
  // 1. Resolve Project Path and Set Logger Root
  const projectRoot = path.resolve(rawOptions.project);
  logger.setProjectRoot(projectRoot); // Set root for logger context
  logger.info(`Resolved project root: ${projectRoot}`);
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project directory does not exist: ${projectRoot}`);
  }

  // 2. Load config file (using resolved project root)
  const fileConfig = await ConfigLoader.loadConfig(rawOptions.config, projectRoot);
  logger.debug('Loaded config file content:', fileConfig);

  // 3. Merge options using shared utility
  // Pass rawOptions which contains both global and command flags
  const mergedConfig = mergeOptions(rawOptions, fileConfig, projectRoot);
  logger.debug('Merged config from file and CLI:', mergedConfig);

  // 4. Extract and type final options for this command from mergedConfig
  const verbose = mergedConfig.verbose ?? false; // Already set by logger setup, but good to have
  const verboseLevel = mergedConfig.verboseLevel;
  // Provide default types if not specified anywhere
  const types = mergedConfig.types ?? 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs';
  const exclude = mergedConfig.exclude ?? [];
  const outputFormat = mergedConfig.outputFormat ?? 'text';
  const output = mergedConfig.output; // Path resolved in mergeOptions
  const essentialFilesList = (mergedConfig.essentialFiles as string[] | undefined) ?? []; // string[] | undefined from mergeOptions
  const miniappRoot = mergedConfig.miniappRoot; // Path resolved in mergeOptions
  const entryFile = mergedConfig.entryFile; // Path resolved in mergeOptions

  // Log final options
  logger.info(`Analyzing file types: ${types}`);
  logger.info(`Project path: ${projectRoot}`);

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

    // Call analyzeProject with final options
    // Pass projectRoot (absolute path), not mergedConfig.project
    const { unusedFiles } = await analyzeProject(projectRoot, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose,
      verboseLevel: verboseLevel,
      miniappRoot, // Pass resolved path
      entryFile, // Pass resolved path
      entryContent: mergedConfig.entryContent, // Pass if present in config
    });

    // Format output
    const formatterOptions: FormatterOutputOptions = {
      format: outputFormat,
      projectRoot: projectRoot, // Use absolute path
      miniappRoot: miniappRoot, // Use resolved path
    };
    const formattedOutput = formatOutput(unusedFiles, formatterOptions);

    // Handle output
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
    throw error; // Re-throw for cli.ts handler
  }
}
