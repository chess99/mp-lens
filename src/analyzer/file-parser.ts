import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { AliasResolver } from '../utils/alias-resolver';

/**
 * 文件解析器：负责解析不同类型的文件，提取其中的依赖关系
 */
export class FileParser {
  private projectRoot: string;
  private aliasResolver: AliasResolver | null = null;
  private hasAliasConfig: boolean = false;
  private options: AnalyzerOptions;

  constructor(projectRoot: string, options: AnalyzerOptions = { fileTypes: [] }) {
    this.projectRoot = projectRoot;
    this.options = options;

    // 如果提供了miniappRoot，则使用它；否则使用projectRoot
    // 注意，miniappRoot应该已经是绝对路径了，不需要再处理
    const actualRoot = options.miniappRoot || projectRoot;

    if (options.miniappRoot && options.verbose) {
      console.log(`DEBUG - FileParser using custom miniapp root: ${options.miniappRoot}`);
    }

    // 总是初始化别名解析器，检查是否有有效的别名配置
    this.aliasResolver = new AliasResolver(actualRoot);

    // 注意：为了测试，确保初始化方法被显式调用
    this.hasAliasConfig = this.aliasResolver.initialize();

    if (this.hasAliasConfig && this.options.verbose) {
      console.log('DEBUG - 检测到别名配置，自动启用别名解析');
      console.log('DEBUG - 别名配置:', JSON.stringify(this.aliasResolver.getAliases(), null, 2));
    }
  }

  /**
   * 解析单个文件，返回它依赖的文件列表
   */
  async parseFile(filePath: string): Promise<string[]> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.js':
      case '.ts':
        return this.parseJavaScript(filePath);
      case '.wxml':
        return this.parseWXML(filePath);
      case '.wxss':
        return this.parseWXSS(filePath);
      case '.json':
        return this.parseJSON(filePath);
      case '.wxs':
        return this.parseWXS(filePath);
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
      case '.svg':
        // 图片文件不会主动依赖其他文件
        return [];
      default:
        return [];
    }
  }

  /**
   * 解析 JavaScript/TypeScript 文件中的依赖
   */
  private async parseJavaScript(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>(); // Use a Set directly

      // Pass the Set to helper functions
      this.processImportStatements(content, filePath, dependencies);
      this.processRequireStatements(content, filePath, dependencies);
      this.processAliasImportComments(content, filePath, dependencies); // Keep for tests if needed
      this.processPageOrComponentStrings(content, filePath, dependencies);

      return Array.from(dependencies); // Return array from Set
    } catch (e) {
      if (this.options.verbose) {
        console.warn(`Error parsing JavaScript file ${filePath}: ${e}`);
      }
      return [];
    }
  }

  /**
   * 处理 import 语句
   */
  private processImportStatements(
    content: string,
    filePath: string,
    dependencies: Set<string>,
  ): void {
    // Combined Regex: Handles
    // 1. import defaultExport from '...';
    // 2. import { namedExport } from '...';
    // 3. import * as namespace from '...';
    // 4. import '...'; (Side effect import)
    // It captures the path in group 1.
    const importRegex =
      /import(?:(?:(?:\s+[\w*{}\s,]+|\s*\*\s*as\s+\w+)\s+from)?\s*)['\"]([^\'\"]+)['\"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        const importPath = match[1];
        // Basic heuristic to potentially ignore type imports (not foolproof)
        if (content.substring(match.index - 5, match.index).includes(' type')) continue;

        const depPath = this.resolveAnyPath(importPath, filePath);
        if (depPath) {
          // if (this.options.verbose) console.log(`DEBUG processImportStatements: Adding ${depPath} from ${filePath}`);
          dependencies.add(depPath);
        }
      }
    }
  }

  /**
   * 处理 require 语句
   */
  private processRequireStatements(
    content: string,
    filePath: string,
    dependencies: Set<string>,
  ): void {
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolveAnyPath(match[1], filePath);
        if (depPath) dependencies.add(depPath);
      }
    }
  }

  /**
   * 处理特殊的@alias-import注释 (仅用于测试别名解析)
   */
  private processAliasImportComments(
    content: string,
    filePath: string,
    dependencies: Set<string>,
  ): void {
    const aliasImportCommentRegex = /\/\/\s*@alias-import[^'"]*from\s+['"]([^'"]+)['"]/g;

    let match;
    while ((match = aliasImportCommentRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolveAnyPath(match[1], filePath);
        if (depPath) dependencies.add(depPath);
      }
    }
  }

  /**
   * Handles string literals that look like 'pages/...' or 'components/...'
   * Resolves them and finds related files (.wxml, .json, etc.)
   */
  private processPageOrComponentStrings(
    content: string,
    filePath: string,
    dependencies: Set<string>,
  ): void {
    // Updated regex to match 'pages/path' or 'components/path' in more contexts
    // Now matches quotes, variable assignments, and path strings without quotes
    const pathRegex = /['"]?((?:pages|components)\/[^'"\s,;)]+)['"]?/g;
    const exts = ['.js', '.ts', '.wxml', '.wxss', '.json'];

    let match;
    while ((match = pathRegex.exec(content)) !== null) {
      const pathString = match[1]; // e.g., pages/logs/logs
      // Treat as root-relative
      const rootRelativePath = '/' + pathString;

      if (this.options.verbose) {
        console.log(
          `DEBUG - Found page/component path string: ${pathString}, treating as ${rootRelativePath}`,
        );
      }

      const resolvedPath = this.resolveAnyPath(rootRelativePath, filePath);

      if (resolvedPath) {
        // Add the initially resolved path (e.g., .../logs.js)
        dependencies.add(resolvedPath);

        // Find and add related files
        const baseName = resolvedPath.replace(/\.[^.]+$/, '');
        for (const ext of exts) {
          const relatedPath = baseName + ext;
          if (fs.existsSync(relatedPath)) {
            dependencies.add(relatedPath); // Add to Set automatically handles duplicates
          }
        }
      } else {
        if (this.options.verbose) {
          console.log(
            `DEBUG - processPageOrComponentStrings: resolveAnyPath returned null for ${rootRelativePath}`,
          );
        }
      }
    }
  }

  /**
   * 解析 WXML 文件中的依赖
   */
  private async parseWXML(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>(); // Use a Set directly

      // Pass the Set to helper functions
      this.processImportIncludeTags(content, filePath, dependencies);
      this.processWxsTags(content, filePath, dependencies);
      this.processImageSources(content, filePath, dependencies);
      this.processCustomComponents(filePath, dependencies); // Needs checking if it uses the Set correctly

      return Array.from(dependencies); // Return array from Set
    } catch (e) {
      if (this.options.verbose) {
        console.warn(`Error parsing WXML file ${filePath}: ${e}`);
      }
      return [];
    }
  }

  /**
   * 处理<import>和<include>标签
   */
  private processImportIncludeTags(
    content: string,
    filePath: string,
    dependencies: Set<string>,
  ): void {
    const importRegex = /<(?:import|include)\s+src=['"](.*?)['"]\s*\/?\s*>/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        // 对于以 / 开头的路径，需要特殊处理
        const importPath = match[1];

        // 如果以 / 开头，这是相对于项目根目录的路径
        if (importPath.startsWith('/')) {
          const absolutePath = path.join(this.projectRoot, importPath.slice(1));

          // 尝试解析不同后缀名，因为 WXML import 可能不带后缀
          const possibleExtensions = ['.wxml', '']; // Check .wxml first, then original
          let resolvedPath: string | null = null;
          for (const ext of possibleExtensions) {
            const testPath = absolutePath + ext;
            if (fs.existsSync(testPath) && fs.statSync(testPath).isFile()) {
              resolvedPath = testPath;
              break;
            }
          }

          if (resolvedPath) {
            dependencies.add(resolvedPath);
          } else if (this.options.verbose) {
            console.log(
              `DEBUG - processImportIncludeTags: Could not resolve root path ${importPath} from ${filePath}`,
            );
          }
        } else {
          // 处理相对路径
          const depPath = this.resolveAnyPath(importPath, filePath);
          if (depPath) dependencies.add(depPath);
        }
      }
    }
  }

  /**
   * 处理wxs模块标签
   */
  private processWxsTags(content: string, filePath: string, dependencies: Set<string>): void {
    const wxsRegex = /<wxs\s+(?:[^>]*?\s+)?src=['"](.*?)['"]/g;

    let match;
    while ((match = wxsRegex.exec(content)) !== null) {
      if (match[1]) {
        // 对于以 / 开头的路径，需要特殊处理
        const wxsPath = match[1];

        // 如果以 / 开头，这是相对于项目根目录的路径
        if (wxsPath.startsWith('/')) {
          const absolutePath = path.join(this.projectRoot, wxsPath.slice(1));
          if (fs.existsSync(absolutePath)) {
            dependencies.add(absolutePath);
            continue;
          }
        } else {
          const depPath = this.resolveAnyPath(wxsPath, filePath);
          if (depPath) dependencies.add(depPath);
        }
      }
    }
  }

  /**
   * 处理图片源路径
   */
  private processImageSources(content: string, filePath: string, dependencies: Set<string>): void {
    // Match src attributes in <image> tags
    const IMAGE_SRC_REGEX = /<image.*?src=["'](.*?)["']/g;
    const matches = [...content.matchAll(IMAGE_SRC_REGEX)];

    matches.forEach((match) => {
      const src = match[1];
      // Skip empty, data URIs, external URLs, or dynamic template strings
      if (!src || /{{.*?}}/.test(src) || /^data:/.test(src) || /^(http|https):/.test(src)) {
        return;
      }
      // Resolve the path using resolveAnyPath
      const resolvedPath = this.resolveAnyPath(src, filePath);
      if (resolvedPath) {
        // console.log(`DEBUG processImageSources: Adding ${resolvedPath}`);
        dependencies.add(resolvedPath);
      } else {
        // console.log(`DEBUG processImageSources: Could not resolve ${src}`);
      }
    });
  }

  /**
   * 处理自定义组件依赖
   */
  private processCustomComponents(filePath: string, dependencies: Set<string>): void {
    // 解析自定义组件（需要读取同名.json文件来获取组件路径）
    const jsonPath = filePath.replace(/\.wxml$/, '.json');
    // 明确检查 JSON 文件是否存在
    const jsonExists = fs.existsSync(jsonPath);

    // Log before checking jsonExists
    // console.log(`DEBUG processCustomComponents: Checking existence for ${jsonPath}`);
    if (jsonExists) {
      try {
        // 读取 JSON 文件内容
        const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

        // 如果是组件配置文件且包含usingComponents
        if (jsonContent.usingComponents) {
          // 遍历所有使用的组件
          for (const [componentName, componentPath] of Object.entries(
            jsonContent.usingComponents,
          )) {
            if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
              // 排除插件路径 (plugin://)
              // 使用统一的路径解析函数
              // 1. Resolve the component path given in usingComponents (might resolve to index file, dir, etc.)
              const resolvedComponentPath = this.resolveAnyPath(componentPath as string, filePath);

              if (resolvedComponentPath) {
                // 2. Determine the base name for checking related files
                //    (remove /index.ext or just .ext)
                const componentBase = resolvedComponentPath.replace(/(\/index)?\.\w+$/, '');

                // 3. Check for related component files based on the derived base name
                const exts = ['.js', '.ts', '.wxml', '.wxss', '.json'];
                for (const ext of exts) {
                  const fullPath = componentBase + ext;
                  if (fs.existsSync(fullPath)) {
                    // Only add if it hasn't been added already (e.g., if resolvedComponentPath was one of these)
                    if (!dependencies.has(fullPath)) {
                      dependencies.add(fullPath);
                    }
                  }
                }
                // Ensure the originally resolved path is also included if it wasn't caught by the extension loop
                // (e.g., if resolveAnyPath resolved to a directory path represented in the graph)
                if (
                  fs.existsSync(resolvedComponentPath) &&
                  !dependencies.has(resolvedComponentPath)
                ) {
                  // Check if it's a file before adding? Or assume if resolveAnyPath returned it, it's relevant?
                  // Let's add it cautiously. If resolveAnyPath resolved to a dir, adding it might be wrong.
                  // For now, rely on the extension check loop above.
                }
              }
            }
          }
        }
      } catch (e) {
        // 如果JSON解析失败，忽略错误
        if (this.options.verbose) {
          console.warn(`Error parsing JSON file ${jsonPath}: ${e}`);
        }
      }
    }
  }

  /**
   * 解析 WXSS 文件中的依赖
   */
  private async parseWXSS(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies: string[] = [];

      // 匹配@import语句
      const importRegex = /@import\s+['"]([^'"]+)['"]/g;

      // 匹配url()中的路径
      const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;

      let match;

      // 处理@import语句
      while ((match = importRegex.exec(content)) !== null) {
        if (match[1]) {
          const importPath = match[1];

          // 尝试别名解析
          const isAliasPath =
            importPath.startsWith('@') ||
            importPath.startsWith('$') ||
            importPath.startsWith('~') ||
            (/^[a-zA-Z]/.test(importPath) &&
              !importPath.startsWith('./') &&
              !importPath.startsWith('../') &&
              !importPath.startsWith('/'));

          if (this.hasAliasConfig && this.aliasResolver && isAliasPath) {
            const aliasPath = this.aliasResolver.resolve(importPath, filePath);
            if (aliasPath) {
              dependencies.push(aliasPath);
              continue;
            }
          } else if (importPath.startsWith('/')) {
            // 对于以 / 开头的路径，直接拼接项目根目录
            const absolutePath = path.join(this.projectRoot, importPath.slice(1));
            if (fs.existsSync(absolutePath)) {
              dependencies.push(absolutePath);
              continue;
            }
          } else {
            // 普通相对路径
            const depPath = this.resolveAnyPath(importPath, filePath);
            if (depPath) dependencies.push(depPath);
          }
        }
      }

      // 处理url()中的路径
      while ((match = urlRegex.exec(content)) !== null) {
        if (match[1]) {
          const urlPath = match[1];

          // 忽略数据URI和外部URL
          if (urlPath.startsWith('data:') || urlPath.match(/^https?:\/\//)) {
            continue;
          }

          // 检查 url 路径
          if (this.options.verbose) {
            console.log(`DEBUG - Processing url path: ${urlPath}`);
          }

          // 尝试别名解析
          const isAliasPath = this.isAliasPath(urlPath);

          if (this.aliasResolver && isAliasPath) {
            const aliasPath = this.aliasResolver.resolve(urlPath, filePath);
            if (aliasPath) {
              dependencies.push(aliasPath);
              continue;
            }
          } else if (urlPath.startsWith('/')) {
            // 对于以 / 开头的路径，直接拼接项目根目录
            const absolutePath = path.join(this.projectRoot, urlPath.slice(1));
            if (fs.existsSync(absolutePath)) {
              dependencies.push(absolutePath);
              continue;
            }
          } else {
            // 对于相对路径特殊处理
            const fileDir = path.dirname(filePath);
            let targetPath;

            // 处理 "../path" 形式的路径
            if (urlPath.startsWith('../')) {
              targetPath = path.resolve(fileDir, urlPath);
            } else {
              // 普通相对路径
              targetPath = path.join(fileDir, urlPath);
            }

            if (fs.existsSync(targetPath)) {
              dependencies.push(targetPath);
              continue;
            }

            // 如果直接路径不存在，尝试常规解析
            const depPath = this.resolvePath(filePath, urlPath);
            if (depPath) dependencies.push(depPath);
          }
        }
      }

      return [...new Set(dependencies)]; // 去除重复项
    } catch (e) {
      if (this.options.verbose) {
        console.warn(`Error parsing WXSS file ${filePath}: ${e}`);
      }
      return [];
    }
  }

  /**
   * 解析 JSON 文件中的依赖
   */
  private async parseJSON(filePath: string): Promise<string[]> {
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const dependencies: string[] = [];

      // 处理 app.json 中的 pages 和 subpackages
      if (content.pages && Array.isArray(content.pages)) {
        for (const page of content.pages) {
          if (typeof page === 'string') {
            // 解析页面路径，可能带有或不带有扩展名
            const basePath = path.join(this.projectRoot, page);
            const exts = ['.js', '.ts', '.wxml', '.wxss', '.json'];

            for (const ext of exts) {
              const fullPath = basePath + ext;
              if (fs.existsSync(fullPath)) {
                dependencies.push(fullPath);
              }
            }
          }
        }
      }

      // 处理子包配置 - 支持两种可能的字段名：subpackages 或 subPackages
      const subpackages = content.subpackages || content.subPackages;
      if (subpackages && Array.isArray(subpackages)) {
        for (const subpackage of subpackages) {
          const root = subpackage.root;
          const pages = subpackage.pages;

          if (typeof root === 'string' && Array.isArray(pages)) {
            for (const page of pages) {
              if (typeof page === 'string') {
                // 解析子包中的页面路径
                const basePath = path.join(this.projectRoot, root, page);
                const exts = ['.js', '.ts', '.wxml', '.wxss', '.json'];

                for (const ext of exts) {
                  const fullPath = basePath + ext;
                  if (fs.existsSync(fullPath)) {
                    dependencies.push(fullPath);
                  }
                }
              }
            }
          }
        }
      }

      // 处理组件配置中的 usingComponents
      if (content.usingComponents && typeof content.usingComponents === 'object') {
        for (const [componentName, componentPath] of Object.entries(content.usingComponents)) {
          if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
            // 排除插件路径 (plugin://)

            // 使用统一的路径解析函数
            // 1. Resolve the component path given in usingComponents (might resolve to index file, dir, etc.)
            const resolvedComponentPath = this.resolveAnyPath(componentPath as string, filePath);

            if (resolvedComponentPath) {
              // 2. Determine the base name for checking related files
              //    (remove /index.ext or just .ext)
              const componentBase = resolvedComponentPath.replace(/(\/index)?\.\w+$/, '');

              // 3. Check for related component files based on the derived base name
              const exts = ['.js', '.ts', '.wxml', '.wxss', '.json'];
              for (const ext of exts) {
                const fullPath = componentBase + ext;
                if (fs.existsSync(fullPath)) {
                  // Only add if it hasn't been added already (e.g., if resolvedComponentPath was one of these)
                  if (!dependencies.includes(fullPath)) {
                    dependencies.push(fullPath);
                  }
                }
              }
              // Ensure the originally resolved path is also included if it wasn't caught by the extension loop
              // (e.g., if resolveAnyPath resolved to a directory path represented in the graph)
              if (
                fs.existsSync(resolvedComponentPath) &&
                !dependencies.includes(resolvedComponentPath)
              ) {
                // Check if it's a file before adding? Or assume if resolveAnyPath returned it, it's relevant?
                // Let's add it cautiously. If resolveAnyPath resolved to a dir, adding it might be wrong.
                // For now, rely on the extension check loop above.
              }
            }
          }
        }
      }

      return [...new Set(dependencies)]; // 去除重复项
    } catch (e) {
      if (this.options.verbose) {
        console.warn(`Error parsing JSON file ${filePath}: ${e}`);
      }
      return [];
    }
  }

  /**
   * 解析 WXS 文件中的依赖
   */
  private async parseWXS(filePath: string): Promise<string[]> {
    // WXS模块依赖分析与JS类似
    return this.parseJavaScript(filePath);
  }

  /**
   * 判断是否是别名路径
   */
  private isAliasPath(importPath: string): boolean {
    return (
      importPath.startsWith('@') ||
      importPath.startsWith('$') ||
      importPath.startsWith('~') ||
      (/^[a-zA-Z]/.test(importPath) &&
        !importPath.startsWith('./') &&
        !importPath.startsWith('../') &&
        !importPath.startsWith('/'))
    );
  }

  /**
   * 统一路径解析：处理别名、绝对路径和相对路径
   * @param importPath 需要解析的导入路径
   * @param sourcePath 源文件路径（解析相对路径的基准）
   * @returns 解析后的绝对路径，如果无法解析则返回null
   */
  private resolveAnyPath(importPath: string, sourcePath: string): string | null {
    if (this.options.verbose) {
      console.log(`DEBUG - Resolving any path '${importPath}' from '${sourcePath}'`);
    }

    // 1. Handle alias
    const isAliasPath = this.isAliasPath(importPath);
    if (isAliasPath && this.aliasResolver) {
      const aliasPath = this.aliasResolver.resolve(importPath, sourcePath);
      if (aliasPath) {
        if (fs.existsSync(aliasPath)) {
          if (this.options.verbose) {
            console.log(`DEBUG - Successfully resolved alias to existing file: ${aliasPath}`);
          }
          return aliasPath;
        } else {
          if (this.options.verbose) {
            console.log(
              `DEBUG - Resolved alias path ${aliasPath} does not exist directly, attempting further resolution...`,
            );
          }
          return this.resolvePath(sourcePath, aliasPath);
        }
      }
      if (this.options.verbose) {
        console.log(`DEBUG - Alias resolution failed for ${importPath}`);
      }
    }

    // 2. Handle root-relative paths (explicitly start with '/')
    if (importPath.startsWith('/')) {
      // Path starting with '/' is relative to the project root.
      // Use resolvePath with projectRootOverride
      const resolvedRootPath = this.resolvePath(sourcePath, importPath, this.projectRoot);
      if (resolvedRootPath) {
        return resolvedRootPath;
      } else {
        return null;
      }
    }

    // 3. Handle relative paths (explicitly start with './' or '../')
    if (importPath.startsWith('.')) {
      const resolvedRelative = this.resolvePath(sourcePath, importPath);
      return resolvedRelative;
    }

    // 4. Handle implicit project root paths (e.g., 'components/button' in usingComponents)
    //    These don't start with '/', './', or '../', and are not aliases.
    //    Assume they are relative to the project root.
    const implicitRootPath = '/' + importPath; // Treat as root-relative
    const resolvedImplicitRoot = this.resolvePath(sourcePath, implicitRootPath, this.projectRoot);
    if (this.options.verbose) {
      console.log(
        `DEBUG - Treating '${importPath}' as implicit root path -> '${implicitRootPath}', Resolved: ${resolvedImplicitRoot}`,
      );
    }
    return resolvedImplicitRoot; // Return result (or null)
  }

  /**
   * Resolves a relative path against a source file path, checking for various extensions and index files.
   * @param sourcePath The absolute path of the source file containing the import.
   * @param relativePath The relative path string to resolve.
   * @param projectRootOverride Optional override for the project root, used for resolving absolute paths starting with '/'.
   * @returns The absolute path of the resolved dependency, or null if not found.
   */
  private resolvePath(
    sourcePath: string,
    relativePath: string,
    projectRootOverride?: string,
  ): string | null {
    const sourceDir = path.dirname(sourcePath);

    // --- Determine the base path for resolution ---
    let effectiveBasePath: string;

    if (relativePath.startsWith('/') && projectRootOverride) {
      // Path starts with '/' and we have a project root context.
      // Could be project-relative ('/pages/...') or an absolute system path containing the root.
      if (path.isAbsolute(relativePath) && relativePath.startsWith(projectRootOverride)) {
        // It's an absolute system path that already includes the project root override.
        // Use it directly to avoid doubling the root.
        effectiveBasePath = relativePath;
        if (this.options.verbose)
          console.log(
            `  DEBUG: Absolute path '${relativePath}' contains project root override '${projectRootOverride}', using directly.`,
          );
      } else {
        // It's a project-root-relative path like '/pages/...' (or potentially absolute but *not* containing the override)
        effectiveBasePath = path.resolve(projectRootOverride, relativePath.substring(1));
        if (this.options.verbose)
          console.log(
            `  DEBUG: Root-relative path '${relativePath}', resolving from override '${projectRootOverride}'. Base: ${effectiveBasePath}`,
          );
      }
    } else {
      // Standard relative path (./ ../) or potentially an absolute system path without override context.
      // path.resolve handles both cases correctly relative to sourceDir.
      effectiveBasePath = path.resolve(sourceDir, relativePath);
      if (this.options.verbose)
        console.log(
          `  DEBUG: Standard relative/absolute path '${relativePath}', resolving from source dir '${sourceDir}'. Base: ${effectiveBasePath}`,
        );
    }

    // console.log(`\n--- Resolving Path ---`);
    // console.log(`  Source: ${sourcePath}`);
    // console.log(`  Relative: ${relativePath}`);
    // console.log(`  Base Path Input: ${basePath}`); // Log the base path calculated

    // If the path doesn't have an extension, try adding common ones.
    const possibleExts =
      path.extname(effectiveBasePath) === ''
        ? ['.js', '.ts', '.wxml', '.wxss', '.json', '.wxs']
        : [path.extname(effectiveBasePath)];

    // 1. Check direct path existence (as file)
    try {
      const existsDirect = fs.existsSync(effectiveBasePath);
      const isFileDirect = existsDirect && fs.statSync(effectiveBasePath).isFile();
      if (this.options.verbose)
        console.log(
          `  1. Direct Check: Exists=${existsDirect}, IsFile=${isFileDirect} -> ${effectiveBasePath}`,
        );
      if (isFileDirect) {
        if (this.options.verbose)
          console.log(`DEBUG - resolvePath: Found direct file: ${effectiveBasePath}`);
        return effectiveBasePath;
      }
    } catch (e) {
      /* ignore */
    }

    // 2. Check with extensions appended (as file)
    if (this.options.verbose) console.log(`  2. Extension Check:`);
    for (const ext of possibleExts) {
      const pathWithExt = effectiveBasePath + ext;
      try {
        const existsExt = fs.existsSync(pathWithExt);
        const isFileExt = existsExt && fs.statSync(pathWithExt).isFile();
        if (this.options.verbose)
          console.log(
            `     - Try ${ext}: Exists=${existsExt}, IsFile=${isFileExt} -> ${pathWithExt}`,
          );
        if (isFileExt) {
          if (this.options.verbose)
            console.log(`DEBUG - resolvePath: Found with extension: ${pathWithExt}`);
          return pathWithExt;
        }
      } catch (e) {
        /* ignore */
      }
    }

    // 3. Check if it's a directory, then look for an index file.
    try {
      if (fs.statSync(effectiveBasePath).isDirectory()) {
        // console.log(`  3. Directory Check: IsDirectory=true -> ${effectiveBasePath}`);
        for (const indexExt of possibleExts) {
          const indexFile = path.join(effectiveBasePath, `index${indexExt}`);
          if (fs.existsSync(indexFile) && fs.statSync(indexFile).isFile()) {
            // console.log(`     - Found index${indexExt}: ${indexFile}`);
            // console.log(`DEBUG - resolvePath: Found directory index: ${indexFile}`);
            // console.log(`--- End Resolving Path ---\n`);
            return indexFile;
          } else {
            // console.log(`     - Try index${indexExt}: Not found or not file.`);
          }
        }
      } else {
        // console.log(`  3. Directory Check: IsDirectory=false -> ${effectiveBasePath}`);
      }
    } catch (e) {
      // Ignore errors (e.g., path doesn't exist)
      // console.log(`  3. Directory Check: Error checking directory -> ${effectiveBasePath}`);
    }

    // console.log(`=> Path Not Resolved.`);
    // console.log(`--- End Resolving Path ---\n`);
    return null; // Not found
  }
}
