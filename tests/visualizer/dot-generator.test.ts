import { GraphLink, GraphNode, ProjectStructure } from '../../src/analyzer/project-structure';
import { DotGenerator, DotGeneratorOptions } from '../../src/visualizer/dot-generator';

describe('DotGenerator', () => {
  it('should generate basic DOT output', () => {
    // Simple mock structure
    const nodes: GraphNode[] = [
      { id: 'app', type: 'App', label: 'App' },
      { id: 'pageA', type: 'Page', label: 'PageA' },
      { id: 'compB', type: 'Component', label: 'CompB' },
      { id: 'utilC', type: 'Module', label: 'UtilC' },
    ];
    const links: GraphLink[] = [
      { source: 'app', target: 'pageA', type: 'Structure' },
      { source: 'pageA', target: 'compB', type: 'Structure' },
      { source: 'pageA', target: 'utilC', type: 'Import' },
      { source: 'compB', target: 'utilC', type: 'Import' },
    ];
    const structure: ProjectStructure = {
      rootNodeId: 'app',
      nodes,
      links,
      miniappRoot: '/test',
    };

    const generator = new DotGenerator(structure);
    const options: DotGeneratorOptions = { title: 'Test Graph' };
    const dotOutput = generator.generate(options);

    // Basic checks
    expect(dotOutput).toContain('digraph "Test Graph"');
    // Remove basic contains checks for nodes/edges as attributes make them brittle
    // expect(dotOutput).toContain('"app" [label="App"];');
    // expect(dotOutput).toContain('"pageA" [label="PageA"];');
    // expect(dotOutput).toContain('"compB" [label="CompB"];');
    // expect(dotOutput).toContain('"utilC" [label="UtilC"];');
    // expect(dotOutput).toContain('"app" -> "pageA"');
    // expect(dotOutput).toContain('"pageA" -> "compB"');
    // expect(dotOutput).toContain('"pageA" -> "utilC"');
    // expect(dotOutput).toContain('"compB" -> "utilC"');

    // Snapshot test for detailed structure/attributes
    expect(dotOutput).toMatchSnapshot();
  });

  // Add more tests for options like depth, focus, etc. if needed
});
