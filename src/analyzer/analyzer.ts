import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { logger } from '../utils/debug-logger';
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

/**
 * Calculates aggregate statistics (files, size, types) for each node based on reachability.
 * - For Module nodes: Stats reflect the individual file.
 * - For App/Package/Page/Component nodes: Stats reflect all unique Module nodes reachable
 *   from that structural node (including traversing Dependency/Import links).
 * Modifies the nodes directly within the provided structure object.
 */
function populateNodeStatistics(structure: ProjectStructure): void {
  const nodeMap = new Map(structure.nodes.map((n) => [n.id, n]));
  const linksFrom = new Map<string, GraphLink[]>();

  // Precompute outgoing links for faster lookup
  structure.links.forEach((link) => {
    if (!linksFrom.has(link.source)) {
      linksFrom.set(link.source, []);
    }
    linksFrom.get(link.source)!.push(link);
  });

  // Function to perform BFS from a set of start nodes and return reachable MODULE nodes
  const findReachableModules = (startNodeIds: string[]): Set<string> => {
    const reachableModules = new Set<string>();
    const visited = new Set<string>();
    const queue: string[] = [];

    // Initialize queue with valid start nodes
    startNodeIds.forEach((id) => {
      if (nodeMap.has(id) && !visited.has(id)) {
        queue.push(id);
        visited.add(id);
        // If start node itself is a module, add it
        if (nodeMap.get(id)?.type === 'Module') {
          reachableModules.add(id);
        }
      }
    });

    while (queue.length > 0) {
      const currentNodeId = queue.shift()!;
      const outgoingLinks = linksFrom.get(currentNodeId) || [];

      for (const link of outgoingLinks) {
        const targetNodeId = link.target;
        if (nodeMap.has(targetNodeId) && !visited.has(targetNodeId)) {
          visited.add(targetNodeId);
          queue.push(targetNodeId);
          // If the target is a Module, add it to our set
          if (nodeMap.get(targetNodeId)?.type === 'Module') {
            reachableModules.add(targetNodeId);
          }
        }
      }
    }
    return reachableModules;
  };

  // Iterate through all nodes and calculate stats
  for (const node of structure.nodes) {
    if (!node.properties) node.properties = {};

    if (node.type === 'Module') {
      // Base stats for individual modules
      const fileSize = node.properties.fileSize || 0;
      const fileExt = node.properties.fileExt || 'unknown';
      node.properties.fileCount = 1;
      node.properties.totalSize = fileSize;
      node.properties.fileTypes = { [fileExt]: 1 };
      node.properties.sizeByType = { [fileExt]: fileSize };
    } else if (['App', 'Package', 'Page', 'Component'].includes(node.type)) {
      // Aggregate stats for structural nodes
      let totalFiles = 0;
      let totalSize = 0;
      const fileTypes: Record<string, number> = {};
      const sizeByType: Record<string, number> = {};

      // Find entry points for traversal: the node itself + direct module children
      const startNodesForTraversal = new Set<string>([node.id]);
      const directChildrenLinks = linksFrom.get(node.id) || [];
      directChildrenLinks.forEach((link) => {
        // Consider modules directly linked via Structure (e.g., page.js)
        // Or config files linked via Config (e.g., app.json)
        if (link.type === 'Structure' || link.type === 'Config') {
          const targetNode = nodeMap.get(link.target);
          if (targetNode?.type === 'Module') {
            startNodesForTraversal.add(link.target);
          }
        }
      });

      // --- DEBUGGING START ---
      if (node.type === 'Component') {
        logger.debug(`[Stats Aggregation] Processing Component: ${node.id}`);
        logger.debug(
          `  Start Nodes for Traversal: ${Array.from(startNodesForTraversal).join(', ')}`,
        );
      }
      // --- DEBUGGING END ---

      // Find all unique modules reachable from these starting points
      const reachableModules = findReachableModules(Array.from(startNodesForTraversal));

      // --- DEBUGGING START ---
      if (node.type === 'Component') {
        logger.debug(`  Reachable Modules Found: ${reachableModules.size}`);
        // Optionally log the first few module IDs:
        // logger.trace(`    Modules: ${Array.from(reachableModules).slice(0, 5).join(', ')}`);
      }
      // --- DEBUGGING END ---

      // Aggregate stats from the reachable modules
      reachableModules.forEach((moduleId) => {
        const moduleNode = nodeMap.get(moduleId);
        if (moduleNode && moduleNode.type === 'Module' && moduleNode.properties) {
          const fileSize = moduleNode.properties.fileSize || 0;
          const fileExt = moduleNode.properties.fileExt || 'unknown';

          totalFiles += 1; // Each unique reachable module counts as 1 file for the container
          totalSize += fileSize;
          fileTypes[fileExt] = (fileTypes[fileExt] || 0) + 1;
          sizeByType[fileExt] = (sizeByType[fileExt] || 0) + fileSize;
        }
      });

      // --- DEBUGGING START ---
      if (node.type === 'Component') {
        logger.debug(`  Calculated totalFiles: ${totalFiles}`);
      }
      // --- DEBUGGING END ---

      // Assign aggregated stats to the structural node
      node.properties.fileCount = totalFiles;
      node.properties.totalSize = totalSize;
      node.properties.fileTypes = fileTypes;
      node.properties.sizeByType = sizeByType;
    }
  }

  logger.debug('Finished populating node statistics based on reachability.');
}

/**
 * Resolves the app.json path and content based on user options or defaults.
 */
function resolveAppJson(
  miniappRoot: string,
  entryFile?: string,
  entryContent?: any,
): { appJsonPath: string | null; appJsonContent: any } {
  let appJsonPath: string | null = null;
  let effectiveAppJsonContent: any = {}; // Default to empty object

  // Priority 1: Use provided entry content
  if (entryContent && typeof entryContent === 'object' && Object.keys(entryContent).length > 0) {
    logger.info('使用提供的 entryContent 作为 app.json 结构。');
    effectiveAppJsonContent = entryContent;
    // Try to find a corresponding path if entryFile hint is given
    if (entryFile) {
      const potentialPath = path.resolve(miniappRoot, entryFile);
      if (fs.existsSync(potentialPath)) {
        appJsonPath = potentialPath;
        logger.debug(`Found potential app.json path matching entryFile hint: ${appJsonPath}`);
      } else {
        logger.debug(
          `EntryFile hint given (${entryFile}), but file not found at ${potentialPath}.`,
        );
      }
    }
    return { appJsonPath, appJsonContent: effectiveAppJsonContent };
  }

  // Priority 2: Use provided entry file path
  if (entryFile) {
    const potentialPath = path.resolve(miniappRoot, entryFile);
    if (fs.existsSync(potentialPath)) {
      logger.info(`使用自定义入口文件作为 app.json: ${potentialPath}`);
      appJsonPath = potentialPath;
      try {
        const content = fs.readFileSync(appJsonPath, 'utf-8');
        effectiveAppJsonContent = JSON.parse(content);
      } catch (error) {
        logger.error(`Failed to read or parse custom entry file ${appJsonPath}:`, error);
        throw new Error(`Failed to process entry file: ${entryFile}`);
      }
      return { appJsonPath, appJsonContent: effectiveAppJsonContent };
    } else {
      logger.warn(
        `Specified entry file '${entryFile}' not found relative to miniapp root '${miniappRoot}'. Falling back to default app.json detection.`, // eslint-disable-line
      );
    }
  }

  // Priority 3: Find default app.json
  const defaultAppJsonPath = path.resolve(miniappRoot, 'app.json');
  if (fs.existsSync(defaultAppJsonPath)) {
    logger.debug(`Found default app.json at: ${defaultAppJsonPath}`);
    appJsonPath = defaultAppJsonPath;
    try {
      const content = fs.readFileSync(appJsonPath, 'utf-8');
      effectiveAppJsonContent = JSON.parse(content);
    } catch (error) {
      logger.error(`Failed to read or parse default app.json ${appJsonPath}:`, error);
      // If default fails to parse, maybe still proceed with empty content?
      // For now, let's treat it as critical if app.json exists but is invalid.
      throw new Error(`Failed to process default app.json`);
    }
  } else {
    logger.warn(
      'Could not find default app.json and no valid entryFile or entryContent provided. Proceeding with empty app configuration.', // eslint-disable-line
    );
  }

  return { appJsonPath, appJsonContent: effectiveAppJsonContent };
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
  trueProjectRoot: string,
  options: AnalyzerOptions,
): Promise<AnalysisResult> {
  const {
    fileTypes = ['js', 'ts', 'wxml', 'wxss', 'json'],
    excludePatterns = [],
    miniappRoot: miniappRootOption,
    entryFile,
    entryContent,
    essentialFiles = [],
    includeAssets = false,
  } = options;

  logger.debug('Project Root:', trueProjectRoot);

  // --- Resolve MiniApp Root --- //
  let actualMiniappRoot = trueProjectRoot;
  if (miniappRootOption) {
    const potentialMiniappRoot = path.resolve(trueProjectRoot, miniappRootOption);
    if (fs.existsSync(potentialMiniappRoot) && fs.statSync(potentialMiniappRoot).isDirectory()) {
      actualMiniappRoot = potentialMiniappRoot;
      logger.info(`使用指定的小程序根目录: ${actualMiniappRoot}`);
    } else {
      logger.warn(
        `指定的小程序根目录 '${miniappRootOption}' 未找到或不是目录。默认使用项目根目录。`, // eslint-disable-line
      );
    }
  } else {
    logger.debug('Miniapp root not specified, using project root.');
  }
  logger.debug('MiniApp Root:', actualMiniappRoot);
  logger.debug('Exclude patterns:', excludePatterns);
  logger.debug('Include assets in cleanup:', includeAssets);
  logger.debug('Essential files:', essentialFiles);

  // --- Resolve App.json --- //
  const { appJsonPath, appJsonContent } = resolveAppJson(
    actualMiniappRoot,
    entryFile,
    entryContent,
  );

  // --- Initial File Scan --- //
  // Scan should happen within the miniapp root if specified
  const allFoundFiles = findAllFiles(actualMiniappRoot, fileTypes, excludePatterns);
  if (allFoundFiles.length === 0 && !entryContent) {
    // If no files found AND no entryContent provided, analysis is likely pointless
    logger.warn(
      'No files found matching specified types/exclusions within the miniapp root, and no entryContent provided. Analysis may yield empty results.', // eslint-disable-line
    );
    // Decide whether to throw or return empty structure
    // Returning empty might be more user-friendly than throwing hard error
    // return {
    //   projectStructure: { nodes: [], links: [], rootNodeId: null, miniappRoot: actualMiniappRoot },
    //   unusedFiles: [],
    //   reachableNodeIds: new Set<string>(),
    // };
  }
  // Add app.json path if it exists and wasn't found by glob (e.g., different extension)
  if (appJsonPath && !allFoundFiles.includes(appJsonPath)) {
    logger.debug(`Manually adding app.json path to found files: ${appJsonPath}`);
    allFoundFiles.push(appJsonPath);
  }

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

  // --- Calculate Reachable Nodes FIRST --- //
  const nodeMap = new Map(projectStructure.nodes.map((n) => [n.id, n]));
  const entryNodeIdsSet: Set<string> = new Set();
  if (projectStructure.rootNodeId) {
    entryNodeIdsSet.add(projectStructure.rootNodeId);
  } else {
    logger.warn('Project structure has no root node ID defined.');
  }
  // Add essential files as entry points
  const essentialFilePaths = resolveEssentialFiles(
    trueProjectRoot,
    actualMiniappRoot,
    essentialFiles,
  );
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
  const pureAmbientDtsFiles = findPureAmbientDeclarationFiles(
    trueProjectRoot,
    allFilePathsInStructure,
  );
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

  // --- Populate Node Statistics (using reachable nodes for App stats) --- //
  populateNodeStatistics(projectStructure);

  // --- Find Unused Files using the Calculated Reachable Nodes --- //
  const unusedFiles = findUnusedFiles(
    projectStructure,
    trueProjectRoot,
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
