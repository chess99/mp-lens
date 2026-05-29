import { logger } from '../utils/debug-logger';
import { extractJsonDependencies } from './json-dependencies';

export class JSONParser {
  constructor() {
    // No dependencies needed for pure text analysis
  }

  async parse(content: string, filePath: string): Promise<string[]> {
    try {
      const jsonContent = JSON.parse(content);
      return extractJsonDependencies(jsonContent);
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        logger.error(`Error parsing JSON file ${filePath}: ${e.message}`);
      } else {
        logger.warn(`Error processing JSON file ${filePath}: ${e.message}`);
      }
      // Don't re-throw parsing errors, just return empty
      return [];
    }
  }
}
