import * as fs from 'fs';
import * as path from 'path';
import { ProjectStructure } from '../analyzer/project-structure';
import { TreeNodeData } from '../ui/types';
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
  private nodeStatistics: Map<
    string,
    { files: number; size: number; fileTypes: Record<string, number> }
  >;

  constructor(structure: ProjectStructure) {
    this.structure = structure;
    this.nodeStatistics = new Map();
    this.calculateNodeStatistics();
  }

  /**
   * Generates the static HTML page.
   */
  async generate(options: HtmlGeneratorOptions): Promise<string> {
    // 1. Define hardcoded asset paths relative to dist/ui-assets
    const jsAssetRelative = 'assets/main.js';
    const cssAssetRelative = 'assets/style.css';

    // 2. Construct full paths relative to this compiled file (__dirname)
    // __dirname = dist/cli/visualizer/
    // Target = dist/ui-assets/assets/
    // Path = ../../ui-assets/assets/...
    const jsAssetPath = path.resolve(__dirname, `../../ui-assets/${jsAssetRelative}`);
    const cssAssetPath = path.resolve(__dirname, `../../ui-assets/${cssAssetRelative}`);

    // 3. Read asset file contents
    let jsContent = '';
    let cssContent = '';
    try {
      logger.debug(`Reading JS content from: ${jsAssetPath}`);
      jsContent = fs.readFileSync(jsAssetPath, 'utf-8');
      logger.debug(`Reading CSS content from: ${cssAssetPath}`);
      if (fs.existsSync(cssAssetPath)) {
        cssContent = fs.readFileSync(cssAssetPath, 'utf-8');
      } else {
        logger.warn(`CSS asset not found at ${cssAssetPath}, continuing without CSS.`);
        cssContent = '/* CSS file not found */';
      }
      logger.debug('Asset contents read successfully.');
    } catch (error: unknown) {
      // Check if it's an error object with a path property
      const hasPath = typeof error === 'object' && error !== null && 'path' in error;

      if (hasPath && (error as { path: string }).path === jsAssetPath) {
        logger.error(`Failed to read JS asset file at ${jsAssetPath}:`, error);
        throw new Error(
          'Failed to read built UI JS asset file. Ensure UI build completed successfully.',
        );
      } else {
        logger.error('Error reading asset file contents:', error);
        jsContent = 'console.error("Failed to load UI JS content");';
      }
    }

    // 4. Prepare data
    const treeData = this.prepareAndConvertData(options.maxDepth, options.focusNode);
    const dataJson = JSON.stringify(treeData).replace(/</g, '\\u003c');

    // 5. Define HTML Template - Embed content, don't link
    const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${options.title || 'MP-Lens 项目可视化'}</title>
  <style>
    ${cssContent}
    body { margin: 0; font-family: sans-serif; background-color: #f8f9fa; color: #212529; }
    #app { padding: 20px; }
  </style>
</head>
<body>
  <div id="app"><noscript>You need to enable JavaScript to run this app.</noscript></div>
  <script>
    window.__MP_LENS_DATA__ = ${dataJson};
  </script>
  <script type="module">
    ${jsContent}
  </script>
</body>
</html>`;

    // 6. Save the generated HTML
    const outputPath = path.resolve(process.cwd(), 'mp-lens-graph.html');
    fs.writeFileSync(outputPath, htmlTemplate);
    logger.info(`✅ Static HTML graph saved to: ${outputPath}`);

    return outputPath;
  }

  /**
   * 计算节点统计信息
   */
  private calculateNodeStatistics(): void {
    let totalSizeSum = 0;

    // 初始化统计信息
    for (const node of this.structure.nodes) {
      this.nodeStatistics.set(node.id, {
        files: 0,
        size: 0,
        fileTypes: {},
      });
    }

    // 第一步：在原始节点上标记文件数据
    const fileNodeIds = new Set<string>();
    for (const node of this.structure.nodes) {
      if (node.type === 'Module' && node.properties) {
        fileNodeIds.add(node.id);

        // 获取文件大小
        const fileSize = node.properties.fileSize || 0;
        totalSizeSum += fileSize;
        const fileExt = node.properties.fileExt || 'unknown';

        // 更新该节点统计信息
        const stats = this.nodeStatistics.get(node.id);
        if (stats) {
          stats.files = 1;
          stats.size = fileSize;
          stats.fileTypes[fileExt] = 1;
        }
      }
    }

    // 第二步：构建子节点到父节点的映射（只使用Structure类型链接）
    const childToParents = new Map<string, string[]>();
    for (const link of this.structure.links) {
      if (link.type === 'Structure') {
        if (!childToParents.has(link.target)) {
          childToParents.set(link.target, []);
        }
        childToParents.get(link.target)!.push(link.source);
      }
    }

    // 第三步：使用拓扑排序方式计算文件统计，自底向上累加
    // 创建入度映射
    const inDegree = new Map<string, number>();
    for (const node of this.structure.nodes) {
      inDegree.set(node.id, 0);
    }

    // 计算每个节点的入度
    for (const [child, parents] of childToParents.entries()) {
      inDegree.set(child, (inDegree.get(child) || 0) + parents.length);
    }

    // 找出所有入度为0的节点（叶子节点）开始处理
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // 处理队列
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      const nodeStats = this.nodeStatistics.get(nodeId);

      // 如果有父节点，更新父节点的统计信息
      const parents = childToParents.get(nodeId) || [];

      if (nodeStats) {
        for (const parentId of parents) {
          const parentStats = this.nodeStatistics.get(parentId);
          if (parentStats) {
            // 累加文件数
            parentStats.files += nodeStats.files;
            // 累加文件大小
            parentStats.size += nodeStats.size;

            // 合并文件类型统计
            for (const [ext, count] of Object.entries(nodeStats.fileTypes)) {
              if (!parentStats.fileTypes[ext]) {
                parentStats.fileTypes[ext] = 0;
              }
              parentStats.fileTypes[ext] += count;
            }
          }

          // 减少父节点的入度
          inDegree.set(parentId, (inDegree.get(parentId) || 0) - 1);

          // 如果父节点入度为0，加入队列
          if (inDegree.get(parentId) === 0) {
            queue.push(parentId);
          }
        }
      }
    }

    // 检查是否有节点没有被处理（可能存在环或孤立节点）
    const isolatedFileNodes = [];

    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree > 0) {
        // 检查是否是文件节点
        const stats = this.nodeStatistics.get(nodeId);
        if (stats && stats.files > 0) {
          isolatedFileNodes.push(nodeId);
        }
      }
    }

    // 关键修复：将所有未处理的文件节点直接算入根节点统计
    // 这样确保所有文件都被计数，无论结构关系如何
    const rootNodeId = this.structure.rootNodeId || 'app';
    const rootStats = this.nodeStatistics.get(rootNodeId);

    if (rootStats) {
      for (const nodeId of isolatedFileNodes) {
        const stats = this.nodeStatistics.get(nodeId);
        if (stats) {
          // 将孤立文件节点的统计信息加到根节点
          rootStats.files += stats.files;
          rootStats.size += stats.size;

          for (const [ext, count] of Object.entries(stats.fileTypes)) {
            if (!rootStats.fileTypes[ext]) {
              rootStats.fileTypes[ext] = 0;
            }
            rootStats.fileTypes[ext] += count;
          }
        }
      }
    }

    // 最终再检查一次：如果还有文件没有被计入根节点，强制计入
    let totalModuleFiles = 0;
    for (const node of this.structure.nodes) {
      if (node.type === 'Module' && node.id !== rootNodeId) {
        totalModuleFiles++;
      }
    }

    if (rootStats && rootStats.files < totalModuleFiles) {
      rootStats.files = totalModuleFiles;
      // 同时确保总大小也被正确设置
      if (rootStats.size < totalSizeSum) {
        rootStats.size = totalSizeSum;
      }
    }
  }

  /**
   * 准备数据并转换为树形结构
   */
  private prepareAndConvertData(maxDepth?: number, focusNode?: string): TreeNodeData {
    let targetNodes: any[];
    let targetLinks: any[];
    let includedNodeIds: Set<string> | null = null;

    // 如果未指定maxDepth，设置为一个很大的值，确保能展示完整层级
    const effectiveMaxDepth = maxDepth !== undefined ? maxDepth : 999;

    // Apply filtering if focusNode and maxDepth are specified
    if (focusNode) {
      includedNodeIds = this.filterStructureByFocus(effectiveMaxDepth, focusNode);
      targetNodes = this.structure.nodes.filter((n) => includedNodeIds!.has(n.id));
      targetLinks = this.structure.links.filter(
        (l) => includedNodeIds!.has(l.source) && includedNodeIds!.has(l.target),
      );
    } else {
      // 如果没有指定焦点节点，处理应用层级（展示完整层级）
      const rootNodeId = this.structure.rootNodeId || 'app';

      // 使用BFS从根节点开始，收集所有可达节点
      includedNodeIds = new Set<string>();
      const queue: { nodeId: string; depth: number }[] = [{ nodeId: rootNodeId, depth: 0 }];
      const visited = new Set<string>();

      includedNodeIds.add(rootNodeId);
      visited.add(rootNodeId);

      // 按照层级计算节点，不限制深度
      while (queue.length > 0) {
        const { nodeId, depth } = queue.shift()!;

        // 找出直接连接的Structure类型链接
        const directLinks = this.structure.links.filter(
          (l) => l.source === nodeId && l.type === 'Structure',
        );

        // 添加直接连接的节点到包含列表
        for (const link of directLinks) {
          includedNodeIds.add(link.target);

          // 如果没访问过，加入队列
          if (!visited.has(link.target)) {
            visited.add(link.target);
            queue.push({ nodeId: link.target, depth: depth + 1 });
          }
        }
      }

      // 扩展节点列表
      targetNodes = this.structure.nodes.filter((n) => includedNodeIds!.has(n.id));

      // 包含所有在includedNodeIds中的节点之间的链接
      targetLinks = this.structure.links.filter(
        (l) =>
          includedNodeIds!.has(l.source) &&
          includedNodeIds!.has(l.target) &&
          // 优先包含Structure类型链接，Import类型次之
          (l.type === 'Structure' || l.type === 'Import'),
      );
    }

    // Map nodes for flat graph data (D3/G6 Graph format)
    const graphNodes = targetNodes.map((node) => {
      // Get the statistics for this node
      const stats = this.nodeStatistics.get(node.id);

      // Enrich properties with statistics
      const enrichedProperties = {
        ...(node.properties || {}),
      };

      // Add statistics to properties if available
      if (stats) {
        enrichedProperties.fileCount = stats.files;
        enrichedProperties.totalSize = stats.size;
        enrichedProperties.fileTypes = stats.fileTypes;
      }

      return {
        id: node.id,
        label: node.label || node.id,
        type: node.type,
        highlighted: focusNode === node.id,
        properties: enrichedProperties,
      };
    });

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
   * 将平面图数据转换为层次树结构
   */
  private convertGraphToTreeInternal(graphData: { nodes: any[]; links: any[] }): TreeNodeData {
    // Create a map of all nodes by ID for quick access
    const nodeMap = new Map<string, TreeNodeData>();
    for (const node of graphData.nodes) {
      nodeMap.set(node.id, {
        id: node.id,
        label: node.label,
        type: node.type,
        properties: node.properties,
        children: [],
      });
    }

    // Create a map of parent-child relationships, based on 'Structure' links
    // preferentially, or any link type if not found
    const childrenMap = new Map<string, Set<string>>();

    // 1. First try to use Structure links only
    const structureLinks = graphData.links.filter((link) => link.type === 'Structure');
    let hasStructureLinks = false;

    for (const link of structureLinks) {
      hasStructureLinks = true;
      if (!childrenMap.has(link.source)) {
        childrenMap.set(link.source, new Set<string>());
      }
      childrenMap.get(link.source)!.add(link.target);

      // Set parent reference on target node
      const targetNode = nodeMap.get(link.target);
      if (targetNode) {
        targetNode.parent = link.source;
      }
    }

    // 2. If no Structure links found, use all links as fallback
    if (!hasStructureLinks) {
      for (const link of graphData.links) {
        if (!childrenMap.has(link.source)) {
          childrenMap.set(link.source, new Set<string>());
        }
        childrenMap.get(link.source)!.add(link.target);

        // Set parent reference on target node
        const targetNode = nodeMap.get(link.target);
        if (targetNode) {
          targetNode.parent = link.source;
        }
      }
    }

    // Find the root node (node with no parent)
    let rootId = graphData.nodes.find((node) => {
      const nodeObj = nodeMap.get(node.id);
      return nodeObj && !nodeObj.parent;
    })?.id;

    // If no root node found, use the first node as root
    if (!rootId && graphData.nodes.length > 0) {
      rootId = graphData.nodes[0].id;
    }

    // If still no root node, create a dummy root
    if (!rootId) {
      rootId = 'root';
      nodeMap.set(rootId, {
        id: rootId,
        label: 'Root',
        type: 'Unknown',
        children: [],
      });
    }

    // Recursive helper to build subtree
    function buildSubtreeHelper(
      nodeId: string,
      builtSet: Set<string>,
      nodeMapRef: Map<string, TreeNodeData>,
      childrenMapRef: Map<string, Set<string>>,
    ): TreeNodeData | null {
      if (builtSet.has(nodeId)) {
        // Already processed this node, avoid cycle
        return null;
      }
      builtSet.add(nodeId);

      const node = nodeMapRef.get(nodeId);
      if (!node) return null;

      // Create a copy of the node to avoid modifying the original
      const resultNode: TreeNodeData = {
        ...node,
        children: [], // We'll fill this with real children
      };

      // Add children
      const childIds = childrenMapRef.get(nodeId);
      if (childIds) {
        // 先创建所有子节点的列表
        const childrenToProcess = Array.from(childIds);

        // 按照节点类型对子节点排序：先包(Package)，再页面(Page)，然后组件(Component)，最后是普通文件(Module)
        childrenToProcess.sort((aId, bId) => {
          const aNode = nodeMapRef.get(aId);
          const bNode = nodeMapRef.get(bId);
          if (!aNode || !bNode) return 0;

          const typeOrder: Record<string, number> = {
            App: 0,
            Package: 1,
            Page: 2,
            Component: 3,
            Module: 4,
          };

          const aOrderValue = typeOrder[aNode.type] ?? 999;
          const bOrderValue = typeOrder[bNode.type] ?? 999;

          return aOrderValue - bOrderValue;
        });

        // 处理排序后的子节点
        for (const childId of childrenToProcess) {
          // Skip if this would create a cycle
          if (builtSet.has(childId)) continue;

          // 创建一个新的builtSet副本，而不是共享引用
          const childBuiltSet = new Set([...builtSet]);
          const childNode = buildSubtreeHelper(childId, childBuiltSet, nodeMapRef, childrenMapRef);

          if (childNode) {
            resultNode.children!.push(childNode);
          }
        }
      }

      // 如果节点是一个组或包，默认展开
      if (
        (resultNode.type === 'App' || resultNode.type === 'Package') &&
        resultNode.children &&
        resultNode.children.length > 0
      ) {
        resultNode.collapsed = false;
      }

      return resultNode;
    }

    // Build the complete tree starting from root
    const result = buildSubtreeHelper(rootId, new Set<string>(), nodeMap, childrenMap);

    if (!result) {
      // Fallback for rare case where tree building fails completely
      return {
        id: 'error',
        label: 'Error Building Tree',
        type: 'Unknown',
      };
    }

    return result;
  }
}
