import chalk from 'chalk';
import { analyzeProject } from '../analyzer/analyzer';
import { GraphNode } from '../analyzer/project-structure';
import { CmdDiffOptions, GlobalCliOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';
import { HandledError } from '../utils/errors';
import {
  branchOrCommitExists,
  GitSwitchManager,
  isGitRepository,
  isWorkingDirectoryClean,
} from '../utils/git-helper';

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
  // Create a new context for each analysis, as global options might be shared
  // but the project state (due to git checkout) is specific to this call.
  const analysisSpecificCliOptions = { ...cliOptions, project: projectRoot };
  const context = await initializeCommandContext(analysisSpecificCliOptions);

  const { projectStructure, reachableNodeIds } = await analyzeProject(projectRoot, {
    fileTypes: context.fileTypes,
    excludePatterns: context.exclude,
    essentialFiles: context.essentialFilesList,
    verbose: context.verbose,
    verboseLevel: context.verboseLevel,
    miniappRoot: context.miniappRoot,
    appJsonPath: context.appJsonPath,
    appJsonContent: context.appJsonContent,
    includeAssets: context.includeAssets,
  });

  let totalSize = 0;
  const files = new Map<string, number>();

  projectStructure.nodes.forEach((node: GraphNode) => {
    // Only include reachable nodes that are actual files with a size
    if (
      reachableNodeIds.has(node.id) &&
      node.properties?.absolutePath &&
      node.properties?.fileSize !== undefined
    ) {
      // Store path relative to miniappRoot for consistent comparison
      // node.id is already the relative path for file nodes
      files.set(node.id, node.properties.fileSize);
      totalSize += node.properties.fileSize;
    }
  });

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

  const baseRef = cmdOptions.base || 'master';
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

  // --- Compare and Display Results ---
  logger.info(chalk.bold('\n📊 包大小差异对比结果:'));

  const sizeDiff = targetSizes.totalSize - baseSizes.totalSize;
  const filesDiff = targetSizes.totalFiles - baseSizes.totalFiles;

  logger.info(
    `总包大小: ${formatBytes(targetSizes.totalSize)} (较 ${baseRef} ${formatBytes(sizeDiff, true)})`,
  );
  logger.info(
    `总文件数: ${targetSizes.totalFiles} (较 ${baseRef} ${filesDiff > 0 ? '+' : ''}${filesDiff})`,
  );

  logger.info(chalk.bold('📄 文件级别变化:'));

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
}
