import * as fs from 'fs';
import { AnalyzerOptions } from '../../types/command-options';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../utils/path-resolver';

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
          // Handle relative paths using resolveAnyPath
          const depPath = this.pathResolver.resolveAnyPath(importPath, filePath, allowedExtensions);
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
        // Use resolveAnyPath - it handles root-relative, relative, and alias paths
        const depPath = this.pathResolver.resolveAnyPath(wxsPath, filePath, allowedExtensions);
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
      if (!src || /{{.*?}}/.test(src) || /^data:/.test(src) || /^(http|https):/.test(src)) {
        return;
      }
      const resolvedPath = this.pathResolver.resolveAnyPath(src, filePath, allowedExtensions);
      if (resolvedPath) {
        dependencies.add(resolvedPath);
      }
    });
  }
}
