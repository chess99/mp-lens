import { useMemo, useState } from 'preact/hooks';
import { ProjectStructure } from '../../analyzer/project-structure';
import { TreeNodeData } from '../types'; // AppProps might need adjustment if `data` prop is removed
import { buildTreeFromGraphData } from '../utils/tree-builder'; // Import the new tree builder
import { DependencyGraph } from './DependencyGraph';
import { FileListView } from './FileListView';
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
    __MP_LENS_TITLE__?: string;
    __MP_LENS_GRAPH_DATA__?: ProjectStructure;
    __MP_LENS_UNUSED_FILES__?: string[];
  }
}

const emptyProjectStructure: ProjectStructure = {
  nodes: [],
  links: [],
  rootNodeId: null,
  miniappRoot: '',
};

const emptyTreeNode: TreeNodeData = {
  id: 'loading',
  label: 'Loading tree...',
  type: 'Unknown',
  properties: { fileCount: 0, totalSize: 0 },
  children: [],
};

// AppProps might no longer need a `data` prop if tree is built internally
export interface AppProps {
  // No props are expected for now
  // If we need to pass something specific from main.tsx later, it can be added here.
}

export function App(props: AppProps) {
  // Accept props object directly
  // Log props to satisfy linter if AppProps is empty, can be removed if AppProps gets members
  if (Object.keys(props).length > 0) {
    console.log('[App] Props received:', props);
  }

  const fullGraphData = useMemo(() => window.__MP_LENS_GRAPH_DATA__ || emptyProjectStructure, []);
  const initialTreeData = useMemo(
    () => buildTreeFromGraphData(fullGraphData) || emptyTreeNode,
    [fullGraphData],
  );

  const [selectedNode, setSelectedNode] = useState<TreeNodeData>(initialTreeData);
  const [currentMode, setCurrentMode] = useState<'tree' | 'unusedFiles'>('tree');

  const handleNodeSelect = (node: TreeNodeData) => {
    setSelectedNode(node);
    setCurrentMode('tree');
  };

  const handleGraphNodeSelect = (nodeId: string) => {
    const nodeData = fullGraphData.nodes.find((n) => n.id === nodeId);
    if (nodeData) {
      // If a graph node is selected, we might want to find its representation
      // in the *current* tree structure for TreeView selection, or rebuild/
      // focus the tree. For now, let's ensure selectedNode is a valid TreeNodeData.
      // This might mean we need a way to map a graph node ID to a tree node.
      // For simplicity, we'll just update selectedNode with its properties.
      // TreeView might need to be able to find this node by ID.
      setSelectedNode({
        id: nodeData.id,
        label: nodeData.label,
        type: nodeData.type,
        properties: nodeData.properties,
        // children might not be directly available here without tree traversal
      });
      setCurrentMode('tree');
    } else {
      console.warn(`[App] Node data not found for ID: ${nodeId}`);
    }
  };

  const realUnusedFiles = useMemo(() => window.__MP_LENS_UNUSED_FILES__ || [], []);

  // Calculate root stats using the root of the built tree
  const rootStats = useMemo(() => {
    const rootNodeForStats = initialTreeData; // Use the root of the built tree
    return {
      totalFiles: rootNodeForStats.properties?.fileCount || 0,
      totalSize: rootNodeForStats.properties?.totalSize || 0,
      unusedFileCount: realUnusedFiles.length,
      unusedFilesList: realUnusedFiles,
    };
  }, [initialTreeData, realUnusedFiles]);

  const switchToUnusedFilesMode = () => setCurrentMode('unusedFiles');
  const switchToTreeMode = () => setCurrentMode('tree');

  if (
    initialTreeData.id === 'loading' ||
    initialTreeData.id === 'empty' ||
    initialTreeData.id === 'error_root'
  ) {
    return (
      <div class="app-container mode-tree">
        <header class="header">
          <h1>{window.__MP_LENS_TITLE__ || '依赖可视化'}</h1>
        </header>
        <main class="main-container mode-tree">
          <section
            class="content"
            style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            <p>{initialTreeData.label}</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={`app-container mode-${currentMode}`}>
      <header className="header">
        <h1>{window.__MP_LENS_TITLE__ || '依赖可视化'}</h1>
        <div className="overview-stats">
          <div className="stat-item clickable" title="返回文件树视图" onClick={switchToTreeMode}>
            <span className="stat-label">总文件数:</span>
            <span className="stat-value">{rootStats.totalFiles}</span>
            <span className="stat-indicator">›</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">总代码量:</span>
            <span className="stat-value">{formatBytes(rootStats.totalSize)}</span>
          </div>
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
                data={initialTreeData} // Pass the dynamically built tree
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
                { id: 'details', label: '节点详情', content: <NodeDetails node={selectedNode} /> },
                {
                  id: 'graph',
                  label: '依赖图',
                  content: (
                    <DependencyGraph
                      selectedNode={selectedNode} // selectedNode is TreeNodeData
                      fullGraphData={fullGraphData}
                      onNodeSelect={handleGraphNodeSelect} // This callback receives nodeId (string)
                    />
                  ),
                },
                {
                  id: 'filelist',
                  label: '文件列表',
                  content: <FileListView node={selectedNode} />,
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
