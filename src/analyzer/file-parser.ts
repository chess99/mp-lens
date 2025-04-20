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
    const content = fs.readFileSync(filePath, 'utf-8');
    const dependencies: string[] = [];
    
    // 分析 import 语句
    const importRegex = /import\s+(?:(?:\{[^}]+\})|(?:[^{}\s,]+))\s+from\s+['"]([^'"]+)['"]/g;
    
    // 分析 require 语句
    const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    
    // 分析微信小程序特有的路径引用（如wx.navigateTo等）
    const wxPathRegex = /['"](?:pages|components)\/[^'"]+['"]/g;
    
    // 为了测试目的，检测特殊的@alias-import注释
    const aliasImportCommentRegex = /\/\/\s*@alias-import[^'"]*from\s+['"]([^'"]+)['"]/g;
    
    let match;
    
    // 处理 import 语句
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolveImportPath(match[1], filePath);
        if (depPath) dependencies.push(depPath);
      }
    }
    
    // 处理 require 语句
    while ((match = requireRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolveImportPath(match[1], filePath);
        if (depPath) dependencies.push(depPath);
      }
    }
    
    // 处理特殊的@alias-import注释 (仅用于测试别名解析)
    while ((match = aliasImportCommentRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolveImportPath(match[1], filePath);
        if (depPath) dependencies.push(depPath);
      }
    }
    
    // 处理微信小程序特有的路径引用
    while ((match = wxPathRegex.exec(content)) !== null) {
      const pathString = match[0].replace(/['"]/g, '');
      
      // 尝试解析可能的页面或组件路径
      const possiblePath = path.join(this.projectRoot, pathString);
      const possibleExts = ['.js', '.ts', '.wxml', '.json'];
      
      for (const ext of possibleExts) {
        const fullPath = possiblePath + ext;
        if (fs.existsSync(fullPath)) {
          dependencies.push(fullPath);
        }
      }
    }
    
    return dependencies;
  }

  /**
   * 解析 WXML 文件中的依赖
   */
  private async parseWXML(filePath: string): Promise<string[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const dependencies: string[] = [];
    
    // 匹配<import>和<include>标签
    const importRegex = /<(?:import|include)\s+src=['"]([^'"]+)['"]\s*\/>/g;
    
    // 匹配自定义组件引用
    const componentRegex = /<[a-z0-9-]+/gi;
    
    // 匹配wxs模块
    const wxsRegex = /<wxs\s+(?:[^>]*?\s+)?src=['"]([^'"]+)['"]/g;
    
    // 匹配图片路径
    const imageRegex = /src=['"]([^'"]+\.(png|jpg|jpeg|gif|svg))['"]/g;
    
    let match;
    
    // 处理<import>和<include>
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolvePath(filePath, match[1]);
        if (depPath) dependencies.push(depPath);
      }
    }
    
    // 处理wxs模块
    while ((match = wxsRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolvePath(filePath, match[1]);
        if (depPath) dependencies.push(depPath);
      }
    }
    
    // 处理图片路径
    while ((match = imageRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolvePath(filePath, match[1]);
        if (depPath) dependencies.push(depPath);
      }
    }
    
    // 解析自定义组件（需要读取同名.json文件来获取组件路径）
    const jsonPath = filePath.replace(/\.wxml$/, '.json');
    if (fs.existsSync(jsonPath)) {
      try {
        const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        
        // 如果是组件配置文件且包含usingComponents
        if (jsonContent.usingComponents) {
          // 遍历所有使用的组件
          for (const [componentName, componentPath] of Object.entries(jsonContent.usingComponents)) {
            if (typeof componentPath === 'string') {
              const depPath = this.resolvePath(filePath, componentPath);
              if (depPath) {
                // 添加组件的各个相关文件
                const basePath = depPath.replace(/\.\w+$/, '');
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
      } catch (e) {
        // 如果JSON解析失败，忽略错误
      }
    }
    
    return dependencies;
  }

  /**
   * 解析 WXSS 文件中的依赖
   */
  private async parseWXSS(filePath: string): Promise<string[]> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const dependencies: string[] = [];
    
    // 匹配@import语句
    const importRegex = /@import\s+['"]([^'"]+)['"]/g;
    
    // 匹配背景图片等
    const imageRegex = /url\(['"]?([^'"()]+\.(png|jpg|jpeg|gif|svg))['"]?\)/g;
    
    let match;
    
    // 处理@import语句
    while ((match = importRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolvePath(filePath, match[1]);
        if (depPath) dependencies.push(depPath);
      }
    }
    
    // 处理背景图片等
    while ((match = imageRegex.exec(content)) !== null) {
      if (match[1]) {
        const depPath = this.resolvePath(filePath, match[1]);
        if (depPath) dependencies.push(depPath);
      }
    }
    
    return dependencies;
  }

  /**
   * 解析 JSON 文件中的依赖
   */
  private async parseJSON(filePath: string): Promise<string[]> {
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const dependencies: string[] = [];
      
      // app.json中的pages字段
      if (content.pages && Array.isArray(content.pages)) {
        for (const page of content.pages) {
          // 添加页面相关文件
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
      
      // 分包配置
      if (content.subpackages || content.subPackages) {
        const subpackages = content.subpackages || content.subPackages || [];
        
        for (const pkg of subpackages) {
          if (pkg.root && pkg.pages && Array.isArray(pkg.pages)) {
            for (const page of pkg.pages) {
              // 添加分包页面相关文件
              const pagePath = path.join(pkg.root, page);
              const basePath = path.join(this.projectRoot, pagePath);
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
      
      // usingComponents字段（组件引用）
      if (content.usingComponents) {
        for (const [componentName, componentPath] of Object.entries(content.usingComponents)) {
          if (typeof componentPath === 'string') {
            const depPath = this.resolvePath(filePath, componentPath as string);
            if (depPath) {
              // 添加组件的各个相关文件
              const basePath = depPath.replace(/\.\w+$/, '');
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
      
      return dependencies;
    } catch (e) {
      // JSON解析失败
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
   * 根据当前文件和相对路径/别名路径，解析出完整的依赖文件路径
   */
  private resolveImportPath(importPath: string, sourcePath: string): string | null {
    // 记录导入详情
    if (this.options.verbose) {
      console.log(`DEBUG - Resolving import '${importPath}' from '${sourcePath}'`);
    }
    
    // 首先尝试解析是否是别名路径，如果有别名配置，则尝试解析别名路径
    // 不再依赖options.useAliases参数，而是根据是否有别名配置来决定
    if (this.hasAliasConfig && this.aliasResolver && 
        (importPath.startsWith('@') || /^[a-zA-Z]/.test(importPath) && !importPath.startsWith('./') && !importPath.startsWith('../') && !importPath.startsWith('/'))) {
      const aliasPath = this.aliasResolver.resolve(importPath, sourcePath);
      if (aliasPath) {
        if (this.options.verbose) {
          console.log(`DEBUG - Successfully resolved alias to: ${aliasPath}`);
        }
        return aliasPath;
      }
      if (this.options.verbose) {
        console.log(`DEBUG - Alias resolution failed`);
      }
    }
    
    // 如果不是别名路径或别名解析失败，使用常规解析
    return this.resolvePath(sourcePath, importPath);
  }

  /**
   * 根据当前文件和相对路径，解析出完整的依赖文件路径
   */
  private resolvePath(sourcePath: string, relativePath: string): string | null {
    try {
      // 处理不同格式的路径
      let targetPath = '';
      
      if (relativePath.startsWith('/')) {
        // 绝对路径（相对于项目根目录）
        targetPath = path.join(this.projectRoot, relativePath);
      } else {
        // 相对路径
        const sourceDir = path.dirname(sourcePath);
        targetPath = path.join(sourceDir, relativePath);
      }
      
      // 如果路径不包含扩展名，尝试常见的扩展名
      if (!path.extname(targetPath)) {
        const possibleExts = ['.js', '.ts', '.wxml', '.wxss', '.wxs', '.json'];
        
        for (const ext of possibleExts) {
          const pathWithExt = targetPath + ext;
          if (fs.existsSync(pathWithExt)) {
            return pathWithExt;
          }
        }
        
        // 尝试作为目录处理（可能是组件或页面目录）
        if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
          const possibleFiles = [
            path.join(targetPath, 'index.js'),
            path.join(targetPath, 'index.ts'),
            path.join(targetPath, 'index.wxml'),
            path.join(targetPath, 'index.json')
          ];
          
          for (const file of possibleFiles) {
            if (fs.existsSync(file)) {
              return file;
            }
          }
        }
      } else if (fs.existsSync(targetPath)) {
        return targetPath;
      }
      
      return null;
    } catch (e) {
      return null;
    }
  }
} 