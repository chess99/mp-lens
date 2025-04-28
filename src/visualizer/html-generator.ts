// Import ProjectStructure and related types
import * as fs from 'fs';
import * as path from 'path';
import { GraphLink, GraphNode, ProjectStructure } from '../analyzer/project-structure';

// Define the structure for G6 hierarchical data
interface G6TreeData {
  id: string;
  label: string;
  type: string;
  properties?: any;
  children?: G6TreeData[];
  parent?: string; // Optional: useful for internal logic but might not be needed by G6 directly in tree structure
  collapsed?: boolean;
}

interface HtmlGeneratorOptions {
  title: string;
  maxDepth?: number;
  focusNode?: string; // This should be a node ID from the ProjectStructure
  // treeView is removed, layout is handled dynamically client-side
  // tree?: boolean; // Removed - always tree now
}

/**
 * Helper function to find template files in a way that works in both development and production
 * This handles the case when we're running from /dist or from /src
 */
function findTemplateFile(fileName: string): string {
  // First try to find template in the same directory as this file
  const directPath = path.resolve(__dirname, fileName);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // If we're in the /dist directory, try looking in /src/visualizer
  if (__dirname.includes('/dist/') || __dirname.includes('\\dist\\')) {
    const srcPath = path.resolve(__dirname).replace(/[\\/]dist[\\/]/, path.sep + 'src' + path.sep);
    const srcFilePath = path.resolve(srcPath, fileName);
    if (fs.existsSync(srcFilePath)) {
      return srcFilePath;
    }
  }

  // Final fallback - build more paths to try
  const possiblePaths = [
    // From project root
    path.resolve(process.cwd(), 'src', 'visualizer', fileName),
    path.resolve(process.cwd(), 'dist', 'visualizer', fileName),
    // From parent dir
    path.resolve(__dirname, '..', '..', 'src', 'visualizer', fileName),
    path.resolve(__dirname, '..', '..', 'dist', 'visualizer', fileName),
  ];

  for (const testPath of possiblePaths) {
    if (fs.existsSync(testPath)) {
      return testPath;
    }
  }

  // If no path is found, return the direct path (will cause readable error)
  return directPath;
}

/**
 * HTML依赖图生成器
 * 使用AntV G6或D3.js生成交互式依赖可视化
 */
export class HtmlGenerator {
  private structure: ProjectStructure;

  constructor(structure: ProjectStructure) {
    this.structure = structure;
  }

  /**
   * Generates HTML for dependency visualization.
   */
  generate(options: HtmlGeneratorOptions): string {
    const { title, maxDepth, focusNode } = options;

    // Determine the effective layout type from options - REMOVED, always tree
    // const defaultLayoutType = options.tree === false ? 'graph' : 'tree';

    // Always use the same template and script files
    const templateFileName = 'template.html'; // Renamed from template-tree/graph
    const scriptFileName = 'render.js'; // Renamed from render-tree/graph

    const templatePath = findTemplateFile(templateFileName);
    const scriptPath = findTemplateFile(scriptFileName);

    let htmlContent: string;
    let scriptContent: string;
    try {
      htmlContent = fs.readFileSync(templatePath, 'utf-8');
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
    } catch (error) {
      console.error(
        `Error reading HTML template or script: ${templatePath} or ${scriptPath}`,
        error,
      );
      return `<html><body><h1>Error loading template or script</h1>...</body></html>`; // Simplified error html
    }

    // Prepare only hierarchical tree data
    const treeData = this.prepareAndConvertData(maxDepth, focusNode);
    // const { graphData, treeData } = this.prepareAndConvertData(maxDepth, focusNode);
    // const graphDataJson = JSON.stringify(graphData); // Removed
    const treeDataJson = JSON.stringify(treeData); // Stringify the tree data

    // Inject data and script into template
    htmlContent = htmlContent.replace('__TITLE__', title || 'Dependency Graph');
    // Inject only tree data structure
    // htmlContent = htmlContent.replace(
    //   'window.__GRAPH_DATA__ = {};',
    //   `window.__GRAPH_DATA__ = ${graphDataJson};`,
    // ); // Removed
    htmlContent = htmlContent.replace(
      '// __TREE_DATA_PLACEHOLDER__', // Add a placeholder for tree data
      `window.__TREE_DATA__ = ${treeDataJson};`,
    );
    // Remove default layout injection
    // htmlContent = htmlContent.replace(
    //   '// __DEFAULT_LAYOUT_PLACEHOLDER__',
    //   `window.__DEFAULT_LAYOUT__ = '${defaultLayoutType}';`,
    // );
    // Replace the inner placeholder within the existing script tag
    htmlContent = htmlContent.replace('// __RENDER_SCRIPT_CONTENT__', scriptContent);

    return htmlContent;
  }

  /**
   * Filters the structure and prepares hierarchical tree data.
   * Removed graphData generation.
   */
  private prepareAndConvertData(maxDepth?: number, focusNode?: string): G6TreeData {
    let targetNodes: GraphNode[];
    let targetLinks: GraphLink[];
    let includedNodeIds: Set<string> | null = null;

    // Apply filtering if focusNode and maxDepth are specified
    if (focusNode && maxDepth !== undefined && maxDepth >= 0) {
      includedNodeIds = this.filterStructureByFocus(maxDepth, focusNode);
      targetNodes = this.structure.nodes.filter((n) => includedNodeIds!.has(n.id));
      targetLinks = this.structure.links.filter(
        (l) => includedNodeIds!.has(l.source) && includedNodeIds!.has(l.target),
      );
    } else {
      // No filtering, use all nodes and links
      targetNodes = this.structure.nodes;
      targetLinks = this.structure.links;
    }

    // Map nodes for flat graph data (D3/G6 Graph format)
    const graphNodes = targetNodes.map((node) => ({
      id: node.id,
      label: node.label || node.id,
      type: node.type,
      highlighted: focusNode === node.id,
      properties: node.properties || {},
    }));

    // Map links for flat graph data
    const graphLinks = targetLinks.map((link) => ({
      source: link.source,
      target: link.target,
      type: link.type,
      highlighted: focusNode && (link.source === focusNode || link.target === focusNode),
      properties: link.properties || {},
    }));

    const graphData = { nodes: graphNodes, links: graphLinks };

    // Convert the filtered graph data to hierarchical tree data
    const treeData = this.convertGraphToTreeInternal(graphData);

    // return { graphData, treeData }; // Return only treeData
    return treeData;
  }

  /**
   * Filters the ProjectStructure based on focusNode and maxDepth using BFS.
   * Returns the set of node IDs to include.
   */
  private filterStructureByFocus(maxDepth: number, focusNodeId: string): Set<string> {
    const includedNodes = new Set<string>();
    const queue: { nodeId: string; depth: number }[] = [{ nodeId: focusNodeId, depth: 0 }];
    const visited = new Set<string>(); // Keep track of visited nodes to avoid redundant processing

    // Check if focus node exists
    if (!this.structure.nodes.some((n) => n.id === focusNodeId)) {
      console.warn(`Focus node "${focusNodeId}" not found in the project structure.`);
      // Return all nodes if focus node not found, or handle as needed
      return new Set(this.structure.nodes.map((n) => n.id));
    }

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;

      // Skip if already visited or depth exceeded
      if (visited.has(nodeId) || depth > maxDepth) {
        continue;
      }

      visited.add(nodeId);
      includedNodes.add(nodeId);

      // Find neighbors (both outgoing and incoming dependencies)
      this.structure.links.forEach((link) => {
        let neighborId: string | null = null;
        if (link.source === nodeId && !visited.has(link.target)) {
          neighborId = link.target;
        } else if (link.target === nodeId && !visited.has(link.source)) {
          neighborId = link.source;
        }

        if (neighborId) {
          queue.push({ nodeId: neighborId, depth: depth + 1 });
        }
      });
    }

    // Ensure the focus node itself is included even if maxDepth is 0
    includedNodes.add(focusNodeId);

    return includedNodes;
  }

  // --------------------------------------------------------------------------
  // NEW METHOD: Convert flat graph structure to hierarchical tree for G6
  // This logic is moved from render-tree.js
  // --------------------------------------------------------------------------
  private convertGraphToTreeInternal(graphData: { nodes: any[]; links: any[] }): G6TreeData {
    const { nodes, links } = graphData;

    if (!nodes || nodes.length === 0) {
      return { id: 'root', label: 'No Data', type: 'Root', children: [] };
    }

    const nodeMap = new Map<string, G6TreeData>();
    nodes.forEach((node) => {
      nodeMap.set(node.id, {
        id: node.id,
        label: node.label || node.id,
        type: node.type,
        properties: node.properties || {},
        children: [], // Initialize children here
        // parent property will not be set globally, only within the context of the tree built
      });
    });

    // Build dependency graph for cycle detection (source -> target)
    const dependencyGraph = new Map<string, Set<string>>();
    nodes.forEach((node) => dependencyGraph.set(node.id, new Set()));
    links.forEach((link) => {
      // Ensure nodes exist before adding link (due to potential filtering)
      if (dependencyGraph.has(link.source) && dependencyGraph.has(link.target)) {
        dependencyGraph.get(link.source)!.add(link.target);
      }
    });

    // --- Cycle Detection and Breaking ---
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const edgesToRemove = new Set<string>(); // Store edges forming cycles "source->target"

    function detectCycle(nodeId: string) {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const neighbors = dependencyGraph.get(nodeId) || new Set();
      for (const neighbor of neighbors) {
        const edgeId = `${nodeId}->${neighbor}`;
        if (recursionStack.has(neighbor)) {
          edgesToRemove.add(edgeId);
        } else if (!visited.has(neighbor)) {
          // Check if neighbor exists in the map before recursing
          if (nodeMap.has(neighbor)) {
            detectCycle(neighbor); // Recursive call
          }
        }
      }

      recursionStack.delete(nodeId);
      // No explicit return true/false needed as we modify edgesToRemove directly
    }

    // Ensure we only start cycle detection from nodes actually present
    nodes.forEach((node) => {
      if (!visited.has(node.id)) {
        detectCycle(node.id);
      }
    });
    // --- End Cycle Detection ---

    // Build the acyclic graph structure (parent -> children) and track incoming links
    const childrenMap = new Map<string, Set<string>>(); // Acyclic parent -> children
    const incomingLinks = new Map<string, Set<string>>(); // child -> parents (acyclic)

    nodes.forEach((node) => {
      // Initialize maps for all nodes present
      childrenMap.set(node.id, new Set());
      incomingLinks.set(node.id, new Set());
    });

    links.forEach((link) => {
      const edgeId = `${link.source}->${link.target}`;
      if (edgesToRemove.has(edgeId)) {
        // console.warn(`Cycle detected and edge skipped: ${link.source} -> ${link.target}`);
        return; // Skip cycle edges
      }

      // Ensure nodes exist in our nodeMap before adding to structure maps
      if (!nodeMap.has(link.source) || !nodeMap.has(link.target)) {
        // console.warn(`Skipping link due to missing filtered node: ${link.source} -> ${link.target}`);
        return;
      }

      // Add to childrenMap (source is parent, target is child)
      childrenMap.get(link.source)!.add(link.target);

      // Add to incomingLinks (target is child, source is parent)
      incomingLinks.get(link.target)!.add(link.source);
    });

    // --- Refactored Tree Building ---
    // const nodesInTree = new Set<string>(); // Removed - Not used by buildSubtreeHelper

    // Recursive function to build a subtree starting from nodeId
    function buildSubtreeHelper(
      nodeId: string,
      builtSet: Set<string>,
      nodeMapRef: Map<string, G6TreeData>,
      childrenMapRef: Map<string, Set<string>>,
    ): G6TreeData | null {
      if (builtSet.has(nodeId)) {
        // Node already exists somewhere else in the tree structure. Return null or reference.
        // console.log(`Node ${nodeId} already built, skipping branch.`);
        return null; // Skip adding this node again
      }

      const nodeData = nodeMapRef.get(nodeId);
      if (!nodeData) return null;

      builtSet.add(nodeId); // Mark as built *before* recursion for this path

      const childrenIds = childrenMapRef.get(nodeId) || new Set();
      const actualChildren: G6TreeData[] = [];

      for (const childId of childrenIds) {
        const childSubtree = buildSubtreeHelper(childId, builtSet, nodeMapRef, childrenMapRef); // Pass the *same* builtSet down
        if (childSubtree) {
          actualChildren.push(childSubtree);
        }
      }

      // Create a node object specifically for the tree
      const treeNode: G6TreeData = {
        id: nodeData.id,
        label: nodeData.label,
        type: nodeData.type,
        properties: nodeData.properties,
        children: actualChildren,
      };

      return treeNode;
    }

    // Find root nodes (nodes with no incoming links *in the acyclic graph*)
    const rootIds = Array.from(nodeMap.keys()).filter(
      (nodeId) => (incomingLinks.get(nodeId)?.size || 0) === 0,
    );

    // Build the final tree structure(s) starting from the root(s)
    const nodesAlreadyBuiltInFinalTree = new Set<string>(); // Use this set for the actual build function calls
    const rootNodes: G6TreeData[] = [];
    rootIds.forEach((rootId) => {
      // Reset the tracking set for each root's traversal IF we allow duplicates across different root branches
      // For a single cohesive tree, use one shared set `nodesAlreadyBuiltInFinalTree`.
      const tree = buildSubtreeHelper(rootId, nodesAlreadyBuiltInFinalTree, nodeMap, childrenMap);
      if (tree) {
        rootNodes.push(tree);
      }
    });

    // Determine the final root for G6
    let rootNode: G6TreeData;
    if (rootNodes.length === 0) {
      // This can happen if the graph is empty or only contains cycles that were removed
      const firstNodeId = nodes.length > 0 ? nodes[0].id : null;
      const fallbackNode = firstNodeId ? nodeMap.get(firstNodeId) : null;
      if (fallbackNode) {
        console.warn(
          'No root nodes found after cycle breaking and tree build. Using first available node as root. Tree might be incomplete.',
        );
        // Try building from this fallback node, it might be disconnected
        const fallbackTree = buildSubtreeHelper(fallbackNode.id, new Set(), nodeMap, childrenMap);
        rootNode = fallbackTree ?? {
          id: 'fallback-root',
          label: 'Incomplete Tree',
          type: 'Root',
          children: [],
        };
      } else {
        console.warn('Graph analysis resulted in no nodes for the tree structure.');
        rootNode = { id: 'empty-root', label: 'Empty Graph', type: 'Root', children: [] };
      }
    } else if (rootNodes.length === 1) {
      // Single root found, ideal case
      rootNode = rootNodes[0];
      // Ensure the single root isn't collapsed if it has children
      // rootNode.collapsed = false; // Let G6 handle initial expand/collapse based on config
    } else {
      // Multiple roots found, create a synthetic root
      console.log(`Multiple roots found (${rootNodes.length}), creating synthetic root.`);
      rootNode = {
        id: 'synthetic-root',
        label: 'Project Dependencies', // More descriptive label
        type: 'Root',
        children: rootNodes,
        collapsed: false, // Keep synthetic root expanded initially
      };
      // No need to set parent references here; the structure defines parentage
    }

    return rootNode;
  }
}
