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
  const { 
    fileTypes, 
    excludePatterns = [], 
    verbose = false, 
    essentialFiles = [],
    miniappRoot,
    entryFile,
    entryContent
  } = options;
  
  // 确定实际的小程序根目录
  const actualRoot = miniappRoot || projectRoot;
  
  console.log('DEBUG - Analyzer received project path:', projectRoot);
  if (miniappRoot) {
    console.log('DEBUG - Analyzer received miniapp root:', miniappRoot);
  }
  console.log('DEBUG - Using root for analysis:', actualRoot);
  console.log('DEBUG - Analyzer received options:', JSON.stringify(options, null, 2));
  console.log('DEBUG - File types:', fileTypes);
  console.log('DEBUG - Exclude patterns:', excludePatterns);
  
  if (essentialFiles.length > 0 && verbose) {
    console.log('DEBUG - Essential files:', essentialFiles);
  }
  
  if (entryFile && verbose) {
    console.log('DEBUG - Using custom entry file:', entryFile);
  }
  
  if (entryContent && verbose) {
    console.log('DEBUG - Using provided entry content');
  }
  
  // 验证项目路径
  if (!actualRoot || !fs.existsSync(actualRoot)) {
    throw new Error(`小程序目录不存在: ${actualRoot}`);
  }

  // 获取所有符合条件的文件
  const allFiles = findAllFiles(actualRoot, fileTypes, excludePatterns);
  
  if (verbose) {
    console.log(`找到 ${allFiles.length} 个文件用于分析`);
  }

  // 构建依赖图
  const dependencyGraph = new DependencyGraph();
  const fileParser = new FileParser(actualRoot, options);
  
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
  
  // 找出未被引用的文件
  const unusedFiles = findUnusedFiles(
    dependencyGraph, 
    actualRoot, 
    essentialFiles,
    entryFile,
    entryContent
  );
  
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
function findUnusedFiles(
  graph: DependencyGraph, 
  projectRoot: string, 
  essentialFiles: string[] = [], 
  entryFile?: string, 
  entryContent?: any
): string[] {
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
  const allEssentialFiles = [...defaultEssentialFiles, ...essentialFiles.map(file => {
    // 如果是相对路径，则相对于projectRoot解析
    return path.isAbsolute(file) ? file : path.join(projectRoot, file);
  })];
  
  // 确定实际入口文件
  let entryFiles: string[] = [];
  let customEntry = entryFile ? path.join(projectRoot, entryFile) : null;
  
  // 检查自定义入口文件是否存在
  if (customEntry && fs.existsSync(customEntry)) {
    entryFiles.push(customEntry);
    console.log(`使用自定义入口文件: ${customEntry}`);
  } else if (customEntry) {
    console.warn(`警告: 自定义入口文件不存在: ${customEntry}`);
  }
  
  // 如果提供了入口内容但没有找到入口文件，尝试解析入口内容
  if (entryContent && (!customEntry || !fs.existsSync(customEntry))) {
    try {
      console.log('使用提供的入口文件内容');
      
      // 如果是小程序app.json格式的内容
      if (entryContent.pages && Array.isArray(entryContent.pages)) {
        // 将pages字段中的每个页面添加为"入口"文件
        for (const page of entryContent.pages) {
          const extensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
          
          for (const ext of extensions) {
            const pagePath = path.join(projectRoot, page + ext);
            if (fs.existsSync(pagePath) && graph.hasNode(pagePath)) {
              entryFiles.push(pagePath);
            }
          }
        }
        
        // 处理分包加载
        if (entryContent.subpackages || entryContent.subPackages) {
          const subpackages = entryContent.subpackages || entryContent.subPackages || [];
          
          for (const pkg of subpackages) {
            if (pkg.root && pkg.pages && Array.isArray(pkg.pages)) {
              for (const page of pkg.pages) {
                const pagePath = path.join(pkg.root, page);
                const extensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
                
                for (const ext of extensions) {
                  const fullPath = path.join(projectRoot, pagePath + ext);
                  if (fs.existsSync(fullPath) && graph.hasNode(fullPath)) {
                    entryFiles.push(fullPath);
                  }
                }
              }
            }
          }
        }
      }
    } catch (error) {
      console.error(`解析入口内容失败: ${(error as Error).message}`);
    }
  }
  
  // 如果没有指定入口文件或解析失败，则使用默认的小程序入口文件
  if (entryFiles.length === 0) {
    // 小程序可能的入口文件
    const possibleEntryFiles = [
      'app.json',
      'app.js',
      'app.ts',
      'app.wxss',
      'sitemap.json',
      'project.config.json',
      'project.private.config.json'
    ];
    
    // 检查每个可能的入口文件
    for (const entryFileName of possibleEntryFiles) {
      const entryFilePath = path.join(projectRoot, entryFileName);
      
      if (fs.existsSync(entryFilePath) && graph.hasNode(entryFilePath)) {
        entryFiles.push(entryFilePath);
        console.log(`使用入口文件: ${entryFilePath}`);
        
        // 如果找到了app.json，解析它以获取页面列表
        if (entryFileName === 'app.json') {
          try {
            const appConfig = JSON.parse(fs.readFileSync(entryFilePath, 'utf-8'));
            
            if (appConfig.pages && Array.isArray(appConfig.pages)) {
              for (const page of appConfig.pages) {
                const extensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
                
                for (const ext of extensions) {
                  const pagePath = path.join(projectRoot, page + ext);
                  if (fs.existsSync(pagePath) && graph.hasNode(pagePath)) {
                    entryFiles.push(pagePath);
                  }
                }
              }
            }
            
            // 处理分包加载
            if (appConfig.subpackages || appConfig.subPackages) {
              const subpackages = appConfig.subpackages || appConfig.subPackages || [];
              
              for (const pkg of subpackages) {
                if (pkg.root && pkg.pages && Array.isArray(pkg.pages)) {
                  for (const page of pkg.pages) {
                    const pagePath = path.join(pkg.root, page);
                    const extensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
                    
                    for (const ext of extensions) {
                      const fullPath = path.join(projectRoot, pagePath + ext);
                      if (fs.existsSync(fullPath) && graph.hasNode(fullPath)) {
                        entryFiles.push(fullPath);
                      }
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`解析app.json失败: ${(error as Error).message}`);
          }
        }
      }
    }
  }
  
  // 如果依然没有找到入口文件，则报错
  if (entryFiles.length === 0) {
    throw new Error(`无法找到有效的入口文件。请使用--entry-file指定入口文件，或确保app.json存在。`);
  }
  
  console.log(`使用 ${entryFiles.length} 个入口文件进行依赖分析`);
  
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
  
  // 从每个入口文件开始搜索
  for (const entry of entryFiles) {
    if (graph.hasNode(entry)) {
      dfs(entry);
    }
  }
  
  // 从必要文件也开始搜索（但这些只是作为配置文件，不一定有出边）
  for (const essentialFile of allEssentialFiles) {
    if (graph.hasNode(essentialFile)) {
      visited.add(essentialFile); // 至少标记它们自己为已访问
      
      // 也考虑它们可能引用的文件
      for (const dep of graph.outEdges(essentialFile)) {
        dfs(dep);
      }
    }
  }
  
  // 额外传播检查：任何被已访问节点引用的节点也应该被标记
  let newMarked = true;
  while (newMarked) {
    newMarked = false;
    
    for (const node of graph.nodes()) {
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
  for (const node of graph.nodes()) {
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