import { useState } from 'preact/hooks';
import { ProjectStructure } from '../../analyzer/project-structure';
import { AppProps, TreeNodeData } from '../types';
import { DependencyGraph } from './DependencyGraph';
import { NodeDetails } from './NodeDetails';
import { Tabs } from './Tabs';
import { TreeView } from './TreeView';
import { UnusedFilesView } from './UnusedFilesView';

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
    __MP_LENS_TITLE__?: string;
    __MP_LENS_GRAPH_DATA__?: ProjectStructure;
    __MP_LENS_UNUSED_FILES__?: string[];
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
  // State for the current view mode
  const [currentMode, setCurrentMode] = useState<'tree' | 'unusedFiles'>('tree');

  // Callback for TreeView to update selected node AND ensure tree mode
  const handleNodeSelect = (node: TreeNodeData) => {
    setSelectedNode(node);
    setCurrentMode('tree'); // Already correctly sets tree mode
  };

  // Use the defined default structure
  const fullGraphData = window.__MP_LENS_GRAPH_DATA__ || emptyProjectStructure;

  // --- Read REAL Unused Files Data ---
  const realUnusedFiles = window.__MP_LENS_UNUSED_FILES__ || [];

  // Calculate root stats using real data
  const rootStats = {
    totalFiles: data.properties?.fileCount || 0,
    totalSize: data.properties?.totalSize || 0,
    unusedFileCount: realUnusedFiles.length,
    unusedFilesList: realUnusedFiles,
  };

  // Rename function for clarity
  const switchToUnusedFilesMode = () => {
    setCurrentMode('unusedFiles');
  };

  // Handler to ensure we are in tree mode
  const switchToTreeMode = () => {
    // Optional: Could also reset selectedNode to root if desired, but let's keep it simple
    // if (currentMode !== 'tree') {
    //   setSelectedNode(data);
    // }
    setCurrentMode('tree');
  };

  return (
    <div className={`app-container mode-${currentMode}`}>
      <header className="header">
        <h1>{window.__MP_LENS_TITLE__ || '依赖可视化'}</h1>
        <div className="overview-stats">
          {/* Total Files: Clickable, ensures tree mode */}
          <div
            className="stat-item clickable"
            title="返回文件树视图"
            onClick={switchToTreeMode} // Use new handler
          >
            <span className="stat-label">总文件数:</span>
            <span className="stat-value">{rootStats.totalFiles}</span>
            <span className="stat-indicator">›</span>
          </div>
          {/* Total Size remains non-clickable */}
          <div className="stat-item">
            <span className="stat-label">总代码量:</span>
            <span className="stat-value">{formatBytes(rootStats.totalSize)}</span>
          </div>
          {/* Unused Files: Clickable, switches to unusedFiles mode */}
          <div
            className="stat-item clickable"
            title="点击查看未使用的文件列表"
            onClick={switchToUnusedFilesMode}
          >
            <span className="stat-label">未使用文件:</span>
            <span className="stat-value">{rootStats.unusedFileCount}</span>
            <span className="stat-indicator">›</span>
          </div>
        </div>
      </header>

      <main className={`main-container mode-${currentMode}`}>
        {currentMode === 'tree' && (
          <aside className="sidebar">
            <div className="tree-container">
              <TreeView
                data={data}
                onNodeSelect={handleNodeSelect}
                selectedNodeId={selectedNode.id}
              />
            </div>
          </aside>
        )}

        <section className="content">
          {currentMode === 'tree' ? (
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
              ]}
            />
          ) : (
            <UnusedFilesView
              unusedFiles={rootStats.unusedFilesList}
              onReturnToTree={switchToTreeMode}
            />
          )}
        </section>
      </main>
    </div>
  );
}
