import * as fs from 'fs';
import * as path from 'path';
import { logger } from './debug-logger';

// Helper function to recursively find all files in a directory
function getAllFilesRecursive(dirPath: string, fileList: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.resolve(dirPath, entry.name);
      if (entry.isDirectory()) {
        getAllFilesRecursive(fullPath, fileList);
      } else if (entry.isFile()) {
        fileList.push(fullPath);
      }
    }
  } catch (error: any) {
    logger.warn(`Error reading directory for types ${dirPath}: ${error.message}`);
  }
  return fileList;
}

/**
 * Loads tsconfig.json, parses the types array (root level first, then compilerOptions.types),
 * and returns a list of absolute paths for project-local type definition files/directories.
 * It filters out module names (like "miniprogram-api-typings").
 *
 * @param projectRoot The absolute path to the project root.
 * @returns An array of absolute paths to essential type files derived from tsconfig.
 */
export function loadTsConfigTypes(projectRoot: string): string[] {
  const tsConfigPath = path.resolve(projectRoot, 'tsconfig.json');
  const essentialTypeFiles: string[] = [];

  if (!fs.existsSync(tsConfigPath)) {
    logger.debug('tsconfig.json not found, skipping types parsing.');
    return essentialTypeFiles;
  }

  try {
    const tsConfigContent = fs.readFileSync(tsConfigPath, 'utf-8');
    // Basic JSON parsing, potentially improve with a more robust parser that handles comments
    const tsConfig = JSON.parse(tsConfigContent);

    // Check root-level 'types' first, then fallback to 'compilerOptions.types'
    let types: string[] | undefined = undefined;
    if (Array.isArray(tsConfig?.types)) {
      types = tsConfig.types;
    } else if (Array.isArray(tsConfig?.compilerOptions?.types)) {
      types = tsConfig.compilerOptions.types;
    } else {
      // Skip the loop below if types is undefined
    }

    if (Array.isArray(types)) {
      // Check if types was successfully assigned
      for (const typeRef of types) {
        if (typeof typeRef === 'string') {
          // Refined check: Consider anything starting with '.' or containing '/' or '\' as a path.
          const pathSeparatorRegex = /[\\/]/;
          const isLikelyPath = typeRef.startsWith('.') || pathSeparatorRegex.test(typeRef);

          if (isLikelyPath) {
            const potentialPath = path.resolve(projectRoot, typeRef); // Resolve path only if likely a path
            try {
              const stats = fs.statSync(potentialPath);
              if (stats.isFile()) {
                essentialTypeFiles.push(potentialPath);
              } else if (stats.isDirectory()) {
                const filesInDir = getAllFilesRecursive(potentialPath);
                essentialTypeFiles.push(...filesInDir);
              }
            } catch (err: any) {
              // Ignore if path doesn't exist or can't be accessed
              logger.warn(`Could not resolve tsconfig type path '${typeRef}': ${err.message}`);
            }
          } else {
            // Assume it's a module name (like "miniprogram-api-typings") and ignore
          }
        }
      }
    }
    // No else needed here, already logged if no array was found
  } catch (error: any) {
    logger.error(`Failed to read or parse tsconfig.json at ${tsConfigPath}: ${error.message}`);
  }

  // Return unique paths
  return [...new Set(essentialTypeFiles)];
}
