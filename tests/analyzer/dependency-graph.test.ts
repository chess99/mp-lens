import { DependencyGraph } from '../../src/analyzer/dependency-graph';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  it('should initialize with zero nodes and edges', () => {
    expect(graph.nodeCount).toBe(0);
    expect(graph.edgeCount).toBe(0);
    expect(graph.nodes()).toEqual([]);
  });

  // --- Node Tests ---
  describe('Nodes', () => {
    it('should add nodes correctly', () => {
      graph.addNode('a.js');
      graph.addNode('b.js');
      expect(graph.hasNode('a.js')).toBe(true);
      expect(graph.hasNode('b.js')).toBe(true);
      expect(graph.hasNode('c.js')).toBe(false);
      expect(graph.nodeCount).toBe(2);
      expect(graph.nodes()).toEqual(expect.arrayContaining(['a.js', 'b.js']));
    });

    it('should not add duplicate nodes', () => {
      graph.addNode('a.js');
      graph.addNode('a.js');
      expect(graph.nodeCount).toBe(1);
      expect(graph.nodes()).toEqual(['a.js']);
    });
  });

  // --- Edge Tests ---
  describe('Edges', () => {
    beforeEach(() => {
      // Add some nodes for edge tests
      graph.addNode('a.js');
      graph.addNode('b.js');
      graph.addNode('c.js');
    });

    it('should add edges correctly and create nodes if they dont exist', () => {
      graph.addEdge('a.js', 'b.js');
      graph.addEdge('a.js', 'c.js');
      graph.addEdge('b.js', 'c.js');
      graph.addEdge('d.js', 'a.js'); // Add edge with new node 'd.js'

      expect(graph.hasEdge('a.js', 'b.js')).toBe(true);
      expect(graph.hasEdge('a.js', 'c.js')).toBe(true);
      expect(graph.hasEdge('b.js', 'c.js')).toBe(true);
      expect(graph.hasEdge('d.js', 'a.js')).toBe(true);
      expect(graph.hasEdge('b.js', 'a.js')).toBe(false); // Check non-existent edge
      expect(graph.hasEdge('c.js', 'a.js')).toBe(false);

      // Check node was added
      expect(graph.hasNode('d.js')).toBe(true);
      expect(graph.nodeCount).toBe(4);
      expect(graph.edgeCount).toBe(4);
    });

    it('should not add duplicate edges', () => {
      graph.addEdge('a.js', 'b.js');
      graph.addEdge('a.js', 'b.js');
      expect(graph.edgeCount).toBe(1);
      expect(graph.outEdges('a.js')).toEqual(['b.js']);
      expect(graph.inEdges('b.js')).toEqual(['a.js']);
    });

    it('should return correct out-edges and out-degree', () => {
      graph.addEdge('a.js', 'b.js');
      graph.addEdge('a.js', 'c.js');

      expect(graph.outEdges('a.js')).toEqual(expect.arrayContaining(['b.js', 'c.js']));
      expect(graph.outEdges('b.js')).toEqual([]);
      expect(graph.outEdges('nonexistent.js')).toEqual([]);

      expect(graph.outDegree('a.js')).toBe(2);
      expect(graph.outDegree('b.js')).toBe(0);
      expect(graph.outDegree('nonexistent.js')).toBe(0);
    });

    it('should return correct in-edges and in-degree', () => {
      graph.addEdge('a.js', 'c.js');
      graph.addEdge('b.js', 'c.js');

      expect(graph.inEdges('c.js')).toEqual(expect.arrayContaining(['a.js', 'b.js']));
      expect(graph.inEdges('a.js')).toEqual([]);
      expect(graph.inEdges('nonexistent.js')).toEqual([]);

      expect(graph.inDegree('c.js')).toBe(2);
      expect(graph.inDegree('a.js')).toBe(0);
      expect(graph.inDegree('nonexistent.js')).toBe(0);
    });
  });

  // --- JSON Conversion Test ---
  describe('toJSON', () => {
    it('should return correct JSON representation', () => {
      graph.addEdge('a.js', 'b.js');
      graph.addEdge('a.js', 'c.js');
      graph.addEdge('b.js', 'c.js');
      graph.addNode('d.js'); // Isolated node

      const json = graph.toJSON();

      expect(json.nodes).toEqual(
        expect.arrayContaining([{ id: 'a.js' }, { id: 'b.js' }, { id: 'c.js' }, { id: 'd.js' }]),
      );
      // Order of nodes might vary, so check length
      expect(json.nodes).toHaveLength(4);

      expect(json.links).toEqual(
        expect.arrayContaining([
          { source: 'a.js', target: 'b.js' },
          { source: 'a.js', target: 'c.js' },
          { source: 'b.js', target: 'c.js' },
        ]),
      );
      // Order of links might vary, so check length
      expect(json.links).toHaveLength(3);
    });

    it('should return empty arrays for an empty graph', () => {
      const json = graph.toJSON();
      expect(json.nodes).toEqual([]);
      expect(json.links).toEqual([]);
    });
  });
});
