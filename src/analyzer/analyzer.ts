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
  let appJsonPath: string | null = null;
  let appJsonContent: any | null = entryContent || null;

  // --- Step 1: Identify app.json (location and content) ---

  // Attempt 1a: User-provided entry file might BE app.json
  if (entryFileUser) {
    const customEntryPath = path.resolve(miniappRoot, entryFileUser);
    if (fs.existsSync(customEntryPath) && graph.hasNode(customEntryPath)) {
      if (path.basename(customEntryPath) === 'app.json') {
        appJsonPath = customEntryPath;
        logger.info(`Using custom entry file as app.json: ${appJsonPath}`);
        // Try reading content if not already provided
        if (!appJsonContent) {
          try {
            appJsonContent = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
          } catch (e) {
            logger.warn(`Failed to read or parse content from custom app.json: ${appJsonPath}`);
          }
        }
      } else {
        // If user specified a non-app.json file, treat it as a direct entry point
        entryFiles.add(customEntryPath);
        logger.info(`Using custom entry file (non-app.json): ${customEntryPath}`);
      }
    } else {
      logger.warn(
        `Warning: Custom entry file does not exist or not found in graph: ${customEntryPath}`,
      );
    }
  }

  // Attempt 1b: Use provided entryContent if available and app.json path not found yet
  if (appJsonContent && !appJsonPath) {
    logger.debug('Using provided entry content (likely app.json structure).');
    // We have content, but might not know the exact path if not passed via entryFileUser
    // Try finding the default app.json path to associate with this content
    const defaultAppJsonPath = path.resolve(miniappRoot, 'app.json');
    if (fs.existsSync(defaultAppJsonPath) && graph.hasNode(defaultAppJsonPath)) {
      appJsonPath = defaultAppJsonPath;
    }
  }

  // Attempt 1c: Find default app.json if no specific one was identified yet
  if (!appJsonPath) {
    const defaultAppJsonPath = path.resolve(miniappRoot, 'app.json');
    if (fs.existsSync(defaultAppJsonPath) && graph.hasNode(defaultAppJsonPath)) {
      appJsonPath = defaultAppJsonPath;
      logger.info(`Found default app.json: ${appJsonPath}`);
      // Try reading content if not already provided
      if (!appJsonContent) {
        try {
          appJsonContent = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
        } catch (e) {
          logger.warn(`Failed to read or parse content from default app.json: ${appJsonPath}`);
        }
      }
    }
  }

  // --- Step 2: Add Runtime Entry Points (app.js/ts) ---
  // Always look for app.js/app.ts relative to the miniapp root, as the runtime does.
  findImplicitGlobalFiles(miniappRoot, graph, entryFiles);

  // --- Step 3: Add Entry Points from app.json Content ---
  // If we have identified app.json content (from any source), parse it for pages, components etc.
  if (appJsonContent) {
    logger.debug('Parsing app.json content for pages, components, etc...');
    parseEntryContent(appJsonContent, miniappRoot, graph, entryFiles);
    // Also add the app.json file itself as an entry/essential node if found
    if (appJsonPath && graph.hasNode(appJsonPath)) {
      entryFiles.add(appJsonPath);
    }
  } else {
    logger.warn(
      'Could not find or parse app.json content. Analysis might miss pages/components defined there.',
    );
  }

  // --- Step 4: Validate ---
  if (entryFiles.size === 0) {
    const errorMsg =
      'Failed to determine any valid entry points (app.js/ts, app.json pages/components).';
    logger.warn(`${errorMsg} Analysis might be incomplete.`);
    // Only throw error if absolutely nothing could be found
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
    // Helper to find and add all related component files for a given base path
    const addAllRelatedFilesIfExists = (baseRelativePath: string) => {
      const normalizedRelativePath = baseRelativePath.replace(/\\\\/g, '/');
      const absoluteBasePath = path.resolve(miniappRoot, normalizedRelativePath);
      let fileAdded = false; // Track if at least one related file was found

      const extensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];

      for (const ext of extensions) {
        const potentialFilePath = absoluteBasePath + ext;
        if (fs.existsSync(potentialFilePath) && graph.hasNode(potentialFilePath)) {
          // Check if it exists and is part of the initial file scan
          entryFiles.add(potentialFilePath);
          fileAdded = true;
        }
      }
      return fileAdded;
    };

    // Helper to add a single file path if it exists (used for direct references like icons)
    const addSingleFileIfExists = (filePathRelative: string) => {
      const normalizedRelativePath = filePathRelative.replace(/\\\\/g, '/');
      const absolutePath = path.resolve(miniappRoot, normalizedRelativePath);
      if (fs.existsSync(absolutePath) && graph.hasNode(absolutePath)) {
        entryFiles.add(absolutePath);
        return true;
      }
      return false;
    };

    // Process Pages (add all related files)
    if (content.pages && Array.isArray(content.pages)) {
      content.pages.forEach((page: string) => addAllRelatedFilesIfExists(page));
    }

    // Process Subpackages (add all related files for pages)
    const subpackages = content.subpackages || content.subPackages || [];
    if (Array.isArray(subpackages)) {
      subpackages.forEach((pkg: any) => {
        if (pkg.root && pkg.pages && Array.isArray(pkg.pages)) {
          pkg.pages.forEach((page: string) => {
            const pagePath = path.join(pkg.root, page);
            addAllRelatedFilesIfExists(pagePath);
          });
          // Check for subpackage-specific app.js/ts (add single file)
          addSingleFileIfExists(path.join(pkg.root, 'app.js'));
          addSingleFileIfExists(path.join(pkg.root, 'app.ts'));
        }
      });
    }

    // Process TabBar (pagePath needs all related, icons are single files)
    if (content.tabBar && content.tabBar.list && Array.isArray(content.tabBar.list)) {
      content.tabBar.list.forEach((item: any) => {
        if (item.pagePath) addAllRelatedFilesIfExists(item.pagePath); // Page path
        if (item.iconPath) addSingleFileIfExists(item.iconPath); // Icon file
        if (item.selectedIconPath) addSingleFileIfExists(item.selectedIconPath); // Icon file
      });
    }

    // Process Global usingComponents (add all related files for components)
    // Note: Component-specific usingComponents are handled during file parsing,
    // This section handles those defined globally in app.json
    if (content.usingComponents && typeof content.usingComponents === 'object') {
      Object.entries(content.usingComponents).forEach(([_componentName, componentPath]) => {
        if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
          // Treat component paths like page paths - add all related files
          addAllRelatedFilesIfExists(componentPath as string);
        }
      });
    }

    // Add theme.json if present
    if (content.themeLocation) {
      addSingleFileIfExists(content.themeLocation);
    }
    addSingleFileIfExists('theme.json'); // Default location

    // Add workers if present (they are entry points)
    if (content.workers && typeof content.workers === 'string') {
      addSingleFileIfExists(content.workers);
    }
  } catch (error) {
    logger.error(`Failed to parse entry content: ${(error as Error).message}`);
  }
}

/**
 * Finds implicitly loaded global files (app.js, app.ts, app.wxss).
 * These are loaded automatically by the runtime if they exist.
 */
function findImplicitGlobalFiles(
  miniappRoot: string,
  graph: DependencyGraph,
  entryFiles: Set<string>, // Modified in place
): void {
  const possibleImplicitFiles = [
    'app.js', // Global script
    'app.ts', // Global script (TypeScript)
    'app.wxss', // Global stylesheet
  ];

  logger.debug('Searching for implicit global files (app.js/ts/wxss)...');
  for (const entryFileName of possibleImplicitFiles) {
    const entryFilePath = path.resolve(miniappRoot, entryFileName);
    if (fs.existsSync(entryFilePath) && graph.hasNode(entryFilePath)) {
      if (entryFiles.has(entryFilePath)) {
        logger.trace(`Implicit global file already added: ${entryFilePath}`);
      } else {
        entryFiles.add(entryFilePath);
        logger.info(`Found and added implicit global file: ${entryFilePath}`);
      }
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
    'jsconfig.json',
    'mp-analyzer.config.json',
    'mp-analyzer.config.js',
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
