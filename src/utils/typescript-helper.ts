import * as fs from 'fs';
import { logger } from './debug-logger';

/**
 * Checks if a .d.ts file is a pure ambient declaration file.
 * Pure ambient declaration files add types to the global scope without using
 * import/export statements, making them automatically available without explicit imports.
 *
 * @param filePath The absolute path to the .d.ts file
 * @returns true if the file is a pure ambient declaration file, false otherwise
 */
export function isPureAmbientDeclarationFile(filePath: string): boolean {
  if (!filePath.endsWith('.d.ts')) {
    return false;
  }

  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    // Check if it contains any imports or exports (module-style)
    const hasModuleElements = /\b(import|export)\b/.test(content);

    // If it has module elements, it needs to be imported
    if (hasModuleElements) {
      return false;
    }

    // Check if it has ambient declarations
    const hasAmbientDeclarations = /\bdeclare\b/.test(content);

    return hasAmbientDeclarations;
  } catch (err) {
    // Handle error
    logger.debug(`Error reading d.ts file ${filePath}: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Checks if a file is a TypeScript declaration file (.d.ts)
 */
export function isDeclarationFile(filePath: string): boolean {
  return filePath.endsWith('.d.ts');
}

/**
 * Finds all .d.ts files in a project that are pure ambient declaration files.
 * These files should not be marked as unused even if they're not explicitly imported.
 *
 * @param projectRoot The absolute path to the project root
 * @param allFiles An array of all files found in the project
 * @returns An array of absolute paths to pure ambient declaration files
 */
export function findPureAmbientDeclarationFiles(projectRoot: string, allFiles: string[]): string[] {
  const declarationFiles = allFiles.filter((file) => file.endsWith('.d.ts'));
  const ambientDeclarationFiles = declarationFiles.filter(isPureAmbientDeclarationFile);

  if (ambientDeclarationFiles.length > 0) {
    logger.debug(
      `Found ${ambientDeclarationFiles.length} pure ambient declaration files that will be preserved`,
    );
  }

  return ambientDeclarationFiles;
}
