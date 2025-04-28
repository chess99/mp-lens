import { useState } from 'preact/hooks';
import { AppProps, TreeNodeData } from '../types';
import { NodeDetails } from './NodeDetails';
import { Statistics } from './Statistics';
import { Tabs } from './Tabs';
import { TreeView } from './TreeView';

// 格式化字节单位
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
}

export function App({ data }: AppProps) {
  // State for the currently selected node
  const [selectedNode, setSelectedNode] = useState<TreeNodeData>(data); // Default to root node

  // Callback for TreeView to update selected node
  const handleNodeSelect = (node: TreeNodeData) => {
    setSelectedNode(node);
  };

  // Calculate root stats (remains the same)
  const rootStats = {
    totalFiles: data.properties?.fileCount || 0,
    totalSize: data.properties?.totalSize || 0,
  };

  return (
    <>
      <style>
        {`
          /* Basic Layout Styles - replace or augment with actual CSS file later */
          .app-container { display: flex; flex-direction: column; height: 100vh; }
          .header { padding: 10px 20px; background-color: #e9ecef; border-bottom: 1px solid #dee2e6; }
          .header h1 { margin: 0 0 5px 0; font-size: 1.5em; }
          .overview-stats { display: flex; gap: 20px; font-size: 0.9em; }
          .stat-item { background-color: #f8f9fa; padding: 5px 10px; border-radius: 4px; }
          .stat-label { font-weight: bold; margin-right: 5px; }
          .main-container { display: flex; flex-grow: 1; overflow: hidden; /* Prevent overall scroll */ }
          .sidebar { width: 300px; border-right: 1px solid #dee2e6; padding: 15px; overflow-y: auto; }
          .content { flex-grow: 1; padding: 15px; overflow-y: auto; }
          .tree-container { /* Add specific styles if needed */ }
          .graph-container { min-height: 300px; border: 1px dashed #ccc; display:flex; justify-content: center; align-items: center; color: #6c757d; }
        `}
      </style>
      <div className="app-container">
        <header className="header">
          <h1>MP-Lens 项目可视化</h1>
          <div className="overview-stats">
            <div className="stat-item">
              <span className="stat-label">总文件数:</span>
              <span className="stat-value">{rootStats.totalFiles}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">总代码量:</span>
              <span className="stat-value">{formatBytes(rootStats.totalSize)}</span>
            </div>
          </div>
        </header>

        <main className="main-container">
          <aside className="sidebar">
            <div className="tree-container">
              <TreeView
                data={data}
                onNodeSelect={handleNodeSelect}
                selectedNodeId={selectedNode.id}
              />
            </div>
          </aside>

          <section className="content">
            <Tabs
              tabs={[
                {
                  id: 'details',
                  label: '节点详情',
                  content: <NodeDetails node={selectedNode} />,
                },
                {
                  id: 'graph',
                  label: '依赖图 (TODO)',
                  content: (
                    <div id="graph-container" className="graph-container">
                      <div className="placeholder">依赖图: {selectedNode?.label || 'N/A'}</div>
                    </div>
                  ),
                },
                {
                  id: 'stats',
                  label: '节点统计',
                  content: <Statistics node={selectedNode} />,
                },
              ]}
            />
          </section>
        </main>
      </div>
    </>
  );
}
