import * as fs from 'fs';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../utils/path-resolver';

export class WXSParser {
  private pathResolver: PathResolver;

  constructor(pathResolver: PathResolver) {
    this.pathResolver = pathResolver;
  }

  async parse(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>();
      const requireRegex = /require\s*\(\s*['"](.*?)['"]\s*\)/g;
      const allowedExtensions = ['.wxs']; // WXS can only require WXS

      let match;
      while ((match = requireRegex.exec(content)) !== null) {
        if (match[1]) {
          const importPath = match[1];
          const depPath = this.pathResolver.resolveAnyPath(importPath, filePath, allowedExtensions);
          if (depPath) {
            dependencies.add(depPath);
          }
        }
      }
      return Array.from(dependencies);
    } catch (e: any) {
      logger.warn(`Error parsing WXS file ${filePath}: ${e.message}`);
      throw e; // Re-throw
    }
  }
}
