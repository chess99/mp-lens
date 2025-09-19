import * as fs from 'fs';
import * as path from 'path';
import { logger } from './debug-logger';

/**
 * 路径别名配置
 */
interface PathAliases {
  [key: string]: string[];
}

/**
 * 别名解析器: 负责从不同配置文件中加载路径别名
 */
export class AliasResolver {
  private projectRoot: string;
  private aliases: PathAliases = {};
  private initialized = false;
  private providedApplied = false;

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

    if (foundTsConfig) {
      logger.info(`已从tsconfig.json加载别名配置`);
    }

    if (foundCustomConfig) {
      logger.info(`已从mp-lens.config.json加载别名配置`);
    }

    if (this.projectRoot) {
      logger.info(`alias解析的根目录: ${this.projectRoot}`);
    }

    this.initialized = true;

    // 如果至少找到一个来源的别名配置，返回true
    return foundTsConfig || foundCustomConfig;
  }

  /**
   * 从调用方直接提供的配置中加载别名（优先级最高）。
   * 该方法可以在 initialize() 之后调用，用于覆盖/补充已加载的别名。
   */
  public applyProvidedAliases(provided?: { [key: string]: string | string[] }): boolean {
    if (!provided || typeof provided !== 'object') {
      return false;
    }
    const before = Object.keys(this.aliases).length;
    for (const [alias, targets] of Object.entries(provided)) {
      this.aliases[alias] = Array.isArray(targets) ? targets : [targets as string];
    }
    this.providedApplied = true;
    const after = Object.keys(this.aliases).length;
    return after > before;
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

    logger.trace(`Resolving alias prefix for import '${importPath}' in file '${currentFile}'`);

    for (const [alias, targets] of Object.entries(this.aliases)) {
      // Basic alias pattern check (e.g., starts with @/ or aliasName/)
      const aliasPrefix = alias + '/'; // e.g., "@/"
      if (importPath.startsWith(aliasPrefix)) {
        logger.trace(`Found matching alias prefix: ${alias} => ${targets.join(' or ')}`);

        // Try the first target path defined for the alias
        // TODO: Handle multiple targets? For now, use the first.
        if (targets.length > 0) {
          const target = targets[0];
          // target can be absolute (tsconfig) or relative (custom config)
          const resolvedBaseDir = path.isAbsolute(target)
            ? target
            : path.resolve(this.projectRoot, target);

          // Get the part of the import path *after* the alias prefix
          const remainingPath = importPath.substring(aliasPrefix.length);
          // Construct the potential absolute path *without* extension checking
          const potentialPath = path.join(resolvedBaseDir, remainingPath);

          logger.trace(`Alias resolved to potential base path: ${potentialPath}`);
          // Return the potential path. The caller (FileParser) will handle existence checks,
          // index files, and extension appending based on context.
          return potentialPath;
        } else {
          logger.warn(`Alias '${alias}' found but has no target paths defined.`);
        }
        // If we found a matching alias but couldn't resolve (e.g., no targets),
        // stop checking other aliases for this import path.
        return null;
      }
      // Handle aliases without a trailing slash (e.g., alias maps directly to a file/dir)
      else if (importPath === alias) {
        logger.trace(`Found matching alias (exact match): ${alias} => ${targets.join(' or ')}`);
        if (targets.length > 0) {
          const target = targets[0];
          const potentialPath = path.isAbsolute(target)
            ? target
            : path.resolve(this.projectRoot, target);
          logger.trace(`Alias resolved to potential base path: ${potentialPath}`);
          return potentialPath;
        } else {
          logger.warn(`Alias '${alias}' found but has no target paths defined.`);
        }
        return null;
      }
    }

    logger.trace(`No matching alias prefix found for ${importPath}`);
    return null; // No alias matched
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
      logger.debug(`尝试从${tsconfigPath}加载别名配置`);

      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      if (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) {
        // 获取tsconfig所在目录，因为paths是相对于tsconfig的baseUrl
        const tsconfigDir = path.dirname(tsconfigPath);
        const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
        const baseDir = path.resolve(tsconfigDir, baseUrl);

        logger.debug(`tsconfig.json的baseUrl: ${baseUrl}, 解析为: ${baseDir}`);

        for (const [alias, targets] of Object.entries(tsconfig.compilerOptions.paths)) {
          // 处理 paths 中的通配符模式 (如 "@/*" => ["src/*"])
          const normalizedAlias = alias.replace(/\/\*$/, ''); // e.g., '@'

          this.aliases[normalizedAlias] = (targets as string[]).map((target) => {
            const targetPath = target.replace(/\/\*$/, ''); // e.g., 'src'

            // 总是解析为绝对路径
            const absoluteTargetPath = path.resolve(baseDir, targetPath);
            logger.verbose(
              `Mapping alias '${normalizedAlias}' target '${target}' -> '${absoluteTargetPath}'`,
            );
            return absoluteTargetPath;
          });
        }

        logger.debug('从tsconfig.json加载的别名:', this.aliases);
        return Object.keys(this.aliases).length > 0;
      }
    } catch (error) {
      logger.warn(`无法解析 tsconfig.json: ${(error as Error).message}`);
    }

    return false;
  }

  /**
   * 从自定义配置文件加载路径别名
   * @returns 是否成功加载到别名配置
   */
  private loadFromCustomConfig(): boolean {
    // 尝试从mp-lens.config.json加载配置
    const configPath = path.join(this.projectRoot, 'mp-lens.config.json');
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
      logger.warn(`Failed to parse mp-lens.config.json: ${(error as Error).message}`);
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
