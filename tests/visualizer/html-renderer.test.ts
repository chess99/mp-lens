import * as fs from 'fs';
import { GraphLink, GraphNode, ProjectStructure } from '../../src/analyzer/project-structure';
import { AssetResolver } from '../../src/utils/asset-resolver';
import { HtmlGeneratorOptions, HtmlGeneratorPreact } from '../../src/visualizer/html-renderer';

// Mock AssetResolver
jest.mock('../../src/utils/asset-resolver');

// Mock fs module partially
jest.mock('fs', () => ({
  ...jest.requireActual('fs'), // Use actual implementations for other fs functions if needed
  writeFileSync: jest.fn(), // Mock only writeFileSync initially
}));

describe('HtmlGeneratorPreact', () => {
  // Get the mock function reference after jest.mock has run
  const mockWriteFileSync = fs.writeFileSync as jest.Mock;

  beforeEach(() => {
    // Reset mocks before each test
    mockWriteFileSync.mockClear();
    (AssetResolver.getJsAsset as jest.Mock).mockClear();
    (AssetResolver.getCssAsset as jest.Mock).mockClear();

    // Provide default mock implementations
    (AssetResolver.getJsAsset as jest.Mock).mockReturnValue('// Mock JS Content');
    (AssetResolver.getCssAsset as jest.Mock).mockReturnValue('/* Mock CSS Content */');
  });

  it('should generate basic HTML output with embedded data', async () => {
    // Simple mock structure
    const nodes: GraphNode[] = [
      { id: 'app', type: 'App', label: 'App' },
      { id: 'pageA', type: 'Page', label: 'PageA' },
    ];
    const links: GraphLink[] = [{ source: 'app', target: 'pageA', type: 'Structure' }];
    const structure: ProjectStructure = {
      rootNodeId: 'app',
      nodes,
      links,
      miniappRoot: '/test',
    };
    const reachableNodeIds = new Set<string>(['app', 'pageA']);
    const unusedFiles = ['/test/unused.js'];

    const generator = new HtmlGeneratorPreact(structure, reachableNodeIds, unusedFiles);
    const options: HtmlGeneratorOptions = { title: 'Test HTML' };
    const outputPath = await generator.generate(options);

    // Check that writeFileSync was called (generate now saves the file)
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const writtenHtml = mockWriteFileSync.mock.calls[0][1]; // Get the content written

    // Verify HTML structure and embedded data
    expect(writtenHtml).toContain('<title>Test HTML</title>');
    expect(writtenHtml).toMatch(
      /<script>[\s\S]*window\.__MP_LENS_DATA__\s*=\s*{.*}[\s\S]*;\s*<\/script>/,
    );
    expect(writtenHtml).toMatch(
      /<script>[\s\S]*window\.__MP_LENS_GRAPH_DATA__\s*=\s*{.*}[\s\S]*;\s*<\/script>/,
    );
    expect(writtenHtml).toMatch(
      /<script>[\s\S]*window\.__MP_LENS_UNUSED_FILES__\s*=\s*\[.*][\s\S]*;\s*<\/script>/,
    );
    expect(writtenHtml).toMatch(
      /<script>[\s\S]*window\.__MP_LENS_TITLE__\s*=\s*".*"[\s\S]*;\s*<\/script>/,
    );

    // Check that assets were requested and included
    expect(AssetResolver.getJsAsset).toHaveBeenCalledWith('assets/main.js');
    expect(AssetResolver.getCssAsset).toHaveBeenCalledWith('assets/style.css');
    expect(writtenHtml).toContain('// Mock JS Content');
    expect(writtenHtml).toContain('/* Mock CSS Content */');

    // Check that the returned path is the expected output path
    expect(outputPath).toContain('mp-lens-graph.html');
  });

  // Add more tests for options, different data structures etc.
});
