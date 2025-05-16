import * as fs from 'fs';
import * as path from 'path';
import { ConfigFileOptions, GlobalCliOptions } from '../types/command-options';
import { MiniProgramAppJson } from '../types/miniprogram';
import { ConfigLoader } from './config-loader';
import { logger } from './debug-logger';
import { findAppJsonConfig } from './fs-finder';
import { loadTsConfigTypes } from './tsconfig-helper';

// Define the structure of the initialized context returned
interface CommandExecutionContext {
  projectRoot: string;
  miniappRoot: string;
  appJsonPath: string;
  appJsonContent: MiniProgramAppJson;
  fileTypes: string[];
  exclude: string[];
  essentialFilesList: string[];
  includeAssets: boolean;
  verboseLevel: number;
  verbose: boolean;
}

// Default file types list (consistent and comprehensive)
const DEFAULT_FILE_TYPES = 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs';

/**
 * Performs common initialization steps for CLI commands.
 * Resolves paths, loads config, merges options, extracts common settings.
 */
export async function initializeCommandContext(
  cliOptions: GlobalCliOptions,
): Promise<CommandExecutionContext> {
  // 1. Resolve Project Path and Set Logger Root
  const projectRoot = path.resolve(cliOptions.project);
  logger.setProjectRoot(projectRoot);
  logger.debug(`Resolved project root: ${projectRoot}`);
  if (!fs.existsSync(projectRoot)) {
    throw new Error(`Project directory does not exist: ${projectRoot}`);
  }

  // 2. Load config file
  const fileConfig = await ConfigLoader.loadConfig(cliOptions.config, projectRoot);
  logger.debug(`Loaded config file content:`, fileConfig);

  // 3. Merge options
  const mergedConfig = {
    ...fileConfig, // Spread file config over the base CLI options
    ...cliOptions,
  };

  // 3. Path Resolution
  const resolvePathIfNeeded = (p: string | undefined): string | undefined => {
    if (p && typeof p === 'string' && !path.isAbsolute(p)) {
      return path.resolve(projectRoot, p);
    }
    return p;
  };
  mergedConfig.miniappRoot = resolvePathIfNeeded(mergedConfig.miniappRoot);
  mergedConfig.appJsonPath = resolvePathIfNeeded(mergedConfig.appJsonPath);

  // --- Start: Auto-detection logic ---
  if (!mergedConfig.miniappRoot && !mergedConfig.appJsonPath) {
    logger.debug('miniappRoot and appJsonPath not specified, attempting auto-detection...');
    const detectedConfig = findAppJsonConfig(projectRoot);

    if (detectedConfig && detectedConfig !== 'ambiguous') {
      mergedConfig.miniappRoot = detectedConfig.miniappRoot;
      mergedConfig.appJsonPath = detectedConfig.appJsonPath;
    } else if (detectedConfig === 'ambiguous') {
      logger.debug(
        'Auto-detection resulted in ambiguity, leaving miniappRoot and appJsonPath undefined.',
      );
    } else {
      logger.debug('Auto-detection did not find a suitable app.json.');
    }
  }
  // --- End: Auto-detection logic ---
  logger.debug(`Final merged options:`, mergedConfig);

  // Process essential files
  const allEssentialFiles = processEssentialFiles(cliOptions, fileConfig, projectRoot);
  logger.debug(`Final essential files list (CLI/Config + tsconfig):`, allEssentialFiles);

  // 4. Extract common options
  const verbose = mergedConfig.verbose ?? false;
  const verboseLevel = mergedConfig.verboseLevel ?? 3;
  const miniappRoot = mergedConfig.miniappRoot ?? projectRoot;
  const appJsonPath = mergedConfig.appJsonPath;
  const exclude = mergedConfig.exclude ?? [];
  const essentialFilesList = (mergedConfig.essentialFiles as string[] | undefined) ?? [];
  const fileTypesString = mergedConfig.types ?? DEFAULT_FILE_TYPES;
  const fileTypes = fileTypesString.split(',').map((t: string) => t.trim());
  const includeAssets = mergedConfig.includeAssets ?? false;

  // Basic logging (can be expanded)
  logger.debug(`Project path: ${projectRoot}`);
  if (miniappRoot) logger.debug(`Using Miniapp root directory: ${miniappRoot}`);
  if (appJsonPath) logger.debug(`Using specific entry file: ${appJsonPath}`);

  // Resolve App.json
  const { appJsonPath: resolvedAppJsonPath, appJsonContent } = resolveAppJson(
    miniappRoot,
    appJsonPath,
    fileConfig?.appJsonContent,
  );

  return {
    projectRoot,
    miniappRoot,
    appJsonPath: resolvedAppJsonPath,
    appJsonContent,
    fileTypes,
    exclude,
    essentialFilesList,
    includeAssets,
    verboseLevel,
    verbose,
  };
}

/**
 * Extracts and processes essential files from CLI options and config file
 *
 * @param cliOptions CLI provided options that may contain essentialFiles
 * @param fileConfig Configuration file options that may contain essentialFiles
 * @param projectRoot Project root path for resolving relative paths
 * @returns Array of resolved essential file paths
 */
function processEssentialFiles(
  cliOptions: GlobalCliOptions,
  fileConfig: ConfigFileOptions | null,
  projectRoot: string,
): string[] {
  // Extract essential files from CLI or config
  let essentialFilesFromCliOrConfig: string[] = [];
  let essentialFilesSource: string | string[] | undefined = undefined;

  if (cliOptions.essentialFiles !== undefined) {
    essentialFilesSource = cliOptions.essentialFiles;
  } else if (fileConfig?.essentialFiles) {
    essentialFilesSource = fileConfig.essentialFiles;
  }

  if (essentialFilesSource) {
    essentialFilesFromCliOrConfig =
      typeof essentialFilesSource === 'string'
        ? essentialFilesSource.split(',').map((f) => f.trim())
        : Array.isArray(essentialFilesSource)
          ? essentialFilesSource
          : []; // Default to empty array if invalid type
  }

  // Resolve paths from CLI/Config
  const resolvedEssentialFromCliOrConfig = essentialFilesFromCliOrConfig.map((f) =>
    path.resolve(projectRoot, f),
  );

  // Load essential files from tsconfig.types
  const essentialFromTsConfig = loadTsConfigTypes(projectRoot);

  // Combine and deduplicate all essential files
  return [...new Set([...resolvedEssentialFromCliOrConfig, ...essentialFromTsConfig])];
}

/**
 * Resolves the app.json path and content based on user options or defaults.
 */
function resolveAppJson(
  miniappRoot: string,
  rawAppJsonPath?: string,
  appJsonContent?: MiniProgramAppJson,
): { appJsonPath: string; appJsonContent: MiniProgramAppJson } {
  // Result variables
  let appJsonPath: string = '';
  let effectiveAppJsonContent: MiniProgramAppJson = {} as MiniProgramAppJson; // Default to empty object

  // Priority 1: Use provided app.json content
  if (
    appJsonContent &&
    typeof appJsonContent === 'object' &&
    Object.keys(appJsonContent).length > 0
  ) {
    logger.info('使用提供的 appJsonContent 作为 app.json 结构。');
    effectiveAppJsonContent = appJsonContent;

    // If a path hint was provided, try to match it to an existing file
    if (rawAppJsonPath) {
      const potentialPath = path.resolve(miniappRoot, rawAppJsonPath);
      if (fs.existsSync(potentialPath)) {
        appJsonPath = potentialPath;
        logger.debug(`Found potential app.json path matching appJsonPath hint: ${appJsonPath}`);
      } else {
        logger.debug(
          `EntryFile hint given (${rawAppJsonPath}), but file not found at ${potentialPath}.`,
        );
      }
    }

    return { appJsonPath, appJsonContent: effectiveAppJsonContent };
  }

  // Priority 2: Use provided entry file path
  if (rawAppJsonPath) {
    const potentialPath = path.resolve(miniappRoot, rawAppJsonPath);
    if (fs.existsSync(potentialPath)) {
      logger.info(`使用自定义入口文件作为 app.json: ${potentialPath}`);
      appJsonPath = potentialPath;
      try {
        const content = fs.readFileSync(appJsonPath, 'utf-8');
        effectiveAppJsonContent = JSON.parse(content);
        return { appJsonPath, appJsonContent: effectiveAppJsonContent };
      } catch (error) {
        logger.error(`Failed to read or parse custom entry file ${appJsonPath}:`, error);
        throw new Error(`Failed to process entry file: ${appJsonPath}`);
      }
    } else {
      logger.warn(
        `Specified entry file '${rawAppJsonPath}' not found relative to miniapp root '${miniappRoot}'. Falling back to default app.json detection.`,
      );
    }
  }

  // Priority 3: Find default app.json
  const defaultAppJsonPath = path.resolve(miniappRoot, 'app.json');
  if (fs.existsSync(defaultAppJsonPath)) {
    logger.debug(`Found default app.json at: ${defaultAppJsonPath}`);
    appJsonPath = defaultAppJsonPath;
    try {
      const content = fs.readFileSync(appJsonPath, 'utf-8');
      effectiveAppJsonContent = JSON.parse(content);
    } catch (error) {
      logger.error(`Failed to read or parse default app.json ${appJsonPath}:`, error);
      throw new Error(`Failed to process default app.json`);
    }
  } else {
    logger.warn(
      'Could not find default app.json and no valid appJsonPath or appJsonContent provided. Proceeding with empty app configuration.',
    );
  }

  return { appJsonPath, appJsonContent: effectiveAppJsonContent };
}
