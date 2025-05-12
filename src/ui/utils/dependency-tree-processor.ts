import type {
  GraphLink,
  GraphNode,
  NodeType,
  ProjectStructure,
} from '../../analyzer/project-structure';
import type { TreeNodeData } from '../types';

interface ExtendedNodeProperties extends Record<string, any> {
  fileCount?: number;
  totalSize?: number;
  fileTypes?: Record<string, number>;
  sizeByType?: Record<string, number>;
  reachableModuleIds?: Set<string>; // Added to store the IDs
}

interface FileStats {
  fileCount: number;
  totalSize: number;
  fileTypes: Record<string, number>;
  sizeByType: Record<string, number>;
  // We will now store this on the node properties instead of here
  // reachableModuleIds: Set<string>;
}

/**
 * Helper function to format bytes into human-readable form.
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  // Handle cases where bytes might be unexpectedly small leading to i < 0
  if (bytes < 1) return bytes.toFixed(dm) + ' Bytes';
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Calculates statistics from a collection of module IDs.
 */
function calculateStatsFromModuleIds(
  moduleIds: Set<string>,
  nodeMap: Map<string, GraphNode>,
): FileStats {
  const stats: FileStats = {
    fileCount: 0,
    totalSize: 0,
    fileTypes: {},
    sizeByType: {},
  };

  for (const moduleId of moduleIds) {
    const moduleNode = nodeMap.get(moduleId);
    if (moduleNode && moduleNode.type === 'Module' && moduleNode.properties) {
      const properties = moduleNode.properties;
      const fileSize = properties.fileSize || 0;
      const fileExt = properties.fileExt || 'unknown';

      stats.fileCount++;
      stats.totalSize += fileSize;
      stats.fileTypes[fileExt] = (stats.fileTypes[fileExt] || 0) + 1;
      stats.sizeByType[fileExt] = (stats.sizeByType[fileExt] || 0) + fileSize;
    }
  }
  return stats;
}

/**
 * Collects all unique reachable 'Module' node IDs starting from a given graph node ID.
 * Traverses through all link types.
 */
function collectAllReachableModulesFrom(
  startGraphNodeId: string,
  nodeMap: Map<string, GraphNode>,
  linksFromMap: Map<string, GraphLink[]>, // Links grouped by source ID
  // Optional: Cache for this collection to optimize if called with same startNodeId multiple times
  // collectionCache: Map<string, Set<string>> = new Map()
): Set<string> {
  // if (collectionCache.has(startGraphNodeId)) {
  //   return new Set(collectionCache.get(startGraphNodeId)!);
  // }

  const reachableModuleIds = new Set<string>();
  const queue: string[] = [startGraphNodeId];
  const visitedInThisTraversal = new Set<string>();
  visitedInThisTraversal.add(startGraphNodeId);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentNode = nodeMap.get(currentId);

    if (currentNode && currentNode.type === 'Module') {
      reachableModuleIds.add(currentId);
    }

    const outgoingLinks = linksFromMap.get(currentId) || [];
    for (const link of outgoingLinks) {
      const targetId = link.target;
      if (!visitedInThisTraversal.has(targetId)) {
        visitedInThisTraversal.add(targetId);
        // Only add to queue if the target node exists to prevent errors
        if (nodeMap.has(targetId)) {
          queue.push(targetId);
        }
      }
    }
  }
  // collectionCache.set(startGraphNodeId, new Set(reachableModuleIds));
  return reachableModuleIds;
}

/**
 * Finds 'Module' nodes that are direct structural parts of a non-Module node
 * (e.g., app.js for 'app', page.js for a Page).
 */
function findDirectStructuralModules(
  currentGraphNodeId: string,
  allLinks: GraphLink[],
  nodeMap: Map<string, GraphNode>,
): GraphNode[] {
  const directModules: GraphNode[] = [];
  for (const link of allLinks) {
    if (link.source === currentGraphNodeId) {
      const targetNode = nodeMap.get(link.target);
      // These links define the constituent files of an App, Page, Component, etc.
      if (
        targetNode &&
        targetNode.type === 'Module' &&
        (link.type === 'Structure' || link.type === 'Config')
      ) {
        // 'Config' for app.json
        directModules.push(targetNode);
      }
    }
  }
  return directModules;
}

interface ProcessNodeResult {
  treeNode: TreeNodeData;
  reachableModuleIds: Set<string>;
}

/**
 * Recursive helper to build the subtree and calculate stats.
 */
function processNodeRecursive(
  currentGraphNodeId: string,
  nodeMap: Map<string, GraphNode>,
  allLinks: GraphLink[], // Needed for findDirectStructuralModules
  linksFromMap: Map<string, GraphLink[]>, // Needed for collectAllReachableModulesFrom
  // Map defining tree structure: parentId -> Set<childId (non-Module)>
  treeChildrenMap: Map<string, Set<string>>,
  visitedForTreeCycles: Set<string>,
  // collectionCache: Map<string, Set<string>> // Pass down for collectAllReachableModulesFrom
): ProcessNodeResult | null {
  const nodeData = nodeMap.get(currentGraphNodeId);
  if (!nodeData) {
    // console.warn(`[TreeProcessor] Node data not found for ID: ${currentGraphNodeId}`);
    return null;
  }

  if (visitedForTreeCycles.has(currentGraphNodeId)) {
    // console.warn(`[TreeProcessor] Cycle detected in tree structure involving node: ${currentGraphNodeId}`);
    return {
      treeNode: {
        id: nodeData.id,
        label: nodeData.label + ' (Cycle)',
        type: nodeData.type as NodeType,
        properties: nodeData.properties,
        children: [],
      },
      reachableModuleIds: new Set<string>(), // No modules from a cycle node itself
    };
  }
  visitedForTreeCycles.add(currentGraphNodeId);

  const aggregatedModuleIds = new Set<string>();

  // 1. Collect modules from the current node's own direct/constituent files and their dependencies
  if (nodeData.type !== 'Module') {
    // App, Page, Package, Component
    const directModules = findDirectStructuralModules(currentGraphNodeId, allLinks, nodeMap);
    for (const moduleNode of directModules) {
      const modulesReachableFromThisFile = collectAllReachableModulesFrom(
        moduleNode.id,
        nodeMap,
        linksFromMap /* collectionCache */,
      );
      modulesReachableFromThisFile.forEach((id) => aggregatedModuleIds.add(id));
    }
  } else {
    // If the current node itself is a Module (e.g. if root is a module, or a module somehow becomes a tree node)
    // This case should be rare for typical tree structures but handled for completeness.
    const modulesReachableFromThisFile = collectAllReachableModulesFrom(
      currentGraphNodeId,
      nodeMap,
      linksFromMap /* collectionCache */,
    );
    modulesReachableFromThisFile.forEach((id) => aggregatedModuleIds.add(id));
  }

  // 2. Process children (non-Module, 'Structure' links that define the tree hierarchy)
  const childrenTreeNodes: TreeNodeData[] = [];
  const childGraphNodeIds = treeChildrenMap.get(currentGraphNodeId) || new Set();

  for (const childId of childGraphNodeIds) {
    // Ensure child is not a Module type for tree structure (already filtered by treeChildrenMap construction)
    const childNode = nodeMap.get(childId);
    if (childNode /* && childNode.type !== 'Module' -- this check should be implicit now */) {
      const childResult = processNodeRecursive(
        childId,
        nodeMap,
        allLinks,
        linksFromMap,
        treeChildrenMap,
        new Set(visitedForTreeCycles) /* collectionCache */,
      );
      if (childResult) {
        childrenTreeNodes.push(childResult.treeNode);
        childResult.reachableModuleIds.forEach((id) => aggregatedModuleIds.add(id));
      }
    }
  }

  // Sort children: Packages, Pages, Components, then alphabetically by label
  childrenTreeNodes.sort((a, b) => {
    const typeOrder: Record<string, number> = { Package: 1, Page: 2, Component: 3 };
    const orderA = typeOrder[a.type] ?? 99;
    const orderB = typeOrder[b.type] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.label.localeCompare(b.label);
  });

  // 3. Calculate stats for the current node based on all aggregated module IDs
  const currentStats = calculateStatsFromModuleIds(aggregatedModuleIds, nodeMap);

  const finalProperties: ExtendedNodeProperties = {
    ...nodeData.properties, // Preserve original properties
    fileCount: currentStats.fileCount,
    totalSize: currentStats.totalSize,
    fileTypes: currentStats.fileTypes,
    sizeByType: currentStats.sizeByType,
    reachableModuleIds: aggregatedModuleIds, // Store the set of module IDs
  };

  // If properties already had some of these stat fields, they are now updated.
  // If nodeData.properties came from the JSON, they might be stale/incorrect,
  // this recalculation provides the accurate, aggregated stats.

  const treeNode: TreeNodeData = {
    id: nodeData.id,
    label: nodeData.label,
    type: nodeData.type as NodeType,
    properties: finalProperties,
    children: childrenTreeNodes.length > 0 ? childrenTreeNodes : undefined,
  };

  return { treeNode, reachableModuleIds: aggregatedModuleIds };
}

/**
 * Converts flat graph data (nodes and links) into a hierarchical tree structure
 * with calculated statistics for each node.
 */
export function buildTreeWithStats(projectStructure: ProjectStructure): TreeNodeData | null {
  const { nodes, links, rootNodeId: projectRootId } = projectStructure;

  if (!nodes || nodes.length === 0) {
    return { id: 'empty', label: 'No Data Available', type: 'Unknown' };
  }

  const nodeMap = new Map<string, GraphNode>();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  const linksFromMap = new Map<string, GraphLink[]>();
  links.forEach((link) => {
    if (!linksFromMap.has(link.source)) {
      linksFromMap.set(link.source, []);
    }
    linksFromMap.get(link.source)!.push(link);
  });

  // Build treeChildrenMap: parentId -> Set<childId (non-Module)>
  // These are 'Structure' links that form the primary tree hierarchy.
  const treeChildrenMap = new Map<string, Set<string>>();
  links.forEach((link) => {
    if (link.type === 'Structure') {
      const targetNode = nodeMap.get(link.target);
      // Only include non-Module children in the tree view for a cleaner hierarchy.
      // Modules are handled via stats aggregation.
      if (targetNode && targetNode.type !== 'Module') {
        if (!treeChildrenMap.has(link.source)) {
          treeChildrenMap.set(link.source, new Set<string>());
        }
        // Avoid adding self as child in the tree structure
        if (link.source !== link.target) {
          treeChildrenMap.get(link.source)!.add(link.target);
        }
      }
    }
  });

  let rootId = projectRootId;
  if (!rootId || !nodeMap.has(rootId)) {
    // console.warn('[TreeProcessor] projectStructure.rootNodeId not found or invalid, trying 'app'...');
    rootId = 'app'; // Common fallback for miniapps
  }
  if (!nodeMap.has(rootId)) {
    // console.warn(`[TreeProcessor] 'app' node not found, trying first node in the list: ${nodes[0]?.id}`);
    rootId = nodes[0]?.id;
  }

  if (!rootId || !nodeMap.has(rootId)) {
    // console.error('[TreeProcessor] Could not determine a valid root node for the tree.');
    return { id: 'error_root', label: 'Could not build tree: No valid root', type: 'Unknown' };
  }

  // const collectionCache = new Map<string, Set<string>>(); // Instantiate cache for collectAllReachableModulesFrom

  const result = processNodeRecursive(
    rootId,
    nodeMap,
    links,
    linksFromMap,
    treeChildrenMap,
    new Set<string>() /* collectionCache */,
  );

  return result ? result.treeNode : null;
}
