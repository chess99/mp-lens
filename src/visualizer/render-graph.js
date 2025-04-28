// This file contains the D3.js logic previously embedded in html-generator.ts
// It assumes that 'window.__GRAPH_DATA__' has been populated with the graph data.

document.addEventListener('DOMContentLoaded', initGraph);

function initGraph() {
  const graphData = window.__GRAPH_DATA__;
  if (!graphData || !graphData.nodes || !graphData.links) {
    console.error('Graph data is missing or invalid.');
    return;
  }

  const width = window.innerWidth;
  const height = window.innerHeight;

  const svg = d3.select('#container').append('svg').attr('viewBox', [0, 0, width, height]);

  const zoom = d3
    .zoom()
    .scaleExtent([0.1, 4]) // Increased max zoom
    .on('zoom', (event) => {
      g.attr('transform', event.transform);
      // Update zoom slider to reflect programmatic zoom/pan
      d3.select('#zoom-range').property('value', event.transform.k);
    });

  svg.call(zoom);

  const g = svg.append('g');

  // Tooltip setup
  const tooltip = d3.select('body').append('div').attr('class', 'tooltip').style('opacity', 0);

  // --- Simulation Setup ---
  const simulation = d3
    .forceSimulation(graphData.nodes)
    .force(
      'link',
      d3
        .forceLink(graphData.links)
        .id((d) => d.id)
        .distance((link) => {
          switch (link.type) {
            case 'Structure':
              return 50;
            case 'Config':
              return 70;
            default:
              return 120;
          }
        })
        .strength(0.5),
    )
    .force('charge', d3.forceManyBody().strength(-400))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('x', d3.forceX(width / 2).strength(0.04))
    .force('y', d3.forceY(height / 2).strength(0.04));
  // .force("collide", d3.forceCollide().radius(d => (d.type === 'App' || d.type === 'Package') ? 20 : 12));

  // --- Drawing Links ---
  const link = g
    .append('g')
    .attr('class', 'links')
    .selectAll('line')
    .data(graphData.links)
    .join('line')
    .attr('class', (d) => `link ${d.type} ${d.highlighted ? 'highlighted' : ''}`)
    .attr('marker-end', 'url(#arrowhead)');

  // Define arrowhead marker
  svg
    .append('defs')
    .append('marker')
    .attr('id', 'arrowhead')
    .attr('viewBox', '-0 -5 10 10')
    .attr('refX', 15)
    .attr('refY', 0)
    .attr('orient', 'auto')
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('xoverflow', 'visible')
    .append('svg:path')
    .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
    .attr('fill', '#999')
    .style('stroke', 'none');

  // --- Drawing Nodes ---
  const node = g
    .append('g')
    .attr('class', 'nodes')
    .selectAll('g')
    .data(graphData.nodes)
    .join('g')
    .attr('class', (d) => `node ${d.type} ${d.highlighted ? 'highlighted' : ''}`)
    .call(drag(simulation));

  node
    .append('circle')
    .attr('r', (d) => (d.type === 'App' || d.type === 'Package' ? 10 : 6))
    .on('mouseover', function (event, d) {
      tooltip.transition().duration(200).style('opacity', 0.9);
      tooltip
        .html(
          `<strong>ID:</strong> ${d.id}<br/><strong>Label:</strong> ${d.label}<br/><strong>Type:</strong> ${d.type}`,
        )
        .style('left', event.pageX + 5 + 'px')
        .style('top', event.pageY - 28 + 'px');
      highlightNeighbors(d, true);
    })
    .on('mouseout', function (event, d) {
      tooltip.transition().duration(500).style('opacity', 0);
      highlightNeighbors(d, false);
    })
    .on('click', function (event, d) {
      console.log('Clicked node:', d);
      centerNode(d);
    });

  node
    .append('text')
    .text((d) => d.label)
    .attr('x', 0)
    .attr('y', (d) => (d.type === 'App' || d.type === 'Package' ? 20 : 12));

  // --- Simulation Ticks ---
  simulation.on('tick', () => {
    link
      .attr('x1', (d) => d.source.x)
      .attr('y1', (d) => d.source.y)
      .attr('x2', (d) => d.target.x)
      .attr('y2', (d) => d.target.y);

    node.attr('transform', (d) => `translate(${d.x},${d.y})`);
  });

  // --- Drag Functionality ---
  function drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
  }

  // --- Highlighting Neighbors ---
  let highlightedNodes = new Set();
  let highlightedLinks = new Set();

  function highlightNeighbors(centerNodeData, state) {
    highlightedNodes.clear();
    highlightedLinks.clear();

    if (state) {
      highlightedNodes.add(centerNodeData.id);
      graphData.links.forEach((l) => {
        if (l.source.id === centerNodeData.id || l.target.id === centerNodeData.id) {
          highlightedLinks.add(l);
          highlightedNodes.add(l.source.id);
          highlightedNodes.add(l.target.id);
        }
      });
    }

    node.classed('highlighted', (d) => highlightedNodes.has(d.id));
    link.classed('highlighted', (l) => highlightedLinks.has(l));

    node.style('opacity', (d) => (state && !highlightedNodes.has(d.id) ? 0.3 : 1));
    link.style('opacity', (l) =>
      state && !highlightedLinks.has(l) ? 0.2 : l.type === 'Config' ? 0.4 : 0.6,
    );
  }

  // --- Search Functionality ---
  function searchNodes() {
    const searchTerm = d3.select('#search-input').property('value').toLowerCase();
    highlightedNodes.clear();
    highlightedLinks.clear();

    if (!searchTerm) {
      node.classed('highlighted', false).style('opacity', 1);
      link.classed('highlighted', false).style('opacity', (l) => (l.type === 'Config' ? 0.4 : 0.6));
      return;
    }

    const matchingNodes = graphData.nodes.filter(
      (d) => d.id.toLowerCase().includes(searchTerm) || d.label.toLowerCase().includes(searchTerm),
    );

    matchingNodes.forEach((n) => {
      highlightedNodes.add(n.id);
      graphData.links.forEach((l) => {
        if (l.source.id === n.id || l.target.id === n.id) {
          highlightedLinks.add(l);
          highlightedNodes.add(l.source.id);
          highlightedNodes.add(l.target.id);
        }
      });
    });

    node.classed('highlighted', (d) => highlightedNodes.has(d.id));
    link.classed('highlighted', (l) => highlightedLinks.has(l));
    node.style('opacity', (d) => (highlightedNodes.has(d.id) ? 1 : 0.1));
    link.style('opacity', (l) =>
      highlightedLinks.has(l) ? (l.type === 'Config' ? 0.4 : 0.8) : 0.05,
    );

    if (matchingNodes.length > 0) {
      // centerNode(matchingNodes[0]); // Optional: Center view on first found
    }
  }

  function resetSearch() {
    d3.select('#search-input').property('value', '');
    searchNodes();
    svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
  }

  // --- Centering Node ---
  function centerNode(targetNode) {
    const DURATION = 750;
    const scale = 1.5;

    // Get the current size of the SVG viewport
    const svgNode = svg.node();
    const currentWidth = svgNode.clientWidth;
    const currentHeight = svgNode.clientHeight;

    // Use D3's zoom transform to calculate translation
    const transform = d3.zoomIdentity
      .translate(currentWidth / 2, currentHeight / 2) // Move origin to center
      .scale(scale) // Apply zoom
      .translate(-targetNode.x, -targetNode.y); // Move target node to center

    svg.transition().duration(DURATION).call(zoom.transform, transform);
  }

  // --- Event Listeners ---
  d3.select('#search-button').on('click', searchNodes);
  d3.select('#reset-button').on('click', resetSearch);
  d3.select('#search-input').on('keydown', (event) => {
    if (event.key === 'Enter') {
      searchNodes();
    }
  });
  d3.select('#zoom-range').on('input', function () {
    const scale = +this.value;
    const transform = d3.zoomTransform(svg.node());
    svg
      .transition()
      .duration(50)
      .call(zoom.transform, d3.zoomIdentity.translate(transform.x, transform.y).scale(scale));
  });
}
