import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { GraphOptions } from '../types/command-options';
import { DotGenerator } from '../visualizer/dot-generator';
import { HtmlGenerator } from '../visualizer/html-generator';

export async function generateGraph(options: GraphOptions) {
  const { project, verbose, format, output, depth, focus, npm } = options;
  
  if (verbose) {
    console.log(chalk.blue('🔍 开始分析项目依赖关系...'));
    console.log(`项目路径: ${project}`);
    console.log(`输出格式: ${format}`);
    
    if (depth !== undefined) {
      console.log(`依赖深度限制: ${depth}`);
    }
    
    if (focus) {
      console.log(`焦点文件: ${focus}`);
    }
    
    if (npm === false) {
      console.log('排除 npm 依赖');
    }
  }

  try {
    // 分析项目获取依赖图
    const fileTypes = ['js', 'ts', 'wxml', 'wxss', 'json', 'wxs'];
    const excludePatterns = npm === false ? ['**/node_modules/**', '**/miniprogram_npm/**'] : [];
    
    const { dependencyGraph } = await analyzeProject(project, {
      fileTypes,
      excludePatterns,
      verbose
    });
    
    if (verbose) {
      console.log(`依赖图生成完成，包含 ${dependencyGraph.nodeCount} 个节点和 ${dependencyGraph.edgeCount} 条边。`);
    }
    
    // 根据格式生成输出
    let graphContent = '';
    let outputFile = output;
    
    switch (format) {
      case 'html':
        const htmlGenerator = new HtmlGenerator(dependencyGraph);
        graphContent = htmlGenerator.generate({
          title: '微信小程序依赖图',
          projectRoot: project,
          maxDepth: depth,
          focusNode: focus ? path.resolve(project, focus) : undefined
        });
        
        if (!outputFile) {
          outputFile = 'dependency-graph.html';
        } else if (!outputFile.endsWith('.html')) {
          outputFile += '.html';
        }
        break;
        
      case 'dot':
        const dotGenerator = new DotGenerator(dependencyGraph);
        graphContent = dotGenerator.generate({
          title: '微信小程序依赖图',
          projectRoot: project,
          maxDepth: depth,
          focusNode: focus ? path.resolve(project, focus) : undefined
        });
        
        if (!outputFile) {
          outputFile = 'dependency-graph.dot';
        } else if (!outputFile.endsWith('.dot')) {
          outputFile += '.dot';
        }
        break;
        
      case 'json':
        graphContent = JSON.stringify(dependencyGraph.toJSON(), null, 2);
        
        if (!outputFile) {
          outputFile = 'dependency-graph.json';
        } else if (!outputFile.endsWith('.json')) {
          outputFile += '.json';
        }
        break;
        
      case 'png':
      case 'svg':
        console.log(chalk.yellow(`注意：生成 ${format.toUpperCase()} 格式需要系统安装 Graphviz 工具。`));
        
        const dotGen = new DotGenerator(dependencyGraph);
        const dotContent = dotGen.generate({
          title: '微信小程序依赖图',
          projectRoot: project,
          maxDepth: depth,
          focusNode: focus ? path.resolve(project, focus) : undefined
        });
        
        // 将 DOT 格式保存为临时文件
        const tempDotFile = `temp-graph-${Date.now()}.dot`;
        fs.writeFileSync(tempDotFile, dotContent);
        
        if (!outputFile) {
          outputFile = `dependency-graph.${format}`;
        } else if (!outputFile.endsWith(`.${format}`)) {
          outputFile += `.${format}`;
        }
        
        try {
          // 使用 Graphviz 将 DOT 文件转换为 PNG/SVG
          const { execSync } = require('child_process');
          execSync(`dot -T${format} ${tempDotFile} -o ${outputFile}`);
          
          // 删除临时文件
          fs.unlinkSync(tempDotFile);
          
          console.log(chalk.green(`✅ 已生成依赖图: ${outputFile}`));
          return;
        } catch (e) {
          console.error(chalk.red(`❌ 无法生成 ${format.toUpperCase()} 文件：${(e as Error).message}`));
          console.log(chalk.yellow('请确保已安装 Graphviz 工具并将其添加到 PATH 环境变量中。'));
          
          // 清理临时文件
          if (fs.existsSync(tempDotFile)) {
            fs.unlinkSync(tempDotFile);
          }
          
          process.exit(1);
        }
        break;
        
      default:
        console.error(chalk.red(`❌ 不支持的输出格式: ${format}`));
        process.exit(1);
    }
    
    // 保存到文件
    fs.writeFileSync(outputFile, graphContent);
    console.log(chalk.green(`✅ 已生成依赖图: ${outputFile}`));
  } catch (error) {
    console.error(chalk.red(`❌ 分析失败: ${(error as Error).message}`));
    if (verbose) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
} 