import * as fs from 'fs';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../utils/path-resolver';

export class JavaScriptParser {
  private pathResolver: PathResolver;

  constructor(pathResolver: PathResolver) {
    this.pathResolver = pathResolver;
  }

  async parse(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>();

      // Allowed extensions for JS/TS imports
      const allowedExtensions = ['.js', '.ts', '.json'];

      // Process standard import statements
      this.processImportStatements(content, filePath, allowedExtensions, dependencies);

      // Process standard require statements
      this.processRequireStatements(content, filePath, allowedExtensions, dependencies);

      return Array.from(dependencies);
    } catch (e: any) {
      // Log the error but re-throw it so the central handler in FileParser catches it
      logger.warn(`Error parsing JavaScript file ${filePath}: ${e.message}`);
      throw e; // Re-throw the error
    }
  }

  private processImportStatements(
    content: string,
    filePath: string,
    allowedExtensions: string[],
    dependencies: Set<string>,
  ): void {
    const importRegex =
      /import(?:(?:(?:\s+[\w*{}\s,]+|\s*\*\s*as\s+\w+)\s+from)?\s*)['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        const importPath = match[1];
        // Basic heuristic to potentially ignore type imports (not foolproof)
        if (content.substring(match.index - 5, match.index).includes(' type ')) {
          logger.trace(`Skipping potential type import: '${importPath}' in ${filePath}`);
          continue;
        }

        const depPath = this.pathResolver.resolveAnyPath(importPath, filePath, allowedExtensions);
        if (depPath) {
          dependencies.add(depPath);
        }
      }
    }
  }

  private processRequireStatements(
    content: string,
    filePath: string,
    allowedExtensions: string[],
    dependencies: Set<string>,
  ): void {
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.pathResolver.resolveAnyPath(match[1], filePath, allowedExtensions);
        if (depPath) dependencies.add(depPath);
      }
    }
  }
}
