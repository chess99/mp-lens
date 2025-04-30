interface ProjectOverviewProps {
  unusedFiles: string[];
  onBack: () => void;
}

export function ProjectOverview({ unusedFiles, onBack }: ProjectOverviewProps) {
  return (
    <div className="project-overview">
      <div className="project-overview-header">
        <h2>项目概览</h2>
        <button onClick={onBack} className="back-button">
          &larr; 返回节点视图
        </button>
      </div>

      {unusedFiles.length > 0 && (
        <div className="details-card unused-files-card">
          <h3 className="card-title">未使用文件列表 ({unusedFiles.length})</h3>
          <div className="simple-list-container">
            <ul className="simple-list">
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
        <div className="details-card">
          <p>没有发现未使用的文件。</p>
        </div>
      )}
    </div>
  );
}
