import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { AliasResolver } from '../utils/alias-resolver';
import { logger } from '../utils/debug-logger';

/**
 * FileParser: Responsible for parsing different file types in a WeChat Mini Program
 * and extracting their direct code-level or configuration-defined dependencies.
 *
 * Scope:
 * - Analyzes `import`, `require`, WXML `<import>`, `<include>`, `<wxs>`, WXSS `@import`.
 * - Analyzes component usage declared in JSON (`usingComponents`).
 * - Analyzes page paths declared in `app.json` (`pages`, `subPackages`).
 * - Analyzes resource paths referenced directly in WXML (`<image src>`) and WXSS (`url()`).
 * - Analyzes `.wxs` module dependencies.
 * - **Does NOT** analyze string literals in JavaScript/TypeScript that might represent
 *   navigation targets (e.g., 'pages/index/index' within `wx.navigateTo`). This is considered
 *   runtime navigation logic, not a direct code dependency.
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

      // Allowed extensions for JS/TS imports
      const allowedExtensions = ['.js', '.ts', '.json']; // Typically import these

      // Process standard import statements
      this.processImportStatements(content, filePath, allowedExtensions, dependencies);

      // Process standard require statements
      this.processRequireStatements(content, filePath, allowedExtensions, dependencies);

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
      const dependencies = new Set<string>(); // Use Set for automatic deduplication

      // Match @import statements
      const importRegex = /@import\s+['"]([^'"]+)['"]/g;
      // Match url() references
      const urlRegex = /url\(['"]?([^'")]+)['"]?\)/g;
      // Allowed extensions for imports and urls
      const importExtensions = ['.wxss'];
      const urlExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']; // Common image/font types

      let match;

      // Process @import statements
      while ((match = importRegex.exec(content)) !== null) {
        if (match[1]) {
          const importPath = match[1];
          // Directly use resolveAnyPath, it handles relative, root, and alias paths
          const resolvedPath = this.resolveAnyPath(importPath, filePath, importExtensions);
          if (resolvedPath) {
            dependencies.add(resolvedPath);
          }
        }
      }

      // Process url() references
      while ((match = urlRegex.exec(content)) !== null) {
        if (match[1]) {
          const urlPath = match[1].trim(); // Trim whitespace

          // Skip data URIs and external URLs
          if (urlPath.startsWith('data:') || /^(http|https):\/\//.test(urlPath)) {
            continue;
          }

          // Skip dynamic template strings (like url({{someVar}}))
          if (/{{.*?}}/.test(urlPath)) {
            continue;
          }

          // Directly use resolveAnyPath, it handles relative, root, and alias paths
          const resolvedPath = this.resolveAnyPath(urlPath, filePath, urlExtensions);
          if (resolvedPath) {
            dependencies.add(resolvedPath);
          }
        }
      }

      return Array.from(dependencies);
    } catch (e) {
      // Use logger.error for consistency or keep as warn if it's expected to fail sometimes
      logger.warn(`Error parsing WXSS file ${filePath}: ${(e as Error).message}`);
      return [];
    }
  }

  /**
   * 解析 JSON 文件中的依赖
   */
  private async parseJSON(filePath: string): Promise<string[]> {
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const dependencies = new Set<string>(); // Use Set for automatic deduplication
      // Define standard extensions for components (used in usingComponents, generics)
      const componentExtensions = ['.js', '.ts', '.wxml', '.json']; // Usually component logic + template + style + config
      // Define standard extensions for pages (prioritizing script)
      const pageScriptExtensions = ['.js', '.ts'];
      // Define ALL standard extensions for pages/components files
      const pageAllExtensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
      // Define extensions for images/icons
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

      // --- Process app.json specific fields ---

      // Handle 'pages' array
      if (content.pages && Array.isArray(content.pages)) {
        for (const pagePath of content.pages) {
          if (typeof pagePath === 'string') {
            // Resolve *any* primary file for the page (js, ts, wxml, wxss, json)
            // treating paths as root-relative
            const resolvedPagePath = this.resolveAnyPath(
              '/' + pagePath,
              filePath,
              pageAllExtensions, // <-- Use all extensions
            );
            if (resolvedPagePath) {
              dependencies.add(resolvedPagePath);
              // Note: Finding related files is handled by the graph builder ensuring all siblings are added later
            } else if (this.options.verbose) {
              // Add verbose logging if resolution fails
              logger.warn(`Could not resolve page path from app.json: /${pagePath}`);
            }
          }
        }
      }

      // Handle 'subPackages' or 'subpackages' array
      const subpackages = content.subPackages || content.subpackages;
      if (subpackages && Array.isArray(subpackages)) {
        for (const subpackage of subpackages) {
          const root = subpackage.root;
          const subPages = subpackage.pages;

          if (typeof root === 'string' && Array.isArray(subPages)) {
            for (const pagePath of subPages) {
              if (typeof pagePath === 'string') {
                // Construct the full root-relative path
                const fullPagePath = '/' + path.join(root, pagePath);
                // Resolve *any* primary file for the subpackage page
                const resolvedPagePath = this.resolveAnyPath(
                  fullPagePath,
                  filePath,
                  pageAllExtensions, // <-- Use all extensions
                );
                if (resolvedPagePath) {
                  dependencies.add(resolvedPagePath);
                  // Note: Related file finding handled by graph builder
                } else if (this.options.verbose) {
                  // Add verbose logging if resolution fails
                  logger.warn(
                    `Could not resolve subpackage page path from app.json: ${fullPagePath}`,
                  );
                }
              }
            }
          }
        }
      }

      // Handle 'tabBar' icon paths (these are direct file references)
      if (content.tabBar && content.tabBar.list && Array.isArray(content.tabBar.list)) {
        for (const item of content.tabBar.list) {
          if (item && typeof item.iconPath === 'string') {
            const resolvedIconPath = this.resolveAnyPath(item.iconPath, filePath, imageExtensions);
            if (resolvedIconPath) dependencies.add(resolvedIconPath);
          }
          if (item && typeof item.selectedIconPath === 'string') {
            const resolvedSelectedIconPath = this.resolveAnyPath(
              item.selectedIconPath,
              filePath,
              imageExtensions,
            );
            if (resolvedSelectedIconPath) dependencies.add(resolvedSelectedIconPath);
          }
        }
      }

      // --- Process component.json specific fields ---

      // Handle 'usingComponents' object
      if (content.usingComponents && typeof content.usingComponents === 'object') {
        for (const [_componentName, componentPath] of Object.entries(content.usingComponents)) {
          if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
            // Resolve the primary component file (e.g., comp.js, comp.ts, index.js)
            const resolvedComponentPath = this.resolveAnyPath(
              componentPath,
              filePath,
              componentExtensions,
            );
            if (resolvedComponentPath) {
              dependencies.add(resolvedComponentPath);
              // Note: Related file finding delegated to the caller/graph builder.
            }
          }
        }
      }

      // Handle 'componentGenerics' (if needed in the future)
      if (content.componentGenerics && typeof content.componentGenerics === 'object') {
        for (const genericName in content.componentGenerics) {
          const genericInfo = content.componentGenerics[genericName];
          if (genericInfo && typeof genericInfo.default === 'string') {
            const defaultComponentPath = genericInfo.default;
            if (!defaultComponentPath.startsWith('plugin://')) {
              const resolvedDefaultPath = this.resolveAnyPath(
                defaultComponentPath,
                filePath,
                componentExtensions,
              );
              if (resolvedDefaultPath) {
                dependencies.add(resolvedDefaultPath);
              }
            }
          }
        }
      }

      return Array.from(dependencies); // Return unique dependencies
    } catch (e) {
      // Only log if parsing actually fails, not just missing fields
      if (e instanceof SyntaxError) {
        logger.error(`Error parsing JSON file ${filePath}: ${(e as Error).message}`);
      } else if (this.options.verbose) {
        // Log other errors (like file read errors) verbosely
        logger.warn(`Error processing JSON file ${filePath}: ${(e as Error).message}`);
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
    if (!this.hasAliasConfig || !this.aliasResolver) {
      return false;
    }
    const aliases = this.aliasResolver.getAliases();
    if (Object.keys(aliases).length === 0) {
      return false;
    }

    // Create a more precise pattern matching approach
    // 1. Check if the import path matches exactly with an alias
    if (importPath in aliases) {
      return true;
    }

    // 2. Check if the import path starts with an alias followed by a slash
    for (const alias of Object.keys(aliases)) {
      // Ensure we match exact alias prefixes (e.g., '@mtfe/' not just '@')
      // This prevents incorrectly matching npm packages like '@analytics/wechat-sdk'
      // when we have an alias like '@mtfe'
      if (importPath === alias || importPath.startsWith(`${alias}/`)) {
        return true;
      }
    }

    return false;
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

    // Quick check for npm package imports that don't match our alias patterns
    // This prevents unnecessary warnings for packages that can't be resolved in the file system
    if (this.isNpmPackageImport(importPath)) {
      logger.trace(`Skipping resolution for npm package import: ${importPath}`);
      return null;
    }

    // --- REVISED: Handle true absolute paths FIRST, only if they EXIST at that absolute location ---
    if (path.isAbsolute(importPath)) {
      logger.trace(
        `Input importPath '${importPath}' is absolute. Checking direct existence first.`,
      );
      // Check if the file exists *directly* at this absolute path before treating it as special.
      // We use findExistingPath because it also checks extensions.
      const existingAbsolutePath = this.findExistingPath(importPath, allowedExtensions);
      if (existingAbsolutePath) {
        // If it exists at the true absolute path, return it.
        logger.trace(
          `Found existing file at true absolute path: ${existingAbsolutePath}. Returning directly.`,
        );
        return existingAbsolutePath;
      } else {
        // If it doesn't exist at the true absolute path, log it, but let it fall through.
        // It might be a root-relative path (e.g., /pages/index on Linux/Mac) that needs project-relative resolution.
        logger.trace(
          `Absolute path '${importPath}' not found directly. Will proceed to normal resolution (might be root-relative).`,
        );
        // DO NOT return null here. Let it fall through to alias/relative/root-relative checks.
      }
    }
    // --- END REVISED ---

    let potentialBasePath: string | null = null;
    let isAlias = false;

    // 1. Try resolving as an alias first (Skip if already resolved as absolute)
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
   * Check if the import path looks like an npm package that we shouldn't try to resolve
   * on the file system or with aliases
   */
  private isNpmPackageImport(importPath: string): boolean {
    // Typical npm package patterns:
    // 1. Non-relative, non-absolute path that doesn't match our aliases (e.g., 'lodash', 'react')
    // 2. Scoped packages (e.g., '@angular/core', '@analytics/wechat-sdk')

    // For scoped packages, check if it starts with @ but is not one of our aliases
    if (importPath.startsWith('@')) {
      // Extract the scope part (e.g., '@angular' from '@angular/core')
      const scope = importPath.split('/')[0];

      // If we have alias config, check if this scope matches any of our aliases
      if (this.hasAliasConfig && this.aliasResolver) {
        const aliases = this.aliasResolver.getAliases();
        // If the scope exactly matches an alias or is a prefix of an alias followed by /,
        // then it's likely not an npm package but a configured alias
        if (
          scope in aliases ||
          Object.keys(aliases).some((alias) => alias === scope || alias.startsWith(`${scope}/`))
        ) {
          return false;
        }
      }

      // If no alias match, it's likely an npm package
      return true;
    }

    // For non-scoped packages, harder to detect reliably.
    // We'll return false to let the regular resolution logic handle it
    return false;
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
    // --- DEBUG LOGGING START ---
    // console.log(`[findExistingPath] Input: potentialPath='${potentialPath}', extensions=[${allowedExtensions.join(',')}]`);
    // --- DEBUG LOGGING END ---
    logger.trace(
      `Finding existing path for '${potentialPath}' with extensions [${allowedExtensions.join(
        ', ',
      )}]`,
    );

    // Check 1: Does the potential path exist exactly as specified?
    logger.trace(`Check 1: Checking exact path: ${potentialPath}`);
    let potentialPathIsDir = false; // Flag to track if it's a directory
    const check1Exists = fs.existsSync(potentialPath); // Store result for logging
    // --- DEBUG LOGGING START ---
    // console.log(`[findExistingPath] Check 1: fs.existsSync('${potentialPath}') -> ${check1Exists}`);
    // --- DEBUG LOGGING END ---
    if (check1Exists) {
      try {
        const stats = fs.statSync(potentialPath);
        // --- DEBUG LOGGING START ---
        // console.log(`[findExistingPath] Check 1: fs.statSync('${potentialPath}') -> isFile=${stats.isFile()}, isDir=${stats.isDirectory()}`);
        // --- DEBUG LOGGING END ---
        if (stats.isFile()) {
          logger.trace(`Check 1: SUCCESS - Path exists as file: ${potentialPath}`);
          return potentialPath; // Found exact file, return immediately
        }
        if (stats.isDirectory()) {
          logger.trace(
            `Check 1: Path exists as directory: ${potentialPath}. Will proceed to Check 3.`,
          );
          potentialPathIsDir = true; // Mark as directory, proceed checks below
        } else {
          logger.trace(`Check 1: Path exists but is not a file or directory: ${potentialPath}`);
          return potentialPath; // Return other existing types (links etc.)
        }
      } catch (e) {
        // --- DEBUG LOGGING START ---
        // console.log(`[findExistingPath] Check 1: fs.statSync('${potentialPath}') -> ERROR: ${(e as Error).message}`);
        // --- DEBUG LOGGING END ---
        logger.warn(
          `Check 1: Error checking stats for ${potentialPath}: {
            (e as Error).message
          }. Proceeding.`,
        );
      }
    } else {
      logger.trace(`Check 1: Exact path does not exist or failed existsSync: ${potentialPath}`);
    }

    // Check 2: Does the path exist if we add an allowed extension?
    if (!potentialPathIsDir) {
      logger.trace(
        `Check 2: Checking extensions [${allowedExtensions.join(',')}] for base: ${potentialPath}`,
      );
      for (const ext of allowedExtensions) {
        const pathWithExt = potentialPath + ext;
        logger.trace(`Check 2: Trying path with extension: ${pathWithExt}`);
        const check2Exists = fs.existsSync(pathWithExt); // Store result
        // --- DEBUG LOGGING START ---
        // console.log(`[findExistingPath] Check 2: fs.existsSync('${pathWithExt}') -> ${check2Exists}`);
        // --- DEBUG LOGGING END ---
        if (check2Exists) {
          try {
            const stats = fs.statSync(pathWithExt);
            // --- DEBUG LOGGING START ---
            // console.log(`[findExistingPath] Check 2: fs.statSync('${pathWithExt}') -> isFile=${stats.isFile()}`);
            // --- DEBUG LOGGING END ---
            if (stats.isFile()) {
              logger.trace(`Check 2: SUCCESS - Path with extension exists as file: ${pathWithExt}`);
              return pathWithExt; // Return the first valid file found
            } else {
              logger.trace(`Check 2: Path with extension exists but is not a file: ${pathWithExt}`);
            }
          } catch (e) {
            // --- DEBUG LOGGING START ---
            // console.log(`[findExistingPath] Check 2: fs.statSync('${pathWithExt}') -> ERROR: ${(e as Error).message}`);
            // --- DEBUG LOGGING END ---
            logger.warn(`Check 2: Stat error for ${pathWithExt}: ${(e as Error).message}`);
          }
        } else {
          logger.trace(`Check 2: Path with extension does not exist: ${pathWithExt}`);
        }
      } // End loop for Check 2 extensions
    } // End of Check 2 block (!potentialPathIsDir)

    // Check 3: If the original path was identified as a directory in Check 1, check for index files.
    if (potentialPathIsDir) {
      logger.trace(`Check 3: Checking for index files in directory: ${potentialPath}`);
      for (const ext of allowedExtensions) {
        const indexPath = path.join(potentialPath, `index${ext}`);
        logger.trace(`Check 3: Trying index file: ${indexPath}`);
        const check3Exists = fs.existsSync(indexPath); // Store result
        // --- DEBUG LOGGING START ---
        // console.log(`[findExistingPath] Check 3: fs.existsSync('${indexPath}') -> ${check3Exists}`);
        // --- DEBUG LOGGING END ---
        if (check3Exists) {
          try {
            const stats = fs.statSync(indexPath);
            // --- DEBUG LOGGING START ---
            // console.log(`[findExistingPath] Check 3: fs.statSync('${indexPath}') -> isFile=${stats.isFile()}`);
            // --- DEBUG LOGGING END ---
            if (stats.isFile()) {
              logger.trace(`Check 3: SUCCESS - Index file exists: ${indexPath}`);
              return indexPath;
            } else {
              logger.trace(`Check 3: Index path exists but is not a file: ${indexPath}`);
            }
          } catch (e) {
            // --- DEBUG LOGGING START ---
            // console.log(`[findExistingPath] Check 3: fs.statSync('${indexPath}') -> ERROR: ${(e as Error).message}`);
            // --- DEBUG LOGGING END ---
            logger.warn(`Check 3: Stat error for index file ${indexPath}: ${(e as Error).message}`);
          }
        } else {
          logger.trace(`Check 3: Index file does not exist: ${indexPath}`);
        }
      } // End loop for Check 3 extensions
    } // End of Check 3 block (potentialPathIsDir)

    // --- DEBUG LOGGING START ---
    // console.log(`[findExistingPath] FAILED for potentialPath='${potentialPath}'`);
    // --- DEBUG LOGGING END ---
    logger.trace(
      `findExistingPath: FAILED for base path '${potentialPath}' with given extensions [${allowedExtensions.join(
        ',',
      )}]`,
    );
    return null; // Failed to find anything
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
