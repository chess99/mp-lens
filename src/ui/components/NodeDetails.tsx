import { useMemo } from 'preact/hooks';
import type { ProjectStructure } from '../../analyzer/project-structure'; // Import necessary types
import { NodeDetailsProps } from '../types';
import { formatBytes } from '../utils/dependency-tree-processor'; // UPDATED
import styles from './NodeDetails.module.css'; // Import CSS Module

// Update NodeDetailsProps to include fullGraphData and the callback
export interface ExtendedNodeDetailsProps extends NodeDetailsProps {
  fullGraphData: ProjectStructure;
  onChildNodeSelect: (nodeId: string) => void;
}

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

export function NodeDetails({ node, fullGraphData, onChildNodeSelect }: ExtendedNodeDetailsProps) {
  const fileCount = node.properties?.fileCount || 0;
  const totalSize = node.properties?.totalSize || 0;
  const fileTypes = node.properties?.fileTypes || {};
  const sizeByType = node.properties?.sizeByType || {};
  const childrenIds = node.children?.map((c) => c.id) || [];
  const displayPath = node.properties?.basePath || node.properties?.path;

  // Calculate dependency counts for child nodes
  const childDependencyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!node.children || !fullGraphData || !fullGraphData.links) return counts;

    for (const link of fullGraphData.links) {
      counts.set(link.target, (counts.get(link.target) || 0) + 1);
    }
    return counts;
  }, [fullGraphData.links]); // Only depends on all links in the graph

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
    <div className={styles.nodeDetails}>
      {/* Header with node name, type, and displayPath */}
      <div className={`${styles.detailsCard} ${styles.detailsHeader}`}>
        <div className={styles.detailTitleArea}>
          <div className={styles.nodeTypeBadge}>{node.type}</div>
          <h2 className={styles.nodeTitle}>{node.label || node.id}</h2>
          {displayPath && <div className={styles.nodePath}>{displayPath}</div>}
        </div>
        <div className={styles.nodeStats}>
          {fileCount > 0 && (
            <div className={styles.nodeStatItem}>
              <span className={styles.statValue}>{fileCount}</span>
              <span className={styles.statLabel}>文件</span>
            </div>
          )}
          {totalSize > 0 && (
            <div className={styles.nodeStatItem}>
              <span className={styles.statValue}>{formatBytes(totalSize)}</span>
              <span className={styles.statLabel}>总大小</span>
            </div>
          )}
        </div>
      </div>

      <div className={styles.detailsGrid}>
        {/* File Type Distribution Card - Compacted */}
        {topFileTypes.length > 0 && (
          <div className={styles.detailsCard}>
            <h3 className={styles.cardTitle}>文件类型分布</h3>
            <div className={`${styles.distributionList} ${styles.scrollableList}`}>
              {topFileTypes.map(([ext, count]) => {
                const barWidth = (count / Math.max(1, ...topFileTypes.map(([, c]) => c))) * 100;
                return (
                  <div key={ext} className={styles.distributionItem}>
                    <span className={styles.distLabel}>.{ext}</span>
                    <div className={styles.distBarContainer}>
                      <div
                        className={styles.distBar}
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: getColorForType(ext),
                        }}
                      ></div>
                    </div>
                    <span className={styles.distValue}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Size Distribution Card - Compacted */}
        {sizeDistribution.length > 0 && (
          <div className={styles.detailsCard}>
            <h3 className={styles.cardTitle}>体积分布</h3>
            <div className={`${styles.distributionList} ${styles.scrollableList}`}>
              {sizeDistribution.map((item) => (
                <div key={item.ext} className={styles.distributionItem}>
                  <span className={styles.distLabel}>.{item.ext}</span>
                  <div className={styles.distBarContainer}>
                    <div
                      className={styles.distBar}
                      style={{
                        width: `${item.percentage}%`,
                        backgroundColor: getColorForType(item.ext),
                      }}
                    ></div>
                  </div>
                  <span className={styles.distValue}>{item.percentage}%</span>
                  <span className={styles.distSubValue}>({formatBytes(item.size)})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Children List Card - Spans full width */}
        {childrenIds.length > 0 && (
          <div className={`${styles.detailsCard} ${styles.childrenCard}`}>
            <h3 className={styles.cardTitle}>子节点 ({childrenIds.length})</h3>
            <div className={styles.childrenTable}>
              <div className={styles.childHeader}>
                <div className={styles.childTypeCol}>类型</div>
                <div className={styles.childNameCol}>名称</div>
                <div className={styles.childFilesCol}>文件数</div>
                <div className={styles.childSizeCol}>大小</div>
                <div className={styles.childDepCountCol}>被依赖次数</div>
              </div>
              <div className={styles.childrenRows}>
                {node.children?.map((child) => (
                  <div
                    key={child.id}
                    className={`${styles.childRow} ${styles.clickableRow}`}
                    onClick={() => onChildNodeSelect(child.id)}
                    title={`跳转到依赖图: ${child.label || child.id}`}
                  >
                    <div className={styles.childTypeCol}>
                      <span className={styles.childTypeBadge}>{child.type}</span>
                    </div>
                    <div className={styles.childNameCol} title={child.id}>
                      {child.label || child.id}
                    </div>
                    <div className={styles.childFilesCol}>
                      {child.properties?.fileCount ? `${child.properties.fileCount} 文件` : '-'}
                    </div>
                    <div className={styles.childSizeCol}>
                      {child.properties?.totalSize ? formatBytes(child.properties.totalSize) : '-'}
                    </div>
                    <div className={styles.childDepCountCol}>
                      {childDependencyCounts.get(child.id) || 0}
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
