import * as path from 'path';
import { CommandOptions, ConfigFileOptions } from '../types/command-options';

// Type guard to check if a value is a non-empty string
export function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

// Define a type that includes both CommandOptions and ConfigFileOptions
export type MergedOptions = CommandOptions & ConfigFileOptions;

/**
 * Merges options from a configuration file and CLI arguments.
 *
 * Precedence: CLI arguments override configuration file settings.
 *
 * @param {CommandOptions & { [key: string]: any }} cliOptions Options provided via CLI.
 * @param {ConfigFileOptions | null} fileConfig Options loaded from the config file.
 * @param {string} projectRoot The root directory of the project for resolving relative paths.
 * @returns {MergedOptions} A comprehensive options object containing the merged result.
 */
export function mergeOptions(
  cliOptions: CommandOptions & { [key: string]: any },
  fileConfig: ConfigFileOptions | null,
  projectRoot: string,
): MergedOptions {
  // Return the intersection type

  // Start with file config as base, or empty object
  const fileConf = fileConfig || {};
  // Explicitly include base CLI options like project, verbose initially
  const merged: MergedOptions = {
    project: cliOptions.project, // Ensure project from CLI is preserved
    verbose: cliOptions.verbose, // Ensure verbose from CLI is preserved initially
    verboseLevel: cliOptions.verboseLevel,
    config: cliOptions.config,
    ...fileConf, // Spread file config over the base CLI options
  };

  // Layer CLI options over the combined base+file config
  for (const key of Object.keys(cliOptions)) {
    // Avoid overwriting project from file config if CLI didn't provide it (shouldn't happen with yargs)
    if (key === 'project' && !cliOptions.project) continue;

    if (cliOptions[key] !== undefined) {
      (merged as any)[key] = cliOptions[key];
    }
  }

  // --- Specific field merging logic (remains the same) ---
  // 1. Array Merging (exclude/excludePatterns)
  if (
    cliOptions.exclude !== undefined &&
    Array.isArray(cliOptions.exclude) &&
    cliOptions.exclude.length > 0
  ) {
    merged.exclude = cliOptions.exclude;
    delete merged.excludePatterns;
  } else if (fileConf?.exclude && !merged.exclude) {
    merged.exclude = fileConf.exclude;
    delete merged.excludePatterns;
  } else if (fileConf?.excludePatterns && !merged.exclude) {
    merged.exclude = fileConf.excludePatterns;
    delete merged.excludePatterns;
  }

  // NEW: Handle keepAssets array
  if (cliOptions.keepAssets !== undefined && Array.isArray(cliOptions.keepAssets)) {
    merged.keepAssets = cliOptions.keepAssets;
  } else if (fileConf?.keepAssets && !merged.keepAssets) {
    merged.keepAssets = fileConf.keepAssets;
  }
  // Ensure keepAssets is always an array (even if empty)
  merged.keepAssets = merged.keepAssets || [];

  // 2. Essential Files
  let essentialFilesSource: string | string[] | undefined = undefined;
  if (cliOptions.essentialFiles !== undefined) {
    essentialFilesSource = cliOptions.essentialFiles;
  } else if (fileConf?.essentialFiles) {
    essentialFilesSource = fileConf.essentialFiles;
  }
  let finalEssentialFilesList: string[] | undefined = undefined;
  if (essentialFilesSource) {
    finalEssentialFilesList =
      typeof essentialFilesSource === 'string'
        ? essentialFilesSource.split(',').map((f) => f.trim())
        : Array.isArray(essentialFilesSource)
        ? essentialFilesSource
        : undefined;
  }
  if (finalEssentialFilesList) {
    merged.essentialFiles = finalEssentialFilesList.map((f) => path.resolve(projectRoot, f));
  } else {
    merged.essentialFiles = undefined;
  }

  // 3. Path Resolution
  const resolvePathIfNeeded = (p: string | undefined): string | undefined => {
    if (p && typeof p === 'string' && !path.isAbsolute(p)) {
      return path.resolve(projectRoot, p);
    }
    return p;
  };
  merged.miniappRoot = resolvePathIfNeeded(merged.miniappRoot);
  merged.entryFile = resolvePathIfNeeded(merged.entryFile);
  merged.output = resolvePathIfNeeded(merged.output);
  merged.focus = resolvePathIfNeeded(merged.focus);

  // 4. Aliases/Alternative Names
  // Format (format/graphFormat)
  if (cliOptions.format !== undefined) {
    merged.format = cliOptions.format;
    delete merged.graphFormat;
  } else if (merged.graphFormat) {
    merged.format = merged.graphFormat;
    delete merged.graphFormat;
  }
  // Depth (depth/graphDepth)
  if (cliOptions.depth !== undefined) {
    merged.depth = cliOptions.depth;
    delete merged.graphDepth;
  } else if (merged.graphDepth !== undefined) {
    merged.depth = merged.graphDepth;
    delete merged.graphDepth;
  }
  // Npm toggle (npm/includeNpm)
  if (cliOptions.npm !== undefined) {
    merged.npm = cliOptions.npm;
    delete merged.includeNpm;
  } else if (merged.includeNpm !== undefined) {
    merged.npm = merged.includeNpm;
    delete merged.includeNpm;
  }

  return merged;
}
