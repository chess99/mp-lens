import * as fs from 'fs';
import * as path from 'path';
import { logger } from './debug-logger';

// Basic validation for app.json content
function isValidAppJson(content: any): boolean {
  return typeof content === 'object' && content !== null && Array.isArray(content.pages);
}

// Result type for findAppJsonConfig
type FindAppJsonResult =
  | {
      appJsonPath: string;
      miniappRoot: string;
    }
  | null
  | 'ambiguous';

// Common directories to exclude during search
const DEFAULT_EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.vscode',
  '.idea',
  'miniprogram_npm', // Often contains copies
];

/**
 * Searches for a valid app.json within a project directory to automatically determine
 * miniappRoot and appJsonPath.
 *
 * @param projectRoot The absolute path to the project's root directory.
 * @param excludeDirs Optional array of directory names to exclude from search.
 * @returns An object with absolute paths for appJsonPath and miniappRoot, 'ambiguous' if multiple found, or null if none found.
 */
export function findAppJsonConfig(
  projectRoot: string,
  excludeDirs: string[] = DEFAULT_EXCLUDE_DIRS,
): FindAppJsonResult {
  logger.debug('Attempting to auto-detect app.json...');
  const foundAppJsons: { appJsonPath: string; miniappRoot: string }[] = [];
  const visitedDirs = new Set<string>(); // Avoid infinite loops with symlinks if any

  function searchDir(currentDir: string) {
    if (visitedDirs.has(currentDir)) {
      return;
    }
    visitedDirs.add(currentDir);

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.resolve(currentDir, entry.name);
        const relativePath = path.relative(projectRoot, fullPath); // For logging/debugging

        if (entry.isDirectory()) {
          // Check if directory should be excluded
          if (excludeDirs.includes(entry.name)) {
            logger.trace(`Skipping excluded directory: ${relativePath}`);
            continue;
          }
          // Recurse into subdirectory
          searchDir(fullPath);
        } else if (entry.isFile() && entry.name === 'app.json') {
          logger.trace(`Found potential app.json: ${relativePath}`);
          try {
            const contentStr = fs.readFileSync(fullPath, 'utf-8');
            const content = JSON.parse(contentStr);
            if (isValidAppJson(content)) {
              logger.debug(`Found valid app.json at: ${relativePath}`);
              foundAppJsons.push({
                appJsonPath: fullPath, // Absolute path
                miniappRoot: path.dirname(fullPath), // Absolute path
              });
            } else {
              logger.trace(`Skipping invalid app.json (missing 'pages' array?): ${relativePath}`);
            }
          } catch (error: any) {
            logger.trace(`Error reading/parsing app.json at ${relativePath}: ${error.message}`);
          }
        }
      }
    } catch (error: any) {
      logger.warn(`读取目录 ${currentDir} 出错: ${error.message}`);
    }
  }

  // Start search from project root
  searchDir(projectRoot);

  if (foundAppJsons.length === 1) {
    logger.info(`自动检测到入口文件: ${path.relative(projectRoot, foundAppJsons[0].appJsonPath)}`);
    logger.info(
      `自动检测到小程序根目录: ${path.relative(projectRoot, foundAppJsons[0].miniappRoot)}`,
    );
    return foundAppJsons[0];
  } else if (foundAppJsons.length > 1) {
    logger.warn(
      `发现多个有效的 app.json 文件。无法自动检测配置。请指定 --miniapp-root 和 --entry-file。发现的位置:`,
    );
    foundAppJsons.forEach((f) => logger.warn(`  - ${path.relative(projectRoot, f.appJsonPath)}`));
    return 'ambiguous';
  } else {
    logger.debug('No valid app.json found for auto-detection.');
    return null;
  }
}
