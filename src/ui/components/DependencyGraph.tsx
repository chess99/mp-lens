import G6, { Graph } from '@antv/g6';
import { useEffect, useRef } from 'preact/hooks';
import { ProjectStructure } from '../../analyzer/project-structure';
import { TreeNodeData } from '../types';

interface DependencyGraphProps {
  selectedNode: TreeNodeData | null;
  fullGraphData: ProjectStructure;
}

// Helper function to get color by node type
function getNodeColorByType(type: string): string {
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
  return colors[type] || colors.Default;
}

// Helper function to get border color by node type
function getBorderColorByType(type: string): string {
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
  return colors[type] || colors.Default;
}

// Format byte size for tooltip
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function DependencyGraph({ selectedNode, fullGraphData }: DependencyGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Using any type for G6 Graph due to TypeScript definition incompleteness
  const graphRef = useRef<any>(null);

  // Function to create a subgraph focused on the selected node
  const createSubgraphForNode = (node: TreeNodeData | null) => {
    if (!node || !fullGraphData || !fullGraphData.nodes) {
      console.log('[G6] No selected node or graph data available');
      return { nodes: [], edges: [] };
    }

    console.log(`[G6] Preparing data for node: ${node.id}`);

    // Create a directed graph centered on the selected node
    const nodes: any[] = [];
    const edges: any[] = [];
    const nodeMap = new Map<string, boolean>();

    // First, add the selected node as the center node
    nodes.push({
      id: node.id,
      label: node.label || node.id,
      // For selected node, use highlight style
      style: {
        fill: '#e6f7ff',
        stroke: '#1890ff',
        lineWidth: 2,
      },
      type: node.type,
      // Store original data for tooltip
      properties: node.properties,
      isCenter: true,
    });
    nodeMap.set(node.id, true);

    // Find direct dependencies (outgoing edges)
    const outgoingLinks = fullGraphData.links.filter((link) => link.source === node.id);

    // Add outgoing nodes and edges with a limit to prevent overcrowding
    const maxOutgoingNodes = 10;
    outgoingLinks.slice(0, maxOutgoingNodes).forEach((link) => {
      // Find target node in full graph data
      const targetNode = fullGraphData.nodes.find((n) => n.id === link.target);
      if (targetNode && !nodeMap.has(targetNode.id)) {
        // Add node
        nodes.push({
          id: targetNode.id,
          label: targetNode.label || targetNode.id,
          style: {
            fill: getNodeColorByType(targetNode.type),
            stroke: getBorderColorByType(targetNode.type),
            lineWidth: 1,
          },
          type: targetNode.type,
          properties: targetNode.properties,
        });
        nodeMap.set(targetNode.id, true);

        // Add edge
        edges.push({
          source: node.id,
          target: targetNode.id,
          // Add arrow label if available
          label: link.type || 'depends on',
          style: {
            endArrow: true,
            stroke: '#A3B1BF',
            lineWidth: 1.5,
          },
        });
      }
    });

    // Find reverse dependencies (incoming edges)
    const incomingLinks = fullGraphData.links.filter((link) => link.target === node.id);

    // Add incoming nodes and edges with a limit
    const maxIncomingNodes = 10;
    incomingLinks.slice(0, maxIncomingNodes).forEach((link) => {
      // Find source node in full graph data
      const sourceNode = fullGraphData.nodes.find((n) => n.id === link.source);
      if (sourceNode && !nodeMap.has(sourceNode.id)) {
        // Add node
        nodes.push({
          id: sourceNode.id,
          label: sourceNode.label || sourceNode.id,
          style: {
            fill: getNodeColorByType(sourceNode.type),
            stroke: getBorderColorByType(sourceNode.type),
            lineWidth: 1,
          },
          type: sourceNode.type,
          properties: sourceNode.properties,
        });
        nodeMap.set(sourceNode.id, true);

        // Add edge
        edges.push({
          source: sourceNode.id,
          target: node.id,
          // Add arrow label if available
          label: link.type || 'used by',
          style: {
            endArrow: true,
            stroke: '#A3B1BF',
            lineWidth: 1.5,
          },
        });
      }
    });

    // Create tooltips for all nodes
    nodes.forEach((n) => {
      let tooltip = `<div style="padding: 10px;"><strong>${n.label}</strong><br/>Type: ${n.type}`;

      if (n.properties) {
        if (n.properties.fileSize) {
          tooltip += `<br/>Size: ${formatBytes(n.properties.fileSize)}`;
        }
        if (n.properties.fileCount) {
          tooltip += `<br/>Files: ${n.properties.fileCount}`;
        }
        if (n.properties.fileExt) {
          tooltip += `<br/>Extension: ${n.properties.fileExt}`;
        }
      }

      tooltip += '</div>';
      n.tooltip = tooltip;
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

    // Initialize graph if it doesn't exist
    if (!graphRef.current) {
      console.log('[G6] Creating new graph instance');

      // Configure G6 graph - G6 v4.8.21 compatible configuration
      const graph = new Graph({
        container: containerRef.current,
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight || 500,
        // Use force layout for better looking dependency visualization
        layout: {
          type: 'force',
          preventOverlap: true,
          linkDistance: 100,
          nodeStrength: -30,
          edgeStrength: 0.1,
          nodeSize: 30,
        },
        modes: {
          default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
        },
        defaultNode: {
          size: [120, 40],
          type: 'rect',
          style: {
            radius: 5,
            stroke: '#ccc',
            fill: '#fff',
            lineWidth: 1,
          },
          labelCfg: {
            style: {
              fill: '#333',
              fontSize: 10,
            },
          },
        },
        defaultEdge: {
          type: 'cubic',
          style: {
            endArrow: true,
            stroke: '#C2C8D5',
            lineWidth: 1,
          },
          labelCfg: {
            autoRotate: true,
            style: {
              fill: '#666',
              fontSize: 8,
            },
          },
        },
        // Configure tooltips - G6 v4.8.21 style
        plugins: [
          new G6.Tooltip({
            offsetX: 10,
            offsetY: 10,
            itemTypes: ['node'],
            getContent: (e: any) => {
              const node = e.item;
              if (!node) return '';
              const model = node.getModel();
              return model.tooltip || '';
            },
          }),
        ],
      });

      // Add event listeners for node interactions - G6 v4.8.21 style
      graph.on('node:mouseenter', (e: any) => {
        const node = e.item;
        graph.setItemState(node, 'hover', true);

        // Highlight connected edges
        const nodeId = node.getID();
        graph.getEdges().forEach((edge: any) => {
          const edgeModel = edge.getModel();
          if (edgeModel.source === nodeId || edgeModel.target === nodeId) {
            graph.setItemState(edge, 'active', true);
          }
        });
      });

      graph.on('node:mouseleave', (e: any) => {
        const node = e.item;
        graph.setItemState(node, 'hover', false);

        // Reset edge highlighting
        graph.getEdges().forEach((edge: any) => {
          graph.setItemState(edge, 'active', false);
        });
      });

      // Create zoom controls
      const addZoomControls = () => {
        const controlsContainer = document.createElement('div');
        controlsContainer.style.position = 'absolute';
        controlsContainer.style.top = '10px';
        controlsContainer.style.right = '10px';
        controlsContainer.style.background = 'rgba(255, 255, 255, 0.8)';
        controlsContainer.style.borderRadius = '4px';
        controlsContainer.style.padding = '5px';
        controlsContainer.style.display = 'flex';
        controlsContainer.style.gap = '5px';
        controlsContainer.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';

        const zoomInBtn = document.createElement('button');
        zoomInBtn.textContent = '+';
        zoomInBtn.style.width = '28px';
        zoomInBtn.style.height = '28px';
        zoomInBtn.style.cursor = 'pointer';
        zoomInBtn.addEventListener('click', () => graph.zoom(1.2));

        const zoomOutBtn = document.createElement('button');
        zoomOutBtn.textContent = '-';
        zoomOutBtn.style.width = '28px';
        zoomOutBtn.style.height = '28px';
        zoomOutBtn.style.cursor = 'pointer';
        zoomOutBtn.addEventListener('click', () => graph.zoom(0.8));

        const fitBtn = document.createElement('button');
        fitBtn.textContent = '⇔';
        fitBtn.style.width = '28px';
        fitBtn.style.height = '28px';
        fitBtn.style.cursor = 'pointer';
        fitBtn.addEventListener('click', () => graph.fitView(20));

        controlsContainer.appendChild(zoomInBtn);
        controlsContainer.appendChild(zoomOutBtn);
        controlsContainer.appendChild(fitBtn);

        containerRef.current?.appendChild(controlsContainer);
      };

      // Add zoom controls
      addZoomControls();

      graphRef.current = graph;
    }

    const graph = graphRef.current;

    // Prepare subgraph data for the selected node
    const g6Data = createSubgraphForNode(selectedNode);

    // Only render graph if we have nodes to display
    if (g6Data.nodes.length > 0) {
      try {
        // Use proper method sequence for G6 v4.8.21: data() followed by render()
        graph.data(g6Data);
        graph.render();
        console.log('[G6] Graph data loaded and rendered');

        // Fit view after rendering
        graph.fitView(20);
      } catch (error) {
        console.error('[G6] Error during graph rendering:', error);
      }
    } else {
      // Clear graph if no data
      try {
        graph.clear();
        console.log('[G6] Graph cleared due to empty data');
      } catch (error) {
        console.error('[G6] Error clearing graph:', error);
      }
    }

    // Add resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !graphRef.current) return;
      try {
        const width = containerRef.current.offsetWidth;
        const height = containerRef.current.offsetHeight || 500;
        graphRef.current.changeSize(width, height);
        graphRef.current.fitView(20);
      } catch (e) {
        console.error('[G6] Error during resize:', e);
      }
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect();
    };
  }, [selectedNode, fullGraphData]);

  // Handle component unmount - destroy graph
  useEffect(() => {
    return () => {
      if (graphRef.current) {
        try {
          graphRef.current.destroy();
          graphRef.current = null;
        } catch (e) {
          console.error('[G6] Error destroying graph:', e);
        }
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '500px',
        border: '1px solid #eee',
        position: 'relative',
      }}
    >
      {!selectedNode && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#999',
            fontStyle: 'italic',
          }}
        >
          请从左侧选择一个节点以查看其依赖关系
        </div>
      )}
    </div>
  );
}
