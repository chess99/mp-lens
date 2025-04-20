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
  const { fileTypes, excludePatterns = [], verbose = false, useAliases = false } = options;
  
  console.log('DEBUG - Analyzer received project path:', projectRoot);
  console.log('DEBUG - Analyzer received options:', JSON.stringify(options, null, 2));
  console.log('DEBUG - File types:', fileTypes);
  console.log('DEBUG - Exclude patterns:', excludePatterns);
  console.log('DEBUG - Using path aliases:', useAliases);
  
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
  const unusedFiles = findUnusedFiles(dependencyGraph, projectRoot);
  
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
 */
function findUnusedFiles(graph: DependencyGraph, projectRoot: string): string[] {
  const entryFiles = [
    path.join(projectRoot, 'app.js'),
    path.join(projectRoot, 'app.ts'),
    path.join(projectRoot, 'app.json')
  ];
  
  const unusedFiles: string[] = [];
  
  for (const node of graph.nodes()) {
    // 排除入口文件
    if (entryFiles.includes(node)) {
      continue;
    }
    
    // 如果没有其他文件引用它，则认为是未使用的文件
    if (graph.inDegree(node) === 0) {
      unusedFiles.push(node);
    }
  }
  
  return unusedFiles;
} 