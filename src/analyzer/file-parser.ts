import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { AliasResolver } from '../utils/alias-resolver';
import { logger } from '../utils/debug-logger';

/**
 * 文件解析器：负责解析不同类型的文件，提取其中的依赖关系
 */
export class FileParser {
  private projectRoot: string;
  private aliasResolver: AliasResolver | null = null;
  private hasAliasConfig = false;
  private options: AnalyzerOptions;

  constructor(projectRoot: string, options: AnalyzerOptions = { fileTypes: [] }) {
    this.projectRoot = projectRoot;
    this.options = options;

    // 如果提供了miniappRoot，则使用它；否则使用projectRoot
    // 注意，miniappRoot应该已经是绝对路径了，不需要再处理
    const actualRoot = options.miniappRoot || projectRoot;

    if (options.miniappRoot) {
      logger.debug(`FileParser using custom miniapp root: ${options.miniappRoot}`);
    }

    // 总是初始化别名解析器，检查是否有有效的别名配置
    this.aliasResolver = new AliasResolver(actualRoot);

    // 注意：为了测试，确保初始化方法被显式调用
    this.hasAliasConfig = this.aliasResolver.initialize();

    if (this.hasAliasConfig) {
      logger.debug('Alias configuration detected, automatically enabling alias resolution');
      logger.debug('Alias configuration:', this.aliasResolver.getAliases());
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
      const dependencies = new Set<string>();
      const allowedExtensions = ['.js', '.ts', '.json']; // JS can import JS, TS, JSON

      this.processImportStatements(content, filePath, allowedExtensions, dependencies);
      this.processRequireStatements(content, filePath, allowedExtensions, dependencies);
      // FIXME: 为什么需要处理这个? -- Commenting out as likely unnecessary
      // this.processAliasImportComments(content, filePath, dependencies);
      // FIXME: 小程序里不支持这种形式的引用吧? -- Commenting out require.context style imports
      // this.processRequireContext(content, filePath, dependencies);
      // FIXME: 这是在干嘛? -- Removing, as string literal parsing for JS seems unreliable
      // this.processPageOrComponentStrings(content, filePath, dependencies);

      return Array.from(dependencies);
    } catch (e) {
      logger.warn(`Error parsing JavaScript file ${filePath}: ${e}`);
      return [];
    }
  }

  /**
   * 处理 import 语句
   */
  private processImportStatements(
    content: string,
    filePath: string,
    allowedExtensions: string[],
    dependencies: Set<string>,
  ): void {
    // Combined Regex: Handles
    // 1. import defaultExport from '...';
    // 2. import { namedExport } from '...';
    // 3. import * as namespace from '...';
    // 4. import '...'; (Side effect import)
    // It captures the path in group 1.
    const importRegex =
      /import(?:(?:(?:\s+[\w*{}\s,]+|\s*\*\s*as\s+\w+)\s+from)?\s*)['"]([^'"]+)['"]/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        const importPath = match[1];
        // FIXME: 这是在干嘛? Basic heuristic to potentially ignore type imports (not foolproof)
        // Keeping this heuristic for now, but it's not perfect.
        if (content.substring(match.index - 5, match.index).includes(' type')) {
          logger.trace(`Skipping potential type import: '${importPath}' in ${filePath}`);
          continue;
        }

        const depPath = this.resolveAnyPath(importPath, filePath, allowedExtensions);
        if (depPath) {
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
    allowedExtensions: string[],
    dependencies: Set<string>,
  ): void {
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    let match;
    while ((match = requireRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolveAnyPath(match[1], filePath, allowedExtensions);
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
        const depPath = this.resolveAnyPath(match[1], filePath, [
          '.js',
          '.ts',
          '.wxml',
          '.wxss',
          '.json',
        ]);
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

    let match;
    while ((match = pathRegex.exec(content)) !== null) {
      const pathString = match[1]; // e.g., pages/logs/logs
      // Treat as root-relative
      const rootRelativePath = '/' + pathString;

      logger.trace(
        `Found page/component path string: ${pathString}, treating as ${rootRelativePath}`,
      );

      const resolvedPath = this.resolveAnyPath(rootRelativePath, filePath, [
        '.js',
        '.ts',
        '.wxml',
        '.wxss',
        '.json',
      ]);

      if (resolvedPath) {
        // Add the initially resolved path (e.g., .../logs.js)
        dependencies.add(resolvedPath);

        // Find and add related files
        const baseName = resolvedPath.replace(/\.[^.]+$/, '');
        for (const ext of ['.js', '.ts', '.wxml', '.wxss', '.json']) {
          const relatedPath = baseName + ext;
          if (fs.existsSync(relatedPath)) {
            dependencies.add(relatedPath); // Add to Set automatically handles duplicates
          }
        }
      } else {
        logger.trace(
          `processPageOrComponentStrings: resolveAnyPath returned null for ${rootRelativePath}`,
        );
      }
    }
  }

  /**
   * 解析 WXML 文件中的依赖
   */
  private async parseWXML(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>();

      // Pass the Set to helper functions
      this.processImportIncludeTags(content, filePath, dependencies);
      this.processWxsTags(content, filePath, dependencies);
      this.processImageSources(content, filePath, dependencies);
      // FIXME: 小程序不支持这种方式使用自定义组件, 组件必须在json里有申明
      this.processCustomComponents(filePath, dependencies); // Needs checking if it uses the Set correctly

      return Array.from(dependencies); // Return array from Set
    } catch (e) {
      logger.warn(`Error parsing WXML file ${filePath}: ${e}`);
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
            logger.trace(
              `processImportIncludeTags: Could not resolve root path ${importPath} from ${filePath}`,
            );
          }
        } else {
          // 处理相对路径
          const depPath = this.resolveAnyPath(importPath, filePath, ['.wxml']);
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
          const depPath = this.resolveAnyPath(wxsPath, filePath, ['.wxs']);
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
      const resolvedPath = this.resolveAnyPath(src, filePath, [
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
      ]);
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
          for (const [_componentName, componentPath] of Object.entries(
            jsonContent.usingComponents,
          )) {
            if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
              // 排除插件路径 (plugin://)
              // 使用统一的路径解析函数
              // 1. Resolve the component path given in usingComponents (might resolve to index file, dir, etc.)
              const resolvedComponentPath = this.resolveAnyPath(componentPath as string, filePath, [
                '.js',
                '.ts',
                '.wxml',
                '.wxss',
                '.json',
              ]);

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
          logger.warn(`Error parsing JSON file ${jsonPath}: ${e}`);
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
            const depPath = this.resolveAnyPath(importPath, filePath, ['.wxss']);
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
            logger.trace(`Processing url path: ${urlPath}`);
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

            // 如果直接路径不存在，尝试使用 resolveAnyPath
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];
            const depPath = this.resolveAnyPath(urlPath, filePath, imageExtensions);
            if (depPath) dependencies.push(depPath);
          }
        }
      }

      return [...new Set(dependencies)]; // 去除重复项
    } catch (e) {
      if (this.options.verbose) {
        logger.warn(`Error parsing WXSS file ${filePath}: ${e}`);
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
        for (const [_componentName, componentPath] of Object.entries(content.usingComponents)) {
          if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
            // 排除插件路径 (plugin://)

            // 使用统一的路径解析函数
            // 1. Resolve the component path given in usingComponents (might resolve to index file, dir, etc.)
            const resolvedComponentPath = this.resolveAnyPath(componentPath as string, filePath, [
              '.js',
              '.ts',
              '.wxml',
              '.wxss',
              '.json',
            ]);

            if (resolvedComponentPath) {
              // FIXME: 这里假设不对, 组件不一定 index.json, 也可能 /components/button/button.json
              // FIXME: 为什么 resolvedComponentPath 会带后缀
              // FIXME: 这里也导致了第三步的错误
              // FIXME: 目前的状态:
              // resolvedComponentPath: /Users/zcs/code/mmbb/mt-address-msc/src/common/view/location-view/index.ts
              // componentPath: "/common/view/location-view/index"
              // filePath: '/Users/zcs/code/mmbb/mt-address-msc/src/components/address-home-v2/__r-list/address-list/index.json'

              // 2. Determine the base name for checking related files
              //    (remove /index.ext or just .ext)
              const componentBase = resolvedComponentPath.replace(/(\/index)?\.\w+$/, '');
              // FIXME: current: /Users/zcs/code/mmbb/mt-address-msc/src/common/view/location-view

              // 3. Check for related component files based on the derived base name
              const exts = ['.js', '.ts', '.wxml', '.wxss', '.json'];
              for (const ext of exts) {
                // FIXME: 这里怎么
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
        logger.warn(`Error parsing JSON file ${filePath}: ${e}`);
      }
      return [];
    }
  }

  /**
   * 解析 WXS 文件中的依赖 (require)
   */
  private async parseWXS(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>();
      const requireRegex = /require\s*\(\s*['"](.*?)['"]\s*\)/g;
      const allowedExtensions = ['.wxs']; // WXS can only require WXS

      let match;
      while ((match = requireRegex.exec(content)) !== null) {
        if (match[1]) {
          const importPath = match[1];
          // WXS requires are relative or absolute/alias?
          // Assuming relative for now based on typical usage.
          const depPath = this.resolveAnyPath(importPath, filePath, allowedExtensions);
          if (depPath) {
            dependencies.add(depPath);
          }
        }
      }
      return Array.from(dependencies);
    } catch (e) {
      logger.warn(`Error parsing WXS file ${filePath}: ${e}`);
      return [];
    }
  }

  // --- Path Resolution Logic ---

  /**
   * Checks if a given import path potentially uses a configured alias.
   * This is a preliminary check before attempting full resolution.
   */
  private isAliasPath(importPath: string): boolean {
    if (!this.aliasResolver || !this.hasAliasConfig) {
      return false;
    }
    const aliases = this.aliasResolver.getAliases();
    // Check if the import path starts with any defined alias prefix or matches an alias exactly
    return Object.keys(aliases).some(
      (alias) => importPath.startsWith(alias + '/') || importPath === alias,
    );
  }

  /**
   * Resolves an import path (which could be relative, absolute, alias, or implicit root)
   * to an existing file path, considering context-specific allowed extensions.
   *
   * @param importPath The original import string (e.g., './utils', '/pages/index', '@/comp', 'image.png').
   * @param sourcePath The absolute path of the file containing the import.
   * @param allowedExtensions An ordered array of extensions to check (e.g., ['.js', '.ts'] or ['.wxml']).
   * @returns The absolute path of the resolved existing file, or null if not found.
   */
  private resolveAnyPath(
    importPath: string,
    sourcePath: string,
    allowedExtensions: string[],
  ): string | null {
    logger.trace(
      `Resolving import '${importPath}' from '${sourcePath}' with allowed extensions: [${allowedExtensions.join(
        ', ',
      )}]`,
    );

    let potentialBasePath: string | null = null;
    let isAlias = false;

    // 1. Try resolving as an alias first
    if (this.isAliasPath(importPath) && this.aliasResolver) {
      isAlias = true; // Mark that we started from an alias
      potentialBasePath = this.aliasResolver.resolve(importPath, sourcePath);
      if (potentialBasePath) {
        logger.trace(`Alias resolved to base path: ${potentialBasePath}`);
        // Proceed to findExistingPath with this base path
      } else {
        logger.warn(`Alias '${importPath}' detected but could not be resolved by AliasResolver.`);
        return null; // Alias detected but couldn't be mapped
      }
    }

    // 2. Determine the absolute base path if not resolved by alias
    if (!potentialBasePath) {
      const sourceDir = path.dirname(sourcePath);
      if (importPath.startsWith('/')) {
        // Root-relative: Base is the miniappRoot
        potentialBasePath = path.resolve(
          this.options.miniappRoot || this.projectRoot,
          importPath.slice(1),
        );
      } else if (importPath.startsWith('.')) {
        // Relative: Resolve from source file's directory
        potentialBasePath = path.resolve(sourceDir, importPath);
      } else {
        // Implicit root or node_modules: Try resolving from miniappRoot first
        // This handles cases like 'components/button' in usingComponents
        // or bare specifiers like 'lodash' (though node_modules aren't fully handled here)
        potentialBasePath = path.resolve(this.options.miniappRoot || this.projectRoot, importPath);
        // We could add node_modules resolution logic here if needed in the future
      }
      logger.trace(`Path resolved to potential base path: ${potentialBasePath}`);
    }

    // 3. Find the actual existing file using the base path and allowed extensions
    if (potentialBasePath) {
      const existingPath = this.findExistingPath(potentialBasePath, allowedExtensions);
      if (existingPath) {
        logger.trace(`Resolved '${importPath}' to existing file: ${existingPath}`);
        return existingPath;
      } else if (isAlias) {
        // If alias resolution gave a base path but findExistingPath failed, log it.
        logger.warn(
          `Alias resolved to '${potentialBasePath}', but no existing file found with extensions [${allowedExtensions.join(
            ', ',
          )}]`,
        );
      }
    }

    // Only log warning if it wasn't an alias that resolved but failed extension checks
    if (!isAlias) {
      logger.warn(`Failed to resolve import '${importPath}' from '${sourcePath}'.`);
    }
    return null;
  }

  /**
   * Given a potential absolute base path (without extension or index), finds the
   * actual existing file path by checking for the path itself, adding allowed
   * extensions, or checking for directory index files with allowed extensions.
   *
   * @param potentialPath Absolute path, possibly without extension (e.g., '/path/to/file' or '/path/to/dir')
   * @param allowedExtensions Ordered list of extensions to check (e.g., ['.js', '.ts'])
   * @returns The existing absolute file path, or null.
   */
  private findExistingPath(potentialPath: string, allowedExtensions: string[]): string | null {
    logger.trace(
      `Finding existing path for '${potentialPath}' with extensions [${allowedExtensions.join(
        ', ',
      )}]`,
    );

    // Check 1: Does the potential path exist exactly as specified?
    if (fs.existsSync(potentialPath)) {
      try {
        // If it exists, is it a file?
        if (fs.statSync(potentialPath).isFile()) {
          logger.trace(`Path exists as file: ${potentialPath}`);
          return potentialPath;
        }
        // If it's a directory, proceed to Check 3 (index files)
        if (fs.statSync(potentialPath).isDirectory()) {
          logger.trace(`Path exists as directory: ${potentialPath}. Checking index files.`);
          // Fall through to Check 3
        } else {
          logger.trace(`Path exists but is not a file or directory: ${potentialPath}`);
          // Treat as existing if it's not a directory? Maybe.
          // Or return null? Let's return it for now, might be a link etc.
          return potentialPath;
        }
      } catch (e) {
        logger.warn(
          `Error checking stats for ${potentialPath}: ${
            (e as Error).message
          }. Skipping direct/directory check.`,
        );
        // If stats fail, maybe still try extensions (Check 2)
      }
    }

    // Check 2: Does the path exist if we add an allowed extension?
    for (const ext of allowedExtensions) {
      const pathWithExt = potentialPath + ext;
      if (fs.existsSync(pathWithExt)) {
        try {
          // Ensure it's a file we found
          if (fs.statSync(pathWithExt).isFile()) {
            logger.trace(`Path with extension exists as file: ${pathWithExt}`);
            return pathWithExt;
          }
        } catch (e) {
          /* Ignore stat error, file might exist but be unreadable */
        }
      }
    }

    // Check 3: If the original path exists as a directory, check for index files within it.
    // We re-check existsSync here in case the first check failed due to stats error.
    let isDirectory = false;
    try {
      isDirectory = fs.existsSync(potentialPath) && fs.statSync(potentialPath).isDirectory();
    } catch (e) {
      /* Ignore error */
    }

    if (isDirectory) {
      logger.trace(`Checking for index files in directory: ${potentialPath}`);
      for (const ext of allowedExtensions) {
        const indexPath = path.join(potentialPath, `index${ext}`);
        if (fs.existsSync(indexPath)) {
          try {
            // Ensure it's a file we found
            if (fs.statSync(indexPath).isFile()) {
              logger.trace(`Index file exists: ${indexPath}`);
              return indexPath;
            }
          } catch (e) {
            /* Ignore stat error */
          }
        }
      }
    }

    logger.trace(`No existing file found for base path '${potentialPath}' with given extensions.`);
    return null;
  }

  /*
  // OLD resolvePath - TO BE REMOVED
  private resolvePath(
    sourcePath: string,
    relativePath: string,
    projectRootOverride?: string,
  ): string | null {
    const sourceDir = path.dirname(sourcePath);
    const baseDir = projectRootOverride || sourceDir;

    let targetPath: string;
    if (relativePath.startsWith('/')) {
      // Absolute path relative to the effective project root
      targetPath = path.resolve(baseDir, relativePath.slice(1));
    } else {
      // Relative path from the source file's directory
      targetPath = path.resolve(baseDir, relativePath);
    }

        logger.trace(
      `Resolving path: source=${sourcePath}, relative=${relativePath}, base=${baseDir} -> target=${targetPath}`,
        );

    // 1. Check if the exact path exists
    if (fs.existsSync(targetPath)) {
      try {
        if (fs.statSync(targetPath).isFile()) {
          logger.trace(`Resolved path exists as file: ${targetPath}`);
          return targetPath;
        }
        if (fs.statSync(targetPath).isDirectory()) {
          logger.trace(`Resolved path is directory: ${targetPath}, checking index files`);
          // If it's a directory, check for index files (fall through to check 2)
    } else {
          // Path exists but isn't a file or directory (e.g., symlink?)
          logger.trace(`Resolved path exists but is not file/directory: ${targetPath}`);
          return targetPath; // Return the path if it exists, even if not file/dir?
        }
      } catch (e) {
        logger.warn(
          `Error getting stats for existing path ${targetPath}: ${(e as Error).message}`,
      );
        // If stats fail, maybe it still exists? Try extensions anyway.
      }
    }

    // 2. Check for index file in directory
    try {
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        const indexExtensions = ['.js', '.ts', '.tsx', '.jsx', '.json', '.wxml', '.wxss', '.wxs'];
        for (const ext of indexExtensions) {
          const indexPath = path.join(targetPath, `index${ext}`);
          if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
            logger.trace(`Resolved directory to index file: ${indexPath}`);
            return indexPath;
          }
        }
        logger.trace(`Directory found but no suitable index file: ${targetPath}`);
      }
    } catch (e) {
      // Ignore stat errors during index check
    }

    // 3. Check by adding extensions
    const possibleExts = ['.js', '.ts', '.tsx', '.jsx', '.json', '.wxml', '.wxss', '.wxs'];
    for (const ext of possibleExts) {
      const pathWithExt = targetPath + ext;
      if (fs.existsSync(pathWithExt)) {
        try {
          if (fs.statSync(pathWithExt).isFile()) {
            logger.trace(`Resolved path by adding extension ${ext}: ${pathWithExt}`);
          return pathWithExt;
        }
      } catch (e) {
          // Ignore stat errors, maybe file exists but is unreadable
        }
      }
    }

    logger.warn(`Could not resolve path for import '${relativePath}' from '${sourcePath}'`);
    return null;
  }
*/
}
