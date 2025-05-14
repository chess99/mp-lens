import { useMemo, useState } from 'preact/hooks';
import type { GraphNode } from '../../analyzer/project-structure'; // Import graph types
import { NodeDetailsProps } from '../types';
import { formatBytes } from '../utils/dependency-tree-processor'; // UPDATED import path
import styles from './FileListView.module.css'; // Import CSS Module

// ADDED: Define props for FileListView, including the new callback
interface FileListViewProps extends NodeDetailsProps {
  onFileSelect: (moduleId: string) => void;
}

// Helper type for file details including reference count
interface FileDetail {
  id: number;
  path: string;
  relativePath: string;
  size: number;
  type: string;
  dependencyCount: number;
}

// ADD HELPER: Get file extension from path
function getFileExtension(path: string): string {
  const match = path.match(/\.([^./\\]+)$/);
  return match ? match[1].toLowerCase() : ''; // Ensure lowercase extension
}

// ADD HELPER: Convert absolute path to relative path
function toRelativePath(absPath: string, root: string): string {
  if (!absPath || !root) return absPath;
  // Normalize path separators to forward slashes
  const normAbs = absPath.replace(/\\/g, '/');
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, ''); // Ensure no trailing slash
  if (normAbs.startsWith(normRoot + '/')) {
    // Check if it starts with root + slash
    return normAbs.slice(normRoot.length + 1); // Remove root + leading slash
  }
  return absPath; // Return original if not under root
}

/**
 * A component that displays a list of all files in the current node
 */
export function FileListView({ node, onFileSelect }: FileListViewProps) {
  // State for sorting: null means default sort (path), otherwise sort by the active column
  const [sizeOrder, setSizeOrder] = useState<'asc' | 'desc' | null>('desc');
  const [dependencyCountOrder, setDependencyCountOrder] = useState<'asc' | 'desc' | null>(null);
  const [filterType, setFilterType] = useState<string>(''); // '' means show all

  // Use full graph data if available
  const fullGraphData = window.__MP_LENS_GRAPH_DATA__ || { nodes: [], links: [], miniappRoot: '' };
  const miniappRoot = fullGraphData.miniappRoot || '';

  // Pre-calculate dependency counts for all nodes
  const dependencyCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const link of fullGraphData.links) {
      counts.set(link.target, (counts.get(link.target) || 0) + 1);
    }
    return counts;
  }, [fullGraphData.links]);

  // Collect all reachable module files first
  const allFiles = useMemo(() => {
    const moduleIds = node.properties?.reachableModuleIds || new Set<string>();
    const nodeMap = new Map<string, GraphNode>(
      fullGraphData.nodes.map((n: GraphNode) => [n.id, n]),
    ); // Use GraphNode type
    const files: FileDetail[] = []; // Use FileDetail type
    let counter = 0;
    moduleIds.forEach((mid: string) => {
      const m = nodeMap.get(mid);
      if (!m || m.type !== 'Module') return;
      const path = m.id;
      const relativePath = toRelativePath(path, miniappRoot);
      const size = m.properties?.fileSize || 0;
      const ext = m.properties?.fileExt || getFileExtension(path) || 'unknown';
      const dependencyCount = dependencyCounts.get(mid) || 0;
      files.push({
        id: ++counter,
        path,
        relativePath,
        size,
        type: ext,
        dependencyCount,
      });
    });
    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [
    node.id,
    node.properties?.reachableModuleIds,
    fullGraphData.nodes,
    miniappRoot,
    dependencyCounts,
  ]); // Added dependencies

  // Get unique file types for filtering options
  const uniqueFileTypes = useMemo(() => {
    const types = new Set(allFiles.map((f) => f.type));
    return Array.from(types).sort();
  }, [allFiles]);

  // Calculate file counts for each type
  const fileCountsByType = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const file of allFiles) {
      counts[file.type] = (counts[file.type] || 0) + 1;
    }
    return counts;
  }, [allFiles]);

  // Filter and sort files based on state
  const displayedFiles = useMemo(() => {
    let files = allFiles;

    // Apply filter
    if (filterType) {
      files = files.filter((f) => f.type === filterType);
    }

    // Apply sorting based on which column header was clicked last
    files.sort((a, b) => {
      if (dependencyCountOrder) {
        // Sort by dependency count
        return dependencyCountOrder === 'asc'
          ? a.dependencyCount - b.dependencyCount
          : b.dependencyCount - a.dependencyCount;
      } else if (sizeOrder) {
        // Sort by size
        return sizeOrder === 'asc' ? a.size - b.size : b.size - a.size;
      } else {
        // Default sort by relative path if no column is active
        return a.relativePath.localeCompare(b.relativePath);
      }
    });

    // Re-assign sequential IDs after filtering and sorting
    return files.map((f, idx) => ({ ...f, id: idx + 1 }));
  }, [allFiles, filterType, sizeOrder, dependencyCountOrder]); // Add dependencyCountOrder dependency

  // If no files are found *after filtering* (or initially), show a message
  if (displayedFiles.length === 0 && allFiles.length === 0) {
    return (
      <div className={styles.fileListView}>
        <div className={styles.emptyState}>
          <p>此节点没有直接关联的文件。</p>
        </div>
      </div>
    );
  }

  // Sorting arrows - display only if the column is actively sorted
  const sizeArrow = sizeOrder ? (sizeOrder === 'asc' ? '↑' : '↓') : '';
  const dependencyCountArrow = dependencyCountOrder
    ? dependencyCountOrder === 'asc'
      ? '↑'
      : '↓'
    : '';

  const handleSizeSortClick = () => {
    const newOrder = sizeOrder === 'asc' ? 'desc' : 'asc';
    setSizeOrder(newOrder);
    setDependencyCountOrder(null); // Reset other sort
  };

  const handleDependencyCountSortClick = () => {
    const newOrder = dependencyCountOrder === 'asc' ? 'desc' : 'asc';
    setDependencyCountOrder(newOrder);
    setSizeOrder(null); // Reset other sort
  };

  return (
    <div className={styles.fileListView}>
      <div className={styles.fileListHeader}>
        {miniappRoot && <div className={styles.rootPath}>根目录: {miniappRoot}</div>}
      </div>

      {/* Filter Controls */}
      {uniqueFileTypes.length > 1 && ( // Only show filters if there's more than one type
        <div className={styles.fileFilterControls}>
          <span>筛选:</span>
          <button
            onClick={() => setFilterType('')}
            className={`${styles.filterButton} ${filterType === '' ? styles.active : ''}`}
          >
            All ({allFiles.length})
          </button>
          {uniqueFileTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`${styles.filterButton} ${filterType === type ? styles.active : ''}`}
              title={`.${type}`}
            >
              .{type} ({fileCountsByType[type] || 0})
            </button>
          ))}
        </div>
      )}

      <div className={styles.fileTableContainer}>
        {displayedFiles.length > 0 ? (
          <table className={styles.fileTable}>
            <thead>
              <tr>
                <th className={styles.sequenceColumn}>序号</th>
                <th className={styles.fileColumn}>文件</th>
                <th
                  className={`${styles.refCountColumn} ${styles.sortable}`}
                  style={{ cursor: 'pointer' }}
                  onClick={handleDependencyCountSortClick}
                  title="点击切换排序"
                >
                  被依赖次数 {dependencyCountArrow}
                </th>
                <th
                  className={`${styles.sizeColumn} ${styles.sortable}`}
                  style={{ cursor: 'pointer' }}
                  onClick={handleSizeSortClick}
                  title="点击切换排序"
                >
                  大小 {sizeArrow}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedFiles.map((file) => (
                <tr
                  key={file.path}
                  onClick={() => onFileSelect(file.path)}
                  title={`点击跳转到依赖图: ${file.relativePath}`}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Use path as key since ID changes */}
                  <td className={styles.sequenceColumn}>{file.id}</td>
                  <td className={styles.fileColumn} title={file.path}>
                    {file.relativePath}
                  </td>
                  <td className={styles.refCountColumn}>{file.dependencyCount}</td>
                  <td className={styles.sizeColumn}>{formatBytes(file.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.emptyState}>
            <p>没有文件匹配当前的筛选条件。</p>
          </div>
        )}
      </div>
    </div>
  );
}
