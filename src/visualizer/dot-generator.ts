import * as path from 'path';
import { DependencyGraph } from '../analyzer/dependency-graph';

interface DotGeneratorOptions {
  title: string;
  projectRoot: string;
  maxDepth?: number;
  focusNode?: string;
}

/**
 * DOT 依赖图生成器
 * 生成 Graphviz 兼容的 DOT 格式
 */
export class DotGenerator {
  private graph: DependencyGraph;

  constructor(graph: DependencyGraph) {
    this.graph = graph;
  }

  /**
   * 生成 DOT 格式的依赖图
   */
  generate(options: DotGeneratorOptions): string {
    const { title, projectRoot, maxDepth, focusNode } = options;

    // 准备节点和边的数据
    const { nodes, edges } = this.prepareGraphData(projectRoot, maxDepth, focusNode);

    // 构建 DOT 字符串
    let dot = `digraph "${title}" {\n`;

    // 图的全局设置
    dot += '  graph [rankdir=LR, fontname="Arial", fontsize=12, overlap=false, splines=true];\n';
    dot += '  node [shape=box, style="rounded,filled", fontname="Arial", fontsize=10];\n';
    dot += '  edge [color="#999999", fontname="Arial", fontsize=8];\n\n';

    // 添加节点
    for (const node of nodes) {
      const attrs = this.getNodeAttributes(node);

      // 格式化属性
      const attrStr = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(', ');

      dot += `  "${node.id}" [${attrStr}];\n`;
    }

    dot += '\n';

    // 添加边
    for (const edge of edges) {
      const attrs = this.getEdgeAttributes(edge);

      // 格式化属性
      const attrStr = Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(', ');

      dot += `  "${edge.source}" -> "${edge.target}" [${attrStr}];\n`;
    }

    dot += '}\n';

    return dot;
  }

  /**
   * 准备用于生成 DOT 的图形数据
   */
  private prepareGraphData(projectRoot: string, maxDepth?: number, focusNode?: string) {
    // 获取所有节点
    const allNodes = this.graph.nodes();

    // 结果容器
    const result = {
      nodes: [] as any[],
      edges: [] as any[],
    };

    // 如果指定了焦点节点和最大深度
    if (focusNode && maxDepth !== undefined) {
      // 使用 BFS 遍历图进行筛选
      const includedNodes = new Set<string>();
      const queue: Array<{ node: string; depth: number }> = [];

      // 添加焦点节点
      includedNodes.add(focusNode);
      queue.push({ node: focusNode, depth: 0 });

      // BFS 遍历
      while (queue.length > 0) {
        const { node, depth } = queue.shift()!;

        // 如果达到最大深度，则不继续遍历
        if (depth >= maxDepth) continue;

        // 添加所有出边相连的节点
        for (const target of this.graph.outEdges(node)) {
          if (!includedNodes.has(target)) {
            includedNodes.add(target);
            queue.push({ node: target, depth: depth + 1 });
          }
        }

        // 添加所有入边相连的节点
        for (const source of this.graph.inEdges(node)) {
          if (!includedNodes.has(source)) {
            includedNodes.add(source);
            queue.push({ node: source, depth: depth + 1 });
          }
        }
      }

      // 根据筛选结果构建图形数据
      for (const node of includedNodes) {
        result.nodes.push(this.createNodeObject(node, projectRoot, node === focusNode));
      }

      // 添加边
      for (const source of includedNodes) {
        for (const target of this.graph.outEdges(source)) {
          if (includedNodes.has(target)) {
            result.edges.push({
              source,
              target,
              highlighted: source === focusNode || target === focusNode,
            });
          }
        }
      }
    } else {
      // 没有焦点节点或深度限制，使用全部图
      result.nodes = allNodes.map((node) =>
        this.createNodeObject(node, projectRoot, focusNode === node),
      );

      // 添加边
      for (const source of allNodes) {
        for (const target of this.graph.outEdges(source)) {
          result.edges.push({
            source,
            target,
            highlighted: focusNode && (source === focusNode || target === focusNode),
          });
        }
      }
    }

    return result;
  }

  /**
   * 创建节点对象
   */
  private createNodeObject(nodePath: string, projectRoot: string, highlighted: boolean) {
    const relativePath = path.relative(projectRoot, nodePath);
    const ext = path.extname(nodePath);

    // 确定节点类型
    let type = '';
    if (nodePath.includes('/components/') || nodePath.includes('\\components\\')) {
      type = 'component';
    } else if (nodePath.includes('/pages/') || nodePath.includes('\\pages\\')) {
      type = 'page';
    } else if (ext === '.wxs') {
      type = 'wxs';
    }

    return {
      id: nodePath,
      label: relativePath,
      type,
      highlighted,
    };
  }

  /**
   * 获取节点的 DOT 属性
   */
  private getNodeAttributes(node: any) {
    const attrs: Record<string, string> = {
      label: node.label,
    };

    // 根据类型设置不同的样式
    switch (node.type) {
      case 'component':
        attrs.fillcolor = '#c2f5e2';
        attrs.tooltip = `组件: ${node.label}`;
        break;
      case 'page':
        attrs.fillcolor = '#f5c2dd';
        attrs.tooltip = `页面: ${node.label}`;
        break;
      case 'wxs':
        attrs.fillcolor = '#f5ddc2';
        attrs.tooltip = `WXS模块: ${node.label}`;
        break;
      default:
        attrs.fillcolor = '#c2d1f5';
        attrs.tooltip = `文件: ${node.label}`;
    }

    // 如果是高亮节点，使用不同的颜色
    if (node.highlighted) {
      attrs.fillcolor = '#ff9999';
      attrs.penwidth = '2';
    }

    return attrs;
  }

  /**
   * 获取边的 DOT 属性
   */
  private getEdgeAttributes(edge: any) {
    const attrs: Record<string, string> = {};

    if (edge.highlighted) {
      attrs.color = '#ff0000';
      attrs.penwidth = '1.5';
    }

    return attrs;
  }
}
