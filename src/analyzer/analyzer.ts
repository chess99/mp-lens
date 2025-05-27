import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { logger } from '../utils/debug-logger';
import { HandledError } from '../utils/errors';
import { findPureAmbientDeclarationFiles } from '../utils/typescript-helper';
import { GraphLink, ProjectStructure } from './project-structure';
import { ProjectStructureBuilder } from './project-structure-builder';

interface AnalysisResult {
  projectStructure: ProjectStructure;
  unusedFiles: string[];
  reachableNodeIds: Set<string>;
}

// --- Start: Helper Function Definitions --- //

/**
 * Finds all .d.ts files that are pure ambient declarations.
 */
// function findPureAmbientDeclarationFiles(projectRoot: string, allFiles: string[]): string[] {
// Implementation might be complex, assume it exists and works
// return [];
// }

/**
 * Resolves user-provided essential file paths relative to project/miniapp roots.
 */
// function resolveEssentialFiles(
//   projectRoot: string,
//   miniappRoot: string,
//   essentialFilesUser: string[],
// ): Set<string> {
// Implementation needs file system access
// return new Set<string>();
// }

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

  const globOptions = {
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
    logger.debug(`Found ${files.length} files via initial scan in ${rootDir}`);
    return files;
  } catch (error) {
    logger.error(`Error during initial file scan:`, error);
    return [];
  }
}
// --- End: Re-added findAllFiles --- //

// --- Start: Exported analyzeProject function --- //

export async function analyzeProject(
  projectRoot: string,
  options: AnalyzerOptions,
): Promise<AnalysisResult> {
  const {
    fileTypes = ['js', 'ts', 'wxml', 'wxss', 'json'],
    excludePatterns = [],
    miniappRoot,
    appJsonPath,
    appJsonContent,
    essentialFiles = [],
    includeAssets = false,
  } = options;

  logger.debug('Project Root:', projectRoot);
  logger.debug('MiniApp Root:', miniappRoot);
  logger.debug('Exclude patterns:', excludePatterns);
  logger.debug('Include assets in cleanup:', includeAssets);
  logger.debug('Essential files:', essentialFiles);

  // 验证 appJsonContent 存在
  if (
    !appJsonContent ||
    typeof appJsonContent !== 'object' ||
    Object.keys(appJsonContent).length === 0
  ) {
    const errorMsg =
      '分析失败: 没有找到有效的 app.json 内容。请确保小程序项目根目录中存在 app.json 文件，或通过配置提供 appJsonContent。';
    logger.error(errorMsg);
    throw new HandledError(errorMsg);
  }

  // --- Initial File Scan --- //
  // Scan should happen within the miniapp root if specified
  const allFoundFiles = findAllFiles(miniappRoot, fileTypes, excludePatterns);
  if (allFoundFiles.length === 0) {
    // If no files found, analysis will be based solely on appJsonContent
    logger.warn('在指定的 miniapp 根目录中未找到匹配的文件。');
  }

  // Add app.json path if it exists and wasn't found by glob (e.g., different extension)
  if (appJsonPath && !allFoundFiles.includes(appJsonPath)) {
    logger.debug(`Manually adding app.json path to found files: ${appJsonPath}`);
    allFoundFiles.push(appJsonPath);
  }

  // --- Build Project Structure ---
  const builder = new ProjectStructureBuilder(
    projectRoot,
    miniappRoot,
    appJsonPath,
    appJsonContent,
    allFoundFiles, // Pass the list of all files
    options, // Pass remaining options
  );

  const projectStructure = await builder.build();

  // --- Calculate Reachable Nodes FIRST --- //
  const nodeMap = new Map(projectStructure.nodes.map((n) => [n.id, n]));
  const entryNodeIdsSet: Set<string> = new Set();
  if (projectStructure.rootNodeId) {
    entryNodeIdsSet.add(projectStructure.rootNodeId);
  } else {
    logger.warn('Project structure has no root node ID defined.');
  }
  // Add essential files as entry points
  const essentialFilePaths = resolveEssentialFiles(projectRoot, miniappRoot, essentialFiles);
  essentialFilePaths.forEach((filePath) => {
    if (nodeMap.has(filePath)) {
      entryNodeIdsSet.add(filePath);
      logger.trace(`Added essential file path as entry point: ${filePath}`);
    } else {
      logger.trace(`Essential file path specified but not found as node: ${filePath}`);
    }
  });
  // Add pure ambient declaration files as entry points
  const allFilePathsInStructure = projectStructure.nodes
    .filter((n) => n.type === 'Module' && n.properties?.absolutePath)
    .map((n) => n.properties!.absolutePath as string);
  const pureAmbientDtsFiles = findPureAmbientDeclarationFiles(projectRoot, allFilePathsInStructure);
  pureAmbientDtsFiles.forEach((filePath) => {
    if (nodeMap.has(filePath)) {
      entryNodeIdsSet.add(filePath);
      logger.trace(`Added pure ambient d.ts as entry point: ${filePath}`);
    } else {
      logger.warn(`Ambient d.ts file found but not present as node in structure: ${filePath}`);
    }
  });
  logger.debug(`Starting reachability analysis from ${entryNodeIdsSet.size} entry nodes.`);
  const reachableNodeIds = findReachableNodes(projectStructure, Array.from(entryNodeIdsSet));
  logger.debug(`Found ${reachableNodeIds.size} total reachable nodes.`);

  // --- Find Unused Files using the Calculated Reachable Nodes --- //
  const unusedFiles = findUnusedFiles(
    projectStructure,
    projectRoot,
    reachableNodeIds, // <-- Pass calculated reachable nodes
    includeAssets,
  );

  return {
    projectStructure,
    unusedFiles,
    reachableNodeIds, // <-- Return calculated reachable nodes
  };
}

/**
 * Finds unused files using the ProjectStructure.
 * Relies on pre-calculated reachableNodeIds.
 */
function findUnusedFiles(
  structure: ProjectStructure,
  projectRoot: string,
  reachableNodeIds: Set<string>, // <-- Receive reachable nodes
  includeAssets: boolean = false,
): string[] {
  // --- Step 1: Determine Unused FILES --- //
  const allModuleNodes = structure.nodes.filter((n) => n.type === 'Module');
  const unusedModuleNodes = allModuleNodes.filter((node) => !reachableNodeIds.has(node.id));
  let unusedFiles = unusedModuleNodes
    .map((node) => node.properties?.absolutePath as string | undefined)
    .filter((filePath): filePath is string => !!filePath);

  // --- Step 2: Filter out asset files unless includeAssets is true --- //
  if (!includeAssets) {
    const assetExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];
    logger.debug(`Filtering out asset files with extensions: ${assetExtensions.join(', ')}`);

    unusedFiles = unusedFiles.filter((absolutePath) => {
      const fileExt = path.extname(absolutePath).toLowerCase();
      const isAsset = assetExtensions.includes(fileExt);

      if (isAsset) {
        const relativePath = path.relative(projectRoot, absolutePath);
        logger.verbose(`Keeping asset file (assets are excluded by default): ${relativePath}`);
      }

      // Keep the file in the unused list only if it's NOT an asset or if we explicitly want to include assets
      return !isAsset;
    });
  }

  // Debugging output (adjusted)
  logger.verbose('Total Module Nodes:', allModuleNodes.length);
  // logger.verbose('Entry Node IDs for BFS:', entryNodeIds.size); // Removed, happens before
  logger.verbose('Reachable Node IDs:', reachableNodeIds.size);
  logger.info(`发现 ${unusedFiles.length} 个未使用的文件。`);

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
