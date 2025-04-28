/* global G6, window, document, console, Chart */
// This file contains the visualization logic for the MP-Lens tool
// It assumes that 'window.__TREE_DATA__' (hierarchical) has been populated.

document.addEventListener('DOMContentLoaded', init);

// Global variables
let _treeData = null;
let _statistics = null;
let _graphInstance = null;
let _selectedNode = null;
let _charts = {};

// Initialize the application
function init() {
  // Check data
  _treeData = window.__TREE_DATA__;
  if (!_treeData || !_treeData.id) {
    console.error('Tree data is missing or invalid.');
    document.getElementById('tree-container').innerHTML =
      '<div style="color: red; padding: 20px;">错误：数据加载失败。</div>';
    return;
  }

  // Calculate statistics from tree data
  _statistics = generateStatistics(_treeData);

  // Update overview statistics
  updateOverviewStats(_statistics);

  // Generate the tree view in sidebar
  renderTreeView(_treeData);

  // Initialize tabs
  initTabs();

  // Initialize search
  initSearch();

  // Handle window resize
  window.addEventListener('resize', handleResize);
}

// Generate statistics from the tree data
function generateStatistics(data) {
  const stats = {
    totalFiles: 0,
    totalCodeSize: 0,
    totalPages: 0,
    totalComponents: 0,
    fileTypes: {},
    sizeByType: {},
    nodes: new Map(),
  };

  // Helper function to traverse the tree and collect statistics
  function traverse(node) {
    // Count by node type
    if (node.type === 'Page') {
      stats.totalPages++;
    } else if (node.type === 'Component') {
      stats.totalComponents++;
    }

    // Use pre-calculated fileCount from backend if available
    const fileCount = node.properties?.fileCount || 0;
    const fileSize = node.properties?.totalSize || 0;
    const fileTypes = node.properties?.fileTypes || {};

    // Store nodes by ID for quick lookup with pre-calculated counts
    stats.nodes.set(node.id, {
      ...node,
      files: fileCount,
      size: fileSize,
    });

    // For root node, use the pre-calculated values directly
    if (node.type === 'App' && fileCount > 0) {
      stats.totalFiles = fileCount;
      stats.totalCodeSize = fileSize;

      // Accumulate file type statistics from pre-calculated data
      for (const [ext, count] of Object.entries(fileTypes)) {
        if (!stats.fileTypes[ext]) {
          stats.fileTypes[ext] = 0;
          stats.sizeByType[ext] = 0;
        }
        stats.fileTypes[ext] += count;
        // Estimate size by type since we don't have exact per-type size
        stats.sizeByType[ext] += fileSize * (count / fileCount);
      }
    }
    // For individual files, still count them to get accurate file type distribution
    else if (node.properties && node.properties.fileExt) {
      // Process file type
      const fileType = node.properties.fileExt;
      if (!stats.fileTypes[fileType]) {
        stats.fileTypes[fileType] = 0;
        stats.sizeByType[fileType] = 0;
      }
      stats.fileTypes[fileType]++;
      stats.sizeByType[fileType] += node.properties.fileSize || 0;
    }

    // Traverse children
    if (node.children && node.children.length > 0) {
      node.children.forEach(traverse);
    }
  }

  traverse(data);
  return stats;
}

// Update the overview statistics in the sidebar
function updateOverviewStats(stats) {
  document.getElementById('total-files').textContent = stats.totalFiles;
  document.getElementById('total-code-size').textContent = formatBytes(stats.totalCodeSize);
  document.getElementById('total-pages').textContent = stats.totalPages;
  document.getElementById('total-components').textContent = stats.totalComponents;
}

// Render the tree view in the sidebar
function renderTreeView(data, container = null) {
  if (!container) {
    container = document.getElementById('tree-container');
    container.innerHTML = '';
  }

  // Helper function to create a node element
  function createNodeElement(node) {
    const nodeInfo = _statistics.nodes.get(node.id) || {};
    const hasChildren = node.children && node.children.length > 0;

    // Create node container
    const nodeElement = document.createElement('div');
    nodeElement.className = 'tree-node';
    nodeElement.dataset.id = node.id;
    nodeElement.dataset.type = node.type.toLowerCase();

    // Create toggle button (if has children)
    const toggleButton = document.createElement('span');
    toggleButton.className = hasChildren ? 'node-toggle' : 'node-toggle leaf';
    toggleButton.innerHTML = '▼';
    if (hasChildren) {
      toggleButton.classList.add('collapsed');
    }
    nodeElement.appendChild(toggleButton);

    // Create type icon
    const iconElement = document.createElement('span');
    iconElement.className = `node-icon ${node.type.toLowerCase()}`;
    iconElement.textContent = node.type.charAt(0);
    nodeElement.appendChild(iconElement);

    // Create content container
    const contentElement = document.createElement('div');
    contentElement.className = 'node-content';

    // Create header with name and stats
    const headerElement = document.createElement('div');
    headerElement.className = 'node-header';

    const nameElement = document.createElement('span');
    nameElement.className = 'node-name';
    nameElement.textContent = node.label || node.id;
    headerElement.appendChild(nameElement);

    // Add stats if available
    if (nodeInfo.files > 0) {
      const statsElement = document.createElement('span');
      statsElement.className = 'node-stats';
      statsElement.textContent = `${nodeInfo.files}文件`;
      headerElement.appendChild(statsElement);
    }

    contentElement.appendChild(headerElement);

    // Add metadata if available
    if (nodeInfo.size > 0) {
      const metaElement = document.createElement('div');
      metaElement.className = 'node-meta';
      metaElement.textContent = formatBytes(nodeInfo.size);
      contentElement.appendChild(metaElement);
    }

    nodeElement.appendChild(contentElement);

    // Create children container (initially hidden if collapsed)
    if (hasChildren) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      childrenContainer.style.display = 'none';

      // Recursively create child nodes
      node.children.forEach((childNode) => {
        const childElement = createNodeElement(childNode);
        childrenContainer.appendChild(childElement);
      });

      // Append children container after the node
      nodeElement.parentChildrenContainer = childrenContainer;

      // Toggle collapse/expand on click
      toggleButton.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleButton.classList.toggle('collapsed');
        childrenContainer.style.display =
          childrenContainer.style.display === 'none' ? 'block' : 'none';
      });
    }

    // Node click handler
    nodeElement.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(node);
    });

    return nodeElement;
  }

  // Create root node element
  const rootElement = createNodeElement(data);
  container.appendChild(rootElement);

  // If root has children, append the children container
  if (rootElement.parentChildrenContainer) {
    container.appendChild(rootElement.parentChildrenContainer);

    // Auto-expand the first level for better UX
    rootElement.querySelector('.node-toggle').classList.remove('collapsed');
    rootElement.parentChildrenContainer.style.display = 'block';
  }
}

// Select a node and display its details
function selectNode(node) {
  // Clear previous selection
  const prevSelected = document.querySelector('.tree-node.active');
  if (prevSelected) {
    prevSelected.classList.remove('active');
  }

  // Mark current node as selected
  const nodeElement = document.querySelector(`.tree-node[data-id="${node.id}"]`);
  if (nodeElement) {
    nodeElement.classList.add('active');
  }

  // Store selected node
  _selectedNode = node;

  // Update title
  document.getElementById('selected-item-title').textContent = node.label || node.id;

  // Update details in overview tab
  updateNodeDetails(node);

  // Initialize or update the dependency graph in graph tab
  if (document.querySelector('#graph-tab').classList.contains('active')) {
    initializeOrUpdateGraph(node);
  }

  // Update stats charts in stats tab
  if (document.querySelector('#stats-tab').classList.contains('active')) {
    updateStatsCharts(node);
  }
}

// Update node details in the overview tab
function updateNodeDetails(node) {
  const detailsContainer = document.getElementById('item-details');
  const nodeInfo = _statistics.nodes.get(node.id) || {};

  // 提取并格式化路径信息
  let basePath = '';
  if (node.properties?.absolutePath) {
    basePath = node.properties.absolutePath;
  } else if (node.properties?.path) {
    basePath = node.properties.path;
  } else if (node.id && typeof node.id === 'string') {
    basePath = node.id;
  }

  // 格式化统计信息，确保数字显示正确
  const fileCount = nodeInfo.files || 0;
  const totalSize = nodeInfo.size || node.properties?.fileSize || 0;

  // 格式化文件类型信息
  let fileTypesHtml = '<div>没有文件类型信息</div>';
  if (nodeInfo.fileTypes && Object.keys(nodeInfo.fileTypes).length > 0) {
    fileTypesHtml =
      '<table style="width:100%; border-collapse: collapse;">' +
      '<tr><th style="text-align:left; padding:4px;">文件类型</th><th style="text-align:right; padding:4px;">数量</th></tr>';

    Object.entries(nodeInfo.fileTypes)
      .sort((a, b) => b[1] - a[1]) // 按数量降序排序
      .forEach(([type, count]) => {
        fileTypesHtml += `<tr><td style="padding:4px;">${
          type || 'unknown'
        }</td><td style="text-align:right; padding:4px;">${count}</td></tr>`;
      });

    fileTypesHtml += '</table>';
  } else if (node.properties?.fileExt) {
    // 如果节点本身是文件，显示它的类型
    fileTypesHtml = `<div>文件类型: ${node.properties.fileExt || 'unknown'}</div>`;
  }

  let html = `
    <div style="padding: 20px;">
      <h3>${node.label || node.id}</h3>
      <div style="margin-bottom: 15px; display: flex; gap: 10px; color: #666;">
        <span>类型: ${node.type}</span>
        ${fileCount > 0 ? `<span>|</span><span>文件数: ${fileCount}</span>` : ''}
        ${totalSize > 0 ? `<span>|</span><span>总大小: ${formatBytes(totalSize)}</span>` : ''}
      </div>
  `;

  // 添加路径信息
  html += `<div style="margin-bottom: 15px;">
    <div style="font-weight: 500; margin-bottom: 5px;">路径:</div>
    <div style="font-family: monospace; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 4px;">${basePath}</div>
  </div>`;

  // 添加节点类型特定信息
  if (node.type === 'App') {
    html += `<div style="margin-bottom: 15px;">
      <div style="font-weight: 500; margin-bottom: 5px;">应用入口</div>
    </div>`;
  } else if (node.type === 'Package') {
    html += `<div style="margin-bottom: 15px;">
      <div style="font-weight: 500; margin-bottom: 5px;">包信息:</div>
      <div>路径: ${node.properties?.root || '未知'}</div>
    </div>`;
  } else if (node.type === 'Page' || node.type === 'Component') {
    html += `<div style="margin-bottom: 15px;">
      <div style="font-weight: 500; margin-bottom: 5px;">${node.type}信息:</div>
      <div>路径: ${basePath}</div>
    </div>`;
  }

  // 添加文件类型统计
  if (fileCount > 0 || node.properties?.fileExt) {
    html += `<div style="margin-bottom: 15px;">
      <div style="font-weight: 500; margin-bottom: 5px;">文件类型分布:</div>
      ${fileTypesHtml}
    </div>`;
  }

  // 如果有其他属性，以JSON格式显示
  if (node.properties && Object.keys(node.properties).length > 0) {
    // 过滤掉已经显示的基本属性
    const filteredProps = { ...node.properties };
    delete filteredProps.fileCount;
    delete filteredProps.totalSize;
    delete filteredProps.fileTypes;

    if (Object.keys(filteredProps).length > 0) {
      html += `
        <div style="margin-top: 20px;">
          <div style="font-weight: 500; margin-bottom: 5px;">其他属性:</div>
          <div style="font-family: monospace; background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto;">
            <pre>${JSON.stringify(filteredProps, null, 2)}</pre>
          </div>
        </div>
      `;
    }
  }

  html += `</div>`;
  detailsContainer.innerHTML = html;
}

// Initialize or update the dependency graph in the graph tab
function initializeOrUpdateGraph(node) {
  const container = document.getElementById('graph-container');

  // Create subgraph data focused on the selected node
  const graphData = createSubgraphForNode(node);

  if (_graphInstance) {
    // Update existing graph
    _graphInstance.changeData(graphData);
    _graphInstance.fitView(20);
  } else {
    // Initialize G6 graph
    initializeGraph(container, graphData);
  }
}

// Create a subgraph focused on the selected node
function createSubgraphForNode(node) {
  // Create a focused graph with the selected node at the center
  // and its immediate children and parents

  // This is a simplified version - a real implementation would
  // traverse the full tree and find connected nodes

  const nodes = [];
  const edges = [];

  // Add the selected node
  nodes.push({
    id: node.id,
    label: node.label || node.id,
    type: node.type,
    style: { fill: '#e6f7ff', stroke: '#1890ff', lineWidth: 2 },
  });

  // Add child nodes and edges
  if (node.children && node.children.length > 0) {
    node.children.forEach((child) => {
      nodes.push({
        id: child.id,
        label: child.label || child.id,
        type: child.type,
      });

      edges.push({
        source: node.id,
        target: child.id,
        label: 'contains',
      });
    });
  }

  // Find and add parent nodes if available
  if (node.parent) {
    // In a real implementation, you would find the parent node in the full tree
    // This is just a placeholder
    nodes.push({
      id: node.parent,
      label: node.parent,
      type: 'Parent',
    });

    edges.push({
      source: node.parent,
      target: node.id,
      label: 'contains',
    });
  }

  return { nodes, edges };
}

// Initialize the G6 graph
function initializeGraph(container, data) {
  if (!window.G6) {
    console.error('G6 library not loaded');
    container.innerHTML = '<div style="color: red; padding: 20px;">错误：图形库加载失败。</div>';
    return;
  }

  const width = container.clientWidth;
  const height = container.clientHeight;

  _graphInstance = new G6.Graph({
    container: container.id,
    width,
    height,
    layout: {
      type: 'force',
      preventOverlap: true,
      linkDistance: 100,
    },
    defaultNode: {
      size: 40,
      style: {
        fill: '#DEE9FF',
        stroke: '#5B8FF9',
        lineWidth: 1,
      },
      labelCfg: {
        style: {
          fill: '#333',
          fontSize: 12,
        },
      },
    },
    defaultEdge: {
      style: {
        stroke: '#A3B1BF',
        lineWidth: 1.5,
        endArrow: true,
      },
      labelCfg: {
        style: {
          fill: '#666',
          fontSize: 10,
        },
      },
    },
    modes: {
      default: ['drag-canvas', 'zoom-canvas', 'drag-node'],
    },
  });

  _graphInstance.data(data);
  _graphInstance.render();
  _graphInstance.fitView(20);

  // Add zoom controls
  createZoomControls();
}

// Create zoom controls for the graph
function createZoomControls() {
  if (!_graphInstance) return;

  const container = document.getElementById('graph-container');

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
  zoomInBtn.addEventListener('click', () => _graphInstance.zoom(1.2));

  const zoomOutBtn = document.createElement('button');
  zoomOutBtn.textContent = '-';
  zoomOutBtn.style.width = '28px';
  zoomOutBtn.style.height = '28px';
  zoomOutBtn.style.cursor = 'pointer';
  zoomOutBtn.addEventListener('click', () => _graphInstance.zoom(0.8));

  const fitBtn = document.createElement('button');
  fitBtn.textContent = '⇔';
  fitBtn.style.width = '28px';
  fitBtn.style.height = '28px';
  fitBtn.style.cursor = 'pointer';
  fitBtn.addEventListener('click', () => _graphInstance.fitView(20));

  controlsContainer.appendChild(zoomInBtn);
  controlsContainer.appendChild(zoomOutBtn);
  controlsContainer.appendChild(fitBtn);

  container.appendChild(controlsContainer);
}

// Update statistics charts in the stats tab
function updateStatsCharts(node) {
  const nodeInfo = _statistics.nodes.get(node.id) || {};

  // Generate data for file type distribution
  let fileTypeData = {};
  let sizeTypeData = {};

  // If this is a container node (has children), get stats from the node info
  if (nodeInfo.files > 0) {
    // Placeholder - in a real implementation, you would calculate
    // file type distributions for the selected node
    // This is just sample data
    fileTypeData = {
      js: Math.round(nodeInfo.files * 0.4),
      wxml: Math.round(nodeInfo.files * 0.3),
      wxss: Math.round(nodeInfo.files * 0.2),
      json: Math.round(nodeInfo.files * 0.1),
    };

    sizeTypeData = {
      js: Math.round(nodeInfo.size * 0.5),
      wxml: Math.round(nodeInfo.size * 0.2),
      wxss: Math.round(nodeInfo.size * 0.2),
      json: Math.round(nodeInfo.size * 0.1),
    };
  }
  // If this is a leaf node (file), use its own data
  else if (node.properties && node.properties.fileExt) {
    fileTypeData[node.properties.fileExt] = 1;
    sizeTypeData[node.properties.fileExt] = node.properties.fileSize || 0;
  }
  // Otherwise use global stats
  else {
    fileTypeData = _statistics.fileTypes;
    sizeTypeData = _statistics.sizeByType;
  }

  // Update file types chart
  updateOrCreateChart('file-types-chart', '文件类型分布', fileTypeData);

  // Update code size chart
  updateOrCreateChart('code-size-chart', '代码量分布', sizeTypeData, true);
}

// Update or create a chart
function updateOrCreateChart(chartId, title, data, isBytes = false) {
  const canvas = document.getElementById(chartId);

  if (!canvas) {
    console.error(`Canvas with ID ${chartId} not found`);
    return;
  }

  // Prepare data for Chart.js
  const labels = Object.keys(data);
  const values = Object.values(data);

  // Format values if they are bytes
  const formattedValues = isBytes ? values.map((size) => parseInt(size, 10)) : values;

  const formattedLabels = isBytes ? labels.map((label) => label) : labels;

  // Color palette
  const colors = [
    '#FF6384',
    '#36A2EB',
    '#FFCE56',
    '#4BC0C0',
    '#9966FF',
    '#FF9F40',
    '#8AC54A',
    '#EA526F',
    '#18A558',
    '#474A51',
    '#5BC8AF',
    '#6D9DC5',
  ];

  // Chart configuration
  const config = {
    type: 'pie',
    data: {
      labels: formattedLabels,
      datasets: [
        {
          data: formattedValues,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: {
          display: true,
          text: title,
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              const value = context.raw;
              const label = context.label;
              if (isBytes) {
                return `${label}: ${formatBytes(value)}`;
              } else {
                return `${label}: ${value}`;
              }
            },
          },
        },
      },
    },
  };

  // Create or update chart
  if (_charts[chartId]) {
    _charts[chartId].data.labels = formattedLabels;
    _charts[chartId].data.datasets[0].data = formattedValues;
    _charts[chartId].update();
  } else {
    _charts[chartId] = new Chart(canvas, config);
  }
}

// Initialize tabs functionality
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      // Deactivate all tabs and contents
      tabs.forEach((t) => t.classList.remove('active'));
      tabContents.forEach((content) => content.classList.remove('active'));

      // Activate the clicked tab and corresponding content
      tab.classList.add('active');
      const tabId = tab.dataset.tab;
      document.getElementById(`${tabId}-tab`).classList.add('active');

      // If graph tab activated, initialize or update graph
      if (tabId === 'graph' && _selectedNode) {
        initializeOrUpdateGraph(_selectedNode);
      }

      // If stats tab activated, update charts
      if (tabId === 'stats' && _selectedNode) {
        updateStatsCharts(_selectedNode);
      }
    });
  });
}

// Initialize search functionality
function initSearch() {
  const searchInput = document.getElementById('search-input');

  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();

    if (!query) {
      // Reset search
      resetSearch();
      return;
    }

    // Perform search on nodes
    const searchResults = [];

    // Helper function to search in node and its children
    function searchNode(node) {
      const label = (node.label || node.id).toLowerCase();

      if (label.includes(query)) {
        searchResults.push(node);
      }

      if (node.children && node.children.length > 0) {
        node.children.forEach(searchNode);
      }
    }

    // Start search from root
    searchNode(_treeData);

    // Highlight search results
    highlightSearchResults(searchResults);
  });
}

// Highlight search results in the tree
function highlightSearchResults(results) {
  // Reset previous highlights
  document.querySelectorAll('.tree-node').forEach((node) => {
    node.style.backgroundColor = '';
    node.style.fontWeight = '';
  });

  // Highlight matches
  results.forEach((result) => {
    const nodeElement = document.querySelector(`.tree-node[data-id="${result.id}"]`);
    if (nodeElement) {
      nodeElement.style.backgroundColor = '#FFFF99';

      // Ensure all parent containers are expanded
      let parent = nodeElement.parentElement;
      while (parent && parent.classList.contains('tree-children')) {
        parent.style.display = 'block';

        // Update toggle button
        const toggleButton = parent.previousElementSibling.querySelector('.node-toggle');
        if (toggleButton) {
          toggleButton.classList.remove('collapsed');
        }

        parent = parent.parentElement.parentElement;
      }

      // Scroll to first result
      if (result === results[0]) {
        nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
}

// Reset search highlights
function resetSearch() {
  document.querySelectorAll('.tree-node').forEach((node) => {
    node.style.backgroundColor = '';
    node.style.fontWeight = '';
  });
}

// Handle window resize
function handleResize() {
  if (_graphInstance) {
    const container = document.getElementById('graph-container');
    _graphInstance.changeSize(container.clientWidth, container.clientHeight);
  }

  // Update charts if they exist
  Object.values(_charts).forEach((chart) => {
    if (chart && typeof chart.resize === 'function') {
      chart.resize();
    }
  });
}

// Format bytes to human-readable format
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}
