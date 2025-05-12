import { useMemo, useState } from 'preact/hooks';
import { NodeDetailsProps } from '../types';
import { getReachableModules } from '../utils';

// Format bytes to readable format
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

// Get file extension from path
function getFileExtension(path: string): string {
  const match = path.match(/\.([^./\\]+)$/);
  return match ? match[1] : '';
}

// Convert absolute path to relative path
function toRelativePath(absPath: string, root: string): string {
  if (!absPath || !root) return absPath;
  const normAbs = absPath.replace(/\\/g, '/');
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  if (normAbs.startsWith(normRoot)) {
    return normAbs.slice(normRoot.length).replace(/^\//, '');
  }
  return absPath;
}

/**
 * A component that displays a list of all files in the current node
 */
export function FileListView({ node }: NodeDetailsProps) {
  // 排序顺序 state: 'asc' | 'desc'
  const [sizeOrder, setSizeOrder] = useState<'asc' | 'desc'>('desc');
  // Use full graph data if available
  const fullGraphData = window.__MP_LENS_GRAPH_DATA__ || { nodes: [], links: [], miniappRoot: '' };
  const miniappRoot = fullGraphData.miniappRoot || '';

  // 用 analyzer fileCount 逻辑收集所有可达 Module 节点
  const allFiles = useMemo(() => {
    const moduleIds = getReachableModules(fullGraphData.nodes, fullGraphData.links, node.id);
    const nodeMap = new Map(fullGraphData.nodes.map((n: any) => [n.id, n]));
    const files: { id: number; path: string; relativePath: string; size: number; type: string }[] =
      [];
    moduleIds.forEach((mid, idx) => {
      const m = nodeMap.get(mid);
      if (!m) return;
      const path = m.id;
      const relativePath = toRelativePath(path, miniappRoot);
      const size = m.properties?.fileSize || 0;
      const ext = m.properties?.fileExt || getFileExtension(path);
      files.push({
        id: idx + 1,
        path,
        relativePath,
        size,
        type: ext,
      });
    });
    // 按相对路径排序
    return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [node.id, fullGraphData, miniappRoot]);

  // 排序后的文件列表
  const sortedFiles = useMemo(() => {
    const files = [...allFiles];
    files.sort((a, b) => {
      if (sizeOrder === 'asc') return a.size - b.size;
      return b.size - a.size;
    });
    // 重新编号序号
    return files.map((f, idx) => ({ ...f, id: idx + 1 }));
  }, [allFiles, sizeOrder]);

  // If no files are found, show a message
  if (sortedFiles.length === 0) {
    return (
      <div className="file-list-view">
        <div className="empty-state">
          <p>此节点没有直接关联的文件。</p>
        </div>
      </div>
    );
  }

  // 排序箭头
  const sizeArrow = sizeOrder === 'asc' ? '↑' : '↓';

  return (
    <div className="file-list-view">
      <div className="file-list-header">
        <h3>文件列表 ({sortedFiles.length})</h3>
        {miniappRoot && <div className="root-path">根目录: {miniappRoot}</div>}
      </div>

      <div className="file-table-container">
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
            {sortedFiles.map((file) => (
              <tr key={file.id}>
                <td className="sequence-column">{file.id}</td>
                <td className="file-column" title={file.path}>
                  {file.relativePath}
                </td>
                <td className="size-column">{formatBytes(file.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
