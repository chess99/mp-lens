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
  options: AnalyzerOptions,
): Promise<AnalysisResult> {
  const {
    fileTypes,
    excludePatterns = [],
    verbose = false,
    essentialFiles = [],
    miniappRoot,
    entryFile,
    entryContent,
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
    entryContent,
  );

  return {
    dependencyGraph,
    unusedFiles,
  };
}

/**
 * 在指定目录中查找所有符合条件的文件
 */
function findAllFiles(rootDir: string, fileTypes: string[], excludePatterns: string[]): string[] {
  const globPattern = `**/*.{${fileTypes.join(',')}}`;

  // 默认排除的模式
  const defaultIgnorePatterns = [
    '**/node_modules/**',
    '**/miniprogram_npm/**',
    '**/output/dependency-graph.*',
    '**/output/unused-files.*',
    'dependency-graph.*',
    'unused-files.*',
    '**/dist/**',
  ];

  const globOptions: glob.IOptions = {
    cwd: rootDir,
    absolute: true,
    ignore: [...defaultIgnorePatterns, ...excludePatterns],
    nodir: true,
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
  essentialFilesUser: string[] = [], // Renamed for clarity
  entryFileUser?: string, // Renamed for clarity
  entryContent?: any, // Usually app.json content
): string[] {
  // 1. Resolve all potential entry points
  const entryPoints = resolveEntryPoints(graph, projectRoot, entryFileUser, entryContent);

  // 2. Resolve all essential files (always considered reachable)
  const essentialFiles = resolveEssentialFiles(projectRoot, essentialFilesUser);

  // 3. Perform reachability analysis (DFS)
  const reachableFiles = findReachableFiles(graph, entryPoints, essentialFiles);

  // 4. Determine unused files
  const allProjectFiles = graph.nodes();
  const unusedFiles = allProjectFiles.filter((file) => !reachableFiles.has(file));

  // Debugging output if needed
  // console.log('DEBUG - All Project Files:', allProjectFiles.length);
  // console.log('DEBUG - Entry Points:', entryPoints);
  // console.log('DEBUG - Essential Files:', essentialFiles);
  // console.log('DEBUG - Reachable Files:', reachableFiles.size);
  // console.log('DEBUG - Unused Files:', unusedFiles.length);

  return unusedFiles;
}

/**
 * Resolves the actual entry points for the analysis based on user input and defaults.
 */
function resolveEntryPoints(
  graph: DependencyGraph,
  projectRoot: string,
  entryFileUser?: string,
  entryContent?: any,
): string[] {
  const entryFiles: Set<string> = new Set();

  // Attempt 1: User-provided entry file
  if (entryFileUser) {
    const customEntryPath = path.resolve(projectRoot, entryFileUser); // Ensure absolute path
    if (fs.existsSync(customEntryPath) && graph.hasNode(customEntryPath)) {
      entryFiles.add(customEntryPath);
      console.log(`使用自定义入口文件: ${customEntryPath}`);
    } else {
      console.warn(`警告: 自定义入口文件不存在或未在图中找到: ${customEntryPath}`);
    }
  }

  // Attempt 2: User-provided entry content (e.g., app.json)
  // Only proceed if no valid custom entry file was found OR if we should always parse content
  // Current logic: Use content if custom file not found/valid
  if (entryFiles.size === 0 && entryContent) {
    console.log('尝试从提供的入口文件内容解析入口点...');
    parseEntryContent(entryContent, projectRoot, graph, entryFiles);
  }

  // Attempt 3: Default Mini Program entry points if still no entries found
  if (entryFiles.size === 0) {
    console.log('未找到有效的自定义入口或内容入口, 尝试使用默认入口文件...');
    findDefaultMiniprogramEntries(projectRoot, graph, entryFiles);
  }

  if (entryFiles.size === 0) {
    console.warn('警告: 未能确定任何有效的入口文件。分析可能不准确。');
  }

  return Array.from(entryFiles);
}

/**
 * Parses entry points from structured content (like app.json).
 */
function parseEntryContent(
  content: any,
  projectRoot: string,
  graph: DependencyGraph,
  entryFiles: Set<string>, // Modified in place
): void {
  try {
    // Helper to add a potential file if it exists and is in the graph
    const addIfExists = (filePath: string) => {
      // Normalize the path format
      filePath = filePath.replace(/\\/g, '/');

      // First try the exact path as given
      const absolutePath = path.resolve(projectRoot, filePath); // Ensure absolute
      if (fs.existsSync(absolutePath) && graph.hasNode(absolutePath)) {
        entryFiles.add(absolutePath);
        return true; // Indicate success
      }

      // Next try with extensions if the base path doesn't exist directly
      // This covers cases where filePath might be a "base path" without extension
      const extensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
      const hasExtension = path.extname(filePath) !== '';

      // Only try adding extensions if the path doesn't already have one
      if (!hasExtension) {
        for (const ext of extensions) {
          const pathWithExt = absolutePath + ext;
          if (fs.existsSync(pathWithExt) && graph.hasNode(pathWithExt)) {
            entryFiles.add(pathWithExt);
            return true; // Indicate success
          }
        }
      }

      // If we get here, we couldn't find the file either directly or with extensions
      return false; // Indicate failure
    };

    // Main pages
    if (content.pages && Array.isArray(content.pages)) {
      content.pages.forEach((page: string) => addIfExists(page));
    }

    // Subpackages (compatible with subPackages and subpackages)
    const subpackages = content.subpackages || content.subPackages || [];
    if (Array.isArray(subpackages)) {
      subpackages.forEach((pkg: any) => {
        if (pkg.root && pkg.pages && Array.isArray(pkg.pages)) {
          pkg.pages.forEach((page: string) => {
            const pagePath = path.join(pkg.root, page); // Path relative to root
            addIfExists(pagePath);
          });
          // Add subpackage root files like app.js/app.json if they exist
          addIfExists(path.join(pkg.root, 'app.js'));
          addIfExists(path.join(pkg.root, 'app.json'));
        }
      });
    }

    // Independent subpackages root files (less common, but possible)
    if (Array.isArray(subpackages)) {
      subpackages.forEach((pkg: any) => {
        if (pkg.root && pkg.independent && pkg.independent === true) {
          // Independent subpackages might have their own entry logic,
          // often starting with an 'app.js' or similar within their root.
          // We add the root itself or common files within it as potential starting points.
          addIfExists(pkg.root); // Add the root dir? Maybe less useful.
          addIfExists(path.join(pkg.root, 'app.js'));
          addIfExists(path.join(pkg.root, 'app.json')); // Check for JSON config too
        }
      });
    }

    // Handle tabBar list - images are also dependencies
    if (content.tabBar && content.tabBar.list && Array.isArray(content.tabBar.list)) {
      content.tabBar.list.forEach((item: any) => {
        if (item.pagePath) addIfExists(item.pagePath);
        if (item.iconPath) addIfExists(item.iconPath);
        if (item.selectedIconPath) addIfExists(item.selectedIconPath);
      });
    }

    // Handle usingComponents in app.json (global components)
    if (content.usingComponents && typeof content.usingComponents === 'object') {
      Object.entries(content.usingComponents).forEach(([componentName, componentPath]) => {
        if (typeof componentPath === 'string') {
          // First try the exact path as given
          let success = addIfExists(componentPath as string);

          // If we couldn't add it directly, try to normalize the path further
          if (!success) {
            const pathStr = componentPath as string;
            // Remove leading slash if present for consistency when resolving
            const normalizedPath = pathStr.startsWith('/') ? pathStr.substring(1) : pathStr;

            // Try adding the normalized path
            success = addIfExists(normalizedPath);

            // If still unsuccessful, try with various extensions
            if (!success) {
              // Sometimes component paths in JSON don't include extensions
              // Try common component extensions
              const extensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];

              // Try with the original path
              for (const ext of extensions) {
                if (addIfExists(`${pathStr}${ext}`)) {
                  console.log(`成功添加组件依赖(原始路径): ${pathStr}${ext}`);
                  success = true;
                  break;
                }
              }

              // Try with the normalized path if still not successful
              if (!success) {
                for (const ext of extensions) {
                  if (addIfExists(`${normalizedPath}${ext}`)) {
                    console.log(`成功添加组件依赖(标准化路径): ${normalizedPath}${ext}`);
                    break;
                  }
                }
              }
            }
          }
        }
      });
    }
  } catch (error) {
    console.error(`解析入口内容失败: ${(error as Error).message}`);
  }
}

/**
 * Finds default Mini Program entry points like app.js, app.json.
 */
function findDefaultMiniprogramEntries(
  projectRoot: string,
  graph: DependencyGraph,
  entryFiles: Set<string>, // Modified in place
): void {
  const possibleEntryFiles = [
    'app.js',
    'app.ts',
    'app.json', // app.json is crucial as it defines pages
    'app.wxss',
    // project.config.json is essential but not a typical code entry point
    // sitemap.json is also config, not usually a code entry point
  ];

  for (const entryFileName of possibleEntryFiles) {
    const entryFilePath = path.resolve(projectRoot, entryFileName); // Use resolve for consistency
    if (fs.existsSync(entryFilePath) && graph.hasNode(entryFilePath)) {
      entryFiles.add(entryFilePath);
      console.log(`找到并使用默认入口文件: ${entryFilePath}`);
    }
  }
}

/**
 * Resolves essential files that are always considered reachable.
 */
function resolveEssentialFiles(projectRoot: string, essentialFilesUser: string[]): Set<string> {
  const defaultEssentialFiles = [
    // Configuration files are essential even if not directly imported
    'app.json', // Often implicitly needed
    'project.config.json',
    'project.private.config.json',
    'sitemap.json',
    'theme.json', // For theme switching
    'ext.json', // For plugin extensions
    // Build/env related configs
    'tsconfig.json',
    'mp-analyzer.config.json',
    'package.json',
    '.eslintrc.js',
    '.eslintrc.json',
    '.prettierrc',
    '.prettierrc.js',
    '.babelrc',
    'babel.config.js',
    // Common utility/base files (can be debated if truly "essential" without reachability)
    // 'app.js', 'app.ts', // Let reachability handle these normally from entry points
    // 'app.wxss',
  ];

  const essentialFiles = new Set<string>();

  // Add defaults, ensuring they are absolute paths
  defaultEssentialFiles.forEach((file) => {
    const absPath = path.resolve(projectRoot, file);
    // Check existence? Maybe not strictly necessary, they are just *potential* essentials.
    // If they don't exist, they simply won't be in the graph later.
    essentialFiles.add(absPath);
  });

  // Add user-defined essential files, ensuring they are absolute paths
  essentialFilesUser.forEach((file) => {
    const absPath = path.resolve(projectRoot, file); // Resolve relative to project root
    essentialFiles.add(absPath);
  });

  return essentialFiles;
}

/**
 * Performs a Depth-First Search (DFS) or Breadth-First Search (BFS)
 * starting from entry points to find all reachable files.
 */
function findReachableFiles(
  graph: DependencyGraph,
  entryPoints: string[],
  essentialFiles: Set<string>,
): Set<string> {
  const reachable = new Set<string>();
  const queue: string[] = []; // Use BFS for potentially shallower stack depth

  // Add essential files first - they are always reachable
  // Filter essential files to only those actually present in the graph
  essentialFiles.forEach((file) => {
    if (graph.hasNode(file)) {
      if (!reachable.has(file)) {
        reachable.add(file);
        queue.push(file); // Add graph-existing essentials to the traversal start
      }
    }
  });

  // Add entry points to the queue
  entryPoints.forEach((entry) => {
    if (graph.hasNode(entry) && !reachable.has(entry)) {
      reachable.add(entry);
      queue.push(entry);
    }
  });

  // Perform BFS
  while (queue.length > 0) {
    const node = queue.shift()!; // Non-null assertion ok due to length check

    const neighbors = graph.outEdges(node);
    for (const neighbor of neighbors) {
      if (graph.hasNode(neighbor) && !reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  /*// Original DFS implementation (can cause stack overflow on deep graphs)
    function dfs(node: string) {
        reachable.add(node);
        const neighbors = graph.outEdges(node);
        for (const neighbor of neighbors) {
            // Check if neighbor exists in the graph and hasn't been visited
            if (graph.hasNode(neighbor) && !reachable.has(neighbor)) {
                dfs(neighbor);
            }
        }
    }

    // Start DFS from each entry point and essential file found in the graph
    entryPoints.forEach(entry => {
        if (graph.hasNode(entry) && !reachable.has(entry)) {
            dfs(entry);
        }
    });
     essentialFiles.forEach(essential => {
        if (graph.hasNode(essential) && !reachable.has(essential)) {
            dfs(essential); // Ensure essential files are starting points too
        }
    });
    */

  return reachable;
}
