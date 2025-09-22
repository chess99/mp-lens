import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from './config-loader';
import { logger } from './debug-logger';

/**
 * 从 tsconfig.json 读取并解析 paths 别名，返回绝对路径数组
 */
export function loadAliasesFromTsConfig(projectRoot: string): { [key: string]: string[] } {
  try {
    const fsPath = path.join(projectRoot, 'tsconfig.json');
    if (!fs.existsSync(fsPath)) return {};
    const tsconfig = JSON.parse(fs.readFileSync(fsPath, 'utf-8')) as {
      compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> };
    };
    if (!tsconfig.compilerOptions || !tsconfig.compilerOptions.paths) return {};

    const tsconfigDir = path.dirname(fsPath);
    const baseUrl = tsconfig.compilerOptions.baseUrl || '.';
    const baseDir = path.resolve(tsconfigDir, baseUrl);

    const result: { [key: string]: string[] } = {};
    for (const [alias, targets] of Object.entries(tsconfig.compilerOptions.paths)) {
      const normalizedAlias = alias.replace(/\/\*$/, '');
      result[normalizedAlias] = (targets as string[]).map((t) => {
        const targetPath = (t as string).replace(/\/\*$/, '');
        return path.resolve(baseDir, targetPath);
      });
    }
    return result;
  } catch (e) {
    logger.warn(`无法解析 tsconfig.json 以加载别名: ${(e as Error).message}`);
    return {};
  }
}

/**
 * 合并 tsconfig 与 mp-lens.config.* 的 aliases 配置，tsconfig 优先级较低
 */
export async function loadMergedAliases(
  projectRoot: string,
): Promise<{ [key: string]: string | string[] }> {
  const fileConfig = await ConfigLoader.loadConfig(undefined, projectRoot);
  const aliasesFromTsConfig = loadAliasesFromTsConfig(projectRoot);
  const merged: { [key: string]: string | string[] } = {
    ...aliasesFromTsConfig,
    ...(fileConfig?.aliases || {}),
  };
  if (Object.keys(merged).length > 0) {
    logger.debug('已加载并合并别名配置:', merged);
  }
  return merged;
}
