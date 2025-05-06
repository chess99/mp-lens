import * as fs from 'fs';
import * as path from 'path';
import { CommandOptions } from '../types/command-options';
import { ConfigLoader } from './config-loader';
import { logger } from './debug-logger';
import { mergeOptions } from './options-merger';

// Define the structure for the raw options received by commands
interface RawCommandOptions {
  project: string;
  config?: string;
  [key: string]: any; // Allow other command-specific options
}

// Define the structure of the initialized context returned
interface CommandExecutionContext {
  projectRoot: string;
  mergedConfig: CommandOptions; // Contains all merged options
  verbose: boolean;
  verboseLevel: number | undefined;
  miniappRoot: string | undefined;
  entryFile: string | undefined;
  exclude: string[];
  essentialFilesList: string[];
  fileTypes: string[];
  includeAssets: boolean;
}

// Default file types list (consistent and comprehensive)
const DEFAULT_FILE_TYPES = 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs';

/**
 * Performs common initialization steps for CLI commands.
 * Resolves paths, loads config, merges options, extracts common settings.
 */
export async function initializeCommandContext(
  rawOptions: RawCommandOptions,
  commandName: string, // e.g., 'graph', 'clean' for logging
): Promise<CommandExecutionContext> {
  // 1. Resolve Project Path and Set Logger Root
  const projectRoot = path.resolve(rawOptions.project);
  logger.setProjectRoot(projectRoot);
  logger.info(`Resolved project root: ${projectRoot}`);
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project directory does not exist: ${projectRoot}`);
  }

  // 2. Load config file
  const fileConfig = await ConfigLoader.loadConfig(rawOptions.config, projectRoot);
  logger.debug(`Loaded config file content for ${commandName}:`, fileConfig);

  // 3. Merge options
  const mergedConfig = mergeOptions(rawOptions, fileConfig, projectRoot);
  logger.debug(`Final merged options for ${commandName}:`, mergedConfig);

  // 4. Extract common options
  const verbose = mergedConfig.verbose ?? false;
  const verboseLevel = mergedConfig.verboseLevel;
  const miniappRoot = mergedConfig.miniappRoot;
  const entryFile = mergedConfig.entryFile;
  const exclude = mergedConfig.exclude ?? [];
  const essentialFilesList = (mergedConfig.essentialFiles as string[] | undefined) ?? [];
  const fileTypesString = mergedConfig.types ?? DEFAULT_FILE_TYPES;
  const fileTypes = fileTypesString.split(',').map((t: string) => t.trim());
  const includeAssets = mergedConfig.includeAssets ?? false;

  // Basic logging (can be expanded)
  logger.info(`Project path: ${projectRoot}`);
  if (miniappRoot) logger.info(`Using Miniapp root directory: ${miniappRoot}`);
  if (entryFile) logger.info(`Using specific entry file: ${entryFile}`);

  return {
    projectRoot,
    mergedConfig,
    verbose,
    verboseLevel,
    miniappRoot,
    entryFile,
    exclude,
    essentialFilesList,
    fileTypes,
    includeAssets,
  };
}
