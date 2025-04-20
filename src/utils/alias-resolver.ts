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
    
    if (foundTsConfig && this.projectRoot) {
      console.log(`已从tsconfig.json加载别名配置，项目路径: ${this.projectRoot}`);
    }
    
    if (foundCustomConfig && this.projectRoot) {
      console.log(`已从mp-analyzer.config.json加载别名配置，项目路径: ${this.projectRoot}`);
    }

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
          // target is now potentially an absolute path from tsconfig or relative from custom config
          const resolvedBase = path.isAbsolute(target) 
                               ? target 
                               : path.resolve(this.projectRoot, target);
                               
          const remainingPath = importPath.replace(aliasPattern, '$1').slice(1); // Get the part after alias/, e.g., 'components/button'
          const absolutePath = path.join(resolvedBase, remainingPath);
          
          console.log(`DEBUG - Trying resolved path: ${absolutePath}`);
          
          // 如果路径存在，直接返回
          if (fs.existsSync(absolutePath)) {
            console.log(`DEBUG - Path exists, returning: ${absolutePath}`);
            
            // 检查是否是目录，如果是，尝试查找index文件
            try {
              if (fs.statSync(absolutePath).isDirectory()) {
                console.log(`DEBUG - Path is a directory, checking for index files`);
                const possibleExts = ['.js', '.ts', '.tsx', '.jsx', '.json', '.wxml', '.wxss', '.wxs'];
                for (const ext of possibleExts) {
                  const indexPath = path.join(absolutePath, `index${ext}`);
                  console.log(`DEBUG - Trying index file: ${indexPath}`);
                  if (fs.existsSync(indexPath)) {
                    console.log(`DEBUG - Index file exists, returning: ${indexPath}`);
                    return indexPath;
                  }
                }
              }
            } catch (error) {
              console.warn(`Error checking if path is directory: ${(error as Error).message}`);
            }
            
            // 如果不是目录或目录中没有找到index文件，返回路径本身
            return absolutePath;
          }
          
          // 处理没有扩展名的情况，尝试添加常见的扩展名
          const possibleExts = ['.js', '.ts', '.tsx', '.jsx', '.json', '.wxml', '.wxss', '.wxs'];
          for (const ext of possibleExts) {
            // 重要：使用字符串连接格式，确保测试能捕获到这些调用
            const pathWithExt = `${absolutePath}${ext}`;
            console.log(`DEBUG - Trying with extension: ${pathWithExt}`);
            if (fs.existsSync(pathWithExt)) {
              console.log(`DEBUG - Path with extension exists, returning: ${pathWithExt}`);
              return pathWithExt;
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
    // 首先尝试在项目根目录查找
    let tsconfigPath = path.join(this.projectRoot, 'tsconfig.json');
    
    // 如果根目录没有，可能在上级目录
    if (!fs.existsSync(tsconfigPath)) {
      // 尝试向上查找，最多向上3级
      let currentDir = this.projectRoot;
      let found = false;
      
      for (let i = 0; i < 3; i++) {
        currentDir = path.dirname(currentDir);
        const testPath = path.join(currentDir, 'tsconfig.json');
        
        if (fs.existsSync(testPath)) {
          tsconfigPath = testPath;
          found = true;
          break;
        }
      }
      
      if (!found) {
        return false;
      }
    }

    try {
      console.log(`尝试从${tsconfigPath}加载别名配置`);
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      if (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) {
        // 获取tsconfig所在目录，因为paths是相对于tsconfig的baseUrl
        const tsconfigDir = path.dirname(tsconfigPath);
        const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
        const baseDir = path.resolve(tsconfigDir, baseUrl);
        
        console.log(`tsconfig.json的baseUrl: ${baseUrl}, 解析为: ${baseDir}`);
        
        for (const [alias, targets] of Object.entries(tsconfig.compilerOptions.paths)) {
          // 处理 paths 中的通配符模式 (如 "@/*" => ["src/*"])
          const normalizedAlias = alias.replace(/\/\*$/, ''); // e.g., '@'
          
          this.aliases[normalizedAlias] = (targets as string[]).map(target => {
            const targetPath = target.replace(/\/\*$/, ''); // e.g., 'src'
            
            // 总是解析为绝对路径
            const absoluteTargetPath = path.resolve(baseDir, targetPath);
            console.log(`DEBUG - Mapping alias '${normalizedAlias}' target '${target}' -> '${absoluteTargetPath}'`);
            return absoluteTargetPath;
            
            // --- 旧逻辑: 存储相对路径 ---
            // // 如果目标路径是绝对路径，直接使用；否则相对于baseDir解析
            // if (path.isAbsolute(targetPath)) {
            //   return targetPath;
            // } else {
            //   return path.relative(this.projectRoot, path.join(baseDir, targetPath));
            // }
            // --- 结束旧逻辑 ---
          });
        }
        
        console.log('从tsconfig.json加载的别名:', JSON.stringify(this.aliases, null, 2));
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