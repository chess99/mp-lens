// Import ProjectStructure and related types
import { GraphLink, GraphNode, ProjectStructure } from '../analyzer/project-structure';
// --- Start: Add fs import ---
import * as fs from 'fs';
import * as path from 'path';
// --- End: Add fs import ---

// --- Removed D3 type imports ---
// import * as d3 from 'd3';
// type SimulationNode = GraphNode & d3.SimulationNodeDatum;

interface HtmlGeneratorOptions {
  title: string;
  // projectRoot: string; // Still needed for context/labels? Maybe less so if labels are pre-generated.
  maxDepth?: number;
  focusNode?: string; // This should be a node ID from the ProjectStructure
}

/**
 * HTML依赖图生成器
 * 使用D3.js生成交互式依赖可视化
 */
export class HtmlGenerator {
  private structure: ProjectStructure; // Changed from graph to structure

  constructor(structure: ProjectStructure) {
    // Changed parameter type
    this.structure = structure;
  }

  /**
   * 生成HTML格式的依赖图
   */
  generate(options: HtmlGeneratorOptions): string {
    const { title, maxDepth, focusNode } = options;

    // --- Start: Read template and prepare data ---
    const templatePath = path.resolve(__dirname, 'template.html');
    let htmlContent: string;
    try {
      htmlContent = fs.readFileSync(templatePath, 'utf-8');
    } catch (error) {
      console.error(`Error reading HTML template: ${templatePath}`, error);
      return '<html><body>Error loading template.</body></html>';
    }

    // Prepare graph data using the existing method (ensure 'this.' is used)
    const graphData = this.prepareGraphData(maxDepth, focusNode);
    const graphDataJson = JSON.stringify(graphData);
    // --- End: Read template and prepare data ---

    // --- Start: Inject data into template ---
    htmlContent = htmlContent.replace('__TITLE__', title || 'Dependency Graph');
    // Be careful with replacing the placeholder script content
    htmlContent = htmlContent.replace(
      'window.__GRAPH_DATA__ = {};',
      `window.__GRAPH_DATA__ = ${graphDataJson};`,
    );
    // --- End: Inject data into template ---

    // --- Removed embedded JS/CSS/HTML ---
    return htmlContent;
  }

  /**
   * Filters the ProjectStructure based on focusNode and maxDepth using BFS.
   * Returns the set of node IDs to include.
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
      console.warn(`Focus node ID not found in structure: ${focusNodeId}`);
      return includedNodes;
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

      // Add neighbors to queue if not visited and within depth
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
   * Prepares graph data for D3 from ProjectStructure.
   * Applies filtering based on maxDepth and focusNode if provided.
   */
  private prepareGraphData(maxDepth?: number, focusNode?: string): { nodes: any[]; links: any[] } {
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

    // Map nodes to D3 format
    const d3Nodes = targetNodes.map((node) => ({
      id: node.id,
      label: node.label || node.id, // Use label, fallback to id
      type: node.type,
      // Determine initial highlight state based on focusNode
      highlighted: focusNode === node.id,
      // Pass other properties if needed by the frontend JS
      properties: node.properties || {},
    }));

    // Map links to D3 format
    const d3Links = targetLinks.map((link) => ({
      source: link.source, // D3 uses IDs here
      target: link.target, // D3 uses IDs here
      type: link.type,
      // Determine initial highlight state based on focusNode
      highlighted: focusNode && (link.source === focusNode || link.target === focusNode),
      properties: link.properties || {},
    }));

    return { nodes: d3Nodes, links: d3Links };
  }
}
