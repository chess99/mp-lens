import { formatBytes } from '../utils/dependency-tree-processor';
import styles from './Header.module.css';

interface HeaderProps {
  title: string;
  totalFiles: number;
  totalSize: number;
  unusedFileCount: number;
  onTreeModeClick: () => void;
  onUnusedFilesClick: () => void;
}

export function Header({
  title,
  totalFiles,
  totalSize,
  unusedFileCount,
  onTreeModeClick,
  onUnusedFilesClick,
}: HeaderProps) {
  return (
    <header className={styles.header}>
      <h1>{title || '依赖可视化'}</h1>
      <div className={styles.overviewStats}>
        <div
          className={`${styles.statItem} ${styles.clickable}`}
          title="返回文件树视图"
          onClick={onTreeModeClick}
        >
          <span className={styles.statLabel}>总文件数:</span>
          <span className={styles.statValue}>{totalFiles}</span>
          <span className={styles.statIndicator}>›</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statLabel}>总代码量:</span>
          <span className={styles.statValue}>{formatBytes(totalSize)}</span>
        </div>
        <div
          className={`${styles.statItem} ${styles.clickable}`}
          title="点击查看未使用的文件列表"
          onClick={onUnusedFilesClick}
        >
          <span className={styles.statLabel}>未使用文件:</span>
          <span className={styles.statValue}>{unusedFileCount}</span>
          <span className={styles.statIndicator}>›</span>
        </div>
      </div>
    </header>
  );
}
