import * as fs from 'fs';
import * as path from 'path';
import { ConfigFileOptions, GlobalCliOptions } from '../types/command-options';
import { MiniProgramAppJson } from '../types/miniprogram';
import { ConfigLoader } from './config-loader';
import { logger } from './debug-logger';
import { HandledError } from './errors';
import { findAppJsonConfig } from './fs-finder';
import { loadTsConfigTypes } from './tsconfig-helper';

// Define the structure of the initialized context returned
interface CommandExecutionContext {
  projectRoot: string;
  miniappRoot: string;
  appJsonPath: string;
  appJsonContent: MiniProgramAppJson;
  fileTypes: string[];
  excludePatterns: string[];
  essentialFiles: string[];
  includeAssets: boolean;
  verboseLevel: number;
  verbose: boolean;
  aliases?: {
    [key: string]: string | string[];
  };
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
    throw new HandledError(`Project directory does not exist: ${projectRoot}`);
  }

  // 2. Load config file
  const fileConfig = await ConfigLoader.loadConfig(cliOptions.config, projectRoot);
  logger.debug(`Loaded config file content:`, fileConfig);

  // 3. Merge options
  // Merge with care: CLI should only override when value is explicitly provided
  const mergedConfig = {
    ...(fileConfig || {}),
    ...Object.fromEntries(
      Object.entries(cliOptions).filter(([, v]) => v !== undefined && v !== null),
    ),
  } as Partial<GlobalCliOptions & ConfigFileOptions>;

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

  // Load and merge aliases from multiple sources
  const aliasesFromTsConfig = loadAliasesFromTsConfig(projectRoot);
  // Priority (low -> high): tsconfig < mp-lens.config.* (通过 ConfigLoader 加载)
  const mergedAliases: { [key: string]: string | string[] } = {
    ...aliasesFromTsConfig,
    ...(fileConfig?.aliases || {}),
  };
  const hasMergedAliases = Object.keys(mergedAliases).length > 0;
  if (hasMergedAliases) {
    logger.debug(`Loaded aliases from sources (merged):`, mergedAliases);
  }

  // 4. Extract common options
  const verbose = mergedConfig.verbose ?? false;
  const verboseLevel = mergedConfig.verboseLevel ?? 3;
  const miniappRoot = mergedConfig.miniappRoot ?? projectRoot;
  const appJsonPath = mergedConfig.appJsonPath;
  // Exclude: centralized initialization (defaults + .gitignore + config + CLI)
  const excludePatterns = buildExcludePatterns(
    projectRoot,
    fileConfig?.exclude,
    cliOptions.exclude,
  );

  // Essential files: use the fully merged result from processEssentialFiles
  const essentialFiles = allEssentialFiles;
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
    excludePatterns,
    essentialFiles,
    includeAssets,
    verboseLevel,
    verbose,
    aliases: mergedAliases,
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
        throw new HandledError(`Failed to process entry file: ${appJsonPath}`);
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
      throw new HandledError(`Failed to process default app.json: ${appJsonPath}`);
    }
  } else {
    logger.warn(
      'Could not find default app.json and no valid appJsonPath or appJsonContent provided. Proceeding with empty app configuration.',
    );
  }

  return { appJsonPath, appJsonContent: effectiveAppJsonContent };
}

// === Alias loading helpers (pure functions) ===

function loadAliasesFromTsConfig(projectRoot: string): { [key: string]: string[] } {
  try {
    const fsPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(fsPath)) return {};
    const tsconfig = JSON.parse(fs.readFileSync(fsPath, 'utf-8')) as {
      compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
    };
    if (!tsconfig.compilerOptions || !tsconfig.compilerOptions.paths) return {};

    const tsconfigDir = path.dirname(fsPath);
    const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
    const baseDir = path.resolve(tsconfigDir, baseUrl);

    const result: { [key: string]: string[] } = {};
    for (const [alias, targets] of Object.entries(tsconfig.compilerOptions.paths)) {
      const normalizedAlias = alias.replace(/\/\*$/, '');
      result[normalizedAlias] = (targets as string[]).map((t) => {
        const targetPath = (t as string).replace(/\/\*$/, '');
        return path.resolve(baseDir, targetPath);
      });
    }
    return result;
  } catch (e) {
    logger.warn(`无法解析 tsconfig.json 以加载别名: ${(e as Error).message}`);
    return {};
  }
}

// === Exclude building helpers ===

const DEFAULT_EXCLUDE_PATTERNS = [
  // Dependencies
  '**/node_modules/**',
  '**/miniprogram_npm/**',

  // VCS
  '.git/**',
  '.svn/**',
  '.hg/**',

  // Caches
  '.cache/**',
  '.parcel-cache/**',
  '.turbo/**',

  // Build outputs and artifacts
  'dist/**',
  'build/**',
  '.next/**',
  'out/**',
  'coverage/**',
  'tmp/**',
  'temp/**',

  // Tests (files/dirs typically not part of runtime)
  '**/__tests__/**',
  '**/*.spec.js',
  '**/*.spec.ts',
  '**/*.test.js',
  '**/*.test.ts',

  // Root-level project meta/config files
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'tsconfig.json',
  'tsconfig.*.json',
  'jsconfig.json',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
];

function buildExcludePatterns(
  projectRoot: string,
  configExclude?: string[],
  cliExclude?: string[],
): string[] {
  const gitignore = loadGitignoreExcludes(projectRoot);
  const parts = [
    ...DEFAULT_EXCLUDE_PATTERNS,
    ...gitignore,
    ...(Array.isArray(configExclude) ? configExclude : []),
    ...(Array.isArray(cliExclude) ? cliExclude : []),
  ];
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const p of parts) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    unique.push(p);
  }
  logger.debug('Final merged exclude patterns:', unique);
  return unique;
}

function loadGitignoreExcludes(projectRoot: string): string[] {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return [];
  try {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const globs: string[] = [];
    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;
      if (line.startsWith('!')) continue; // Ignore negations for exclude context

      const isDir = line.endsWith('/');
      let pattern = line.replace(/^\//, '');

      if (isDir && !pattern.endsWith('**')) {
        pattern = pattern + '**';
      }

      if (!pattern.includes('/') && !pattern.includes('*')) {
        pattern = `**/${pattern}/**`;
      }

      globs.push(pattern);
    }
    return globs;
  } catch (e) {
    logger.warn(`读取 .gitignore 失败: ${(e as Error).message}`);
    return [];
  }
}
