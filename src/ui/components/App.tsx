import { useState } from 'preact/hooks';
import { ProjectStructure } from '../../analyzer/project-structure';
import { AppProps, TreeNodeData } from '../types';
import { DependencyGraph } from './DependencyGraph';
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

declare global {
  interface Window {
    __MP_LENS_DATA__?: TreeNodeData;
    __MP_LENS_GRAPH_DATA__?: ProjectStructure;
  }
}

// Define a default empty structure matching the type
const emptyProjectStructure: ProjectStructure = {
  nodes: [],
  links: [],
  rootNodeId: null,
  miniappRoot: '',
};

export function App({ data }: AppProps) {
  // State for the currently selected node
  const [selectedNode, setSelectedNode] = useState<TreeNodeData>(data); // Default to root node

  // Callback for TreeView to update selected node
  const handleNodeSelect = (node: TreeNodeData) => {
    setSelectedNode(node);
  };

  // Use the defined default structure
  const fullGraphData = window.__MP_LENS_GRAPH_DATA__ || emptyProjectStructure;

  // Calculate root stats (remains the same)
  const rootStats = {
    totalFiles: data.properties?.fileCount || 0,
    totalSize: data.properties?.totalSize || 0,
  };

  return (
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
                label: '依赖图',
                content: (
                  <DependencyGraph selectedNode={selectedNode} fullGraphData={fullGraphData} />
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
  );
}
