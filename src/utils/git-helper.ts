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
    // Sanitize ref to prevent command injection
    const sanitizedRef = ref.replace(/[;&|`$()]/g, '');
    if (sanitizedRef !== ref) {
      logger.warn(`Git ref contains potentially dangerous characters and was sanitized: ${ref} -> ${sanitizedRef}`);
    }
    
    execSync(`git rev-parse --verify "${sanitizedRef}"`, {
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
    // Sanitize ref to prevent command injection
    const sanitizedRef = ref.replace(/[;&|`$()]/g, '');
    if (sanitizedRef !== ref) {
      logger.warn(`Git ref contains potentially dangerous characters and was sanitized: ${ref} -> ${sanitizedRef}`);
    }
    
    logger.info(`正在切换到: ${sanitizedRef}`);
    execSync(`git checkout "${sanitizedRef}"`, {
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
