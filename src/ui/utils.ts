// 与 analyzer fileCount 逻辑一致的工具函数

import type { GraphLink, GraphNode } from '../analyzer/project-structure';

/**
 * 统计结构节点（如 App/Page/Package/Component）下所有可达 Module 节点
 * @param nodes ProjectStructure.nodes
 * @param links ProjectStructure.links
 * @param startId 起点节点 id
 * @returns 所有可达 Module 节点的 id 数组
 */
export function getReachableModules(
  nodes: GraphNode[],
  links: GraphLink[],
  startId: string,
): string[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const linksFrom = new Map<string, GraphLink[]>();
  links.forEach((link) => {
    if (!linksFrom.has(link.source)) linksFrom.set(link.source, []);
    linksFrom.get(link.source)!.push(link);
  });

  // 起点集合 = 自己 + 直接 Structure/Config 关联的 Module
  const startNodes = new Set<string>([startId]);
  const directLinks = linksFrom.get(startId) || [];
  directLinks.forEach((link) => {
    if (link.type === 'Structure' || link.type === 'Config') {
      const targetNode = nodeMap.get(link.target);
      if (targetNode && targetNode.type === 'Module') {
        startNodes.add(link.target);
      }
    }
  });

  // BFS 全边遍历
  const reachableModules = new Set<string>();
  const visited = new Set<string>();
  const queue = Array.from(startNodes);
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);
    const node = nodeMap.get(currentId);
    if (!node) continue;
    if (node.type === 'Module') {
      reachableModules.add(currentId);
    }
    const outLinks = linksFrom.get(currentId) || [];
    outLinks.forEach((link) => {
      // analyzer 逻辑：全类型边都遍历
      if (!visited.has(link.target)) {
        queue.push(link.target);
      }
    });
  }
  return Array.from(reachableModules);
}
