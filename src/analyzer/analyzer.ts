import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { logger } from '../utils/debug-logger';
import { DependencyGraph } from './dependency-graph';
import { FileParser } from './file-parser';

interface AnalysisResult {
  dependencyGraph: DependencyGraph;
  unusedFiles: string[];
}

/**
 * 分析微信小程序项目，构建依赖图并找出未使用的文件
 */
export async function analyzeProject(
  trueProjectRoot: string,
  options: AnalyzerOptions,
): Promise<AnalysisResult> {
  const {
    fileTypes,
    excludePatterns = [],
    essentialFiles = [],
    miniappRoot: miniappRootRelative,
    entryFile,
    entryContent,
  } = options;

  // Determine the absolute path for the miniapp root
  const actualMiniappRoot = miniappRootRelative
    ? path.resolve(trueProjectRoot, miniappRootRelative)
    : trueProjectRoot;

  logger.debug('Project Root:', trueProjectRoot);
  logger.debug('MiniApp Root:', actualMiniappRoot);
  logger.verbose('Analyzer received options:', options);
  logger.debug('File types:', fileTypes);
  logger.debug('Exclude patterns:', excludePatterns);

  if (essentialFiles.length > 0) {
    logger.debug('Essential files:', essentialFiles);
  }

  if (entryFile) {
    logger.debug('Using custom entry file:', entryFile);
  }

  if (entryContent) {
    logger.debug('Using provided entry content');
  }

  // Validate the MiniApp root path
  if (!actualMiniappRoot || !fs.existsSync(actualMiniappRoot)) {
    throw new Error(`小程序目录不存在: ${actualMiniappRoot}`);
  }

  // Get all files within the MiniApp root
  const allFiles = findAllFiles(actualMiniappRoot, fileTypes, excludePatterns);

  logger.info(`Found ${allFiles.length} files for analysis within ${actualMiniappRoot}`);

  // Build dependency graph based on MiniApp root
  const dependencyGraph = new DependencyGraph();
  const fileParser = new FileParser(trueProjectRoot, {
    ...options,
    miniappRoot: actualMiniappRoot,
  });

  // First step: Add all found files (from MiniApp root) to the graph
  for (const file of allFiles) {
    dependencyGraph.addNode(file);
  }

  // Second step: Analyze dependencies for each file
  for (const file of allFiles) {
    try {
      const dependencies = await fileParser.parseFile(file);

      for (const dep of dependencies) {
        if (allFiles.includes(dep)) {
          dependencyGraph.addEdge(file, dep);
        }
      }
    } catch (error) {
      logger.warn(`Unable to parse file ${file}: ${(error as Error).message}`);
    }
  }

  // Find unused files, passing both roots now
  const unusedFiles = findUnusedFiles(
    dependencyGraph,
    trueProjectRoot,
    actualMiniappRoot,
    essentialFiles,
    entryFile,
    entryContent,
  );

  return {
    dependencyGraph,
    unusedFiles,
  };
}

/**
 * 在指定目录中查找所有符合条件的文件
 */
function findAllFiles(rootDir: string, fileTypes: string[], excludePatterns: string[]): string[] {
  const globPattern = `**/*.{${fileTypes.join(',')}}`;

  // 默认排除的模式
  const defaultIgnorePatterns = [
    '**/node_modules/**',
    '**/miniprogram_npm/**',
    '**/output/dependency-graph.*',
    '**/output/unused-files.*',
    'dependency-graph.*',
    'unused-files.*',
    '**/dist/**',
  ];

  const globOptions: glob.IOptions = {
    cwd: rootDir,
    absolute: true,
    ignore: [...defaultIgnorePatterns, ...excludePatterns],
    nodir: true,
  };

  return glob.sync(globPattern, globOptions);
}

/**
 * 查找未被使用的文件
 * 使用可达性分析：从入口文件开始，标记所有可达的文件，剩余的即为未使用的文件
 */
function findUnusedFiles(
  graph: DependencyGraph,
  projectRoot: string,
  miniappRoot: string,
  essentialFilesUser: string[] = [],
  entryFileUser?: string,
  entryContent?: any,
): string[] {
  // 1. Resolve entry points relative to the miniapp root
  const entryPoints = resolveEntryPoints(graph, miniappRoot, entryFileUser, entryContent);

  // 2. Resolve essential files using both project and miniapp roots
  const essentialFiles = resolveEssentialFiles(projectRoot, miniappRoot, essentialFilesUser);

  // 3. Perform reachability analysis (BFS/DFS)
  const reachableFiles = findReachableFiles(graph, entryPoints, essentialFiles);

  // 4. Determine unused files
  const allProjectFiles = graph.nodes();
  const unusedFiles = allProjectFiles.filter((file) => !reachableFiles.has(file));

  // Debugging output
  logger.verbose('All Project Files:', allProjectFiles.length);
  logger.verbose('Entry Points:', entryPoints);
  logger.verbose('Essential Files:', Array.from(essentialFiles));
  logger.verbose('Reachable Files:', reachableFiles.size);
  logger.info('Unused Files:', unusedFiles.length);

  return unusedFiles;
}

/**
 * Resolves the actual entry points for the analysis based on user input and defaults.
 */
function resolveEntryPoints(
  graph: DependencyGraph,
  miniappRoot: string,
  entryFileUser?: string,
  entryContent?: any,
): string[] {
  const entryFiles: Set<string> = new Set();

  // Attempt 1: User-provided entry file (relative to miniapp root)
  if (entryFileUser) {
    const customEntryPath = path.resolve(miniappRoot, entryFileUser);
    if (fs.existsSync(customEntryPath) && graph.hasNode(customEntryPath)) {
      entryFiles.add(customEntryPath);
      logger.info(`Using custom entry file: ${customEntryPath}`);
    } else {
      logger.warn(
        `Warning: Custom entry file does not exist or not found in graph: ${customEntryPath}`,
      );
    }
  }

  // Attempt 2: User-provided entry content (like app.json)
  if (entryFiles.size === 0 && entryContent) {
    logger.debug('Attempting to parse entry points from provided entry content...');
    parseEntryContent(entryContent, miniappRoot, graph, entryFiles);
  }

  // Attempt 3: Default Mini Program entry points (relative to miniapp root)
  if (entryFiles.size === 0) {
    logger.info('No custom entry points found, using default entry files...');
    findDefaultMiniprogramEntries(miniappRoot, graph, entryFiles);
  }

  if (entryFiles.size === 0) {
    const errorMsg = '未能确定任何有效的入口文件。';
    logger.warn(`${errorMsg} 分析可能不准确。`);
    throw new Error(errorMsg);
  }

  return Array.from(entryFiles);
}

/**
 * Parses entry points from structured content (like app.json).
 */
function parseEntryContent(
  content: any,
  miniappRoot: string,
  graph: DependencyGraph,
  entryFiles: Set<string>,
): void {
  try {
    const addIfExists = (filePathRelative: string) => {
      const normalizedRelativePath = filePathRelative.replace(/\\\\/g, '/');

      const absolutePath = path.resolve(miniappRoot, normalizedRelativePath);

      if (fs.existsSync(absolutePath) && graph.hasNode(absolutePath)) {
        entryFiles.add(absolutePath);
        return true;
      }

      const extensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
      const hasExtension = path.extname(normalizedRelativePath) !== '';

      if (!hasExtension) {
        for (const ext of extensions) {
          const pathWithExt = absolutePath + ext;
          if (fs.existsSync(pathWithExt) && graph.hasNode(pathWithExt)) {
            entryFiles.add(pathWithExt);
            return true;
          }
        }
      }
      return false;
    };

    if (content.pages && Array.isArray(content.pages)) {
      content.pages.forEach((page: string) => addIfExists(page));
    }

    const subpackages = content.subpackages || content.subPackages || [];
    if (Array.isArray(subpackages)) {
      subpackages.forEach((pkg: any) => {
        if (pkg.root && pkg.pages && Array.isArray(pkg.pages)) {
          pkg.pages.forEach((page: string) => {
            const pagePath = path.join(pkg.root, page);
            addIfExists(pagePath);
          });
          addIfExists(path.join(pkg.root, 'app.js'));
          addIfExists(path.join(pkg.root, 'app.json'));
          addIfExists(path.join(pkg.root, 'app.ts'));
        }
      });
    }

    if (content.tabBar && content.tabBar.list && Array.isArray(content.tabBar.list)) {
      content.tabBar.list.forEach((item: any) => {
        if (item.pagePath) addIfExists(item.pagePath);
        if (item.iconPath) addIfExists(item.iconPath);
        if (item.selectedIconPath) addIfExists(item.selectedIconPath);
      });
    }

    if (content.usingComponents && typeof content.usingComponents === 'object') {
      Object.entries(content.usingComponents).forEach(([_componentName, componentPath]) => {
        if (typeof componentPath === 'string') {
          let success = addIfExists(componentPath as string);

          if (!success) {
            const pathStr = componentPath as string;
            const normalizedPath = pathStr.startsWith('/') ? pathStr.substring(1) : pathStr;

            success = addIfExists(normalizedPath);

            if (!success) {
              const extensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];

              for (const ext of extensions) {
                if (addIfExists(`${pathStr}${ext}`)) {
                  logger.info(
                    `Successfully added component dependency (original path): ${pathStr}${ext}`,
                  );
                  success = true;
                  break;
                }
              }

              if (!success) {
                for (const ext of extensions) {
                  if (addIfExists(`${normalizedPath}${ext}`)) {
                    logger.info(
                      `Successfully added component dependency (standardized path): ${normalizedPath}${ext}`,
                    );
                    break;
                  }
                }
              }
            }
          }
        }
      });
    }
  } catch (error) {
    logger.error(`Failed to parse entry content: ${(error as Error).message}`);
  }
}

/**
 * Finds default Mini Program entry points like app.js, app.json.
 */
function findDefaultMiniprogramEntries(
  miniappRoot: string,
  graph: DependencyGraph,
  entryFiles: Set<string>,
): void {
  const possibleEntryFiles = ['app.js', 'app.ts', 'app.json'];

  for (const entryFileName of possibleEntryFiles) {
    const entryFilePath = path.resolve(miniappRoot, entryFileName);
    if (fs.existsSync(entryFilePath) && graph.hasNode(entryFilePath)) {
      entryFiles.add(entryFilePath);
      logger.info(`Found and using default entry file: ${entryFilePath}`);
    }
  }
}

/**
 * Resolves essential files that are always considered reachable.
 */
function resolveEssentialFiles(
  projectRoot: string,
  miniappRoot: string,
  essentialFilesUser: string[],
): Set<string> {
  const projectLevelFiles = [
    'tsconfig.json',
    'mp-analyzer.config.json',
    'package.json',
    '.eslintrc.js',
    '.eslintrc.json',
    '.prettierrc',
    '.prettierrc.js',
    '.babelrc',
    'babel.config.js',
  ];

  const miniappLevelFiles = [
    'app.json',
    'project.config.json',
    'project.private.config.json',
    'sitemap.json',
    'theme.json',
    'ext.json',
  ];

  const essentialFiles = new Set<string>();

  projectLevelFiles.forEach((file) => {
    const absPath = path.resolve(projectRoot, file);
    essentialFiles.add(absPath);
  });

  miniappLevelFiles.forEach((file) => {
    const absPath = path.resolve(miniappRoot, file);
    essentialFiles.add(absPath);
  });

  essentialFilesUser.forEach((file) => {
    const absPath = path.resolve(miniappRoot, file);
    essentialFiles.add(absPath);
  });

  return essentialFiles;
}

/**
 * Performs a Depth-First Search (DFS) or Breadth-First Search (BFS)
 * starting from entry points to find all reachable files.
 */
function findReachableFiles(
  graph: DependencyGraph,
  entryPoints: string[],
  essentialFiles: Set<string>,
): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [];

  essentialFiles.forEach((file) => {
    if (graph.hasNode(file)) {
      if (!reachable.has(file)) {
        reachable.add(file);
        queue.push(file);
      }
    }
  });

  entryPoints.forEach((entry) => {
    if (graph.hasNode(entry) && !reachable.has(entry)) {
      reachable.add(entry);
      queue.push(entry);
    }
  });

  while (queue.length > 0) {
    const node = queue.shift()!;

    const neighbors = graph.outEdges(node);
    for (const neighbor of neighbors) {
      if (graph.hasNode(neighbor) && !reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return reachable;
}
