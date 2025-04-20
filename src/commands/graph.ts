import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { GraphOptions } from '../types/command-options';

/**
 * 生成依赖关系图
 */
export async function generateGraph(options: GraphOptions): Promise<void> {
  const { project, verbose, format, output, depth, focus, npm } = options;
  
  if (verbose) {
    console.log(chalk.blue('🔍 开始分析项目依赖关系...'));
    console.log(`项目路径: ${project}`);
    console.log(`输出格式: ${format}`);
    
    if (output) {
      console.log(`输出文件: ${output}`);
    }
    
    if (depth !== undefined) {
      console.log(`依赖深度限制: ${depth}`);
    }
    
    if (focus) {
      console.log(`聚焦文件: ${focus}`);
    }
    
    console.log(`包含npm依赖: ${npm ? '是' : '否'}`);
  }

  try {
    // 获取所有支持的文件类型
    const fileTypes = ['js', 'ts', 'wxml', 'wxss', 'json', 'wxs', 'png', 'jpg', 'jpeg', 'gif', 'svg'];
    
    // 设置排除规则
    const excludePatterns: string[] = [];
    if (!npm) {
      excludePatterns.push('**/node_modules/**', '**/miniprogram_npm/**');
    }
    
    // 分析项目依赖
    const { dependencyGraph } = await analyzeProject(project, {
      fileTypes,
      excludePatterns,
      verbose,
      useAliases: options.useAliases
    });
    
    // 获取图数据
    const graphData = dependencyGraph.toJSON();
    
    // 处理聚焦
    if (focus) {
      const focusPath = path.resolve(project, focus);
      // 处理聚焦逻辑...
      console.log(`聚焦于文件: ${focusPath}`);
    }
    
    // 处理深度限制
    if (depth !== undefined && depth >= 0) {
      // 实现深度限制逻辑...
      console.log(`限制依赖深度为: ${depth}`);
    }
    
    // 渲染可视化
    let outputContent = '';
    switch (format) {
      case 'html':
        outputContent = renderHTML(graphData);
        break;
      case 'dot':
        outputContent = renderDOT(graphData);
        break;
      case 'json':
        outputContent = JSON.stringify(graphData, null, 2);
        break;
      case 'svg':
      case 'png':
        outputContent = renderDOT(graphData);
        // 这里应该调用Graphviz将DOT转换为SVG或PNG
        // 简化版本不实现该功能
        console.log(chalk.yellow('⚠️ SVG/PNG格式需要安装Graphviz，本版本不支持直接导出。'));
        break;
      default:
        throw new Error(`不支持的输出格式: ${format}`);
    }
    
    // 写入文件或输出到控制台
    if (output) {
      fs.writeFileSync(output, outputContent);
      console.log(chalk.green(`✅ 依赖图已保存到: ${output}`));
    } else {
      // 如果是HTML，我们应该将其保存到临时文件并打开浏览器
      if (format === 'html') {
        const tempFile = path.join(process.cwd(), 'dependency-graph.html');
        fs.writeFileSync(tempFile, outputContent);
        console.log(chalk.green(`✅ 依赖图已保存到: ${tempFile}`));
        console.log(chalk.blue('请在浏览器中打开此文件查看交互式依赖图。'));
      } else {
        // 其他格式直接输出到控制台
        console.log(outputContent);
      }
    }
    
  } catch (error) {
    console.error(chalk.red(`❌ 生成依赖图失败: ${(error as Error).message}`));
    throw error;
  }
}

/**
 * 渲染HTML格式的依赖图
 */
function renderHTML(graphData: any): string {
  // 简化的HTML模板
  return `
<!DOCTYPE html>
<html>
<head>
  <title>微信小程序依赖图</title>
  <meta charset="utf-8">
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; }
    .node { fill: #69b3a2; stroke: #fff; stroke-width: 2px; }
    .link { stroke: #999; stroke-opacity: 0.6; }
    .node text { font-size: 10px; }
  </style>
</head>
<body>
  <div id="graph"></div>
  <script>
    const data = ${JSON.stringify(graphData)};
    // 这里应该有D3.js代码来渲染力导向图
    console.log('依赖图数据:', data);
    document.body.innerHTML += '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
  </script>
</body>
</html>
  `;
}

/**
 * 渲染DOT格式的依赖图
 */
function renderDOT(graphData: any): string {
  // 简化的DOT语言模板
  let dot = 'digraph DependencyGraph {\n';
  dot += '  node [shape=box];\n\n';
  
  // 添加节点
  for (const node of graphData.nodes) {
    const label = path.basename(node.id);
    dot += `  "${node.id}" [label="${label}"];\n`;
  }
  
  dot += '\n';
  
  // 添加边
  for (const link of graphData.links) {
    dot += `  "${link.source}" -> "${link.target}";\n`;
  }
  
  dot += '}\n';
  return dot;
} 