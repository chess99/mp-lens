import { NodeDetailsProps } from '../types';

// 格式化字节数为可读格式
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

export function NodeDetails({ node }: NodeDetailsProps) {
  const fileCount = node.properties?.fileCount || 0;
  const totalSize = node.properties?.totalSize || 0;
  const fileTypes = node.properties?.fileTypes || {};
  const parentId = node.parent;
  const childrenIds = node.children?.map((c) => c.id) || [];

  // 构建文件类型信息
  const fileTypeInfo = Object.entries(fileTypes).map(([ext, count]) => (
    <div key={ext} className="file-type-item">
      <span className="file-type-ext">.{ext}&nbsp;</span>
      <span className="file-type-count">{count} 文件</span>
    </div>
  ));

  return (
    <div className="node-details">
      <div className="details-header">
        <h2>{node.label || node.id}</h2>
        <div className="node-type">{node.type}</div>
      </div>

      <div className="details-section">
        <h3>基本信息</h3>
        <div className="details-info">
          <div className="info-item">
            <span className="info-label">ID:</span>
            <span className="info-value" style={{ wordBreak: 'break-all' }}>
              {node.id}
            </span>
          </div>
          {parentId && (
            <div className="info-item">
              <span className="info-label">Parent ID:</span>
              <span className="info-value" style={{ wordBreak: 'break-all' }}>
                {parentId}
              </span>
            </div>
          )}
          {fileCount > 0 && (
            <div className="info-item">
              <span className="info-label">文件数:</span>
              <span className="info-value">{fileCount}</span>
            </div>
          )}
          {totalSize > 0 && (
            <div className="info-item">
              <span className="info-label">总大小:</span>
              <span className="info-value">{formatBytes(totalSize)}</span>
            </div>
          )}
        </div>
      </div>

      {childrenIds.length > 0 && (
        <div className="details-section">
          <h3>Children IDs ({childrenIds.length})</h3>
          <ul className="details-list">
            {childrenIds.map((id) => (
              <li key={id} style={{ wordBreak: 'break-all' }}>
                {id}
              </li>
            ))}
          </ul>
        </div>
      )}

      {fileTypeInfo.length > 0 && (
        <div className="details-section">
          <h3>文件类型</h3>
          <div className="file-types-container">{fileTypeInfo}</div>
        </div>
      )}

      {node.properties &&
        Object.keys(node.properties).filter(
          (key) => !['fileCount', 'totalSize', 'fileTypes'].includes(key),
        ).length > 0 && (
          <div className="details-section">
            <h3>其它属性</h3>
            <div className="details-properties">
              {Object.entries(node.properties)
                .filter(([key]) => !['fileCount', 'totalSize', 'fileTypes'].includes(key))
                .map(([key, value]) => (
                  <div key={key} className="property-item">
                    <span className="property-key">{key}:</span>
                    <span className="property-value">
                      {key === 'sizeByType' && typeof value === 'object' && value !== null ? (
                        <ul style={{ margin: 0, paddingLeft: '15px' }}>
                          {Object.entries(value).map(([type, size]) => (
                            <li key={type}>
                              {type}: {formatBytes(size as number)}
                            </li>
                          ))}
                        </ul>
                      ) : typeof value === 'object' ? (
                        JSON.stringify(value)
                      ) : (
                        String(value)
                      )}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        )}
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
