import { logger } from '../../utils/debug-logger';

export class WXSSParser {
  constructor() {
    // No dependencies needed for pure text analysis
  }

  async parse(content: string, filePath: string): Promise<string[]> {
    try {
      const dependencies = new Set<string>();

      // Match @import statements
      const importRegex = /@import\s+['"]([^'"]+)['"]/g;
      // Match url() references
      const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;

      let match;

      // Process @import statements
      while ((match = importRegex.exec(content)) !== null) {
        if (match[1]) {
          const importPath = match[1];
          dependencies.add(importPath);
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
          dependencies.add(urlPath);
        }
      }

      return Array.from(dependencies);
    } catch (e: any) {
      logger.warn(`Error parsing WXSS file ${filePath}: ${e.message}`);
      throw e; // Re-throw
    }
  }
}
