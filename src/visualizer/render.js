/* global G6, window, document, console, alert */
// This file contains the AntV G6 TreeGraph visualization logic.
// It assumes that 'window.__TREE_DATA__' (hierarchical) has been populated.

document.addEventListener('DOMContentLoaded', init);

let _currentGraphInstance = null; // Keep track of the TreeGraph instance

// Helper function to check if a node is a leaf node in the tree data structure
function isLeafNode(nodeData) {
  return !nodeData.children || nodeData.children.length === 0;
}

function init() {
  // Check G6
  if (typeof G6 === 'undefined') {
    console.error('AntV G6 library is not loaded.');
    document.getElementById('container').innerHTML =
      '<div style="color: red; padding: 20px;">Error: G6 library failed to load.</div>';
    return;
  }

  // Get data
  const treeData = window.__TREE_DATA__;

  // Basic data validation
  if (!treeData || !treeData.id) {
    console.error('Tree data is missing or invalid.');
    document.getElementById('container').innerHTML =
      '<div style="color: red; padding: 20px;">Error: Tree data missing.</div>';
    return;
  }

  // Get container dimensions
  const container = document.getElementById('container');
  if (!container) {
    console.error('Container element #container not found.');
    return;
  }
  const width = container.scrollWidth || window.innerWidth;
  const height = container.scrollHeight || window.innerHeight;

  // --- TreeGraph Configuration (Inspired by G6 Example) ---
  const graphInstance = new G6.TreeGraph({
    container: 'container',
    width,
    height,
    // Data is loaded later
    modes: {
      // Use behaviors from example
      default: ['drag-canvas', 'zoom-canvas', 'drag-element', 'collapse-expand'],
    },
    defaultNode: {
      // Configure built-in node type based on example
      // type: - Uses G6 default node for TreeGraph (likely circle or ellipse)
      // size: - Let layout determine or use G6 default
      style: {
        // Example styling for built-in node
        labelText: (d) => d.label || d.id, // Use label, fallback to id
        labelPlacement: (d) => (isLeafNode(d) ? 'right' : 'left'),
        labelBackground: true,
        ports: [{ placement: 'right' }, { placement: 'left' }],
        // Keep some styles from previous config if desired, e.g., fill/stroke
        fill: '#DEE9FF',
        stroke: '#5B8FF9',
        lineWidth: 1,
        // radius: - determined by node type
      },
      labelCfg: {
        // Style the label text itself
        style: {
          fontSize: 11,
          fill: '#333',
        },
      },
      // nodeStateStyles can remain for hover/select effects
    },
    defaultEdge: {
      type: 'cubic-horizontal', // Keep cubic-horizontal edge type
      style: {
        stroke: '#A3B1BF',
        lineWidth: 1.5,
        endArrow: { path: G6.Arrow.triangle(6, 8, 0), d: 0, fill: '#A3B1BF' },
      },
      // edgeStateStyles can remain
    },
    nodeStateStyles: {
      // Keep existing state styles for visual feedback
      highlight: { fill: '#e6f7ff', stroke: '#1890ff', lineWidth: 2 },
      select: { stroke: '#00f', lineWidth: 2, shadowColor: '#00f', shadowBlur: 5 },
      dark: { opacity: 0.2 },
    },
    layout: {
      // Use layout parameters from example
      type: 'compactBox',
      direction: 'LR',
      getId: (d) => d.id,
      getHeight: () => 32, // From example
      getWidth: () => 32, // From example
      getVGap: () => 10, // From example
      getHGap: () => 100, // From example
    },
    animate: true, // Keep animation
    animateCfg: { duration: 300, easing: 'easeCubic' },
  });

  _currentGraphInstance = graphInstance; // Store the created instance

  console.log('Initializing TreeGraph with G6 example style layout:', graphInstance.get('layout'));

  // --- Event Listeners ---
  // Window resize
  window.addEventListener('resize', () => {
    if (!graphInstance || graphInstance.get('destroyed')) return;
    const currentWidth = container.scrollWidth || window.innerWidth;
    const currentHeight = container.scrollHeight || window.innerHeight;
    graphInstance.changeSize(currentWidth, currentHeight);
  });

  // Canvas click (Clear selection)
  graphInstance.on('canvas:click', () => {
    // Find selected nodes and clear their state
    const selectedNodes = graphInstance.findAllByState('node', 'select');
    selectedNodes.forEach((node) => {
      graphInstance.clearItemStates(node, 'select');
    });
    // You might also want to clear highlight/dark states here if clicking canvas should reset everything
    // graphInstance.getNodes().forEach((node) => graphInstance.clearItemStates(node, ['select', 'highlight', 'dark']));
  });

  // --- Load Data and Initial Render ---
  console.log('Loading treeData:', JSON.stringify(treeData).substring(0, 500) + '...');
  graphInstance.data(treeData);
  graphInstance.render();
  graphInstance.fitView(20);

  // --- UI Controls ---
  createZoomControl(graphInstance);
  initSearch(graphInstance); // Should still work
  createLayoutSwitcher(graphInstance); // Should still work
}

// --- UI Control Functions ---

// Zoom Controls (Keep as is)
function createZoomControl(graph) {
  const container = document.getElementById('container');
  if (!container) return;

  let controlContainer = container.querySelector('.graph-control-zoom');
  if (!controlContainer) {
    controlContainer = document.createElement('div');
    controlContainer.className = 'graph-control graph-control-zoom'; // Added specific class
    container.appendChild(controlContainer);
  }
  controlContainer.innerHTML = ''; // Clear previous buttons

  const zoomInBtn = document.createElement('button');
  zoomInBtn.innerHTML = '+';
  zoomInBtn.title = 'Zoom In';
  zoomInBtn.addEventListener('click', () => graph.zoom(1.2));

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.innerHTML = '-';
  zoomOutBtn.title = 'Zoom Out';
  zoomOutBtn.addEventListener('click', () => graph.zoom(0.8));

  const fitBtn = document.createElement('button');
  fitBtn.innerHTML = '⇔';
  fitBtn.title = 'Fit View';
  fitBtn.addEventListener('click', () => graph.fitView(20));

  controlContainer.appendChild(zoomInBtn);
  controlContainer.appendChild(zoomOutBtn);
  controlContainer.appendChild(fitBtn);
}

// Search Functionality (Keep as is - searches model data)
function initSearch(graph) {
  const searchInput = document.getElementById('search-input');
  const searchButton = document.getElementById('search-button');
  const resetButton = document.getElementById('reset-button');

  if (!searchInput || !searchButton || !resetButton) return;

  const performSearch = () => {
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
      resetSearch();
      return;
    }

    const allItemMap = graph.get('itemMap'); // Use itemMap for TreeGraph
    const allNodes = Object.values(allItemMap).filter(
      (item) => item.getType && item.getType() === 'node',
    );
    let matchedItems = [];

    // Clear previous states
    allNodes.forEach((node) => {
      graph.clearItemStates(node, ['highlight', 'dark']);
    });

    // Search in TreeGraph data using traversal
    matchedItems = [];
    // IMPORTANT: graph.save() gets the *data*, graph.getNodes() gets the *items*
    // We need to find the items corresponding to the matched data nodes.
    const matchedNodeIds = new Set();
    G6.Util.traverseTree(graph.save(), (nodeData) => {
      const label = String(nodeData.label || nodeData.id).toLowerCase();
      if (label.includes(query)) {
        matchedNodeIds.add(nodeData.id);
      }
    });

    // Get the actual G6 item objects for the matched IDs
    matchedItems = allNodes.filter((nodeItem) => matchedNodeIds.has(nodeItem.getID()));

    if (matchedItems.length > 0) {
      // Expand ancestors of matched nodes to make them visible
      matchedItems.forEach((item) => {
        let current = item;
        while (current) {
          const parentItem = current.get('parent');
          if (!parentItem) break;
          const parentModel = parentItem.getModel();
          if (parentModel.collapsed) {
            graph.updateItem(parentItem, { collapsed: false });
          }
          current = parentItem;
        }
      });
      graph.layout(); // Apply layout changes due to expansion

      // Dim non-matching nodes and highlight matches
      allNodes.forEach((node) => {
        if (!matchedItems.includes(node)) {
          graph.setItemState(node, 'dark', true);
        } else {
          graph.setItemState(node, 'highlight', true);
        }
      });

      // Focus on the first matched node
      graph.focusItem(matchedItems[0], true, { duration: 500, easing: 'easeCubic' });
    } else {
      console.log('No nodes found matching:', query);
      alert('No matching nodes found.');
    }
  };

  const resetSearch = () => {
    searchInput.value = '';
    graph.getNodes().forEach((node) => {
      graph.clearItemStates(node, ['highlight', 'dark']);
    });
    // graph.fitView(20); // Optional reset view
  };

  searchButton.addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      performSearch();
    }
  });
  resetButton.addEventListener('click', resetSearch);
}

// Layout Switcher (Keep as is - switches tree layouts)
function createLayoutSwitcher(graph) {
  const placeholder = document.getElementById('layout-control-placeholder');
  if (!placeholder) return;

  placeholder.innerHTML = ''; // Clear placeholder

  const label = document.createElement('label');
  label.htmlFor = 'layout-select';
  label.textContent = 'Layout:';

  const select = document.createElement('select');
  select.id = 'layout-select';

  // Layouts suitable for TreeGraph
  const layouts = [
    { name: 'Compact Box', value: { type: 'compactBox', direction: 'LR' } },
    { name: 'Indent', value: { type: 'indent', direction: 'LR' } },
    { name: 'Dendrogram', value: { type: 'dendrogram', direction: 'LR' } },
    { name: 'Mindmap', value: { type: 'mindmap', direction: 'LR' } },
  ];

  let currentLayoutConfig = graph.get('layout');
  const currentType = currentLayoutConfig.type || 'compactBox'; // Default to compactBox

  layouts.forEach((layoutOpt) => {
    const option = document.createElement('option');
    option.value = JSON.stringify(layoutOpt.value);
    option.textContent = layoutOpt.name;
    if (currentType === layoutOpt.value.type) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  select.addEventListener('change', (e) => {
    try {
      const newLayoutConfig = JSON.parse(e.target.value);
      console.log('Changing layout to:', newLayoutConfig);
      graph.updateLayout(newLayoutConfig);
    } catch (error) {
      console.error('Error parsing layout config:', error);
    }
  });

  placeholder.appendChild(label);
  placeholder.appendChild(select);
}
