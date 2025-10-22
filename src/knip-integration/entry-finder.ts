import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { GlobalCliOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';
import { COMPONENT_DEFINITION_FILE_TYPES } from '../utils/filetypes';

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
    const { projectStructure } = await analyzeProject(projectRoot, {
      ...context,
      includeAssets: false,
    });
    const nodeMap = new Map(projectStructure.nodes.map((n) => [n.id, n]));
    const allowedExts = new Set(COMPONENT_DEFINITION_FILE_TYPES);
    const entries = new Set<string>();

    // 1) 从非 Module（App/Package/Page/Component）到 Module 的直接结构链接
    for (const link of projectStructure.links) {
      if (link.type !== 'Structure') continue;
      const source = nodeMap.get(link.source);
      const target = nodeMap.get(link.target);
      if (!source || !target) continue;
      if (source.type !== 'Module' && target.type === 'Module' && target.properties?.absolutePath) {
        const abs = target.properties.absolutePath as string;
        const ext = path.extname(abs).toLowerCase().slice(1);
        if (allowedExts.has(ext)) {
          entries.add(path.relative(projectRoot, abs));
        }
      }
    }

    // 2) essentialFiles 直接加入（来自初始化上下文）
    if (Array.isArray(context.essentialFiles)) {
      for (const abs of context.essentialFiles) {
        const ext = path.extname(abs).toLowerCase().slice(1);
        if (allowedExts.has(ext)) {
          entries.add(path.relative(projectRoot, abs));
        }
      }
    }

    logger.info(`[EntryFinder] 基于第一层结构关联与必要文件生成入口文件数: ${entries.size}`);
    return Array.from(entries);
  } catch (e) {
    logger.error(`[EntryFinder] analyzeProject 执行失败: ${(e as Error).message}`);
    return [];
  }
}
