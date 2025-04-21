import * as path from 'path';
import { DependencyGraph } from '../analyzer/dependency-graph';

interface HtmlGeneratorOptions {
  title: string;
  projectRoot: string;
  maxDepth?: number;
  focusNode?: string;
}

/**
 * HTML依赖图生成器
 * 使用D3.js生成交互式依赖可视化
 */
export class HtmlGenerator {
  private graph: DependencyGraph;

  constructor(graph: DependencyGraph) {
    this.graph = graph;
  }

  /**
   * 生成HTML格式的依赖图
   */
  generate(options: HtmlGeneratorOptions): string {
    const { title, projectRoot, maxDepth, focusNode } = options;

    // 将依赖图转换为D3可用的格式
    const graphData = this.prepareGraphData(projectRoot, maxDepth, focusNode);

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            margin: 0;
            padding: 0;
            background-color: #f8f9fa;
        }
        
        #container {
            width: 100%;
            height: 100vh;
            overflow: hidden;
        }
        
        svg {
            width: 100%;
            height: 100%;
        }
        
        .node {
            cursor: pointer;
        }
        
        .node circle {
            fill: #4287f5;
            stroke: #2b5797;
            stroke-width: 1.5px;
        }
        
        .node.component circle {
            fill: #42f5ad;
            stroke: #2b9779;
        }
        
        .node.page circle {
            fill: #f542a7;
            stroke: #972b6d;
        }
        
        .node.wxs circle {
            fill: #f5a742;
            stroke: #97682b;
        }
        
        .node.highlighted circle {
            fill: #ff4242;
            stroke: #972b2b;
            stroke-width: 2.5px;
        }
        
        .node text {
            font-size: 10px;
            font-family: sans-serif;
            fill: #333;
        }
        
        .link {
            fill: none;
            stroke: #999;
            stroke-opacity: 0.6;
            stroke-width: 1.5px;
        }
        
        .highlighted {
            stroke: #ff4242;
            stroke-opacity: 0.8;
            stroke-width: 2px;
        }
        
        .tooltip {
            position: absolute;
            background: rgba(255, 255, 255, 0.9);
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 8px;
            font-size: 12px;
            pointer-events: none;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            max-width: 300px;
            z-index: 10;
        }
        
        .controls {
            position: absolute;
            top: 20px;
            left: 20px;
            background: white;
            border-radius: 4px;
            padding: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            z-index: 5;
        }
        
        .controls label {
            margin-right: 5px;
        }
        
        .search-box {
            margin-top: 10px;
        }
        
        .legend {
            position: absolute;
            bottom: 20px;
            left: 20px;
            background: white;
            border-radius: 4px;
            padding: 8px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        
        .legend-item {
            display: flex;
            align-items: center;
            margin-bottom: 4px;
        }
        
        .legend-item-color {
            width: 12px;
            height: 12px;
            margin-right: 5px;
            border-radius: 50%;
            border: 1px solid #555;
        }
    </style>
</head>
<body>
    <div id="container"></div>
    
    <div class="controls">
        <div>
            <label for="zoom-range">缩放:</label>
            <input type="range" id="zoom-range" min="0.1" max="2" step="0.1" value="1">
        </div>
        <div class="search-box">
            <input type="text" id="search-input" placeholder="搜索文件...">
            <button id="search-button">搜索</button>
        </div>
    </div>
    
    <div class="legend">
        <h4 style="margin-top: 0">图例</h4>
        <div class="legend-item">
            <div class="legend-item-color" style="background-color: #4287f5;"></div>
            <span>普通文件</span>
        </div>
        <div class="legend-item">
            <div class="legend-item-color" style="background-color: #42f5ad;"></div>
            <span>组件</span>
        </div>
        <div class="legend-item">
            <div class="legend-item-color" style="background-color: #f542a7;"></div>
            <span>页面</span>
        </div>
        <div class="legend-item">
            <div class="legend-item-color" style="background-color: #f5a742;"></div>
            <span>WXS模块</span>
        </div>
        <div class="legend-item">
            <div class="legend-item-color" style="background-color: #ff4242;"></div>
            <span>高亮节点</span>
        </div>
    </div>
    
    <script>
    // 依赖图数据
    const graphData = ${JSON.stringify(graphData)};
    
    // 初始化力导向图
    function initGraph() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        // 创建SVG容器
        const svg = d3.select("#container")
            .append("svg")
            .attr("viewBox", [0, 0, width, height]);
        
        // 创建缩放行为
        const zoom = d3.zoom()
            .scaleExtent([0.1, 2])
            .on("zoom", (event) => {
                g.attr("transform", event.transform);
            });
        
        svg.call(zoom);
        
        const g = svg.append("g");
        
        // 创建模拟
        const simulation = d3.forceSimulation(graphData.nodes)
            .force("link", d3.forceLink(graphData.links).id(d => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2))
            .force("x", d3.forceX(width / 2).strength(0.05))
            .force("y", d3.forceY(height / 2).strength(0.05));
        
        // 创建工具提示
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("opacity", 0);
        
        // 绘制连线
        const link = g.append("g")
            .selectAll("line")
            .data(graphData.links)
            .join("line")
            .attr("class", "link")
            .attr("class", d => d.highlighted ? "link highlighted" : "link");
        
        // 绘制节点
        const node = g.append("g")
            .selectAll(".node")
            .data(graphData.nodes)
            .join("g")
            .attr("class", d => {
                let classes = "node";
                if (d.type) classes += " " + d.type;
                if (d.highlighted) classes += " highlighted";
                return classes;
            })
            .call(drag(simulation))
            .on("mouseover", function(event, d) {
                tooltip.transition()
                    .duration(200)
                    .style("opacity", .9);
                
                tooltip.html(getTooltipContent(d))
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", function(d) {
                tooltip.transition()
                    .duration(500)
                    .style("opacity", 0);
            })
            .on("click", function(event, d) {
                // 高亮节点和连接的边
                highlightConnections(d.id);
            });
        
        // 为节点添加圆形
        node.append("circle")
            .attr("r", d => d.highlighted ? 8 : 6);
        
        // 为节点添加文本标签
        node.append("text")
            .attr("dx", 12)
            .attr("dy", ".35em")
            .text(d => d.label);
        
        // 更新模拟
        simulation.on("tick", () => {
            link
                .attr("x1", d => d.source.x)
                .attr("y1", d => d.source.y)
                .attr("x2", d => d.target.x)
                .attr("y2", d => d.target.y);
            
            node
                .attr("transform", d => \`translate(\${d.x},\${d.y})\`);
        });
        
        // 缩放控制
        d3.select("#zoom-range").on("input", function() {
            const scale = parseFloat(this.value);
            svg.call(zoom.transform, d3.zoomIdentity.scale(scale));
        });
        
        // 搜索功能
        d3.select("#search-button").on("click", search);
        d3.select("#search-input").on("keyup", function(event) {
            if (event.key === "Enter") search();
        });
        
        function search() {
            const searchTerm = d3.select("#search-input").property("value").toLowerCase();
            if (!searchTerm) return;
            
            const foundNode = graphData.nodes.find(node => 
                node.id.toLowerCase().includes(searchTerm) || 
                node.label.toLowerCase().includes(searchTerm)
            );
            
            if (foundNode) {
                // 将视图中心设置到找到的节点
                const transform = d3.zoomIdentity
                    .translate(width / 2 - foundNode.x, height / 2 - foundNode.y)
                    .scale(1);
                
                svg.transition().duration(750).call(zoom.transform, transform);
                
                // 高亮节点连接
                highlightConnections(foundNode.id);
            }
        }
        
        // 高亮节点和连接
        function highlightConnections(nodeId) {
            // 重置所有节点和连接的样式
            node.classed("highlighted", false);
            link.classed("highlighted", false);
            
            // 查找所有连接到此节点的边
            const connectedLinks = graphData.links.filter(
                link => link.source.id === nodeId || link.target.id === nodeId
            );
            
            // 高亮所选节点
            node.filter(d => d.id === nodeId).classed("highlighted", true);
            
            // 高亮相关连接和节点
            link.filter(d => d.source.id === nodeId || d.target.id === nodeId)
                .classed("highlighted", true);
            
            // 高亮连接的节点
            const connectedNodes = new Set();
            connectedLinks.forEach(link => {
                connectedNodes.add(link.source.id === nodeId ? link.target.id : link.source.id);
            });
            
            node.filter(d => connectedNodes.has(d.id)).classed("highlighted", true);
        }
        
        // 拖拽功能
        function drag(simulation) {
            function dragstarted(event) {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                event.subject.fx = event.subject.x;
                event.subject.fy = event.subject.y;
            }
            
            function dragged(event) {
                event.subject.fx = event.x;
                event.subject.fy = event.y;
            }
            
            function dragended(event) {
                if (!event.active) simulation.alphaTarget(0);
                event.subject.fx = null;
                event.subject.fy = null;
            }
            
            return d3.drag()
                .on("start", dragstarted)
                .on("drag", dragged)
                .on("end", dragended);
        }
        
        // 生成工具提示内容
        function getTooltipContent(node) {
            let content = \`<div><strong>\${node.label}</strong></div>\`;
            content += \`<div>类型: \${getTypeLabel(node.type)}</div>\`;
            
            const inDegree = graphData.links.filter(link => link.target.id === node.id).length;
            const outDegree = graphData.links.filter(link => link.source.id === node.id).length;
            
            content += \`<div>被引用: \${inDegree} 次</div>\`;
            content += \`<div>引用他人: \${outDegree} 个文件</div>\`;
            
            return content;
        }
        
        // 获取节点类型标签
        function getTypeLabel(type) {
            switch(type) {
                case 'component': return '组件';
                case 'page': return '页面';
                case 'wxs': return 'WXS模块';
                default: return '普通文件';
            }
        }
    }
    
    // 等待DOM加载完成后初始化图形
    document.addEventListener('DOMContentLoaded', initGraph);
    </script>
</body>
</html>
`;
  }

  /**
   * 准备用于可视化的图形数据
   */
  private prepareGraphData(projectRoot: string, maxDepth?: number, focusNode?: string) {
    // 获取所有节点和边
    const allNodes = this.graph.nodes();
    const graphData = {
      nodes: [] as any[],
      links: [] as any[],
    };

    // 如果指定了焦点节点，则根据最大深度筛选
    if (focusNode && maxDepth !== undefined) {
      // 以焦点节点为中心，进行BFS遍历
      const includedNodes = new Set<string>();
      const queue: Array<{ node: string; depth: number }> = [];

      // 添加焦点节点
      includedNodes.add(focusNode);
      queue.push({ node: focusNode, depth: 0 });

      // BFS遍历
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
        graphData.nodes.push(this.createNodeObject(node, projectRoot, node === focusNode));
      }

      // 添加边
      for (const node of includedNodes) {
        for (const target of this.graph.outEdges(node)) {
          if (includedNodes.has(target)) {
            graphData.links.push({
              source: node,
              target,
              highlighted: node === focusNode || target === focusNode,
            });
          }
        }
      }
    } else {
      // 没有焦点节点或深度限制，使用全部图
      graphData.nodes = allNodes.map((node) =>
        this.createNodeObject(node, projectRoot, focusNode === node),
      );

      for (const source of allNodes) {
        for (const target of this.graph.outEdges(source)) {
          graphData.links.push({
            source,
            target,
            highlighted: focusNode && (source === focusNode || target === focusNode),
          });
        }
      }
    }

    return graphData;
  }

  /**
   * 创建节点对象
   */
  private createNodeObject(nodePath: string, projectRoot: string, highlighted: boolean) {
    const relativePath = path.relative(projectRoot, nodePath);
    const ext = path.extname(nodePath);
    const basename = path.basename(nodePath);

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
}
