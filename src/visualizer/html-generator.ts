// Import ProjectStructure and related types
import * as fs from 'fs';
import * as path from 'path';
import { GraphLink, GraphNode, ProjectStructure } from '../analyzer/project-structure';

interface HtmlGeneratorOptions {
  title: string;
  maxDepth?: number;
  focusNode?: string; // This should be a node ID from the ProjectStructure
  treeView?: boolean; // New option to toggle between tree view and graph view
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
   * 生成HTML格式的依赖图
   */
  generate(options: HtmlGeneratorOptions): string {
    const { title, maxDepth, focusNode, treeView = true } = options;

    // Use different templates based on visualization type
    const templateFileName = treeView ? 'template-tree.html' : 'template-graph.html';
    const scriptFileName = treeView ? 'render-tree.js' : 'render-graph.js';

    // Use the helper function to reliably find template files
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
      // Provide more detailed error message for debugging
      return `<html><body>
        <h1>Error loading template or script</h1>
        <p>Could not find files at:</p>
        <ul>
          <li>Template: ${templatePath}</li>
          <li>Script: ${scriptPath}</li>
        </ul>
        <p>Current directory: ${__dirname}</p>
        <p>Error: ${error instanceof Error ? error.message : String(error)}</p>
      </body></html>`;
    }

    // Prepare graph data using the existing method
    const graphData = this.prepareGraphData(maxDepth, focusNode);
    const graphDataJson = JSON.stringify(graphData);

    // Inject data and script into template
    htmlContent = htmlContent.replace('__TITLE__', title || 'Dependency Graph');
    htmlContent = htmlContent.replace(
      'window.__GRAPH_DATA__ = {};',
      `window.__GRAPH_DATA__ = ${graphDataJson};`,
    );
    htmlContent = htmlContent.replace(
      '<!-- __RENDER_SCRIPT__ -->',
      `<script>\n${scriptContent}\n</script>`,
    );

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
   * Prepares graph data from ProjectStructure.
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
      source: link.source,
      target: link.target,
      type: link.type,
      // Determine initial highlight state based on focusNode
      highlighted: focusNode && (link.source === focusNode || link.target === focusNode),
      properties: link.properties || {},
    }));

    return { nodes: d3Nodes, links: d3Links };
  }
}
