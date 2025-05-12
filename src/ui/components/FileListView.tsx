import { useMemo, useState } from 'preact/hooks';
import { NodeDetailsProps } from '../types';
import { formatBytes } from '../utils/dependency-tree-processor'; // UPDATED import path

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
export function FileListView({ node }: NodeDetailsProps) {
  const [sizeOrder, setSizeOrder] = useState<'asc' | 'desc'>('desc');
  const [filterType, setFilterType] = useState<string>(''); // '' means show all

  // Use full graph data if available
  const fullGraphData = window.__MP_LENS_GRAPH_DATA__ || { nodes: [], links: [], miniappRoot: '' };
  const miniappRoot = fullGraphData.miniappRoot || '';

  // Collect all reachable module files first
  const allFiles = useMemo(() => {
    // Get module IDs directly from the processed node properties
    const moduleIds = node.properties?.reachableModuleIds || new Set<string>();
    // const moduleIds = getReachableModules(fullGraphData.nodes, fullGraphData.links, node.id); // OLD way

    const nodeMap = new Map(fullGraphData.nodes.map((n: any) => [n.id, n]));
    const files: { id: number; path: string; relativePath: string; size: number; type: string }[] =
      [];
    let counter = 0; // Use a simple counter for ID
    moduleIds.forEach((mid: string) => {
      const m = nodeMap.get(mid);
      if (!m || m.type !== 'Module') return; // Only include Modules
      const path = m.id;
      const relativePath = toRelativePath(path, miniappRoot);
      const size = m.properties?.fileSize || 0;
      const ext = m.properties?.fileExt || getFileExtension(path) || 'unknown'; // Default to 'unknown'
      files.push({
        id: ++counter, // Increment counter for unique ID
        path,
        relativePath,
        size,
        type: ext,
      });
    });
    // Initial sort by relative path
    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [node.id, fullGraphData, miniappRoot]);

  // Get unique file types for filtering options
  const uniqueFileTypes = useMemo(() => {
    const types = new Set(allFiles.map((f) => f.type));
    return Array.from(types).sort();
  }, [allFiles]);

  // Filter and sort files based on state
  const displayedFiles = useMemo(() => {
    let files = allFiles;

    // Apply filter
    if (filterType) {
      files = files.filter((f) => f.type === filterType);
    }

    // Apply sorting
    files.sort((a, b) => {
      if (sizeOrder === 'asc') return a.size - b.size;
      return b.size - a.size;
    });

    // Re-assign sequential IDs after filtering and sorting
    return files.map((f, idx) => ({ ...f, id: idx + 1 }));
  }, [allFiles, filterType, sizeOrder]);

  // If no files are found *after filtering* (or initially), show a message
  if (displayedFiles.length === 0 && allFiles.length === 0) {
    return (
      <div className="file-list-view">
        <div className="empty-state">
          <p>此节点没有直接关联的文件。</p>
        </div>
      </div>
    );
  }

  // Sorting arrow
  const sizeArrow = sizeOrder === 'asc' ? '↑' : '↓';

  return (
    <div className="file-list-view">
      <div className="file-list-header">
        <h3>文件列表 ({displayedFiles.length})</h3>
        {miniappRoot && <div className="root-path">根目录: {miniappRoot}</div>}
      </div>

      {/* Filter Controls */}
      {uniqueFileTypes.length > 1 && ( // Only show filters if there's more than one type
        <div className="file-filter-controls">
          <span>筛选:</span>
          <button
            onClick={() => setFilterType('')}
            className={`filter-button ${filterType === '' ? 'active' : ''}`}
          >
            All
          </button>
          {uniqueFileTypes.map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`filter-button ${filterType === type ? 'active' : ''}`}
              title={`.${type}`}
            >
              .{type}
            </button>
          ))}
        </div>
      )}

      <div className="file-table-container">
        {displayedFiles.length > 0 ? (
          <table className="file-table">
            <thead>
              <tr>
                <th className="sequence-column">序号</th>
                <th className="file-column">文件</th>
                <th
                  className="size-column sortable"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSizeOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  title="点击切换排序"
                >
                  大小 {sizeArrow}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayedFiles.map((file) => (
                <tr key={file.path}>
                  {' '}
                  {/* Use path as key since ID changes */}
                  <td className="sequence-column">{file.id}</td>
                  <td className="file-column" title={file.path}>
                    {file.relativePath}
                  </td>
                  <td className="size-column">{formatBytes(file.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="empty-state">
            <p>没有文件匹配当前的筛选条件。</p>
          </div>
        )}
      </div>
    </div>
  );
}
