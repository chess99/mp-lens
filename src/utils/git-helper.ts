import { execSync } from 'child_process';
import { logger } from './debug-logger';
import { HandledError } from './errors';

/**
 * 检查当前是否在 Git 仓库中
 */
export function isGitRepository(projectRoot: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: projectRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取默认分支名。
 * 优先解析远程 origin 的 HEAD 指向；若不可用，则在远程分支中优先选择 main、其次 master；
 * 若仍不可用，回退到当前分支名。
 */
export function getDefaultBranch(projectRoot: string): string {
  // 1) 尝试解析 origin/HEAD -> origin/<branch>
  try {
    const symRef = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();
    // 形如: refs/remotes/origin/main
    const match = symRef.match(/refs\/remotes\/origin\/(.+)$/);
    if (match && match[1]) {
      return match[1];
    }
  } catch (error) {
    // 忽略，继续下一种策略
    logger.debug(
      `解析 origin/HEAD 失败，尝试从远程分支列表推断默认分支: ${(error as Error).message}`,
    );
  }

  // 2) 从远程分支列表中选择常见默认分支
  try {
    const remoteBranchesRaw = execSync('git branch -r', {
      cwd: projectRoot,
      encoding: 'utf8',
    });
    const remoteBranches = remoteBranchesRaw
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    const hasOriginMain = remoteBranches.some((b) => /origin\/main$/.test(b));
    if (hasOriginMain) return 'main';
    const hasOriginMaster = remoteBranches.some((b) => /origin\/master$/.test(b));
    if (hasOriginMaster) return 'master';
  } catch (error) {
    logger.debug(`获取远程分支失败: ${(error as Error).message}`);
  }

  // 3) 退化为当前分支（本地环境下依然可用）
  try {
    return getCurrentBranch(projectRoot);
  } catch (error) {
    // 极端情况下再回退到常见默认值
    logger.warn(`无法获取当前分支，回退到默认 'master': ${(error as Error).message}`);
    return 'master';
  }
}

/**
 * 检查工作区是否干净（没有未提交的更改）
 */
export function isWorkingDirectoryClean(projectRoot: string): boolean {
  try {
    const output = execSync('git status --porcelain', {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();
    return output === '';
  } catch (error) {
    logger.warn(`检查工作区状态失败: ${(error as Error).message}`);
    return false;
  }
}

/**
 * 获取当前分支名
 */
function getCurrentBranch(projectRoot: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: projectRoot,
      encoding: 'utf8',
    }).trim();
  } catch (error) {
    throw new HandledError(`获取当前分支失败: ${(error as Error).message}`);
  }
}

/**
 * 检查分支或提交是否存在
 */
export function branchOrCommitExists(projectRoot: string, ref: string): boolean {
  try {
    execSync(`git rev-parse --verify ${ref}`, {
      cwd: projectRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * 切换到指定分支或提交
 */
function checkoutBranch(projectRoot: string, ref: string): void {
  try {
    logger.info(`正在切换到: ${ref}`);
    execSync(`git checkout ${ref}`, {
      cwd: projectRoot,
      stdio: 'inherit',
    });
  } catch (error) {
    throw new HandledError(`切换分支失败: ${(error as Error).message}`);
  }
}

/**
 * Git 切换管理器，用于安全地切换分支并在完成后恢复
 */
export class GitSwitchManager {
  private projectRoot: string;
  private originalBranch: string;
  private currentBranchName: string; // Tracks the branch currently checked out by the manager
  private hasSwitched: boolean = false;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.originalBranch = getCurrentBranch(projectRoot);
    this.currentBranchName = this.originalBranch;
  }

  /**
   * 获取原始分支名
   */
  getOriginalBranch(): string {
    return this.originalBranch;
  }

  /**
   * 获取当前 GitSwitchManager 检出的分支名
   */
  getCurrentBranch(): string {
    return this.currentBranchName;
  }

  /**
   * 切换到目标分支或提交
   */
  switchTo(target: string): void {
    if (
      target === this.currentBranchName ||
      (target === 'HEAD' && this.currentBranchName === this.originalBranch && !this.hasSwitched)
    ) {
      logger.info(`目标 ${target} 与当前分支 ${this.currentBranchName} 相同，无需切换`);
      return;
    }

    if (!branchOrCommitExists(this.projectRoot, target)) {
      throw new HandledError(`分支或提交 '${target}' 不存在`);
    }

    checkoutBranch(this.projectRoot, target);
    this.currentBranchName = target; // Update current branch after successful checkout
    this.hasSwitched = true;
  }

  /**
   * 恢复到原始分支
   */
  restore(): void {
    if (this.hasSwitched && this.currentBranchName !== this.originalBranch) {
      logger.info(`恢复到原始分支: ${this.originalBranch}`);
      checkoutBranch(this.projectRoot, this.originalBranch);
      this.currentBranchName = this.originalBranch;
      this.hasSwitched = false; // Reset switch status after restoring
    }
  }
}
