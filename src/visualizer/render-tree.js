/* global G6, window, document, console, setTimeout, alert */
// This file contains the AntV G6 tree visualization logic
// It assumes that 'window.__GRAPH_DATA__' has been populated with the graph data.

document.addEventListener('DOMContentLoaded', initTree);

function initTree() {
  // Check if G6 is loaded properly
  if (typeof G6 === 'undefined') {
    console.error('AntV G6 library is not loaded. Please check the script import.');
    document.getElementById('container').innerHTML =
      '<div style="color: red; padding: 20px;">Error: G6 visualization library failed to load.</div>';
    return;
  }

  // Check if G6 has the necessary methods
  if (typeof G6.registerNode !== 'function') {
    console.error(
      'G6.registerNode is not a function. You may be using an incompatible G6 version.',
    );
    document.getElementById('container').innerHTML =
      '<div style="color: red; padding: 20px;">Error: Incompatible G6 version. Please check console for details.</div>';
    return;
  }

  const graphData = window.__GRAPH_DATA__;
  if (!graphData || !graphData.nodes || !graphData.links) {
    console.error('Graph data is missing or invalid.');
    return;
  }

  // Convert the flat graph data to a hierarchical tree structure
  const treeData = convertGraphToTree(graphData);

  // Get container dimensions
  const container = document.getElementById('container');
  const width = container.scrollWidth || window.innerWidth;
  const height = container.scrollHeight || window.innerHeight;

  // Register a custom node with collapse/expand functionality
  registerCustomNode();

  // Create a new G6 Graph instance
  const graph = new G6.TreeGraph({
    container: 'container',
    width,
    height,
    modes: {
      default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
    },
    layout: {
      type: 'dendrogram',
      direction: 'LR', // Left to right tree layout
      nodeSep: 40,
      rankSep: 100,
    },
    defaultNode: {
      type: 'tree-node',
      size: [120, 40],
      style: {
        fill: '#DEE9FF',
        stroke: '#5B8FF9',
        radius: 5,
      },
      labelCfg: {
        style: {
          fontSize: 12,
          fill: '#000',
        },
      },
    },
    defaultEdge: {
      type: 'cubic-horizontal',
      style: {
        stroke: '#A3B1BF',
        lineWidth: 1.5,
        endArrow: {
          path: 'M 0,0 L 8,4 L 0,8 Z',
          fill: '#A3B1BF',
        },
      },
      edgeStateStyles: {
        highlight: {
          stroke: '#5B8FF9',
          lineWidth: 2,
        },
      },
    },
    // Add custom collapse/expand state to nodes
    animate: true,
    animateCfg: {
      duration: 300, // ms
      easing: 'easeCubic',
    },
  });

  // Listen for window resize
  window.addEventListener('resize', () => {
    if (!graph || graph.get('destroyed')) return;

    const container = document.getElementById('container');
    const width = container.scrollWidth || window.innerWidth;
    const height = container.scrollHeight || window.innerHeight;
    graph.changeSize(width, height);
  });

  // Initialize node collapse state
  if (treeData.children && Array.isArray(treeData.children)) {
    treeData.children.forEach((child) => {
      if (child && child.children && child.children.length) {
        child.collapsed = true;
      }
    });
  }

  // Data change listener for node click
  graph.on('node:click', (evt) => {
    const node = evt.item;
    const model = node.getModel();

    if (model.children && model.children.length > 0) {
      if (model.collapsed) {
        graph.expandSubtree(model.id);
        model.collapsed = false;
        graph.updateItem(node, {
          style: { fill: '#DEE9FF' },
        });
      } else {
        graph.collapseSubtree(model.id);
        model.collapsed = true;
        graph.updateItem(node, {
          style: { fill: '#E8EFF7' },
        });
      }
    }
  });

  // Load data and render
  graph.data(treeData);
  graph.render();
  graph.fitView();

  // Collapse all nodes except the root by default
  setTimeout(() => {
    const root = graph.findById(treeData.id);
    if (root && treeData.children && Array.isArray(treeData.children)) {
      treeData.children.forEach((child) => {
        if (child && child.id) {
          const childNode = graph.findById(child.id);
          if (childNode && child.collapsed) {
            graph.collapseSubtree(child.id);
          }
        }
      });
    }
  }, 500);

  // Create zoom controls
  createZoomControl(graph);

  // Initialize search functionality
  initSearch(graph);
}

// Register a custom node with an icon indicating expand/collapse
function registerCustomNode() {
  G6.registerNode('tree-node', {
    draw: function draw(cfg, group) {
      const width = cfg.size[0];
      const height = cfg.size[1];
      const keyShape = group.addShape('rect', {
        attrs: {
          x: -width / 2,
          y: -height / 2,
          width,
          height,
          fill: cfg.style ? cfg.style.fill : '#DEE9FF',
          stroke: cfg.style ? cfg.style.stroke : '#5B8FF9',
          radius: cfg.style ? cfg.style.radius : 5,
        },
        name: 'key-shape',
      });

      // Add text label
      const label = cfg.label || cfg.id;
      const formattedLabel = label.length > 20 ? label.substring(0, 18) + '...' : label;

      group.addShape('text', {
        attrs: {
          text: formattedLabel,
          x: 0,
          y: 0,
          textAlign: 'center',
          textBaseline: 'middle',
          fill: '#666',
          fontSize: 12,
        },
        name: 'label',
      });

      // Add collapse/expand icon if the node has children
      if (cfg.children && cfg.children.length) {
        const hasCollapsed = cfg.collapsed;

        group.addShape('circle', {
          attrs: {
            x: width / 2 - 8,
            y: 0,
            r: 8,
            fill: '#fff',
            stroke: '#ccc',
          },
          name: 'collapse-icon-bg',
        });

        group.addShape('text', {
          attrs: {
            x: width / 2 - 8,
            y: 0,
            textAlign: 'center',
            textBaseline: 'middle',
            text: hasCollapsed ? '+' : '-',
            fontSize: 16,
            fill: '#666',
            cursor: 'pointer',
          },
          name: 'collapse-icon',
        });
      }

      // Add node type icon/indicator
      const typeColor = getTypeColor(cfg.type);
      group.addShape('circle', {
        attrs: {
          x: -width / 2 + 12,
          y: 0,
          r: 6,
          fill: typeColor,
        },
        name: 'type-indicator',
      });

      return keyShape;
    },
    update: function update(cfg, item) {
      const group = item.getContainer();
      const icon = group.find((ele) => ele.get('name') === 'collapse-icon');
      if (icon) {
        icon.attr({
          text: cfg.collapsed ? '+' : '-',
        });
      }

      // Update node style if needed
      const keyShape = item.get('keyShape');
      keyShape.attr('fill', cfg.style ? cfg.style.fill : '#DEE9FF');
    },
  });
}

// Create zoom control buttons
function createZoomControl(graph) {
  const controlContainer = document.createElement('div');
  controlContainer.className = 'graph-control';

  // Zoom in button
  const zoomInBtn = document.createElement('button');
  zoomInBtn.innerHTML = '+';
  zoomInBtn.addEventListener('click', () => {
    graph.zoom(1.1);
  });

  // Zoom out button
  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.innerHTML = '-';
  zoomOutBtn.addEventListener('click', () => {
    graph.zoom(0.9);
  });

  // Fit view button
  const fitBtn = document.createElement('button');
  fitBtn.innerHTML = '⇔';
  fitBtn.addEventListener('click', () => {
    graph.fitView();
  });

  // Append buttons to control container
  controlContainer.appendChild(zoomInBtn);
  controlContainer.appendChild(zoomOutBtn);
  controlContainer.appendChild(fitBtn);

  // Append control container to the DOM
  document.getElementById('container').appendChild(controlContainer);
}

// Initialize search functionality
function initSearch(graph) {
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  const resetButton = document.getElementById('reset-button');

  if (!searchInput || !searchButton || !resetButton) return;

  // Search button click handler
  searchButton.addEventListener('click', () => {
    const keyword = searchInput.value.trim().toLowerCase();
    if (!keyword) return;

    let found = false;
    const nodes = graph.getNodes();

    // Reset all nodes' states first
    nodes.forEach((node) => {
      graph.clearItemStates(node);
    });

    // Find nodes matching the keyword
    nodes.forEach((node) => {
      const model = node.getModel();
      const id = String(model.id).toLowerCase();
      const label = String(model.label || '').toLowerCase();

      if (id.includes(keyword) || label.includes(keyword)) {
        graph.setItemState(node, 'highlight', true);
        found = true;

        // Expand parent nodes to show the found node
        let parent = model.parent;
        let depth = 0;
        const maxDepth = 20; // Prevent infinite loops

        while (parent && depth < maxDepth) {
          const parentNode = graph.findById(parent);
          if (parentNode) {
            const parentModel = parentNode.getModel();
            if (parentModel.collapsed) {
              graph.expandSubtree(parentModel.id);
              parentModel.collapsed = false;
            }
          }

          // Find next parent
          const parentItem = graph.findById(parent);
          if (parentItem) {
            const parentItemModel = parentItem.getModel();
            parent = parentItemModel.parent;
          } else {
            break;
          }

          depth++;
        }
      }
    });

    if (!found) {
      alert('未找到匹配节点');
    }
  });

  // Reset button click handler
  resetButton.addEventListener('click', () => {
    searchInput.value = '';
    const nodes = graph.getNodes();
    nodes.forEach((node) => {
      graph.clearItemStates(node);
    });
  });

  // Enter key in search input
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      searchButton.click();
    }
  });
}

// Convert flat graph structure to hierarchical tree for G6.TreeGraph
function convertGraphToTree(graphData) {
  const { nodes, links } = graphData;

  // Create a deep copy of nodes to prevent circular references
  const nodeMap = new Map();

  // Create node map with all nodes
  nodes.forEach((node) => {
    // Create a new node object without the children property
    nodeMap.set(node.id, {
      id: node.id,
      label: node.label,
      type: node.type,
      properties: node.properties,
      // Initialize empty children array
      children: [],
    });
  });

  // Process dependency links - avoid circular references
  const edgeMap = new Map(); // Track edges we've processed
  const dependencyGraph = new Map(); // For cycle detection

  // Build a graph representation for cycle detection
  nodes.forEach((node) => {
    dependencyGraph.set(node.id, new Set());
  });

  // Populate the graph
  links.forEach((link) => {
    if (dependencyGraph.has(link.source)) {
      dependencyGraph.get(link.source).add(link.target);
    }
  });

  // Detect and break cycles
  function hasCycle(nodeId, visited = new Set(), recursionStack = new Set()) {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const neighbors = dependencyGraph.get(nodeId) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor, visited, recursionStack)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle - remove this edge
        dependencyGraph.get(nodeId).delete(neighbor);
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  // Detect and break all cycles
  nodes.forEach((node) => {
    hasCycle(node.id);
  });

  // Track incoming links for each node
  const incomingLinks = new Map();

  // Now build the tree using the acyclic graph
  nodes.forEach((node) => {
    const neighbors = dependencyGraph.get(node.id) || new Set();
    for (const neighbor of neighbors) {
      // Create a unique edge ID
      const edgeId = `${node.id}->${neighbor}`;

      // Skip if we've already processed this edge
      if (edgeMap.has(edgeId)) continue;
      edgeMap.set(edgeId, true);

      // Track incoming links
      if (!incomingLinks.has(neighbor)) {
        incomingLinks.set(neighbor, new Set());
      }
      incomingLinks.get(neighbor).add(node.id);

      // Add neighbor as child
      const sourceNode = nodeMap.get(node.id);
      const targetNode = nodeMap.get(neighbor);

      if (sourceNode && targetNode) {
        // Ensure we don't add the same child twice
        const alreadyChild = sourceNode.children.some((child) => child.id === targetNode.id);
        if (!alreadyChild) {
          // Make a shallow copy to avoid circular references
          const childCopy = { ...targetNode };
          // Only include the children property, not the actual children
          childCopy.children = [];
          // Flag to track parent relationship for searching
          childCopy.parent = node.id;

          // Add as child
          sourceNode.children.push(targetNode);
          // Update the target node with parent reference
          targetNode.parent = node.id;
        }
      }
    }
  });

  // Find root nodes (nodes with no incoming links)
  const rootCandidates = Array.from(nodeMap.values()).filter(
    (node) => !incomingLinks.has(node.id) || incomingLinks.get(node.id).size === 0,
  );

  // Create a synthetic root if needed
  let rootNode;
  if (rootCandidates.length === 0) {
    // No root found, use the first node as root
    rootNode = {
      id: 'root',
      label: 'Root',
      type: 'Root',
      children: [],
    };
    // Add the first node as a child of the synthetic root
    if (nodes.length > 0) {
      const firstNode = nodeMap.get(nodes[0].id);
      if (firstNode) {
        rootNode.children.push(firstNode);
        firstNode.parent = 'root';
      }
    }
  } else if (rootCandidates.length === 1) {
    // Single root found
    rootNode = rootCandidates[0];
  } else {
    // Multiple roots, create a synthetic parent
    rootNode = {
      id: 'root',
      label: 'Root',
      type: 'Root',
      children: rootCandidates,
    };

    // Set parent references
    rootCandidates.forEach((node) => {
      node.parent = 'root';
    });
  }

  return rootNode;
}

// Get color based on node type
function getTypeColor(type) {
  const colorMap = {
    App: '#f46649',
    Package: '#0891b2',
    Page: '#f59e0b',
    Component: '#9333ea',
    Module: '#4d7c0f',
    Config: '#ec4899',
    Root: '#64748b',
    Worker: '#7f7f7f',
  };

  return colorMap[type] || '#888888';
}
