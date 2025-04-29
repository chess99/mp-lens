import { useCallback, useMemo, useState } from 'preact/hooks';
import { TreeNodeData, TreeViewProps } from '../types';

// Define props for the recursive TreeNode component
interface TreeNodeProps {
  node: TreeNodeData;
  onNodeSelect: (node: TreeNodeData) => void;
  selectedNodeId?: string;
  isExpanded: boolean; // Whether this node itself is expanded
  toggleNode: (nodeId: string) => void;
  isNodeExpandedCheck: (nodeId: string) => boolean; // Add this function prop
  depth: number; // Current nesting depth
}

// Recursive TreeNode component
function TreeNode({
  node,
  onNodeSelect,
  selectedNodeId,
  isExpanded,
  toggleNode,
  isNodeExpandedCheck,
  depth, // Current nesting depth
}: TreeNodeProps) {
  console.log('TreeNode depth', depth);
  const isSelected = node.id === selectedNodeId;
  const hasChildren = node.children && node.children.length > 0;
  const indentSize = 20; // Pixels per depth level

  const handleNodeClick = () => {
    onNodeSelect(node);
  };

  // Renamed from handleToggleClick for clarity
  const handleNodeDoubleClick = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent potential text selection issues
    // Only toggle if the node actually has children
    if (hasChildren) {
      toggleNode(node.id);
    }
  };

  // Add separate handler for triangle toggle click
  const handleToggleClick = (e: MouseEvent) => {
    e.stopPropagation(); // Prevent the node selection
    if (hasChildren) {
      toggleNode(node.id);
    }
  };

  return (
    <li className="tree-node">
      <div
        onClick={handleNodeClick} // Single click selects
        onDblClick={handleNodeDoubleClick} // Double click toggles
        className={`tree-node-item ${isSelected ? 'selected' : ''}`}
        title={`ID: ${node.id}`}
        style={{ paddingLeft: `${depth * indentSize}px` }}
      >
        {hasChildren && (
          // Restore the onClick handler for the toggle span
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
              depth={depth + 1}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

// Helper function to collect all expandable node IDs
function getAllExpandableNodeIds(node: TreeNodeData): Set<string> {
  const ids = new Set<string>();
  function traverse(currentNode: TreeNodeData) {
    if (currentNode.children && currentNode.children.length > 0) {
      ids.add(currentNode.id);
      currentNode.children.forEach(traverse);
    }
  }
  traverse(node);
  return ids;
}

// Main TreeView component - manages expansion state
export function TreeView({
  data,
  onNodeSelect,
  selectedNodeId,
  onExpandAll,
  onCollapseAll,
}: TreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set([data.id]));

  // Calculate all expandable node IDs once
  const allExpandableIds = useMemo(() => getAllExpandableNodeIds(data), [data]);

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

  // Implement expand/collapse all logic using useCallback
  const handleExpandAll = useCallback(() => {
    setExpandedNodes(allExpandableIds);
    // Call external handler if provided (though maybe not needed if state managed here)
    if (onExpandAll) onExpandAll();
  }, [allExpandableIds, onExpandAll]);

  const handleCollapseAll = useCallback(() => {
    setExpandedNodes(new Set([data.id])); // Keep root expanded
    // Call external handler if provided
    if (onCollapseAll) onCollapseAll();
  }, [data.id, onCollapseAll]);

  // Helper function to pass down expansion state
  const isNodeExpanded = (nodeId: string) => expandedNodes.has(nodeId);

  return (
    <div className="tree-view">
      {/* Add Expand/Collapse Buttons */}
      <div className="tree-controls">
        <button onClick={handleExpandAll}>Expand All</button>
        <button onClick={handleCollapseAll}>Collapse All</button>
      </div>
      {/* End Buttons */}
      <ul>
        <TreeNode
          node={data}
          onNodeSelect={onNodeSelect}
          selectedNodeId={selectedNodeId}
          isExpanded={isNodeExpanded(data.id)}
          toggleNode={toggleNode}
          isNodeExpandedCheck={isNodeExpanded}
          depth={0}
        />
      </ul>
    </div>
  );
}
