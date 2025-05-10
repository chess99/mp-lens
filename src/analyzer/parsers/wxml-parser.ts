import * as fs from 'fs';
import { AnalyzerOptions } from '../../types/command-options';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../utils/path-resolver';

/**
 * Parser for WXML files that finds dependencies to other files.
 *
 * Path resolution rules for WeChat Mini Program WXML files:
 * 1. Paths starting with '/' are relative to the mini program root
 *    Example: <import src="/templates/header.wxml" />
 *
 * 2. Paths starting with './' or '../' are relative to the current file's directory
 *    Example: <import src="../templates/header.wxml" />
 *
 * 3. Paths with no prefix (like "templates/header.wxml") should be treated as relative
 *    to the current file's directory, equivalent to adding a './' prefix.
 *    This parser automatically adds the './' prefix to follow Mini Program conventions.
 */
export class WXMLParser {
  private pathResolver: PathResolver;
  private projectRoot: string; // Needed for root-relative paths in imports/includes/wxs
  private options: AnalyzerOptions; // Needed for verbose logging option

  constructor(pathResolver: PathResolver, projectRoot: string, options: AnalyzerOptions) {
    this.pathResolver = pathResolver;
    this.projectRoot = projectRoot;
    this.options = options;
  }

  async parse(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>();

      this.processImportIncludeTags(content, filePath, dependencies);
      this.processWxsTags(content, filePath, dependencies);
      this.processImageSources(content, filePath, dependencies);
      // NOTE: processCustomComponents is intentionally omitted as component
      // dependencies are defined in JSON files.

      return Array.from(dependencies);
    } catch (e: any) {
      logger.warn(`Error parsing WXML file ${filePath}: ${e.message}`);
      throw e; // Re-throw
    }
  }

  private processImportIncludeTags(
    content: string,
    filePath: string,
    dependencies: Set<string>,
  ): void {
    const importRegex = /<(?:import|include)\s+src=['"](.*?)['"]\s*\/?\s*>/g;
    const allowedExtensions = ['.wxml'];

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        const importPath = match[1];

        if (importPath.includes('{{')) {
          logger.trace(`Skipping dynamic import/include path: ${importPath} in ${filePath}`);
          continue;
        }

        // Handle root-relative paths explicitly for <import> and <include>
        if (importPath.startsWith('/')) {
          // Use PathResolver.resolveAnyPath for consistency, treating it as non-relative.
          const resolvedPath = this.pathResolver.resolveAnyPath(
            importPath,
            filePath,
            allowedExtensions,
          );
          if (resolvedPath) {
            dependencies.add(resolvedPath);
          } else if (this.options.verbose) {
            logger.trace(
              `processImportIncludeTags: Could not resolve root path ${importPath} from ${filePath}`,
            );
          }
        } else {
          // Ensure non-absolute, non-relative paths are treated as relative to current dir
          // This follows WeChat Mini Program conventions where paths like "templates/foo.wxml"
          // are treated as "./templates/foo.wxml"
          const normalizedPath = importPath.startsWith('.') ? importPath : './' + importPath;

          // Handle relative paths using resolveAnyPath
          const depPath = this.pathResolver.resolveAnyPath(
            normalizedPath,
            filePath,
            allowedExtensions,
          );
          if (depPath) dependencies.add(depPath);
        }
      }
    }
  }

  private processWxsTags(content: string, filePath: string, dependencies: Set<string>): void {
    const wxsRegex = /<wxs\s+(?:[^>]*?\s+)?src=['"](.*?)['"]/g;
    const allowedExtensions = ['.wxs'];

    let match;
    while ((match = wxsRegex.exec(content)) !== null) {
      if (match[1]) {
        const wxsPath = match[1];

        if (wxsPath.includes('{{')) {
          logger.trace(`Skipping dynamic wxs path: ${wxsPath} in ${filePath}`);
          continue;
        }

        // Normalize paths to ensure non-absolute, non-relative paths are treated as relative
        const normalizedPath =
          wxsPath.startsWith('/') || wxsPath.startsWith('.') ? wxsPath : './' + wxsPath;

        // Use resolveAnyPath - it handles root-relative, relative, and alias paths
        const depPath = this.pathResolver.resolveAnyPath(
          normalizedPath,
          filePath,
          allowedExtensions,
        );
        if (depPath) {
          dependencies.add(depPath);
        }
      }
    }
  }

  private processImageSources(content: string, filePath: string, dependencies: Set<string>): void {
    // Added 's' flag (dotAll) to allow . to match newline characters
    const IMAGE_SRC_REGEX = /<image[\s\S]*?src=["'](.*?)["']/gs;
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
    const matches = [...content.matchAll(IMAGE_SRC_REGEX)];

    matches.forEach((match) => {
      const src = match[1];
      if (!src || src.includes('{{') || /^data:/.test(src) || /^(http|https):/.test(src)) {
        let reason = 'empty';
        if (src) {
          // src is not empty, determine other reason
          if (src.includes('{{')) {
            reason = 'dynamic (contains {{)';
          } else if (/^data:/.test(src)) {
            reason = 'data URI';
          } else if (/^(http|https):/.test(src)) {
            reason = 'HTTP/HTTPS URL';
          }
        }
        logger.trace(
          `Skipping image src resolution for '${src}' in file '${filePath}'. Reason: ${reason}.`,
        );
        return;
      }

      // Normalize paths to ensure non-absolute, non-relative paths are treated as relative
      const normalizedPath = src.startsWith('/') || src.startsWith('.') ? src : './' + src;

      const resolvedPath = this.pathResolver.resolveAnyPath(
        normalizedPath,
        filePath,
        allowedExtensions,
      );
      if (resolvedPath) {
        dependencies.add(resolvedPath);
      }
    });
  }
}
