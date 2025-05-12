import styles from './UnusedFilesView.module.css';

interface UnusedFilesViewProps {
  unusedFiles: string[];
  onReturnToTree: () => void;
}

export function UnusedFilesView({ unusedFiles, onReturnToTree }: UnusedFilesViewProps) {
  return (
    <div className={styles.unusedFilesView}>
      <div className={styles.unusedFilesViewHeader}>
        <h2>未使用文件列表</h2>
        <button onClick={onReturnToTree} className={styles.returnToTreeButton}>
          &larr; 返回文件树视图
        </button>
      </div>

      <div className={styles.analysisContent}>
        {unusedFiles.length > 0 && (
          <div className={styles.detailsCard}>
            <div className={styles.simpleListContainer}>
              <ul className={styles.simpleList}>
                {unusedFiles.map((filePath) => (
                  <li key={filePath} title={filePath}>
                    {filePath}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {unusedFiles.length === 0 && (
          <div className={styles.detailsCard}>
            <p>没有发现未使用的文件。</p>
          </div>
        )}

        {/* Add other analysis cards here in the future */}
      </div>
    </div>
  );
}
