import type { GraphNode, NodeType, ProjectStructure } from '../../analyzer/project-structure';
import type { TreeNodeData } from '../types';

/**
 * Converts flat graph data (nodes and links) into a hierarchical tree structure.
 * This is intended for client-side use in the UI.
 */
export function buildTreeFromGraphData(
  projectStructure: ProjectStructure,
  // Optional: filter by reachability or focus (can be added later if needed)
  // reachableNodeIds?: Set<string>,
  // focusNodeId?: string,
  // maxDepth?: number,
): TreeNodeData | null {
  const { nodes, links, rootNodeId: projectRootId } = projectStructure;

  if (!nodes || nodes.length === 0) {
    return { id: 'empty', label: 'No Data Available', type: 'Unknown' };
  }

  const nodeMap = new Map<string, GraphNode>();
  nodes.forEach((node) => nodeMap.set(node.id, node));

  // Build children map using only 'Structure' links for the tree hierarchy
  const childrenMap = new Map<string, Set<string>>();
  links.forEach((link) => {
    if (link.type === 'Structure') {
      if (!childrenMap.has(link.source)) {
        childrenMap.set(link.source, new Set<string>());
      }
      // Avoid adding self as child
      if (link.source !== link.target) {
        childrenMap.get(link.source)!.add(link.target);
      }
    }
  });

  // Determine the root node for the tree
  // Try the projectStructure.rootNodeId first, then 'app', then first node as last resort.
  let rootId = projectRootId;
  if (!rootId || !nodeMap.has(rootId)) {
    // console.warn('[TreeBuilder] projectStructure.rootNodeId not found or invalid, trying 'app'...');
    rootId = 'app'; // Common fallback for miniapps
  }
  if (!nodeMap.has(rootId)) {
    // console.warn('[TreeBuilder] 'app' node not found, trying first node in the list...');
    rootId = nodes[0]?.id;
  }

  if (!rootId || !nodeMap.has(rootId)) {
    // console.error('[TreeBuilder] Could not determine a valid root node for the tree.');
    return { id: 'error_root', label: 'Could not build tree', type: 'Unknown' };
  }

  // Recursive helper to build the subtree
  const buildSubtree = (currentId: string, visited: Set<string>): TreeNodeData | null => {
    const nodeData = nodeMap.get(currentId);
    if (!nodeData) {
      // console.warn(`[TreeBuilder] Node data not found for ID: ${currentId}`);
      return null;
    }

    // Prevent infinite loops in case of cycles in Structure links (should be rare)
    if (visited.has(currentId)) {
      // console.warn(`[TreeBuilder] Cycle detected involving node: ${currentId}, stopping recursion.`);
      return {
        id: nodeData.id,
        label: nodeData.label + ' (Cycle)',
        type: nodeData.type as NodeType,
        properties: nodeData.properties,
        children: [], // Break cycle by not adding children
      };
    }
    visited.add(currentId);

    const childrenData: TreeNodeData[] = [];
    const childIds = childrenMap.get(currentId) || new Set();

    for (const childId of childIds) {
      const childNode = nodeMap.get(childId);
      // Only include non-Module children in the tree view for a cleaner hierarchy
      // Module nodes are implicitly part of their parent's fileCount/totalSize etc.
      if (childNode && childNode.type !== 'Module') {
        const subtree = buildSubtree(childId, new Set(visited)); // Pass copy of visited set
        if (subtree) {
          childrenData.push(subtree);
        }
      }
    }

    // Sort children: Packages, Pages, Components, then alphabetically by label
    childrenData.sort((a, b) => {
      const typeOrder: Record<string, number> = { Package: 1, Page: 2, Component: 3 };
      const orderA = typeOrder[a.type] ?? 99;
      const orderB = typeOrder[b.type] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      return a.label.localeCompare(b.label);
    });

    return {
      id: nodeData.id,
      label: nodeData.label,
      type: nodeData.type as NodeType,
      properties: nodeData.properties,
      children: childrenData.length > 0 ? childrenData : undefined,
    };
  };

  return buildSubtree(rootId, new Set<string>());
}
