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
 * Loads tsconfig.json, parses the compilerOptions.types array,
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

    const types = tsConfig?.compilerOptions?.types;

    if (Array.isArray(types)) {
      logger.debug(`Found compilerOptions.types: ${types.join(', ')}`);
      for (const typeRef of types) {
        if (typeof typeRef === 'string') {
          // Refined check: Consider anything starting with '.' or containing '/' or '\' as a path.
          const pathSeparatorRegex = /[\\/]/;
          const isLikelyPath = typeRef.startsWith('.') || pathSeparatorRegex.test(typeRef);

          if (isLikelyPath) {
            const potentialPath = path.resolve(projectRoot, typeRef); // Resolve path only if likely a path
            logger.trace(
              `Processing tsconfig type reference as path: ${typeRef} -> ${potentialPath}`,
            );
            try {
              const stats = fs.statSync(potentialPath);
              if (stats.isFile()) {
                logger.debug(
                  `Adding file from tsconfig types: ${path.relative(projectRoot, potentialPath)}`,
                );
                essentialTypeFiles.push(potentialPath);
              } else if (stats.isDirectory()) {
                logger.debug(
                  `Adding files in directory from tsconfig types: ${path.relative(
                    projectRoot,
                    potentialPath,
                  )}`,
                );
                const filesInDir = getAllFilesRecursive(potentialPath);
                essentialTypeFiles.push(...filesInDir);
                logger.trace(`  -> Added ${filesInDir.length} files from directory ${typeRef}`);
              }
            } catch (err: any) {
              // Ignore if path doesn't exist or can't be accessed
              logger.warn(`Could not resolve tsconfig type path '${typeRef}': ${err.message}`);
            }
          } else {
            // Assume it's a module name (like "miniprogram-api-typings") and ignore
            logger.trace(`Ignoring tsconfig type reference (assumed module): ${typeRef}`);
          }
        }
      }
    } else {
      logger.trace('compilerOptions.types not found or not an array in tsconfig.json');
    }
  } catch (error: any) {
    logger.error(`Failed to read or parse tsconfig.json at ${tsConfigPath}: ${error.message}`);
  }

  // Return unique paths
  return [...new Set(essentialTypeFiles)];
}
