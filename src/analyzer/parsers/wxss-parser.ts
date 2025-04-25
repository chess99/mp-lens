import * as fs from 'fs';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../utils/path-resolver';

export class WXSSParser {
  private pathResolver: PathResolver;

  constructor(pathResolver: PathResolver) {
    this.pathResolver = pathResolver;
  }

  async parse(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>();

      // Match @import statements
      const importRegex = /@import\s+['"]([^'"]+)['"]/g;
      // Match url() references
      const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
      // Allowed extensions for imports and urls
      const importExtensions = ['.wxss'];
      const urlExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

      let match;

      // Process @import statements
      while ((match = importRegex.exec(content)) !== null) {
        if (match[1]) {
          const importPath = match[1];
          const resolvedPath = this.pathResolver.resolveAnyPath(
            importPath,
            filePath,
            importExtensions,
          );
          if (resolvedPath) {
            dependencies.add(resolvedPath);
          }
        }
      }

      // Process url() references
      while ((match = urlRegex.exec(content)) !== null) {
        if (match[1]) {
          const urlPath = match[1].trim();
          if (
            urlPath.startsWith('data:') ||
            /^(http|https):\/\//.test(urlPath) ||
            /{{.*?}}/.test(urlPath)
          ) {
            continue;
          }
          const resolvedPath = this.pathResolver.resolveAnyPath(urlPath, filePath, urlExtensions);
          if (resolvedPath) {
            dependencies.add(resolvedPath);
          }
        }
      }

      return Array.from(dependencies);
    } catch (e: any) {
      logger.warn(`Error parsing WXSS file ${filePath}: ${e.message}`);
      throw e; // Re-throw
    }
  }
}
