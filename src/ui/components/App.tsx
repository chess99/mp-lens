import { useMemo, useState } from 'preact/hooks';
import { ProjectStructure } from '../../analyzer/project-structure';
import { TreeNodeData } from '../types'; // AppProps might need adjustment if `data` prop is removed
import { buildTreeWithStats, formatBytes } from '../utils/dependency-tree-processor'; // NEW
import { DependencyGraph } from './DependencyGraph';
import { FileListView } from './FileListView';
import { NodeDetails } from './NodeDetails';
import { Tabs } from './Tabs';
import { TreeView } from './TreeView';
import { UnusedFilesView } from './UnusedFilesView';

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

// Helper function to find a node in the tree by its ID
function findTreeNodeById(treeNode: TreeNodeData | null, id: string): TreeNodeData | null {
  if (!treeNode) {
    return null;
  }
  if (treeNode.id === id) {
    return treeNode;
  }
  if (treeNode.children) {
    for (const child of treeNode.children) {
      const found = findTreeNodeById(child, id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

export function App(props: AppProps) {
  // Accept props object directly
  // Log props to satisfy linter if AppProps is empty, can be removed if AppProps gets members
  if (Object.keys(props).length > 0) {
    console.log('[App] Props received:', props);
  }

  const fullGraphData = useMemo(() => window.__MP_LENS_GRAPH_DATA__ || emptyProjectStructure, []);

  // Build the tree structure AND calculate stats in one step
  const initialTreeData = useMemo(
    () => buildTreeWithStats(fullGraphData) || emptyTreeNode,
    [fullGraphData],
  );

  const [selectedNode, setSelectedNode] = useState<TreeNodeData>(initialTreeData);
  const [currentMode, setCurrentMode] = useState<'tree' | 'unusedFiles'>('tree');
  const [activeTabId, setActiveTabId] = useState<string>('details'); // Default to details tab

  const handleNodeSelect = (node: TreeNodeData) => {
    setSelectedNode(node);
    setCurrentMode('tree');
    setActiveTabId('details'); // Reset to details tab when a tree node is selected
  };

  const handleGraphNodeSelect = (nodeId: string) => {
    // Find the corresponding node within the constructed tree data
    const treeNode = findTreeNodeById(initialTreeData, nodeId);

    if (treeNode) {
      setSelectedNode(treeNode); // Set the found node from the tree
      setCurrentMode('tree');
    } else {
      // Fallback or error handling if node not found in the tree
      // This might happen if graph data includes nodes not represented in the tree
      console.warn(
        `[App] TreeNode not found in initialTreeData for ID: ${nodeId}. Falling back to graph data.`,
      );
      // Optional Fallback: use raw data like before, but be aware it might be incomplete for details view
      const nodeData = fullGraphData.nodes.find((n) => n.id === nodeId);
      if (nodeData) {
        setSelectedNode({
          // This fallback node will lack children and accurate calculated stats
          id: nodeData.id,
          label: nodeData.label,
          type: nodeData.type,
          properties: nodeData.properties,
        });
        setCurrentMode('tree');
      } else {
        console.error(`[App] GraphNode also not found for ID: ${nodeId}`);
      }
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

  // Handler for when a file is clicked in FileListView
  const handleFileSelect = (moduleId: string) => {
    handleGraphNodeSelect(moduleId); // Reuse existing logic to select the node
    setActiveTabId('graph'); // Switch to the graph tab
  };

  // Handler for when a child node is clicked in NodeDetails view
  const handleChildNodeGraphJump = (nodeId: string) => {
    handleGraphNodeSelect(nodeId);
    setActiveTabId('graph');
  };

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
                data={initialTreeData} // Pass the dynamically built tree with stats
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
                  content: (
                    <NodeDetails
                      node={selectedNode}
                      fullGraphData={fullGraphData}
                      onChildNodeSelect={handleChildNodeGraphJump}
                    />
                  ),
                },
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
                  content: <FileListView node={selectedNode} onFileSelect={handleFileSelect} />, // Pass handler
                },
              ]}
              activeTabId={activeTabId} // Pass state
              onTabChange={setActiveTabId} // Pass setter
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
