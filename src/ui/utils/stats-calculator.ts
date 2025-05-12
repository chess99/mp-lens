import { GraphLink, GraphNode } from '../../analyzer/project-structure';
import { TreeNodeData } from '../types';

interface FileStats {
  fileCount: number;
  totalSize: number;
  fileTypes: Record<string, number>;
  sizeByType: Record<string, number>;
}

/**
 * Main class responsible for calculating accurate statistics for nodes
 * in the dependency graph, handling deduplication and proper traversal
 */
export class StatsCalculator {
  private nodeMap: Map<string, GraphNode>;
  private linksFromMap: Map<string, GraphLink[]>;
  private statsCache: Map<string, FileStats>;

  constructor(nodes: GraphNode[], links: GraphLink[]) {
    // Build lookup maps for efficient access
    this.nodeMap = new Map(nodes.map((node) => [node.id, node]));

    // Group links by source node for quick traversal
    this.linksFromMap = new Map();
    for (const link of links) {
      if (!this.linksFromMap.has(link.source)) {
        this.linksFromMap.set(link.source, []);
      }
      this.linksFromMap.get(link.source)!.push(link);
    }

    // Cache for computed stats to avoid recalculation
    this.statsCache = new Map();
  }

  /**
   * Calculate statistics for all nodes in the tree,
   * starting from the root and traversing downward
   */
  public calculateAllStats(rootNode: TreeNodeData): TreeNodeData {
    // Start with the root node
    const processedRoot = this.calculateNodeStats(rootNode);

    // Continue with child nodes if any
    if (processedRoot.children && processedRoot.children.length > 0) {
      processedRoot.children = processedRoot.children.map((child) => this.calculateAllStats(child));
    }

    return processedRoot;
  }

  /**
   * Calculate statistics for a single node
   */
  private calculateNodeStats(node: TreeNodeData): TreeNodeData {
    // Check cache first to avoid redundant calculations
    if (this.statsCache.has(node.id)) {
      const cachedStats = this.statsCache.get(node.id)!;
      node.properties = {
        ...node.properties,
        ...cachedStats,
      };
      return node;
    }

    // Get all reachable module nodes from this node
    const reachableModules = this.getReachableModules(node.id);

    // Calculate statistics from reachable modules
    const stats = this.calculateStatsFromModules(reachableModules);

    // Cache the results
    this.statsCache.set(node.id, stats);

    // Update node properties with calculated stats
    node.properties = {
      ...node.properties,
      ...stats,
    };

    return node;
  }

  /**
   * Get all reachable module nodes from a given node
   * using BFS to traverse the dependency graph
   */
  private getReachableModules(nodeId: string): GraphNode[] {
    const visited = new Set<string>();
    const queue: string[] = [nodeId];
    const modules: GraphNode[] = [];

    visited.add(nodeId);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentNode = this.nodeMap.get(currentId);

      // If this is a module node, add it to the result
      if (currentNode && currentNode.type === 'Module') {
        modules.push(currentNode);
      }

      // Process outgoing links (both Structure and Import types)
      const outgoingLinks = this.linksFromMap.get(currentId) || [];
      for (const link of outgoingLinks) {
        const targetId = link.target;

        // Skip if already visited
        if (visited.has(targetId)) {
          continue;
        }

        visited.add(targetId);
        queue.push(targetId);
      }
    }

    return modules;
  }

  /**
   * Calculate statistics from a collection of module nodes
   */
  private calculateStatsFromModules(modules: GraphNode[]): FileStats {
    const stats: FileStats = {
      fileCount: 0,
      totalSize: 0,
      fileTypes: {},
      sizeByType: {},
    };

    for (const module of modules) {
      const properties = module.properties || {};
      const fileSize = properties.fileSize || 0;
      const fileExt = properties.fileExt || 'unknown';

      // Update statistics
      stats.fileCount++;
      stats.totalSize += fileSize;

      // Update file type counters
      stats.fileTypes[fileExt] = (stats.fileTypes[fileExt] || 0) + 1;
      stats.sizeByType[fileExt] = (stats.sizeByType[fileExt] || 0) + fileSize;
    }

    return stats;
  }
}

/**
 * Utility function to apply stats calculation to a tree
 */
export function calculateTreeStats(
  treeData: TreeNodeData,
  nodes: GraphNode[],
  links: GraphLink[],
): TreeNodeData {
  const calculator = new StatsCalculator(nodes, links);
  return calculator.calculateAllStats(treeData);
}

/**
 * Helper function to format bytes into human-readable form
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
