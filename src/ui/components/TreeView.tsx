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

  // Basic styling (move to CSS later)
  const nodeStyle = {
    marginLeft: '10px',
    cursor: 'pointer',
    fontWeight: isSelected ? 'bold' : 'normal',
    color: isSelected ? '#007bff' : 'inherit',
    listStyle: 'none',
    padding: '2px 0',
  };
  const childrenStyle = {
    paddingLeft: '15px',
    borderLeft: '1px dashed #ccc',
    listStyle: 'none',
  };
  const toggleStyle = {
    display: 'inline-block',
    width: '15px',
    textAlign: 'center' as const,
    marginRight: '5px',
  };

  const handleNodeClick = () => {
    onNodeSelect(node);
  };

  const handleToggleClick = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent node selection when toggling
    toggleNode(node.id);
  };

  return (
    <li style={{ listStyle: 'none' }}>
      <div onClick={handleNodeClick} style={nodeStyle} title={`ID: ${node.id}`}>
        {hasChildren && (
          <span style={toggleStyle} onClick={handleToggleClick}>
            {isExpanded ? '▼' : '▶'}
          </span>
        )}
        {!hasChildren && <span style={toggleStyle}>&nbsp;</span>} {/* Placeholder */}
        {node.label} ({node.properties?.files || 0} files)
        {/* Optionally display size: formatBytes(node.properties?.size || 0) */}
      </div>
      {hasChildren && isExpanded && (
        <ul style={childrenStyle}>
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
    <ul style={{ paddingLeft: 0, listStyle: 'none' }}>
      <TreeNode
        node={data}
        onNodeSelect={onNodeSelect}
        selectedNodeId={selectedNodeId}
        isExpanded={isNodeExpanded(data.id)}
        toggleNode={toggleNode}
        isNodeExpandedCheck={isNodeExpanded}
      />
    </ul>
  );
}
