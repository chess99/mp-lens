import { useMemo } from 'preact/hooks';
import { NodeDetailsProps } from '../types';
import { formatBytes } from '../utils/dependency-tree-processor'; // UPDATED

// Assign consistent colors to file types
function getFileTypeColor(fileType: string): string {
  // Map common file extensions to specific colors
  const fileTypeColorMap: Record<string, string> = {
    // Code files
    js: '#F7DF1E', // JavaScript - yellow
    ts: '#3178C6', // TypeScript - blue
    jsx: '#61DAFB', // React - light blue
    tsx: '#61DAFB', // React TypeScript - light blue
    vue: '#42B883', // Vue - green

    // Styles
    css: '#264DE4', // CSS - blue
    scss: '#CD6799', // SCSS - pink
    less: '#1D365D', // LESS - dark blue

    // Markup
    html: '#E44D26', // HTML - orange
    xml: '#F37C20', // XML - orange
    json: '#1C59A5', // JSON - blue

    // Images
    png: '#A6D659', // green
    jpg: '#E15241', // red
    jpeg: '#E15241', // red
    gif: '#9D67F8', // purple
    svg: '#FFB13B', // yellow-orange

    // Documents
    md: '#083FA1', // Markdown - blue
    pdf: '#F40F02', // PDF - red

    // Config files
    yml: '#7A348F', // YAML - purple
    yaml: '#7A348F', // YAML - purple
    toml: '#9C4221', // TOML - brown

    // Misc
    wxml: '#09BB07', // WeChat Mini Program - green
    wxss: '#09BB07', // WeChat Mini Program - green
    wxs: '#09BB07', // WeChat Mini Program - green

    // Default
    txt: '#A9A9A9', // Text - gray
  };

  return fileTypeColorMap[fileType] || '#4285F4'; // Default to blue
}

export function NodeDetails({ node }: NodeDetailsProps) {
  const fileCount = node.properties?.fileCount || 0;
  const totalSize = node.properties?.totalSize || 0;
  const fileTypes = node.properties?.fileTypes || {};
  const sizeByType = node.properties?.sizeByType || {};
  const childrenIds = node.children?.map((c) => c.id) || [];
  const displayPath = node.properties?.basePath || node.properties?.path;

  // Calculate top file types by count
  const topFileTypes = useMemo(() => {
    return Object.entries(fileTypes).sort(([, countA], [, countB]) => countB - countA);
  }, [fileTypes]);

  // Calculate file type size distribution percentages
  const sizeDistribution = useMemo(() => {
    if (totalSize === 0) return [];

    return Object.entries(sizeByType)
      .sort(([, sizeA], [, sizeB]) => sizeB - sizeA)
      .map(([ext, size]) => ({
        ext,
        size: size as number,
        percentage: Math.round(((size as number) / totalSize) * 100),
      }));
  }, [sizeByType, totalSize]);

  // Get file type color by extension
  const getColorForType = (ext: string): string => {
    return getFileTypeColor(ext);
  };

  return (
    <div className="node-details">
      {/* Header with node name, type, and displayPath */}
      <div className="details-card details-header">
        <div className="detail-title-area">
          <div className="node-type-badge">{node.type}</div>
          <h2 className="node-title">{node.label || node.id}</h2>
          {displayPath && <div className="node-path">{displayPath}</div>}
        </div>
        <div className="node-stats">
          {fileCount > 0 && (
            <div className="node-stat-item">
              <span className="stat-value">{fileCount}</span>
              <span className="stat-label">文件</span>
            </div>
          )}
          {totalSize > 0 && (
            <div className="node-stat-item">
              <span className="stat-value">{formatBytes(totalSize)}</span>
              <span className="stat-label">总大小</span>
            </div>
          )}
        </div>
      </div>

      <div className="details-grid">
        {/* File Type Distribution Card - Compacted */}
        {topFileTypes.length > 0 && (
          <div className="details-card file-type-card">
            <h3 className="card-title">文件类型分布</h3>
            <div className="distribution-list file-type-list scrollable-list">
              {topFileTypes.map(([ext, count]) => {
                const barWidth = (count / Math.max(1, ...topFileTypes.map(([, c]) => c))) * 100;
                return (
                  <div key={ext} className="distribution-item file-type-item">
                    <span className="dist-label">.{ext}</span>
                    <div className="dist-bar-container">
                      <div
                        className="dist-bar file-type-bar"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: getColorForType(ext),
                        }}
                      ></div>
                    </div>
                    <span className="dist-value">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Size Distribution Card - Compacted */}
        {sizeDistribution.length > 0 && (
          <div className="details-card size-dist-card">
            <h3 className="card-title">体积分布</h3>
            <div className="distribution-list size-dist-list scrollable-list">
              {sizeDistribution.map((item) => (
                <div key={item.ext} className="distribution-item size-dist-item">
                  <span className="dist-label">.{item.ext}</span>
                  <div className="dist-bar-container">
                    <div
                      className="dist-bar size-bar"
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: getColorForType(item.ext),
                      }}
                    ></div>
                  </div>
                  <span className="dist-value">{item.percentage}%</span>
                  <span className="dist-sub-value">({formatBytes(item.size)})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Children List Card - Spans full width */}
        {childrenIds.length > 0 && (
          <div className="details-card children-card">
            <h3 className="card-title">子节点 ({childrenIds.length})</h3>
            <div className="children-table">
              <div className="child-header">
                <div className="child-type-col">类型</div>
                <div className="child-name-col">名称</div>
                <div className="child-files-col">文件数</div>
                <div className="child-size-col">大小</div>
              </div>
              <div className="children-rows">
                {node.children?.map((child) => (
                  <div key={child.id} className="child-row">
                    <div className="child-type-col">
                      <span className="child-type-badge">{child.type}</span>
                    </div>
                    <div className="child-name-col" title={child.id}>
                      {child.label || child.id}
                    </div>
                    <div className="child-files-col">
                      {child.properties?.fileCount ? `${child.properties.fileCount} 文件` : '-'}
                    </div>
                    <div className="child-size-col">
                      {child.properties?.totalSize ? formatBytes(child.properties.totalSize) : '-'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* Add to index.css or component style
.details-list {
  list-style: none;
  padding-left: 15px;
  font-size: 0.9em;
  max-height: 150px; 
  overflow-y: auto;
}
.details-list li {
  margin-bottom: 4px;
}
*/
