import * as fs from 'fs';
import * as glob from 'glob';
import AhoCorasick from 'modern-ahocorasick';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { initializeCommandContext } from './command-init';

/**
 * 检测项目中未被使用的资源文件（如图片）。
 *
 * 检测方式：
 * - 首先通过 analyzeProject 获取所有可达（reachable）的源文件节点。
 * - 在小程序根目录下（miniappRoot）glob 查找所有资源文件（如 png/jpg/svg 等）。
 * - 仅用资源文件名（不含路径）作为关键词，使用 Aho-Corasick 算法批量在所有可达文件内容中做字符串匹配。
 * - 只要资源文件名在任一可达文件内容中出现，即视为"被引用"。否则视为"未被引用"。
 *
 * 局限性：
 * - 仅基于文件名字符串匹配，无法检测路径级别的精确引用。
 * - 无法检测动态拼接、变量引用、base64、网络资源等间接用法。
 * - 可能存在误报（如同名但非资源用途的字符串）或漏报（如资源名被拼接、加密、压缩等）。
 * - 仅检测源码可达文件，不含 node_modules、构建产物等。
 *
 * 适合用于大批量资源初步清理，结果建议人工复核。
 *
 * @param projectRoot 项目根目录（绝对路径）
 * @returns 未被引用的资源文件绝对路径数组
 */
export async function findUnusedAssets(projectRoot: string): Promise<string[]> {
  // 1. 初始化上下文，获取 miniappRoot、fileTypes、exclude 等
  const context = await initializeCommandContext({ project: projectRoot });
  const {
    miniappRoot,
    fileTypes,
    excludePatterns,
    appJsonPath,
    appJsonContent,
    essentialFiles,
    includeAssets,
  } = context;

  // 2. 组装 AnalyzerOptions，确保 fileTypes 有默认值
  const defaultFileTypes = ['js', 'ts', 'wxml', 'wxss', 'json'];
  const options = {
    miniappRoot,
    fileTypes: Array.isArray(fileTypes) && fileTypes.length > 0 ? fileTypes : defaultFileTypes,
    excludePatterns,
    appJsonPath,
    appJsonContent,
    essentialFiles,
    includeAssets,
  };

  // 3. 分析项目，获取 reachable 文件节点
  const { projectStructure, reachableNodeIds } = await analyzeProject(projectRoot, options);
  const reachableFiles = projectStructure.nodes
    .filter((n) => n.type === 'Module' && n.properties?.absolutePath && reachableNodeIds.has(n.id))
    .map((n) => n.properties!.absolutePath as string)
    .filter(fs.existsSync);

  // 4. 获取所有资源文件
  const assetGlobPattern = '**/*.{png,jpg,jpeg,gif,svg,webp}';
  const assetFiles = glob.sync(assetGlobPattern, { cwd: miniappRoot, absolute: true });
  if (assetFiles.length === 0) return [];
  const assetNames = assetFiles.map((f) => path.basename(f));

  // 5. 构建 Aho-Corasick 自动机
  const ac = new AhoCorasick(assetNames);

  // 6. 读取所有 reachable 文件内容，并用自动机查找
  const usedAssets = new Set<string>();
  for (const file of reachableFiles) {
    let content: string;
    try {
      content = await fs.promises.readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const [, foundArr] of ac.search(content)) {
      for (const found of foundArr) {
        usedAssets.add(found);
      }
    }
  }

  // 7. 输出未被引用的资源
  const unusedAssets = assetFiles.filter((f) => !usedAssets.has(path.basename(f)));
  return unusedAssets;
}
