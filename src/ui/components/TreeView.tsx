import { useState } from 'preact/hooks';
import { TreeNodeData, TreeViewProps } from '../types';

// Define props for the recursive TreeNode component
interface TreeNodeProps {
  node: TreeNodeData;
  onNodeSelect: (node: TreeNodeData) => void;
  selectedNodeId?: string;
  isExpanded: boolean; // Whether this node itself is expanded
  toggleNode: (nodeId: string) => void;
  isNodeExpandedCheck: (nodeId: string) => boolean; // Add this function prop
}

// Recursive TreeNode component
function TreeNode({
  node,
  onNodeSelect,
  selectedNodeId,
  isExpanded,
  toggleNode,
  isNodeExpandedCheck,
}: TreeNodeProps) {
  const isSelected = node.id === selectedNodeId;
  const hasChildren = node.children && node.children.length > 0;

  const handleNodeClick = () => {
    onNodeSelect(node);
  };

  const handleToggleClick = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent node selection when toggling
    toggleNode(node.id);
  };

  return (
    <li className="tree-node">
      <div
        onClick={handleNodeClick}
        className={`tree-node-item ${isSelected ? 'selected' : ''}`}
        title={`ID: ${node.id}`}
      >
        {hasChildren && (
          <span className="toggle" onClick={handleToggleClick}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span className="toggle">&nbsp;</span>} {/* Placeholder */}
        <span className="label">{node.label}</span>
        <span className="stats">({node.properties?.fileCount || 0} files)</span>
        {/* Optionally display size: formatBytes(node.properties?.size || 0) */}
      </div>
      {hasChildren && isExpanded && (
        <ul className="tree-children">
          {node.children?.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onNodeSelect={onNodeSelect}
              selectedNodeId={selectedNodeId}
              isExpanded={isNodeExpandedCheck(child.id)}
              toggleNode={toggleNode}
              isNodeExpandedCheck={isNodeExpandedCheck}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// Main TreeView component - manages expansion state
export function TreeView({ data, onNodeSelect, selectedNodeId }: TreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([data.id]));

  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  // Helper function to pass down expansion state
  const isNodeExpanded = (nodeId: string) => expandedNodes.has(nodeId);

  return (
    <div className="tree-view">
      <ul>
        <TreeNode
          node={data}
          onNodeSelect={onNodeSelect}
          selectedNodeId={selectedNodeId}
          isExpanded={isNodeExpanded(data.id)}
          toggleNode={toggleNode}
          isNodeExpandedCheck={isNodeExpanded}
        />
      </ul>
    </div>
  );
}
