import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { GlobalCliOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';

/**
 * Finds potential entry points for a Mini Program project.
 * Includes app, pages, subPackages, and components found via usingComponents.
 *
 * @param projectRoot The absolute path to the root of the entire project.
 * @returns A promise resolving to an array of entry file paths relative to the projectRoot.
 */
export async function findMiniProgramEntryPoints(projectRoot: string): Promise<string[]> {
  logger.debug('[EntryFinder] 使用 analyzeProject 结果生成入口点（递归）。');
  logger.debug(`[EntryFinder] Project Root: ${projectRoot}`);

  // 通过统一的初始化流程获取 appJson、别名、排除规则等上下文
  const cliOptions: GlobalCliOptions = { project: projectRoot };
  const context = await initializeCommandContext(cliOptions);

  if (!context.appJsonContent || Object.keys(context.appJsonContent).length === 0) {
    logger.warn('[EntryFinder] 未找到有效的 app.json 内容，返回空入口列表。');
    return [];
  }

  try {
    const { projectStructure, reachableNodeIds } = await analyzeProject(projectRoot, {
      ...context,
      includeAssets: false,
    });
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
