import * as fs from 'fs';
import * as glob from 'glob';
import minimatch from 'minimatch';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { logger } from '../utils/debug-logger';
import { findPureAmbientDeclarationFiles } from '../utils/typescript-helper';
import { GraphLink, ProjectStructure } from './project-structure';
import { ProjectStructureBuilder } from './project-structure-builder';

interface AnalysisResult {
  projectStructure: ProjectStructure;
  unusedFiles: string[];
}

// --- Start: New Helper Function --- //
/**
 * Resolves the app.json path and content based on options and defaults.
 */
function resolveAppJson(
  miniappRoot: string,
  entryFile?: string,
  entryContent?: any,
): { appJsonPath: string | null; appJsonContent: any } {
  let appJsonPath: string | null = null;
  let resolvedContent: any = entryContent || null;

  // Attempt 1: User-provided entry file
  if (entryFile) {
    const customEntryPath = path.resolve(miniappRoot, entryFile);
    if (fs.existsSync(customEntryPath)) {
      if (path.basename(customEntryPath) === 'app.json') {
        appJsonPath = customEntryPath;
        logger.info(`Using custom entry file as app.json: ${appJsonPath}`);
        if (!resolvedContent) {
          try {
            resolvedContent = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
          } catch (e) {
            logger.warn(`Failed to read/parse content from custom app.json: ${appJsonPath}`);
          }
        }
      } else {
        logger.warn(
          `Custom entry file '${entryFile}' is not app.json. Its content won't be used for app structure unless provided via entryContent.`, // Clarified warning
        );
      }
    } else {
      logger.warn(`Custom entry file specified but does not exist: ${customEntryPath}`);
    }
  }

  // Attempt 2: Use provided entryContent if path wasn't found via entryFile
  if (resolvedContent && !appJsonPath) {
    logger.debug('Using provided entry content.');
    const defaultAppJsonPath = path.resolve(miniappRoot, 'app.json');
    if (fs.existsSync(defaultAppJsonPath)) {
      appJsonPath = defaultAppJsonPath; // Associate content with default path
      logger.debug(`Associated entryContent with existing default app.json: ${appJsonPath}`);
    } else {
      logger.debug('Using provided entryContent without a corresponding app.json file.');
    }
  }

  // Attempt 3: Find default app.json if no path or content yet
  if (!appJsonPath && !resolvedContent) {
    const defaultAppJsonPath = path.resolve(miniappRoot, 'app.json');
    if (fs.existsSync(defaultAppJsonPath)) {
      appJsonPath = defaultAppJsonPath;
      logger.info(`Found default app.json: ${appJsonPath}`);
      try {
        resolvedContent = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8'));
      } catch (e) {
        logger.warn(`Failed to read/parse content from default app.json: ${appJsonPath}`);
      }
    }
  }

  // Final check and return
  if (!appJsonPath && !resolvedContent) {
    throw new Error(
      'Failed to determine app.json path or content (checked custom entry, entryContent, and default app.json). Cannot analyze structure.',
    );
  }

  if (!resolvedContent) {
    logger.warn(
      `Proceeding with app.json path (${appJsonPath}) but no valid content could be parsed/found. Structure analysis might be incomplete.`,
    );
    resolvedContent = {}; // Ensure content is always an object
  }

  return { appJsonPath, appJsonContent: resolvedContent };
}
// --- End: New Helper Function --- //

// --- Start: Re-added findAllFiles --- //
/**
 * 在指定目录中查找所有符合条件的文件
 */
function findAllFiles(rootDir: string, fileTypes: string[], excludePatterns: string[]): string[] {
  // Ensure fileTypes are valid for glob pattern
  const safeFileTypes = fileTypes.filter((t) => t && /^[a-zA-Z0-9]+$/.test(t));
  if (safeFileTypes.length === 0) {
    logger.warn('No valid file types specified for glob search.');
    return [];
  }
  const globPattern = `**/*.{${safeFileTypes.join(',')}}`;

  // Default ignore patterns (consider refining these)
  const defaultIgnorePatterns = [
    '**/node_modules/**',
    '**/miniprogram_npm/**',
    // Add other common build/output dirs if necessary, e.g., '**/dist/**'?
    // Keep output patterns from original
    '**/output/dependency-graph.*',
    '**/output/unused-files.*',
    'dependency-graph.*',
    'unused-files.*',
  ];

  const globOptions: glob.IOptions = {
    cwd: rootDir,
    absolute: true,
    ignore: [...defaultIgnorePatterns, ...excludePatterns],
    nodir: true,
    dot: true, // Include hidden files/folders if not excluded
  };

  logger.debug(`Glob pattern: ${globPattern}`);
  logger.debug(`Glob options:`, globOptions);

  try {
    const files = glob.sync(globPattern, globOptions);
    logger.info(`Found ${files.length} files via initial scan in ${rootDir}`);
    return files;
  } catch (error) {
    logger.error(`Error during initial file scan:`, error);
    return [];
  }
}
// --- End: Re-added findAllFiles --- //

/**
 * Main analysis function.
 */
export async function analyzeProject(
  trueProjectRoot: string,
  options: AnalyzerOptions,
): Promise<AnalysisResult> {
  const {
    excludePatterns = [],
    essentialFiles = [],
    miniappRoot: miniappRootRelative,
    entryFile,
    entryContent,
    keepAssets = [],
  } = options;

  // Determine the absolute path for the miniapp root
  const actualMiniappRoot = miniappRootRelative
    ? path.resolve(trueProjectRoot, miniappRootRelative)
    : trueProjectRoot;

  logger.debug('Project Root:', trueProjectRoot);
  logger.debug('MiniApp Root:', actualMiniappRoot);
  logger.verbose('Analyzer received options:', options);
  logger.debug('Exclude patterns:', excludePatterns);
  logger.debug('Keep assets patterns:', keepAssets);

  if (essentialFiles.length > 0) {
    logger.debug('Essential files:', essentialFiles);
  }

  if (entryFile) {
    logger.debug('Using custom entry file hint:', entryFile);
  }

  if (entryContent) {
    logger.debug('Using provided entry content hint');
  }

  // Validate the MiniApp root path
  if (!actualMiniappRoot || !fs.existsSync(actualMiniappRoot)) {
    throw new Error(`小程序目录不存在: ${actualMiniappRoot}`);
  }

  // --- Resolve App.json Config --- //
  const { appJsonPath, appJsonContent } = resolveAppJson(
    actualMiniappRoot,
    entryFile,
    entryContent,
  );

  // --- Start: Add initial file scan --- //
  const fileTypes = (options.fileTypes as string[] | undefined) ?? [
    // Default types, align with builder/parser if possible
    'js',
    'ts',
    'json',
    'wxml',
    'wxss',
    'wxs',
    // Include common assets by default?
    'png',
    'jpg',
    'jpeg',
    'gif',
    'svg',
  ];
  const allFoundFiles = findAllFiles(
    actualMiniappRoot, // Scan within miniapp root
    fileTypes,
    options.excludePatterns ?? [],
  );
  // --- End: Add initial file scan --- //

  // --- Build Project Structure ---
  const builder = new ProjectStructureBuilder(
    trueProjectRoot,
    actualMiniappRoot,
    appJsonPath,
    appJsonContent,
    allFoundFiles, // Pass the list of all files
    options, // Pass remaining options
  );

  const projectStructure = await builder.build();

  // --- Find Unused Files using the New Structure ---
  const unusedFiles = findUnusedFiles(
    projectStructure,
    trueProjectRoot,
    actualMiniappRoot,
    essentialFiles,
    keepAssets,
  );

  return {
    projectStructure,
    unusedFiles,
  };
}

/**
 * Finds unused files using the ProjectStructure.
 */
function findUnusedFiles(
  structure: ProjectStructure,
  projectRoot: string,
  miniappRoot: string,
  essentialFilesUser: string[] = [],
  keepAssetsPatterns: string[] = [],
): string[] {
  const nodeMap = new Map(structure.nodes.map((n) => [n.id, n]));

  // --- Step 1: Identify Entry FILE Node IDs --- //
  const entryNodeIds: Set<string> = new Set();
  if (structure.rootNodeId) {
    entryNodeIds.add(structure.rootNodeId);
  } else {
    logger.warn('Project structure has no root node ID defined.');
  }

  // --- Step 2: Identify Essential Node IDs --- //
  const essentialNodeIds: Set<string> = new Set();
  logger.trace('--- Identifying Essential Nodes ---');
  // 3a. Resolve essential file paths specified by user + defaults
  const essentialFilePaths = resolveEssentialFiles(projectRoot, miniappRoot, essentialFilesUser);
  essentialFilePaths.forEach((filePath) => {
    if (nodeMap.has(filePath)) {
      essentialNodeIds.add(filePath);
      // Add essential file path node to the entry points for traversal
      entryNodeIds.add(filePath);
      logger.trace(`Added essential node ID to entries: ${filePath}`);
      logger.verbose(`Adding essential file node to entry points: ${nodeMap.get(filePath)?.label}`);
    } else {
      logger.trace(`Essential file path specified but not found as node: ${filePath}`);
    }
  });

  // 3b. Find pure ambient declaration files
  const allFilePathsInStructure = structure.nodes
    .filter((n) => n.type === 'Module' && n.properties?.absolutePath)
    .map((n) => n.properties!.absolutePath as string);
  const pureAmbientDtsFiles = findPureAmbientDeclarationFiles(projectRoot, allFilePathsInStructure);
  logger.debug(
    `Found ${pureAmbientDtsFiles.length} pure ambient declaration files that will be preserved`,
  );
  pureAmbientDtsFiles.forEach((filePath) => {
    if (nodeMap.has(filePath)) {
      essentialNodeIds.add(filePath);
      // Add ambient d.ts file path node to the entry points for traversal
      entryNodeIds.add(filePath);
      logger.trace(`Added ambient node ID to entries: ${filePath}`);
      logger.verbose(`Adding ambient d.ts node to entry points: ${nodeMap.get(filePath)?.label}`);
    } else {
      logger.warn(`Ambient d.ts file found but not present as node in structure: ${filePath}`);
    }
  });
  logger.debug(`Identified ${essentialNodeIds.size} essential nodes (configs, ambient d.ts).`);

  // --- Step 4: Perform Reachability Analysis from Combined Starting Points --- //
  logger.debug(
    `Starting reachability analysis from ${entryNodeIds.size} nodes (App + essential/ambient).`,
  );
  logger.trace('--- Initial Reachable Queue (Before BFS) ---');
  entryNodeIds.forEach((id) =>
    logger.trace(`Queue initial add: ${nodeMap.get(id)?.label} [${id}]`),
  );
  logger.trace('--- End Initial Queue ---');

  const reachableNodeIds = findReachableNodes(structure, Array.from(entryNodeIds));
  logger.debug(`Found ${reachableNodeIds.size} total reachable nodes.`);

  // --- Step 5: Determine Unused FILES --- //
  const allModuleNodes = structure.nodes.filter((n) => n.type === 'Module');
  const unusedModuleNodes = allModuleNodes.filter((node) => !reachableNodeIds.has(node.id));
  let unusedFiles = unusedModuleNodes
    .map((node) => node.properties?.absolutePath as string | undefined)
    .filter((filePath): filePath is string => !!filePath);

  // 6. Filter out files matching keepAssets patterns
  if (keepAssetsPatterns.length > 0) {
    logger.debug(
      `Filtering unused files against keepAssets patterns: ${keepAssetsPatterns.join(', ')}`,
    );
    unusedFiles = unusedFiles.filter((absolutePath) => {
      const relativePath = path.relative(projectRoot, absolutePath);
      const shouldKeep = keepAssetsPatterns.some((pattern) => minimatch(relativePath, pattern));
      if (shouldKeep) {
        logger.verbose(
          `Keeping file due to keepAssets match (${relativePath} matches ${keepAssetsPatterns.find(
            (p) => minimatch(relativePath, p),
          )}): ${absolutePath}`,
        );
      }
      return !shouldKeep;
    });
  }

  // Debugging output
  logger.verbose('All Module Nodes:', allModuleNodes.length);
  logger.verbose('Entry Node IDs for BFS (App + essential/ambient):', entryNodeIds.size);
  logger.verbose('Reachable Node IDs:', reachableNodeIds.size);
  logger.info('Unused Files Found:', unusedFiles.length);

  return unusedFiles;
}

/**
 * Resolves essential files provided by the user to absolute paths.
 * (Implementation likely remains the same - it deals with file paths)
 */
function resolveEssentialFiles(
  projectRoot: string,
  miniappRoot: string,
  essentialFilesUser: string[],
): Set<string> {
  const essentialFiles = new Set<string>();

  // --- Start: Added Default Essential Files ---
  const projectLevelFiles = [
    'tsconfig.json',
    'jsconfig.json',
    'mp-lens.config.json',
    'mp-lens.config.js',
    'package.json',
    '.eslintrc.js',
    '.eslintrc.json',
    '.prettierrc',
    '.prettierrc.js',
    '.babelrc',
    'babel.config.js',
  ];

  const miniappLevelFiles = [
    'app.json', // Often the source of truth for entries, essential itself
    'project.config.json',
    'project.private.config.json',
    'sitemap.json',
    'theme.json',
    'ext.json',
  ];

  // Add default project-level files
  projectLevelFiles.forEach((file) => {
    const absPath = path.resolve(projectRoot, file);
    // Check existence? Optional, depends if we want to add only existing ones.
    // Adding regardless simplifies logic, reachability check will handle non-existent nodes later.
    // if (fs.existsSync(absPath)) {
    essentialFiles.add(absPath);
    // }
  });

  // Add default miniapp-level files
  miniappLevelFiles.forEach((file) => {
    const absPath = path.resolve(miniappRoot, file);
    // if (fs.existsSync(absPath)) {
    essentialFiles.add(absPath);
    // }
  });
  logger.verbose(
    `Added ${projectLevelFiles.length + miniappLevelFiles.length} default essential file paths.`,
  );
  // --- End: Added Default Essential Files ---

  // Add user-specified essential files
  essentialFilesUser.forEach((file) => {
    // Try resolving relative to miniapp root first, then project root
    const pathFromMiniApp = path.resolve(miniappRoot, file);
    const pathFromProject = path.resolve(projectRoot, file);

    if (fs.existsSync(pathFromMiniApp)) {
      essentialFiles.add(pathFromMiniApp);
      logger.verbose(`Resolved essential file (from miniapp root): ${file} -> ${pathFromMiniApp}`);
    } else if (fs.existsSync(pathFromProject)) {
      essentialFiles.add(pathFromProject);
      logger.verbose(`Resolved essential file (from project root): ${file} -> ${pathFromProject}`);
    } else {
      logger.warn(`Specified essential file not found: ${file}`);
    }
  });
  return essentialFiles;
}

/**
 * Performs reachability analysis (BFS) on the ProjectStructure graph.
 */
function findReachableNodes(structure: ProjectStructure, entryNodeIds: string[]): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = [];
  const linksFrom = new Map<string, GraphLink[]>();
  const nodeMap = new Map(structure.nodes.map((n) => [n.id, n]));

  // Precompute outgoing links for faster lookup
  structure.links.forEach((link) => {
    if (!linksFrom.has(link.source)) {
      linksFrom.set(link.source, []);
    }
    linksFrom.get(link.source)!.push(link);
  });

  // Initialize queue with entry points that exist in the graph
  entryNodeIds.forEach((id) => {
    if (nodeMap.has(id)) {
      queue.push(id);
      reachable.add(id);
    } else {
      logger.warn(`Entry node ID specified but not found in graph: ${id}`);
    }
  });

  logger.trace(`findReachableNodes: Starting BFS with initial queue size ${queue.length}`);
  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;
    logger.trace(`BFS: Processing node ${nodeMap.get(currentNodeId)?.label} [${currentNodeId}]`);

    // Find nodes reachable from the current node
    const outgoingLinks = linksFrom.get(currentNodeId) || [];
    logger.trace(`BFS: Found ${outgoingLinks.length} outgoing links from ${currentNodeId}`);

    for (const link of outgoingLinks) {
      const targetNodeId = link.target;
      const targetNodeLabel = nodeMap.get(targetNodeId)?.label;
      logger.trace(
        `BFS: Checking neighbor ${targetNodeLabel} [${targetNodeId}] via link type ${link.type}`,
      );
      if (nodeMap.has(targetNodeId) && !reachable.has(targetNodeId)) {
        reachable.add(targetNodeId);
        queue.push(targetNodeId);
        logger.trace(`BFS: Added ${targetNodeLabel} [${targetNodeId}] to reachable set and queue.`);
      } else if (!nodeMap.has(targetNodeId)) {
        logger.trace(`BFS: Neighbor node not found in map: ${targetNodeId}`);
      } else if (reachable.has(targetNodeId)) {
        logger.trace(`BFS: Neighbor already reachable: ${targetNodeLabel} [${targetNodeId}]`);
      }
    }
  }

  logger.debug(`Reachability analysis complete. Found ${reachable.size} reachable nodes.`);
  return reachable;
}
