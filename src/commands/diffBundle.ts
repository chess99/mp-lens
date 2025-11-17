import chalk from 'chalk';
import * as fs from 'fs';
import { sync as globSync } from 'glob';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer.js';
import { GraphNode } from '../analyzer/project-structure.js';
import { CmdDiffOptions, GlobalCliOptions } from '../types/command-options.js';
import { initializeCommandContext } from '../utils/command-init.js';
import { logger } from '../utils/debug-logger.js';
import { HandledError } from '../utils/errors.js';
import { IMAGE_FILE_TYPES } from '../utils/filetypes.js';
import {
  branchOrCommitExists,
  getDefaultBranch,
  GitSwitchManager,
  isGitRepository,
  isWorkingDirectoryClean,
} from '../utils/git-helper.js';

interface PackageAnalysisResult {
  totalSize: number;
  totalFiles: number;
  files: Map<string, number>; // Map of relative file path to size
}

function formatBytes(bytes: number, includeSign = false): string {
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  if (Math.abs(bytes) < 1e-9) {
    // Treat as zero
    return includeSign ? '+0 Bytes' : '0 Bytes';
  }

  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const value = parseFloat((bytes / Math.pow(k, i)).toFixed(2));

  let prefix = '';
  if (includeSign) {
    if (value > 0) {
      prefix = '+';
    }
    // Negative sign is part of 'value' if bytes is negative
  }
  return `${prefix}${value} ${sizes[i]}`;
}

async function getProjectPackageSizes(
  cliOptions: GlobalCliOptions,
  projectRoot: string, // Pass projectRoot explicitly for clarity with git operations
): Promise<PackageAnalysisResult> {
  const analysisSpecificCliOptions = { ...cliOptions, project: projectRoot };
  const context = await initializeCommandContext(analysisSpecificCliOptions);

  const files = new Map<string, number>();
  let totalSize = 0;

  // 1. Analyze assets (images) using glob
  if (context.miniappRoot) {
    const imagePattern = `**/*.{${IMAGE_FILE_TYPES.join(',')}}`;
    logger.debug(`开始使用glob模式扫描图片资源: ${imagePattern} 于目录: ${context.miniappRoot}`);
    try {
      const assetFiles = globSync(imagePattern, {
        cwd: context.miniappRoot,
        nodir: true,
        absolute: false, // Get paths relative to cwd
      });

      logger.debug(`Glob扫描到 ${assetFiles.length} 个潜在图片资源文件。`);
      for (const relativeAssetPath of assetFiles) {
        const absoluteAssetPath = path.join(context.miniappRoot, relativeAssetPath);
        try {
          const stats = fs.statSync(absoluteAssetPath);
          if (stats.isFile()) {
            files.set(relativeAssetPath, stats.size);
          }
        } catch (err) {
          logger.warn(
            `无法获取资源文件 ${absoluteAssetPath} 的状态: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (globError) {
      logger.error(
        `扫描图片资源时发生错误: ${globError instanceof Error ? globError.message : String(globError)}`,
      );
    }
  } else {
    logger.warn('miniappRoot 未定义，跳过图片资源扫描。');
  }

  // 2. Analyze project structure (non-assets and non-globbed assets)
  const { projectStructure, reachableNodeIds } = await analyzeProject(projectRoot, context);

  projectStructure.nodes.forEach((node: GraphNode) => {
    if (
      reachableNodeIds.has(node.id) &&
      node.properties?.absolutePath && // Ensure it's a file node
      node.properties?.fileSize !== undefined
    ) {
      const nodePath = node.id; // node.id is relative path for file nodes
      // If this path is NOT already in our 'files' map (i.e., it wasn't added by the asset glob scan),
      // then add it from analyzeProject. This prioritizes glob-scanned assets.
      if (!files.has(nodePath)) {
        files.set(nodePath, node.properties.fileSize);
      }
    }
  });

  // 3. Calculate total size and file count from the 'files' map
  for (const size of files.values()) {
    totalSize += size;
  }

  return {
    totalSize,
    totalFiles: files.size,
    files,
  };
}

export async function diffBundle(
  cliOptions: GlobalCliOptions,
  cmdOptions: CmdDiffOptions,
): Promise<void> {
  logger.info('开始分析包大小变化...');
  const projectRoot = cliOptions.project;

  if (!isGitRepository(projectRoot)) {
    throw new HandledError('当前目录不是一个 Git 仓库。请在 Git 仓库内运行此命令。');
  }

  const baseRef = cmdOptions.base || getDefaultBranch(projectRoot);
  const targetRef = cmdOptions.target || 'HEAD';

  logger.info(`对比基准 (Base): ${baseRef}`);
  logger.info(`对比目标 (Target): ${targetRef}`);

  let baseSizes: PackageAnalysisResult;
  let targetSizes: PackageAnalysisResult;

  const gitManager = new GitSwitchManager(projectRoot);

  try {
    // --- Analyze Target ---
    if (targetRef !== 'HEAD' && targetRef !== gitManager.getOriginalBranch()) {
      if (!isWorkingDirectoryClean(projectRoot)) {
        throw new HandledError('工作区不干净，请提交或暂存更改后再切换到其他提交进行对比。');
      }
      if (!branchOrCommitExists(projectRoot, targetRef)) {
        throw new HandledError(`目标提交或分支 '${targetRef}' 不存在。`);
      }
      logger.info(`准备分析目标: ${targetRef}`);
      gitManager.switchTo(targetRef);
    } else {
      logger.info(`直接分析当前状态作为目标 (${targetRef})`);
    }
    targetSizes = await getProjectPackageSizes(cliOptions, projectRoot);

    // --- Analyze Base ---
    if (baseRef !== gitManager.getCurrentBranch()) {
      if (!isWorkingDirectoryClean(projectRoot)) {
        logger.warn('切换到基准前检测到工作区不干净，这可能导致分析不准确。');
      }
      if (!branchOrCommitExists(projectRoot, baseRef)) {
        throw new HandledError(`基准提交或分支 '${baseRef}' 不存在。`);
      }
      logger.info(`准备分析基准: ${baseRef}`);
      gitManager.switchTo(baseRef);
    }
    baseSizes = await getProjectPackageSizes(cliOptions, projectRoot);
  } finally {
    gitManager.restore();
  }

  // --- Display file-level details first ---
  console.log(chalk.bold('\n📄 文件级别变化明细:'));

  interface FileChange {
    type: 'added' | 'deleted' | 'modified';
    file: string;
    size?: number; // For added/deleted
    oldSize?: number; // For modified
    newSize?: number; // For modified
    impact: number; // Actual difference, oldSize - newSize
  }

  const changes: FileChange[] = [];

  // Find added and modified files
  for (const [file, newSize] of targetSizes.files.entries()) {
    if (baseSizes.files.has(file)) {
      const oldSize = baseSizes.files.get(file)!;
      if (oldSize !== newSize) {
        changes.push({
          type: 'modified',
          file,
          oldSize,
          newSize,
          impact: newSize - oldSize, // Actual difference
        });
      }
    } else {
      changes.push({ type: 'added', file, size: newSize, impact: newSize });
    }
  }

  // Find deleted files
  for (const [file, oldSize] of baseSizes.files.entries()) {
    if (!targetSizes.files.has(file)) {
      changes.push({ type: 'deleted', file, size: oldSize, impact: -oldSize }); // Negative impact
    }
  }

  // Sort changes by impact, descending (largest positive first, largest negative last)
  changes.sort((a, b) => b.impact - a.impact);

  if (changes.length === 0) {
    console.log('  所有文件大小均未发生变化。');
  } else {
    changes.forEach((change) => {
      switch (change.type) {
        case 'added': {
          console.log(chalk.green(`  + ${change.file} (${formatBytes(change.size!)})`));
          break;
        }
        case 'deleted': {
          console.log(chalk.red(`  - ${change.file} (-${formatBytes(change.size!)})`));
          break;
        }
        case 'modified': {
          const diff = change.newSize! - change.oldSize!;
          console.log(
            chalk.yellow(
              `  ~ ${change.file} (${formatBytes(change.oldSize!)} -> ${formatBytes(
                change.newSize!,
              )}, ${formatBytes(diff, true)})`,
            ),
          );
          break;
        }
      }
    });
  }

  // --- Finally, print the summary at the end ---
  const sizeDiff = targetSizes.totalSize - baseSizes.totalSize;
  const filesDiff = targetSizes.totalFiles - baseSizes.totalFiles;

  console.log(chalk.bold('\n📊 包大小差异对比结果:'));
  console.log(chalk.dim(`  基准 (Base): ${baseRef}`));
  console.log(chalk.dim(`  目标 (Target): ${targetRef}\n`));

  console.log(
    `  总包大小: ${formatBytes(baseSizes.totalSize)} -> ${formatBytes(
      targetSizes.totalSize,
    )} (${formatBytes(sizeDiff, true)})`,
  );
  console.log(
    `  总文件数: ${baseSizes.totalFiles} -> ${targetSizes.totalFiles} (${filesDiff > 0 ? '+' : ''}${filesDiff})`,
  );
}
