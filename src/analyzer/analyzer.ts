import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { DependencyGraph } from './dependency-graph';
import { FileParser } from './file-parser';

interface AnalysisResult {
  dependencyGraph: DependencyGraph;
  unusedFiles: string[];
}

/**
 * 分析微信小程序项目，构建依赖图并找出未使用的文件
 */
export async function analyzeProject(
  projectRoot: string,
  options: AnalyzerOptions
): Promise<AnalysisResult> {
  const { fileTypes, excludePatterns = [], verbose = false, essentialFiles = [] } = options;
  
  console.log('DEBUG - Analyzer received project path:', projectRoot);
  console.log('DEBUG - Analyzer received options:', JSON.stringify(options, null, 2));
  console.log('DEBUG - File types:', fileTypes);
  console.log('DEBUG - Exclude patterns:', excludePatterns);
  
  if (essentialFiles.length > 0 && verbose) {
    console.log('DEBUG - Essential files:', essentialFiles);
  }
  
  // 验证项目路径
  if (!projectRoot || !fs.existsSync(projectRoot)) {
    throw new Error(`项目路径不存在: ${projectRoot}`);
  }

  // 获取所有符合条件的文件
  const allFiles = findAllFiles(projectRoot, fileTypes, excludePatterns);
  
  if (verbose) {
    console.log(`找到 ${allFiles.length} 个文件用于分析`);
  }

  // 构建依赖图
  const dependencyGraph = new DependencyGraph();
  const fileParser = new FileParser(projectRoot, options);
  
  // 第一步：添加所有文件到图中
  for (const file of allFiles) {
    dependencyGraph.addNode(file);
  }
  
  // 第二步：分析每个文件的依赖关系
  for (const file of allFiles) {
    try {
      const dependencies = await fileParser.parseFile(file);
      
      for (const dep of dependencies) {
        // 只添加项目内的依赖关系
        if (allFiles.includes(dep)) {
          dependencyGraph.addEdge(file, dep);
        }
      }
    } catch (error) {
      if (verbose) {
        console.warn(`无法解析文件 ${file}: ${(error as Error).message}`);
      }
    }
  }
  
  // 找出未被引用的文件（入度为0的节点，排除app.js/app.json等入口文件）
  const unusedFiles = findUnusedFiles(dependencyGraph, projectRoot, essentialFiles);
  
  return {
    dependencyGraph,
    unusedFiles
  };
}

/**
 * 在指定目录中查找所有符合条件的文件
 */
function findAllFiles(
  rootDir: string,
  fileTypes: string[],
  excludePatterns: string[]
): string[] {
  const globPattern = `**/*.{${fileTypes.join(',')}}`;
  
  // 默认排除的模式
  const defaultIgnorePatterns = [
    '**/node_modules/**', 
    '**/miniprogram_npm/**',
    '**/output/dependency-graph.*',
    '**/output/unused-files.*',
    'dependency-graph.*',
    'unused-files.*',
    '**/dist/**'
  ];
  
  const globOptions: glob.IOptions = {
    cwd: rootDir,
    absolute: true,
    ignore: [...defaultIgnorePatterns, ...excludePatterns],
    nodir: true
  };
  
  return glob.sync(globPattern, globOptions);
}

/**
 * 查找未被使用的文件
 * 使用可达性分析：从入口文件开始，标记所有可达的文件，剩余的即为未使用的文件
 */
function findUnusedFiles(graph: DependencyGraph, projectRoot: string, essentialFiles: string[] = []): string[] {
  // 默认入口文件和基本配置文件
  const defaultEssentialFiles = [
    'app.js',
    'app.ts',
    'app.json',
    'project.config.json',
    'tsconfig.json',
    'mp-analyzer.config.json',
    'package.json',
    '.eslintrc.js',
    '.eslintrc.json',
    '.prettierrc',
    '.prettierrc.js',
    '.babelrc',
    'babel.config.js'
  ].map(file => path.join(projectRoot, file));
  
  // 合并默认的和用户定义的必要文件
  const allEssentialFiles = [...defaultEssentialFiles, ...essentialFiles];
  
  // 已访问的节点集合
  const visited = new Set<string>();
  
  // 从入口文件开始进行深度优先搜索，标记所有可达的文件
  function dfs(node: string) {
    if (visited.has(node)) return;
    visited.add(node);
    
    // 访问所有依赖的文件（出边）
    for (const dep of graph.outEdges(node)) {
      dfs(dep);
    }
  }
  
  // 从每个入口文件和必要文件开始搜索
  for (const entryFile of allEssentialFiles) {
    if (graph.hasNode(entryFile)) {
      dfs(entryFile);
    }
  }
  
  // 查找其他有用但可能不是从入口文件直接可达的文件
  // 例如：通过动态导入或其他特殊方式引用的文件
  const allNodes = graph.nodes();
  
  // 额外检查：任何被其他文件引用的文件，应该被标记为使用中
  // 进行多轮传播检查，直到没有新的节点被标记
  let newMarked = true;
  while (newMarked) {
    newMarked = false;
    
    for (const node of allNodes) {
      // 如果节点已被标记为访问过，检查它指向的所有节点
      if (visited.has(node)) {
        for (const dep of graph.outEdges(node)) {
          if (!visited.has(dep)) {
            visited.add(dep);
            newMarked = true;
          }
        }
      }
    }
  }
  
  // 未访问的节点即为未使用的文件
  const unusedFiles: string[] = [];
  for (const node of allNodes) {
    // 排除必要文件的额外检查（虽然它们应该已经在DFS中被标记）
    if (allEssentialFiles.includes(node) || allEssentialFiles.some(pattern => {
      // 支持通配符匹配
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        return regex.test(node);
      }
      return false;
    })) {
      continue;
    }
    
    if (!visited.has(node)) {
      unusedFiles.push(node);
    }
  }
  
  return unusedFiles;
} 