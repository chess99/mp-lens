import * as fs from 'fs';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { AnalyzerOptions } from '../types/command-options';
import { MiniProgramAppJson } from '../types/miniprogram';
import { loadMergedAliases } from '../utils/alias-loader';
import { logger } from '../utils/debug-logger';

/**
 * Finds potential entry points for a Mini Program project.
 * Includes app, pages, subPackages, and components found via usingComponents.
 *
 * @param projectRoot The absolute path to the root of the entire project.
 * @param miniappRoot The absolute path to the root of the miniapp source code (where app.json resides).
 * @returns A promise resolving to an array of entry file paths relative to the projectRoot.
 */
export async function findMiniProgramEntryPoints(
  projectRoot: string,
  miniappRoot: string,
): Promise<string[]> {
  logger.debug('[EntryFinder] 使用 analyzeProject 结果生成入口点（递归）。');
  logger.debug(`[EntryFinder] Project Root: ${projectRoot}`);
  logger.debug(`[EntryFinder] MiniApp Root: ${miniappRoot}`);

  const appJsonPath = path.resolve(miniappRoot, 'app.json');
  if (!fs.existsSync(appJsonPath)) {
    logger.warn('[EntryFinder] 未找到 app.json，返回空入口列表。');
    return [];
  }

  let appJsonContent: MiniProgramAppJson;
  try {
    appJsonContent = JSON.parse(fs.readFileSync(appJsonPath, 'utf-8')) as MiniProgramAppJson;
  } catch (e) {
    logger.error(`[EntryFinder] 读取或解析 app.json 失败: ${(e as Error).message}`);
    return [];
  }

  const aliases = await loadMergedAliases(projectRoot);
  const options: AnalyzerOptions = {
    miniappRoot,
    appJsonPath,
    appJsonContent,
    aliases,
    fileTypes: ['js', 'ts', 'wxml', 'wxss', 'json'],
    excludePatterns: [],
    includeAssets: false,
  };

  try {
    const { projectStructure, reachableNodeIds } = await analyzeProject(projectRoot, options);
    const nodeMap = new Map(projectStructure.nodes.map((n) => [n.id, n]));
    const entries = new Set<string>();
    for (const id of reachableNodeIds) {
      const node = nodeMap.get(id);
      if (node && node.type === 'Module' && node.properties?.absolutePath) {
        entries.add(path.relative(projectRoot, node.properties.absolutePath as string));
      }
    }
    logger.info(`[EntryFinder] 依据可达节点生成入口文件数: ${entries.size}`);
    return Array.from(entries);
  } catch (e) {
    logger.error(`[EntryFinder] analyzeProject 执行失败: ${(e as Error).message}`);
    return [];
  }
}
