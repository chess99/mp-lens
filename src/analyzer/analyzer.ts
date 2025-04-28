import * as fs from 'fs';
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

  // --- Build Project Structure ---
  const builder = new ProjectStructureBuilder(
    trueProjectRoot,
    actualMiniappRoot,
    appJsonPath,
    appJsonContent,
    options,
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
  // 1. Identify Entry Nodes from the Structure
  const entryNodes: Set<string> = new Set();
  if (structure.rootNodeId) {
    entryNodes.add(structure.rootNodeId);
  } else {
    logger.warn('Project structure has no root node ID defined.');
  }

  // 2. Resolve essential FILE paths (convert user input to absolute paths)
  const essentialFilePaths = resolveEssentialFiles(projectRoot, miniappRoot, essentialFilesUser);

  // Add essential file paths to the entry points for traversal
  const nodeMap = new Map(structure.nodes.map((n) => [n.id, n]));
  essentialFilePaths.forEach((filePath) => {
    if (nodeMap.has(filePath)) {
      entryNodes.add(filePath);
      logger.verbose(`Adding essential file node to entry points: ${filePath}`);
    } else {
      logger.warn(`Essential file specified but not found in structure: ${filePath}`);
    }
  });

  // 3. Find pure ambient declaration files (d.ts) - Logic remains the same
  const allFilePathsInStructure = structure.nodes
    .filter((n) => n.type === 'Module' && n.properties?.absolutePath)
    .map((n) => n.properties!.absolutePath as string);

  const pureAmbientDtsFiles = findPureAmbientDeclarationFiles(projectRoot, allFilePathsInStructure);

  // Add pure ambient d.ts files to entry nodes for traversal
  pureAmbientDtsFiles.forEach((filePath) => {
    if (nodeMap.has(filePath)) {
      entryNodes.add(filePath);
      logger.verbose(`Adding ambient d.ts node to entry points: ${filePath}`);
    } else {
      logger.warn(`Ambient d.ts file found but not present as node in structure: ${filePath}`);
    }
  });

  if (pureAmbientDtsFiles.length > 0) {
    logger.debug(
      `Added ${pureAmbientDtsFiles.length} pure ambient declaration files to traversal entry points`,
    );
  }

  // 4. Perform reachability analysis using the ProjectStructure (BFS/DFS)
  const reachableNodeIds = findReachableNodes(structure, Array.from(entryNodes));

  // 5. Determine unused FILES
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
  logger.verbose('Entry Node IDs:', Array.from(entryNodes));
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

  // Precompute outgoing links for faster lookup
  structure.links.forEach((link) => {
    if (!linksFrom.has(link.source)) {
      linksFrom.set(link.source, []);
    }
    linksFrom.get(link.source)!.push(link);
  });

  // Initialize queue with entry points that exist in the graph
  const nodeMap = new Map(structure.nodes.map((n) => [n.id, n]));
  entryNodeIds.forEach((id) => {
    if (nodeMap.has(id)) {
      queue.push(id);
      reachable.add(id);
    } else {
      logger.warn(`Entry node ID specified but not found in graph: ${id}`);
    }
  });

  while (queue.length > 0) {
    const currentNodeId = queue.shift()!;

    // Find nodes reachable from the current node
    const outgoingLinks = linksFrom.get(currentNodeId) || [];

    for (const link of outgoingLinks) {
      const targetNodeId = link.target;
      if (nodeMap.has(targetNodeId) && !reachable.has(targetNodeId)) {
        reachable.add(targetNodeId);
        queue.push(targetNodeId);
      }
    }
  }

  logger.debug(`Reachability analysis complete. Found ${reachable.size} reachable nodes.`);
  return reachable;
}
