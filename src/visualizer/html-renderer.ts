import * as fs from 'fs';
import * as path from 'path';
import { ProjectStructure } from '../analyzer/project-structure';
import { TreeNodeData } from '../ui/types';
import { AssetResolver } from '../utils/asset-resolver';
import { logger } from '../utils/debug-logger';

/**
 * HtmlGenerator选项
 */
export interface HtmlGeneratorOptions {
  title: string;
  maxDepth?: number;
  focusNode?: string;
}

/**
 * Generates a static HTML file with embedded data and pre-built UI assets.
 */
export class HtmlGeneratorPreact {
  private structure: ProjectStructure;
  private reachableNodeIds: Set<string>;

  constructor(structure: ProjectStructure, reachableNodeIds: Set<string>) {
    this.structure = structure;
    this.reachableNodeIds = reachableNodeIds;
  }

  /**
   * Generates the static HTML page.
   */
  async generate(options: HtmlGeneratorOptions): Promise<string> {
    // 1. 定义资源文件的相对路径
    const jsAssetRelative = 'assets/main.js';
    const cssAssetRelative = 'assets/style.css';

    // 2. 使用AssetResolver获取资源内容
    const jsContent =
      AssetResolver.getJsAsset(jsAssetRelative) || 'console.error("无法加载UI资源");';
    const cssContent = AssetResolver.getCssAsset(cssAssetRelative) || '/* 无法加载样式 */';

    // 3. 准备数据
    // 树状视图数据
    const treeData = this.prepareAndConvertData(options.maxDepth, options.focusNode);
    const treeDataJson = JSON.stringify(treeData).replace(/</g, '\\u003c');
    // 完整结构数据（用于图形视图）
    const graphDataJson = JSON.stringify(this.structure).replace(/</g, '\\u003c');

    // 4. 定义HTML模板 - 嵌入两种数据集
    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title || '依赖可视化'}</title>
  <style>
    ${cssContent}
    body { margin: 0; font-family: sans-serif; background-color: #f8f9fa; color: #212529; }
    #app { padding: 20px; }
  </style>
</head>
<body>
  <div id="app"><noscript>You need to enable JavaScript to run this app.</noscript></div>
  <script>
    // Embed tree data for TreeView and other components
    window.__MP_LENS_DATA__ = ${treeDataJson};
    // Embed full graph data for DependencyGraph component
    window.__MP_LENS_GRAPH_DATA__ = ${graphDataJson};
    // Set title for UI components
    window.__MP_LENS_TITLE__ = "${options.title || '依赖可视化'}";
  </script>
  <script type="module">
    ${jsContent}
  </script>
</body>
</html>`;

    // 5. 保存生成的HTML
    const outputPath = path.resolve(process.cwd(), 'mp-lens-graph.html');
    fs.writeFileSync(outputPath, htmlTemplate);
    logger.info(`✅ 静态HTML图表已保存至: ${outputPath}`);

    return outputPath;
  }

  /**
   * 准备数据并转换为树形结构
   */
  private prepareAndConvertData(maxDepth?: number, focusNode?: string): TreeNodeData {
    let targetNodes: any[];
    let targetLinks: any[];
    let includedNodeIds: Set<string>; // No longer nullable

    // If maxDepth is not specified, set a large value to ensure full level display
    const effectiveMaxDepth = maxDepth !== undefined ? maxDepth : 999;

    // Apply filtering if focusNode and maxDepth are specified
    if (focusNode) {
      // TODO: Re-evaluate focus filtering logic if it needs to be aware of the pre-filtered reachable set
      // For now, assume filterStructureByFocus operates correctly or adapt it later.
      includedNodeIds = this.filterStructureByFocus(effectiveMaxDepth, focusNode);
      // Ensure focus filtering only includes nodes that are also globally reachable
      includedNodeIds = new Set([...includedNodeIds].filter((id) => this.reachableNodeIds.has(id)));
      logger.debug(`Focus filtering resulted in ${includedNodeIds.size} reachable nodes.`);
      targetNodes = this.structure.nodes.filter((n) => includedNodeIds.has(n.id));
      targetLinks = this.structure.links.filter(
        (l) => includedNodeIds.has(l.source) && includedNodeIds.has(l.target),
      );
    } else {
      // Use the pre-calculated reachableNodeIds directly
      includedNodeIds = this.reachableNodeIds;
      logger.debug(`Using pre-calculated reachable nodes: ${includedNodeIds.size}`);

      // Filter nodes based on reachability
      targetNodes = this.structure.nodes.filter((n) => includedNodeIds.has(n.id));

      // Filter links based on reachability of both source and target
      targetLinks = this.structure.links.filter(
        (l) => includedNodeIds.has(l.source) && includedNodeIds.has(l.target),
      );
    }

    const graphData = { nodes: targetNodes, links: targetLinks };

    // Pass the original full nodeStatistics map, but the tree will only be built from reachable nodes
    const treeData = this.convertGraphToTreeInternal(graphData);

    return treeData;
  }

  /**
   * 根据焦点节点过滤结构
   */
  private filterStructureByFocus(maxDepth: number, focusNodeId: string): Set<string> {
    // 检查focus节点是否存在
    if (!this.structure.nodes.some((n: any) => n.id === focusNodeId)) {
      // 如果不存在，返回所有节点
      return new Set(this.structure.nodes.map((n: any) => n.id));
    }

    const includedNodes = new Set<string>();
    const queue: { nodeId: string; depth: number }[] = [{ nodeId: focusNodeId, depth: 0 }];
    const visited = new Set<string>(); // Keep track of visited nodes to avoid redundant processing

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!;

      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      includedNodes.add(nodeId);

      // Don't explore beyond max depth
      if (depth >= maxDepth) continue;

      // Add neighbors (from link sources and targets)
      for (const link of this.structure.links) {
        if (link.source === nodeId && !visited.has(link.target)) {
          queue.push({ nodeId: link.target, depth: depth + 1 });
        }
        if (link.target === nodeId && !visited.has(link.source)) {
          queue.push({ nodeId: link.source, depth: depth + 1 });
        }
      }
    }

    return includedNodes;
  }

  /**
   * Converts the flat graph data into a hierarchical tree structure.
   * Uses the pre-calculated full nodeStatistics map.
   */
  private convertGraphToTreeInternal(
    graphData: { nodes: any[]; links: any[] },
    // No longer need fullNodeStatistics map, stats are on node properties
    // fullNodeStatistics: typeof this.nodeStatistics,
  ): TreeNodeData {
    logger.debug(
      `[convertGraphToTreeInternal] Received graphData with ${graphData.nodes.length} nodes and ${graphData.links.length} links.`,
    );
    // Log first few node IDs and link sources/targets for inspection
    logger.trace(
      '[convertGraphToTreeInternal] Sample Nodes:',
      graphData.nodes.slice(0, 5).map((n) => n.id),
    );
    logger.trace(
      '[convertGraphToTreeInternal] Sample Links:',
      graphData.links.slice(0, 5).map((l) => `${l.source} -> ${l.target} (${l.type})`),
    );

    // Create a map for quick access to node data from the filtered graphData
    const filteredNodeDataMap = new Map<string, any>();
    for (const node of graphData.nodes) {
      filteredNodeDataMap.set(node.id, node);
    }

    // Build children map based on links (prefer Structure, fallback to all)
    const childrenMap = new Map<string, Set<string>>();
    const structureLinks = graphData.links.filter((link) => link.type === 'Structure');
    const linksToUse = structureLinks.length > 0 ? structureLinks : graphData.links;

    // Store parent references while building childrenMap
    const parentMap = new Map<string, string>();
    for (const link of linksToUse) {
      if (!childrenMap.has(link.source)) {
        childrenMap.set(link.source, new Set<string>());
      }
      // Avoid adding self as child if source and target are same
      if (link.source !== link.target) {
        childrenMap.get(link.source)!.add(link.target);
        // Only set parent if target is part of the filtered nodes
        if (filteredNodeDataMap.has(link.target)) {
          parentMap.set(link.target, link.source);
        }
      }
    }
    logger.debug(
      `[convertGraphToTreeInternal] Built childrenMap (${childrenMap.size} entries) and parentMap (${parentMap.size} entries).`,
    );
    logger.trace("[convertGraphToTreeInternal] Children of 'app':", childrenMap.get('app'));

    // --- MODIFIED ROOT FINDING ---
    let rootId: string | undefined;

    // 1. Prioritize finding the 'app' node within the filtered graphData
    const appNode = graphData.nodes.find((node) => node.id === 'app');
    if (appNode) {
      rootId = appNode.id;
      logger.debug(`[convertGraphToTreeInternal] Found explicit 'app' node as root: ${rootId}`);
    } else {
      // 2. Fallback: Find node with no parent based on Structure links
      rootId = graphData.nodes.find((node) => !parentMap.has(node.id))?.id;
      logger.debug(
        `[convertGraphToTreeInternal] Did not find 'app' node, fallback root via parentMap: ${rootId}`,
      );

      // 3. Ultimate Fallback (if cycles hide the root or 'app' is missing)
      if (!rootId && graphData.nodes.length > 0) {
        // Prefer the original project root if it's included, otherwise the first node
        const originalRootId = this.structure.rootNodeId || 'app'; // Should still be 'app' usually
        rootId = filteredNodeDataMap.has(originalRootId) ? originalRootId : graphData.nodes[0].id;
        logger.warn(
          `[convertGraphToTreeInternal] Could not determine unique root via 'app' or parent links, falling back to: ${rootId}`,
        );
      }
    }
    // --- END MODIFIED ROOT FINDING ---

    if (!rootId) {
      logger.warn('[convertGraphToTreeInternal] No rootId could be determined!');
      return { id: 'empty', label: 'No Data', type: 'Unknown' };
    }
    logger.info(`[convertGraphToTreeInternal] Determined final rootId: ${rootId}`);

    // Recursive helper - uses node properties directly for stats
    const buildSubtreeHelper = (currentId: string, visited: Set<string>): TreeNodeData => {
      const nodeData = filteredNodeDataMap.get(currentId);
      if (!nodeData) {
        logger.warn(`[buildSubtreeHelper] Node data not found for ID: ${currentId}`);
        return { id: currentId, label: 'Error: Not Found', type: 'Unknown' };
      }

      // Prevent infinite loops in case of cycles in Structure links
      if (visited.has(currentId)) {
        logger.warn(
          `[buildSubtreeHelper] Cycle detected involving node: ${currentId}, stopping recursion.`,
        );
        return {
          id: nodeData.id,
          label: nodeData.label + ' (Cycle)',
          type: nodeData.type,
          properties: nodeData.properties,
        };
      }
      visited.add(currentId);

      const childrenData: TreeNodeData[] = [];
      const childIds = childrenMap.get(currentId) || [];
      for (const childId of childIds) {
        const childNode = filteredNodeDataMap.get(childId);
        // *** FILTERING LOGIC: Only include non-Module children in the tree ***
        if (childNode && childNode.type !== 'Module') {
          childrenData.push(buildSubtreeHelper(childId, new Set(visited))); // Pass copy of visited set for sibling branches
        }
      }

      // Sort children: Packages, Pages, Components, then alphabetically by label
      childrenData.sort((a, b) => {
        const typeOrder: Record<string, number> = { Package: 1, Page: 2, Component: 3 }; // Allow string index
        const orderA = typeOrder[a.type] ?? 99; // Use nullish coalescing for default
        const orderB = typeOrder[b.type] ?? 99; // Use nullish coalescing for default
        if (orderA !== orderB) return orderA - orderB;
        return a.label.localeCompare(b.label);
      });

      return {
        id: nodeData.id,
        label: nodeData.label,
        type: nodeData.type,
        properties: nodeData.properties,
        children: childrenData.length > 0 ? childrenData : undefined,
      };
    };

    const result = buildSubtreeHelper(rootId, new Set<string>());
    logger.debug(
      `[convertGraphToTreeInternal] Final built tree root: ${result?.id}, Children count: ${result?.children?.length}`,
    );

    // Handle case where buildSubtreeHelper returns null (shouldn't happen for valid rootId, but good practice)
    if (!result) {
      logger.error(`Failed to build subtree starting from root: ${rootId}`);
      return {
        id: 'error_root',
        label: 'Error Building Tree',
        type: 'Unknown',
        children: [],
        properties: {},
      };
    }
    return result;
  }
}
