import { TreeNodeData } from '../types';

// 格式化字节数为可读格式
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// 颜色生成函数
function generateColors(count: number): string[] {
  const colors = [
    '#4285F4',
    '#EA4335',
    '#FBBC05',
    '#34A853',
    '#FF6D01',
    '#46BDC6',
    '#9C27B0',
    '#673AB7',
  ];

  // 如果需要更多颜色，则循环使用现有颜色
  return Array(count)
    .fill(0)
    .map((_, i) => colors[i % colors.length]);
}

interface StatisticsProps {
  node: TreeNodeData;
}

export function Statistics({ node }: StatisticsProps) {
  const fileTypes = node.properties?.fileTypes || {};
  const fileCount = node.properties?.fileCount || 0;
  const totalSize = node.properties?.totalSize || 0;

  // 准备文件类型数据用于图表
  const fileTypeLabels = Object.keys(fileTypes);
  const fileTypeValues = Object.values(fileTypes);
  const fileTypeColors = generateColors(fileTypeLabels.length);

  return (
    <div className="statistics-container">
      <div className="statistics-summary">
        <div className="summary-item">
          <span className="summary-label">总文件数:</span>
          <span className="summary-value">{fileCount}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">总代码量:</span>
          <span className="summary-value">{formatBytes(totalSize)}</span>
        </div>
      </div>

      {Object.keys(fileTypes).length > 0 && (
        <div className="charts-container">
          <div className="chart-wrapper">
            <h3>文件类型分布</h3>
            <div id="file-types-chart" className="chart-placeholder">
              <div className="file-types-list">
                {fileTypeLabels.map((type, index) => (
                  <div key={type} className="file-type-row">
                    <span
                      className="file-type-color"
                      style={{ backgroundColor: fileTypeColors[index] }}
                    ></span>
                    <span className="file-type-name">.{type}</span>
                    <span className="file-type-value">{fileTypeValues[index]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="chart-wrapper">
            <h3>体积分布</h3>
            <div id="size-chart" className="chart-placeholder">
              <div className="placeholder-text">客户端渲染后将显示图表</div>
            </div>
          </div>
        </div>
      )}

      {Object.keys(fileTypes).length === 0 && (
        <div className="no-data">
          <p>没有足够的数据生成统计信息。</p>
        </div>
      )}
    </div>
  );
}
