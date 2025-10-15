import G6, { Graph } from '@antv/g6';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ProjectStructure } from '../../analyzer/project-structure';
import { TreeNodeData } from '../types';
import { computeAggregatedStatsForNode } from '../utils/dependency-tree-processor';
import styles from './DependencyGraph.module.css';

interface DependencyGraphProps {
  selectedNode: TreeNodeData | null;
  fullGraphData: ProjectStructure;
  initialTreeData: TreeNodeData;
  onNodeSelect?: (nodeId: string) => void;
}

// Helper function to find a node in the tree by its ID (copied from App.tsx)
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

// Helper function to get color by node type
function getNodeColorByType(type: string, isCenter = false): string {
  const colors: Record<string, string> = {
    App: '#e6f7ff',
    Module: '#e8f5e9',
    Component: '#fff3e0',
    Page: '#e3f2fd',
    Config: '#f3e5f5',
    Package: '#eceff1',
    Worker: '#fce4ec',
    Default: '#f5f5f5',
  };
  return isCenter ? '#e6f7ff' : colors[type] || colors.Default;
}

// Helper function to get border color by node type
function getBorderColorByType(type: string, isCenter = false): string {
  const colors: Record<string, string> = {
    App: '#1890ff',
    Module: '#a5d6a7',
    Component: '#ffcc80',
    Page: '#90caf9',
    Config: '#ce93d8',
    Package: '#b0bec5',
    Worker: '#f48fb1',
    Default: '#e0e0e0',
  };
  return isCenter ? '#1890ff' : colors[type] || colors.Default;
}

// Helper: if over maxLength, keep at least the last two path segments intact.
// Then, from right to left, keep adding whole segments until reaching maxLength.
// If the retained part is still longer than maxLength (e.g., very long filename), we still keep it intact.
function truncateKeepLastTwoSegments(text: string, maxLength = 60): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(-1);

  const lastSlash = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  if (lastSlash < 0) {
    // Not a path, fallback to simple middle truncation
    const keep = maxLength - 1; // room for ellipsis
    const head = Math.ceil(keep / 2);
    const tail = Math.floor(keep / 2);
    return text.slice(0, head) + '…' + text.slice(text.length - tail);
  }

  const delimiter = text[lastSlash];
  const parts = text.split(/[/\\]/);
  const n = parts.length;
  let start = Math.max(0, n - 2); // ensure at least last two segments

  // Try to include more segments from the left while respecting maxLength
  // We account for leading ellipsis + delimiter when truncated
  const joinWithDelim = (arr: string[]) => arr.join(delimiter);
  let retained = parts.slice(start);
  while (start > 0) {
    const candidate = parts.slice(start - 1);
    const candidateStr = candidate.join(delimiter);
    const lengthWithEllipsis = candidateStr.length + 2; // '…' + delimiter
    if (lengthWithEllipsis <= maxLength) {
      start -= 1;
      retained = candidate;
    } else {
      break;
    }
  }

  // If no truncation actually needed (we managed to include all parts), return original
  if (start === 0 && joinWithDelim(parts).length <= maxLength) {
    return text;
  }

  const retainedStr = joinWithDelim(retained);
  // If retained part plus prefix still exceeds maxLength (very long filename), keep it intact anyway
  return '…' + delimiter + retainedStr;
}

// Helper to ensure node always has valid property information
function ensureNodeProperties(properties: Record<string, unknown> = {}): Record<string, unknown> {
  const p = properties as { fileCount?: number; totalSize?: number; fileSize?: number };
  return {
    ...properties,
    fileCount: typeof p.fileCount === 'number' ? p.fileCount : 1,
    totalSize:
      typeof p.totalSize === 'number'
        ? p.totalSize
        : typeof p.fileSize === 'number'
          ? p.fileSize
          : 0,
  };
}

export function DependencyGraph({
  selectedNode,
  fullGraphData,
  initialTreeData,
  onNodeSelect,
}: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<Graph | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // (Removed aggregated calculation here; center节点的聚合在 App.tsx fallback 中处理)

  // Function to create a subgraph focused on the selected node
  const createSubgraphForNode = (node: TreeNodeData | null) => {
    const nodes: any[] = [];
    const edges: any[] = [];
    const nodeMap = new Map<string, boolean>();

    const linksFromMap = new Map<string, string[]>();
    for (const link of fullGraphData?.links || []) {
      if (!linksFromMap.has(link.source)) linksFromMap.set(link.source, []);
      linksFromMap.get(link.source)!.push(link.target);
    }

    const aggregateModuleStats = (startId: string) =>
      computeAggregatedStatsForNode(fullGraphData, startId, 'Module');

    if (!node || !fullGraphData) {
      return { nodes, edges };
    }

    // Add the selected node as the center node (use provided properties)
    nodes.push({
      id: node.id,
      label: truncateKeepLastTwoSegments(node.label || node.id),
      // Preserve full label for tooltip
      fullLabel: node.label || node.id,
      style: {
        fill: getNodeColorByType(node.type, true),
        stroke: getBorderColorByType(node.type, true),
        lineWidth: 3,
        shadowColor: 'rgba(0,0,0,0.2)',
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowOffsetY: 5,
        radius: 4,
        cursor: 'pointer',
      },
      labelCfg: {
        style: {
          fontWeight: 'bold',
          fontSize: 13,
          cursor: 'pointer',
        },
      },
      nodeType: node.type,
      properties: ensureNodeProperties(node.properties),
    });
    nodeMap.set(node.id, true);

    // Find direct dependencies (outgoing edges)
    const outgoingLinks = fullGraphData.links.filter((link) => link.source === node.id);
    const maxOutgoingNodes = 30;
    outgoingLinks.slice(0, maxOutgoingNodes).forEach((link) => {
      const rawTargetNode = fullGraphData.nodes.find((n) => n.id === link.target);
      if (rawTargetNode) {
        if (!nodeMap.has(rawTargetNode.id)) {
          const processedTargetNode = findTreeNodeById(initialTreeData, rawTargetNode.id);
          const targetNodeData = processedTargetNode || rawTargetNode; // Prioritize processed node

          // Get properties, ensure they're valid
          let targetProperties = processedTargetNode?.properties || rawTargetNode.properties || {};
          targetProperties = ensureNodeProperties(targetProperties as Record<string, unknown>);

          nodes.push({
            id: targetNodeData.id,
            label: truncateKeepLastTwoSegments(targetNodeData.label || targetNodeData.id),
            fullLabel: targetNodeData.label || targetNodeData.id,
            style: {
              fill: getNodeColorByType(targetNodeData.type),
              stroke: getBorderColorByType(targetNodeData.type),
              lineWidth: 1,
              radius: 4,
              cursor: 'pointer',
            },
            nodeType: targetNodeData.type,
            properties: targetProperties, // Use ensured properties
          });
          nodeMap.set(targetNodeData.id, true);
        }
        if (nodeMap.has(link.source) && nodeMap.has(link.target)) {
          edges.push({
            source: link.source,
            target: link.target,
            label: link.type || '',
          });
        }
      }
    });

    // Find reverse dependencies (incoming edges)
    const incomingLinks = fullGraphData.links.filter((link) => link.target === node.id);
    const maxIncomingNodes = 30;
    incomingLinks.slice(0, maxIncomingNodes).forEach((link) => {
      const rawSourceNode = fullGraphData.nodes.find((n) => n.id === link.source);
      if (rawSourceNode) {
        if (!nodeMap.has(rawSourceNode.id)) {
          const processedSourceNode = findTreeNodeById(initialTreeData, rawSourceNode.id);
          const sourceNodeData = processedSourceNode || rawSourceNode; // Prioritize processed node

          // Get properties, ensure they're valid
          let sourceProperties = processedSourceNode?.properties || rawSourceNode.properties || {};
          sourceProperties = ensureNodeProperties(sourceProperties as Record<string, unknown>);

          nodes.push({
            id: sourceNodeData.id,
            label: truncateKeepLastTwoSegments(sourceNodeData.label || sourceNodeData.id),
            fullLabel: sourceNodeData.label || sourceNodeData.id,
            style: {
              fill: getNodeColorByType(sourceNodeData.type),
              stroke: getBorderColorByType(sourceNodeData.type),
              lineWidth: 1,
              radius: 4,
              cursor: 'pointer',
            },
            nodeType: sourceNodeData.type,
            properties: sourceProperties, // Use ensured properties
          });
          nodeMap.set(sourceNodeData.id, true);
        }
        if (nodeMap.has(link.source) && nodeMap.has(link.target)) {
          if (!edges.some((e) => e.source === link.source && e.target === link.target)) {
            edges.push({
              source: link.source,
              target: link.target,
              label: link.type || '',
            });
          }
        }
      }
    });

    // Create tooltips for all nodes
    nodes.forEach((n) => {
      const title = n.fullLabel || n.label;
      let tooltip = `<div style="padding: 5px; font-size: 12px;"><strong>${title}</strong><br/>类型: ${n.nodeType}`;
      if (n.properties) {
        // Prefer aggregated values; if missing and nodeType === Module, compute on the fly
        let files: number | undefined = n.properties.fileCount;
        let totalSizeBytes: number | undefined = n.properties.totalSize;
        let selfBytes: number | undefined = n.properties.selfSize;

        if (n.nodeType === 'Module') {
          const agg = aggregateModuleStats(n.id);
          files = agg.fileCount;
          totalSizeBytes = agg.totalSize;
          selfBytes = agg.selfSize;
        }

        tooltip += `<br/>文件数: ${files ?? 0}`;
        const totalSizeDisplay = ((totalSizeBytes ?? 0) / 1024).toFixed(2) + ' KB';
        tooltip += `<br/>总大小: ${totalSizeDisplay}`;
        if (n.nodeType === 'Module') {
          const selfDisplay = ((selfBytes ?? 0) / 1024).toFixed(2) + ' KB';
          tooltip += `<br/>自身大小: ${selfDisplay}`;
        }
      }
      tooltip += `</div>`;
      n.tooltip = tooltip; // Assign tooltip directly to node data
    });

    console.log(`[G6] Created subgraph with ${nodes.length} nodes and ${edges.length} edges`);
    return { nodes, edges };
  };

  // Effect for initializing and updating the graph
  useEffect(() => {
    if (!containerRef.current) {
      console.log('[G6] Container ref not available');
      return;
    }

    setIsLoading(true);

    // Initialize graph if it doesn't exist
    if (!graphRef.current) {
      console.log('[G6] Creating new graph instance with default elements');

      const containerHeight = Math.max(containerRef.current.clientHeight, window.innerHeight * 0.6);

      // Define layout options - ONLY DAGRE NOW
      const dagreLayout = {
        type: 'dagre',
        rankdir: 'LR', // Keep Left-to-Right
        align: 'UL',
        nodesep: 15,
        ranksep: 40,
      };

      // Configure G6 graph using default elements
      const graph = new Graph({
        container: containerRef.current,
        width: containerRef.current.clientWidth,
        height: containerHeight,
        fitView: true,
        fitViewPadding: 30,
        animate: false, // Keep animation disabled for zoom stability
        layout: dagreLayout, // Use the defined dagre layout directly
        modes: {
          default: ['drag-canvas', 'zoom-canvas', 'drag-node', 'activate-relations'],
        },
        // *** Use default rect node ***
        defaultNode: {
          type: 'rect',
          size: [340, 48],
          // Basic default style, will be overridden by node data
          style: {
            radius: 4,
            lineWidth: 1,
            fill: '#f5f5f5',
            stroke: '#e0e0e0',
            cursor: 'pointer', // Add cursor pointer to indicate clickable nodes
          },
          // Default label config
          labelCfg: {
            style: {
              fill: '#333',
              fontSize: 11,
              lineHeight: 14,
              cursor: 'pointer',
            },
          },
        },
        // *** Use default cubic edge ***
        defaultEdge: {
          type: 'cubic',
          // Default edge style
          style: {
            stroke: '#C2C8D5',
            lineWidth: 1.5,
            endArrow: {
              path: G6.Arrow.triangle(6, 8, 3), // Standard arrow
              d: 3, // Offset
              fill: '#C2C8D5',
            },
          },
          // Default edge label config
          labelCfg: {
            autoRotate: true,
            style: {
              fill: '#666',
              fontSize: 9,
              cursor: 'default', // Keep default cursor for edge labels
              background: {
                fill: '#fff',
                stroke: '#efefef',
                padding: [1, 3],
                radius: 2,
              },
            },
          },
        },
        // State styles for interaction feedback
        nodeStateStyles: {
          hover: {
            shadowColor: 'rgba(64,158,255,0.4)',
            shadowBlur: 10,
            stroke: '#40a9ff', // Highlight border on hover
            cursor: 'pointer', // Ensure pointer cursor on hover
          },
          // Add styles for the 'selected' state if needed
        },
        edgeStateStyles: {
          active: {
            stroke: '#1890ff',
            lineWidth: 2,
            shadowColor: '#1890ff',
            shadowBlur: 5,
            endArrow: {
              path: G6.Arrow.triangle(6, 8, 3),
              d: 3,
              fill: '#1890ff', // Highlight arrow
            },
          },
        },
        // Tooltip plugin
        plugins: [
          new G6.Tooltip({
            offsetX: 10,
            offsetY: 10,
            itemTypes: ['node'],
            getContent: (e: any) => e.item?.getModel().tooltip || '',
            shouldBegin: (e: any) => e.item?.getModel().tooltip, // Only show if tooltip data exists
          }),
        ],
      });

      // *** 禁用局部刷新，解决缩小时的残影问题 ***
      const canvas = graph.get('canvas');
      if (canvas) {
        console.log('[G6] Disabling localRefresh to fix ghosting issue');
        canvas.set('localRefresh', false);
      }

      // Event listeners for hover effects
      graph.on('node:mouseenter', (e: any) => {
        if (!e.item) return;
        graph.setItemState(e.item, 'hover', true);
        // Highlight connected edges
        e.item.getEdges().forEach((edge: any) => graph.setItemState(edge, 'active', true));
      });

      graph.on('node:mouseleave', (e: any) => {
        if (!e.item) return;
        graph.setItemState(e.item, 'hover', false);
        // Reset edge highlighting
        e.item.getEdges().forEach((edge: any) => graph.setItemState(edge, 'active', false));
      });

      // *** Add event listener for node click ***
      graph.on('node:click', (e: any) => {
        if (e.item) {
          const clickedNodeId = e.item.getID();
          console.log(`[G6] Node clicked: ${clickedNodeId}`);
          // Call the callback prop if it exists
          if (onNodeSelect) {
            onNodeSelect(clickedNodeId);
          }
        }
      });

      // Add layout/zoom controls (existing logic)
      const addControls = () => {
        const controlsContainer = document.createElement('div');
        controlsContainer.style.position = 'absolute';
        controlsContainer.style.top = '10px';
        controlsContainer.style.right = '10px';
        controlsContainer.style.background = 'rgba(255, 255, 255, 0.9)';
        controlsContainer.style.borderRadius = '4px';
        controlsContainer.style.padding = '8px';
        controlsContainer.style.display = 'flex';
        // Change to row for zoom controls only
        controlsContainer.style.flexDirection = 'row';
        controlsContainer.style.gap = '5px';
        controlsContainer.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        controlsContainer.style.zIndex = '10';

        // KEEP ZOOM CONTROLS SECTION
        const zoomControls = document.createElement('div');
        zoomControls.style.display = 'flex'; // Keep flex for buttons
        zoomControls.style.gap = '5px';

        const zoomInBtn = document.createElement('button');
        zoomInBtn.textContent = '+';
        zoomInBtn.style.width = '28px';
        zoomInBtn.style.height = '28px';
        zoomInBtn.style.cursor = 'pointer';
        zoomInBtn.style.borderRadius = '2px';
        zoomInBtn.style.border = '1px solid #d9d9d9';
        zoomInBtn.addEventListener('click', () => graph.zoom(1.2));
        zoomControls.appendChild(zoomInBtn);

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.textContent = '-';
        zoomOutBtn.style.width = '28px';
        zoomOutBtn.style.height = '28px';
        zoomOutBtn.style.cursor = 'pointer';
        zoomOutBtn.style.borderRadius = '2px';
        zoomOutBtn.style.border = '1px solid #d9d9d9';
        zoomOutBtn.addEventListener('click', () => graph.zoom(0.8));
        zoomControls.appendChild(zoomOutBtn);

        const fitBtn = document.createElement('button');
        fitBtn.textContent = '⇔';
        fitBtn.style.width = '28px';
        fitBtn.style.height = '28px';
        fitBtn.style.cursor = 'pointer';
        fitBtn.style.borderRadius = '2px';
        fitBtn.style.border = '1px solid #d9d9d9';
        fitBtn.addEventListener('click', () => graph.fitView(20));
        zoomControls.appendChild(fitBtn);

        // Append zoom controls directly to the main container
        controlsContainer.appendChild(zoomControls);

        containerRef.current?.appendChild(controlsContainer);
      };
      addControls();

      graphRef.current = graph;
    }

    // Prepare and render graph data (existing logic)
    const graph = graphRef.current;
    if (!graph || graph.get('destroyed')) {
      console.error('[G6] Graph instance not available or destroyed');
      setIsLoading(false);
      return;
    }

    const g6Data = createSubgraphForNode(selectedNode);

    if (g6Data.nodes.length > 0) {
      // Define the handler outside the try block to ensure it's in scope for catch
      let afterLayoutHandler: (() => void) | null = null;
      try {
        // Define the handler for after layout completion
        afterLayoutHandler = () => {
          if (graph && !graph.get('destroyed')) {
            graph.fitView(20); // Fit view AFTER layout is done
            console.log('[G6] View fitted after layout.');
            setIsLoading(false); // Hide loading indicator
          }
          // Optional: graph.off('afterlayout', afterLayoutHandler); // G6.once should handle this
        };

        // Register the listener ONCE before changing data
        graph.once('afterlayout', afterLayoutHandler);

        // Change data - this triggers the layout process
        graph.changeData(g6Data);
        console.log('[G6] Graph data changed, waiting for layout...');
        // --- Do NOT call fitView or setIsLoading immediately here ---
      } catch (error) {
        console.error('[G6] Error during graph rendering:', error);
        // Ensure listener is removed on error, check if handler was defined
        if (afterLayoutHandler) {
          graph.off('afterlayout', afterLayoutHandler);
        }
        setIsLoading(false); // Still hide loading on error
      }
    } else {
      // Handle empty graph case
      try {
        graph.clear();
        console.log('[G6] Graph cleared due to empty data');
        setIsLoading(false); // Hide loading immediately when clearing
      } catch (error) {
        console.error('[G6] Error clearing graph:', error);
        setIsLoading(false);
      }
    }

    // Cleanup function
    return () => {
      // No explicit graph destroy needed here if we reuse the instance
      // console.log('[G6] Cleanup effect');
    };
  }, [selectedNode, fullGraphData, initialTreeData, onNodeSelect]);

  // Resize handling (existing logic)
  useEffect(() => {
    // ... (keep existing resize observer code) ...
  }, []);

  return (
    <div
      style={{
        position: 'relative',
        height: 'calc(100vh - 250px)',
        minHeight: '500px',
        overflow: 'hidden',
        border: '1px solid #eee',
        borderRadius: '4px',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {isLoading && (
        <div className={styles.graphPlaceholder}>
          <div className={styles.graphPlaceholderText}>
            {!selectedNode
              ? '请从左侧选择一个节点以查看其依赖关系'
              : `正在渲染 "${selectedNode.label || selectedNode.id}" 的依赖关系...`}
          </div>
        </div>
      )}
      <div className={styles.graphContainer} ref={containerRef}></div>
    </div>
  );
}
