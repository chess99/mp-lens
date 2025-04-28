// Import ProjectStructure and related types
import { GraphLink, GraphNode, ProjectStructure } from '../analyzer/project-structure';

interface DotGeneratorOptions {
  title: string;
  // projectRoot: string; // No longer needed
  maxDepth?: number;
  focusNode?: string; // Node ID from ProjectStructure
}

/**
 * DOT 依赖图生成器
 * 生成 Graphviz 兼容的 DOT 格式
 */
export class DotGenerator {
  private structure: ProjectStructure; // Changed from graph

  constructor(structure: ProjectStructure) {
    // Changed parameter type
    this.structure = structure;
  }

  /**
   * 生成 DOT 格式的依赖图
   */
  generate(options: DotGeneratorOptions): string {
    // Remove projectRoot from destructuring
    const { title, maxDepth, focusNode } = options;

    // 准备节点和链接的数据, applying filters
    const { nodes, links } = this.prepareGraphData(maxDepth, focusNode);

    // 构建 DOT 字符串
    let dot = `digraph "${title}" {\n`;

    // 图的全局设置
    dot += '  graph [rankdir=LR, fontname="Arial", fontsize=12, overlap=scale, splines=true];\n'; // Use overlap=scale for better layout
    dot += '  node [shape=box, style="rounded,filled", fontname="Arial", fontsize=10];\n';
    dot += '  edge [color="#999999", fontname="Arial", fontsize=8];\n\n';

    // 添加节点
    for (const node of nodes) {
      // Pass the full GraphNode object
      const attrs = this.getNodeAttributes(node, focusNode === node.id);

      // 格式化属性
      const attrStr = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(', ');

      dot += `  "${node.id}" [${attrStr}];\n`; // Use node.id
    }

    dot += '\n';

    // 添加边 (links)
    for (const link of links) {
      // Pass the full GraphLink object
      // Ensure boolean is passed for highlighting
      const isEdgeHighlighted =
        !!focusNode && (link.source === focusNode || link.target === focusNode);
      const attrs = this.getEdgeAttributes(link, isEdgeHighlighted);

      // 格式化属性
      const attrStr = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(', ');

      dot += `  "${link.source}" -> "${link.target}" [${attrStr}];\n`; // Use link.source/target
    }

    dot += '}\n';

    return dot;
  }

  /**
   * Filters the ProjectStructure based on focusNode and maxDepth using BFS.
   * Returns the set of node IDs to include.
   * (Copied from HtmlGenerator - consider refactoring to a shared utility)
   */
  private filterStructureByFocus(maxDepth: number, focusNodeId: string): Set<string> {
    const includedNodes = new Set<string>();
    const queue: Array<{ nodeId: string; depth: number }> = [];
    const nodeMap = new Map(this.structure.nodes.map((n) => [n.id, n]));
    const linksFrom = new Map<string, GraphLink[]>();
    const linksTo = new Map<string, GraphLink[]>();

    // Precompute links for faster lookup
    this.structure.links.forEach((link) => {
      if (!linksFrom.has(link.source)) linksFrom.set(link.source, []);
      linksFrom.get(link.source)!.push(link);
      if (!linksTo.has(link.target)) linksTo.set(link.target, []);
      linksTo.get(link.target)!.push(link);
    });

    // Validate focus node exists
    if (!nodeMap.has(focusNodeId)) {
      console.warn(`[DOT] Focus node ID not found in structure: ${focusNodeId}`);
      return includedNodes; // Return empty set
    }

    // Start BFS from the focus node
    includedNodes.add(focusNodeId);
    queue.push({ nodeId: focusNodeId, depth: 0 });

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;

      // Stop if max depth reached
      if (depth >= maxDepth) continue;

      // Explore neighbors (both outgoing and incoming links)
      const outgoing = linksFrom.get(nodeId) || [];
      const incoming = linksTo.get(nodeId) || [];

      outgoing.forEach((link) => {
        if (!includedNodes.has(link.target)) {
          includedNodes.add(link.target);
          queue.push({ nodeId: link.target, depth: depth + 1 });
        }
      });
      incoming.forEach((link) => {
        if (!includedNodes.has(link.source)) {
          includedNodes.add(link.source);
          queue.push({ nodeId: link.source, depth: depth + 1 });
        }
      });
    }

    return includedNodes;
  }

  /**
   * Prepares graph data (nodes and links) for DOT generation from ProjectStructure.
   * Applies filtering based on maxDepth and focusNode if provided.
   */
  private prepareGraphData(
    maxDepth?: number,
    focusNode?: string,
  ): { nodes: GraphNode[]; links: GraphLink[] } {
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

    // Return the filtered/complete nodes and links directly
    return { nodes: targetNodes, links: targetLinks };
  }

  // Removed createNodeObject as it's no longer needed

  /**
   * 获取节点的 DOT 属性 based on GraphNode
   */
  private getNodeAttributes(node: GraphNode, isHighlighted: boolean): Record<string, string> {
    const attrs: Record<string, string> = {
      label: node.label || node.id, // Use label, fallback to id
      tooltip: `${node.type}: ${node.label || node.id}`, // Basic tooltip
    };

    // Adjust shape and color based on NodeType
    switch (node.type) {
      case 'App':
        attrs.shape = 'doubleoctagon';
        attrs.fillcolor = '#ff9896'; // Red
        break;
      case 'Package':
        attrs.shape = 'folder'; // Or house, component
        attrs.fillcolor = '#98df8a'; // Green
        break;
      case 'Page':
        attrs.shape = 'ellipse';
        attrs.fillcolor = '#ffbb78'; // Orange
        break;
      case 'Component':
        attrs.shape = 'box'; // Default, but make explicit
        attrs.fillcolor = '#bcbd22'; // Olive
        break;
      case 'Module':
      default:
        attrs.shape = 'note';
        attrs.fillcolor = '#aec7e8'; // Light blue
        // Add more specific styling based on file extension if needed
        // e.g., if (node.label.endsWith('.js')) { ... }
        break;
    }

    // Apply highlight style
    if (isHighlighted) {
      attrs.fillcolor = '#ff4242'; // Brighter highlight red
      attrs.penwidth = '2';
      attrs.fontcolor = 'white';
    }

    return attrs;
  }

  /**
   * 获取边的 DOT 属性 based on GraphLink
   */
  private getEdgeAttributes(link: GraphLink, isHighlighted: boolean): Record<string, string> {
    const attrs: Record<string, string> = {
      tooltip: link.type, // Show link type on hover
    };

    // Adjust style based on LinkType
    switch (link.type) {
      case 'Structure':
        attrs.color = '#333333';
        attrs.penwidth = '1.5';
        attrs.style = 'solid';
        break;
      case 'Import':
        attrs.color = '#1f77b4'; // Blue
        attrs.style = 'dashed';
        break;
      case 'Template':
        attrs.color = '#ff7f0e'; // Orange
        attrs.style = 'dashed';
        attrs.penwidth = '1.0';
        break;
      case 'Style':
        attrs.color = '#2ca02c'; // Green
        attrs.style = 'dotted';
        break;
      case 'Config':
        attrs.color = '#9467bd'; // Purple
        attrs.style = 'dotted';
        attrs.penwidth = '0.8';
        attrs.color = '#9467bd80'; // Add alpha for lighter color
        break;
      default:
        attrs.color = '#999999';
        attrs.style = 'solid';
    }

    // Apply highlight style
    if (isHighlighted) {
      attrs.color = '#ff0000'; // Bright red
      attrs.penwidth = '2.0';
    }

    return attrs;
  }
}
