import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { logger } from './debug-logger';

export class PathResolver {
  private projectRoot: string;
  private options: AnalyzerOptions;

  constructor(projectRoot: string, options: AnalyzerOptions) {
    this.projectRoot = projectRoot;
    this.options = options; // Store options, especially for miniappRoot
  }

  /**
   * Resolves an import path (which could be relative, absolute, alias, or implicit root)
   * to an existing file path, considering context-specific allowed extensions.
   *
   * @param importPath The original import string (e.g., './utils', '/pages/index', '@/comp', 'image.png').
   * @param sourcePath The absolute path of the file containing the import.
   * @param allowedExtensions An ordered array of extensions to check (e.g., ['.js', '.ts'] or ['.wxml']).
   * @returns The absolute path of the resolved existing file, or null if not found.
   */
  public resolveAnyPath(
    importPath: string,
    sourcePath: string,
    allowedExtensions: string[],
  ): string | null {
    logger.trace(
      `Resolving import '${importPath}' from '${sourcePath}' with allowed extensions: [${allowedExtensions.join(
        ', ',
      )}]`,
    );

    // Rule 0: Handle data URIs and remote URLs
    if (/^data:/.test(importPath) || /^(http|https|\/\/):/.test(importPath)) {
      logger.trace(`Skipping resolution for data URI or remote URL: ${importPath}`);
      return null;
    }

    if (this.isNpmPackageImport(importPath)) {
      logger.trace(`Skipping resolution for npm package import: ${importPath}`);
      return null;
    }

    if (path.isAbsolute(importPath)) {
      logger.trace(
        `Input importPath '${importPath}' is absolute. Checking direct existence first.`,
      );
      const existingAbsolutePath = this.findExistingPath(importPath, allowedExtensions);
      if (existingAbsolutePath) {
        logger.trace(
          `Found existing file at true absolute path: ${existingAbsolutePath}. Returning directly.`,
        );
        return existingAbsolutePath;
      } else {
        logger.trace(
          `Absolute path '${importPath}' not found directly. Will proceed to normal resolution (might be root-relative).`,
        );
      }
    }

    let potentialBasePath: string | null = null;
    let isAlias = false;

    const aliasResolved = this.resolveAlias(importPath);
    if (aliasResolved) {
      isAlias = true;
      potentialBasePath = aliasResolved;
      logger.trace(`Alias resolved to base path: ${potentialBasePath}`);
    }

    if (!potentialBasePath) {
      const sourceDir = path.dirname(sourcePath);
      const miniappRoot = this.options.miniappRoot || this.projectRoot;
      if (importPath.startsWith('/')) {
        potentialBasePath = path.resolve(miniappRoot, importPath.slice(1));
      } else if (importPath.startsWith('.')) {
        potentialBasePath = path.resolve(sourceDir, importPath);
      } else {
        potentialBasePath = path.resolve(miniappRoot, importPath);
      }
      logger.trace(`Path resolved to potential base path: ${potentialBasePath}`);
    }

    if (potentialBasePath) {
      const existingPath = this.findExistingPath(potentialBasePath, allowedExtensions);
      if (existingPath) {
        logger.trace(`Resolved '${importPath}' to existing file: ${existingPath}`);
        return existingPath;
      } else if (isAlias) {
        logger.warn(
          `Alias resolved to '${potentialBasePath}', but no existing file found with extensions [${allowedExtensions.join(
            ', ',
          )}]`,
        );
      }
    }

    if (!isAlias) {
      logger.warn(`Failed to resolve import '${importPath}' from '${sourcePath}'.`);
    }
    return null;
  }

  /**
   * Given a potential absolute base path (without extension or index), finds the
   * actual existing file path by checking for the path itself, adding allowed
   * extensions, or checking for directory index files with allowed extensions.
   *
   * @param potentialPath Absolute path, possibly without extension (e.g., '/path/to/file' or '/path/to/dir')
   * @param allowedExtensions Ordered list of extensions to check (e.g., ['.js', '.ts'])
   * @returns The existing absolute file path, or null.
   */
  private findExistingPath(potentialPath: string, allowedExtensions: string[]): string | null {
    logger.trace(
      `Looking for existing path: ${potentialPath} with extensions: ${allowedExtensions}`,
    );

    let potentialPathIsDir = false;
    try {
      const stats = fs.statSync(potentialPath);
      if (stats.isFile()) {
        logger.trace(`Check 1: Exact path exists and is a file: ${potentialPath}`);
        return potentialPath; // Exact match and is a file
      } else if (stats.isDirectory()) {
        logger.trace(`Check 1: Exact path exists and is a directory: ${potentialPath}`);
        potentialPathIsDir = true; // It's a directory, continue to check index files
      }
    } catch (e: any) {
      logger.trace(`Check 1: Exact path does not exist: ${potentialPath}`);
    }

    // Check 2: Try appending allowed extensions if it wasn't a directory
    if (!potentialPathIsDir) {
      logger.trace(`Check 2: Trying extensions for base path: ${potentialPath}`);
      for (const ext of allowedExtensions) {
        const pathWithExt = potentialPath + ext;
        logger.trace(`Check 2a: Checking path with extension: ${pathWithExt}`);
        try {
          const stats = fs.statSync(pathWithExt);
          if (stats.isFile()) {
            logger.trace(`Check 2b: Found file with extension: ${pathWithExt}`);
            return pathWithExt;
          } else {
            logger.trace(`Check 2b: Path with extension not found or not a file: ${pathWithExt}`);
          }
        } catch (e: any) {
          logger.trace(`Check 2b: Error stating path ${pathWithExt}: ${e.message}`);
        }
      }
    }

    // Check 3: If the original path was a directory OR it wasn't found with extensions, check for index files
    logger.trace(`Check 3: Checking for index files in directory: ${potentialPath}`);
    for (const ext of allowedExtensions) {
      const indexFilePath = path.join(potentialPath, 'index' + ext);
      logger.trace(`Check 3a: Checking index file: ${indexFilePath}`);
      try {
        const stats = fs.statSync(indexFilePath);
        if (stats.isFile()) {
          logger.trace(`Check 3b: Found index file: ${indexFilePath}`);
          return indexFilePath;
        } else {
          logger.trace(`Check 3b: Index file not found or not a file: ${indexFilePath}`);
        }
      } catch (e: any) {
        logger.trace(`Check 3b: Error stating index file ${indexFilePath}: ${e.message}`);
      }
    }

    logger.trace(`Failed to find existing path for: ${potentialPath}`);
    return null; // Nothing found
  }

  /**
   * Check if the import path looks like an alias based on the loaded configuration.
   */
  private isAliasPath(importPath: string): boolean {
    const aliases = this.getAliases();
    if (!aliases) return false;
    const keys = Object.keys(aliases);
    if (keys.length === 0) return false;
    if (importPath in aliases) return true;
    for (const alias of keys) {
      if (importPath === alias || importPath.startsWith(`${alias}/`)) return true;
    }
    return false;
  }

  private resolveAlias(importPath: string): string | null {
    const aliases = this.getAliases();
    if (!aliases) return null;
    for (const [alias, targets] of Object.entries(aliases)) {
      const aliasPrefix = `${alias}/`;
      if (importPath === alias || importPath.startsWith(aliasPrefix)) {
        const remaining = importPath === alias ? '' : importPath.substring(aliasPrefix.length);
        const targetList = Array.isArray(targets) ? targets : [targets as string];
        if (targetList.length === 0) return null;
        // Use first target
        const base = targetList[0];
        const baseDir = path.isAbsolute(base) ? base : path.resolve(this.projectRoot, base);
        return path.join(baseDir, remaining);
      }
    }
    return null;
  }

  /**
   * Check if the import path looks like an npm package that we shouldn't try to resolve
   * on the file system or with aliases.
   */
  private isNpmPackageImport(importPath: string): boolean {
    // First check: if it's an absolute path, it's definitely not an npm package
    if (path.isAbsolute(importPath)) {
      return false;
    }

    if (importPath.startsWith('@')) {
      const scope = importPath.split('/')[0];
      const aliases = this.getAliases();
      if (
        aliases &&
        (scope in aliases ||
          Object.keys(aliases).some((alias) => alias === scope || alias.startsWith(`${scope}/`)))
      ) {
        return false; // configured alias scope
      }
      return true; // Starts with @ and doesn't match a configured alias scope
    }

    // Basic check: if it doesn't start with '.', '/', or match an alias, it *might* be an npm package.
    if (
      !importPath.startsWith('.') &&
      !importPath.startsWith('/') &&
      !this.isAliasPath(importPath)
    ) {
      logger.trace(
        `Path '${importPath}' is non-relative, non-absolute, non-alias. Considering as NPM package.`,
      );
      return true; // MODIFIED: Was false, now true for paths like 'lodash'
    }

    return false; // Default to false if none of the above conditions met (e.g. relative paths)
  }

  private getAliases(): { [key: string]: string | string[] } | null {
    return this.options.aliases || null;
  }
}
