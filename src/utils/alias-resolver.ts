import * as fs from 'fs';
import * as path from 'path';

/**
 * 路径别名配置
 */
export interface PathAliases {
  [key: string]: string[];
}

/**
 * 别名解析器: 负责从不同配置文件中加载路径别名
 */
export class AliasResolver {
  private projectRoot: string;
  private aliases: PathAliases = {};
  private initialized: boolean = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  /**
   * 初始化别名解析器
   * @returns 是否找到有效的别名配置
   */
  public initialize(): boolean {
    if (this.initialized) return Object.keys(this.aliases).length > 0;

    // 尝试从不同来源加载别名
    const foundTsConfig = this.loadFromTsConfig();
    const foundCustomConfig = this.loadFromCustomConfig();

    this.initialized = true;
    
    // 如果至少找到一个来源的别名配置，返回true
    return foundTsConfig || foundCustomConfig;
  }

  /**
   * 解析别名路径
   * @param importPath 导入路径
   * @param currentFile 当前文件路径
   * @returns 解析后的路径，如果找不到匹配的别名则返回null
   */
  public resolve(importPath: string, currentFile: string): string | null {
    if (!this.initialized) {
      this.initialize();
    }

    console.log(`DEBUG - Resolving alias for import '${importPath}' in file '${currentFile}'`);
    console.log(`DEBUG - Available aliases:`, JSON.stringify(this.aliases, null, 2));

    // 检查是否是别名路径
    for (const [alias, targets] of Object.entries(this.aliases)) {
      // 别名必须以 @ 或字母开头，后面跟 / 或没有其他字符
      const aliasPattern = new RegExp(`^${alias}(/|$)`);
      
      if (aliasPattern.test(importPath)) {
        // 找到了匹配的别名
        console.log(`DEBUG - Found matching alias: ${alias} => ${targets.join(' or ')}`);
        
        for (const target of targets) {
          // 替换别名为目标路径
          const relativePath = importPath.replace(aliasPattern, target + '$1');
          const absolutePath = path.join(this.projectRoot, relativePath);
          
          console.log(`DEBUG - Trying resolved path: ${absolutePath}`);
          
          // 如果路径存在，直接返回
          if (fs.existsSync(absolutePath)) {
            console.log(`DEBUG - Path exists, returning: ${absolutePath}`);
            return absolutePath;
          }
          
          // 处理没有扩展名的情况，尝试添加常见的扩展名
          const possibleExts = ['.js', '.ts', '.tsx', '.jsx', '.json', '.wxml', '.wxss', '.wxs'];
          for (const ext of possibleExts) {
            const pathWithExt = absolutePath + ext;
            console.log(`DEBUG - Trying with extension: ${pathWithExt}`);
            if (fs.existsSync(pathWithExt)) {
              console.log(`DEBUG - Path with extension exists, returning: ${pathWithExt}`);
              return pathWithExt;
            }
          }
          
          // 尝试作为目录处理，查找目录下的index文件
          if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).isDirectory()) {
            console.log(`DEBUG - Path is a directory, checking for index files`);
            for (const ext of possibleExts) {
              const indexPath = path.join(absolutePath, `index${ext}`);
              console.log(`DEBUG - Trying index file: ${indexPath}`);
              if (fs.existsSync(indexPath)) {
                console.log(`DEBUG - Index file exists, returning: ${indexPath}`);
                return indexPath;
              }
            }
          }
        }
        
        console.log(`DEBUG - Could not resolve alias ${alias} to a valid file path`);
      }
    }

    console.log(`DEBUG - No matching alias found for ${importPath}`);
    return null;
  }

  /**
   * 从tsconfig.json加载路径别名
   * @returns 是否成功加载到别名配置
   */
  private loadFromTsConfig(): boolean {
    const tsconfigPath = path.join(this.projectRoot, 'tsconfig.json');
    if (!fs.existsSync(tsconfigPath)) {
      return false;
    }

    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      if (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) {
        for (const [alias, targets] of Object.entries(tsconfig.compilerOptions.paths)) {
          // 处理 paths 中的通配符模式 (如 "@/*" => ["src/*"])
          const normalizedAlias = alias.replace(/\/\*$/, '');
          this.aliases[normalizedAlias] = (targets as string[]).map(target => 
            target.replace(/\/\*$/, '')
          );
        }
        return Object.keys(this.aliases).length > 0;
      }
    } catch (error) {
      console.warn(`无法解析 tsconfig.json: ${(error as Error).message}`);
    }
    
    return false;
  }

  /**
   * 从自定义配置文件加载路径别名
   * @returns 是否成功加载到别名配置
   */
  private loadFromCustomConfig(): boolean {
    // 尝试从mp-analyzer.config.json加载配置
    const configPath = path.join(this.projectRoot, 'mp-analyzer.config.json');
    if (!fs.existsSync(configPath)) {
      return false;
    }

    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.aliases && typeof config.aliases === 'object') {
        const initialAliasCount = Object.keys(this.aliases).length;
        
        for (const [alias, targets] of Object.entries(config.aliases)) {
          this.aliases[alias] = Array.isArray(targets) ? targets : [targets as string];
        }
        
        // 检查是否添加了新的别名
        return Object.keys(this.aliases).length > initialAliasCount;
      }
    } catch (error) {
      console.warn(`无法解析 mp-analyzer.config.json: ${(error as Error).message}`);
    }
    
    return false;
  }

  /**
   * 获取所有配置的别名
   */
  public getAliases(): PathAliases {
    if (!this.initialized) {
      this.initialize();
    }
    return this.aliases;
  }
} 