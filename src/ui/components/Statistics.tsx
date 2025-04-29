import { ChartData, TreeNodeData } from '../types';

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
  const sizeByType = node.properties?.sizeByType || {};
  const fileCount = node.properties?.fileCount || 0;
  const totalSize = node.properties?.totalSize || 0;

  // File types count chart data (pie)
  const fileTypeCountLabels = Object.keys(fileTypes);
  const fileTypeCountValues = Object.values(fileTypes);
  const fileTypeCountColors = generateColors(fileTypeCountLabels.length);
  const fileTypesCountChartData: ChartData = {
    labels: fileTypeCountLabels.map((l) => `.${l}`),
    values: fileTypeCountValues,
    colors: fileTypeCountColors,
  };

  // File types size chart data (bar)
  // Sort by size descending for better visualization
  const sortedSizeByType = Object.entries(sizeByType).sort(([, sizeA], [, sizeB]) => sizeB - sizeA);
  const fileTypeSizeLabels = sortedSizeByType.map(([ext]) => `.${ext}`);
  const fileTypeSizeValues = sortedSizeByType.map(([, size]) => size);
  // Use consistent colors based on type if possible, or generate new ones
  const fileTypeSizeColors = fileTypeSizeLabels.map((label) => {
    const index = fileTypeCountLabels.indexOf(label.substring(1)); // Find original index
    return index !== -1 ? fileTypeCountColors[index] : '#cccccc'; // Use original color or gray
  });
  const fileTypesSizeChartData: ChartData = {
    labels: fileTypeSizeLabels,
    values: fileTypeSizeValues,
    colors: fileTypeSizeColors, // Use mapped colors
  };

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
            <h3>文件类型分布 (数量)</h3>
            <canvas
              id="file-types-count-chart"
              data-chart-type="pie"
              data-chart-data={JSON.stringify(fileTypesCountChartData)}
              width="300"
              height="300"
              className="chart-canvas"
            ></canvas>
            <div className="file-types-list">
              {fileTypeCountLabels.map((type, index) => (
                <div key={type} className="file-type-row">
                  <span
                    className="file-type-color"
                    style={{ backgroundColor: fileTypeCountColors[index] }}
                  ></span>
                  <span className="file-type-name">.{type}</span>
                  <span className="file-type-value">{fileTypeCountValues[index]} files</span>
                </div>
              ))}
            </div>
          </div>

          <div className="chart-wrapper">
            <h3>文件类型分布 (体积)</h3>
            <canvas
              id="file-types-size-chart"
              data-chart-type="bar"
              data-chart-data={JSON.stringify(fileTypesSizeChartData)}
              width="300"
              height="300"
              className="chart-canvas"
            ></canvas>
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
