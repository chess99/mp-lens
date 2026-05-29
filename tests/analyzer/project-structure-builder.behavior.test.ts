import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeProject } from '../../src/analyzer/analyzer';
import { AnalyzerOptions } from '../../src/types/command-options';
import { buildTreeWithStats } from '../../src/ui/utils/dependency-tree-processor';

function createFixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-lens-analyzer-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, content);
  }
  return root;
}

function optionsFor(
  root: string,
  appJsonContent: AnalyzerOptions['appJsonContent'],
): AnalyzerOptions {
  return {
    miniappRoot: root,
    appJsonPath: path.join(root, 'app.json'),
    appJsonContent,
    includeAssets: true,
  };
}

describe('ProjectStructureBuilder behavior', () => {
  it('marks worker imports reachable before build returns', async () => {
    const root = createFixture({
      'app.json': JSON.stringify({ pages: ['pages/index/index'], workers: 'workers/index.js' }),
      'app.js': '',
      'pages/index/index.js': '',
      'workers/index.js': "const helper = require('./helper');\n",
      'workers/helper.js': 'module.exports = {};\n',
    });

    const result = await analyzeProject(
      root,
      optionsFor(root, { pages: ['pages/index/index'], workers: 'workers/index.js' }),
    );

    expect(result.reachableNodeIds.has(path.join(root, 'workers/index.js'))).toBe(true);
    expect(result.reachableNodeIds.has(path.join(root, 'workers/helper.js'))).toBe(true);
    expect(result.unusedFiles).not.toContain(path.join(root, 'workers/helper.js'));
  });

  it('marks componentGenerics default components reachable', async () => {
    const root = createFixture({
      'app.json': JSON.stringify({ pages: ['pages/index/index'] }),
      'app.js': '',
      'pages/index/index.json': JSON.stringify({
        usingComponents: {
          generic: '/components/generic/generic',
        },
      }),
      'pages/index/index.js': '',
      'components/generic/generic.json': JSON.stringify({
        component: true,
        componentGenerics: {
          selectable: {
            default: '/components/selectable/selectable',
          },
        },
      }),
      'components/generic/generic.js': '',
      'components/selectable/selectable.json': JSON.stringify({ component: true }),
      'components/selectable/selectable.js': '',
    });

    const result = await analyzeProject(root, optionsFor(root, { pages: ['pages/index/index'] }));

    expect(
      result.reachableNodeIds.has(path.join(root, 'components/selectable/selectable.js')),
    ).toBe(true);
    expect(result.unusedFiles).not.toContain(
      path.join(root, 'components/selectable/selectable.js'),
    );
  });

  it('deduplicates links when a page is declared from pages and tabBar', async () => {
    const root = createFixture({
      'app.json': JSON.stringify({
        pages: ['pages/index/index'],
        tabBar: {
          list: [{ pagePath: 'pages/index/index', text: 'Home' }],
        },
      }),
      'app.js': '',
      'pages/index/index.js': '',
      'pages/index/index.wxml': '<view />',
    });

    const result = await analyzeProject(
      root,
      optionsFor(root, {
        pages: ['pages/index/index'],
        tabBar: {
          list: [{ pagePath: 'pages/index/index', text: 'Home' }],
        },
      }),
    );

    const duplicateKeys = result.projectStructure.links.map(
      (link) => `${link.source}|${link.target}|${link.type}|${link.dependencyType ?? ''}`,
    );
    expect(new Set(duplicateKeys).size).toBe(duplicateKeys.length);
  });

  it('uses one canonical component node for direct and index-style component paths', async () => {
    const root = createFixture({
      'app.json': JSON.stringify({
        pages: ['pages/index/index'],
        usingComponents: {
          foo: '/components/foo/index',
        },
      }),
      'app.js': '',
      'pages/index/index.json': JSON.stringify({
        usingComponents: {
          foo: '../../components/foo',
        },
      }),
      'pages/index/index.js': '',
      'components/foo/index.json': JSON.stringify({ component: true }),
      'components/foo/index.js': '',
    });

    const result = await analyzeProject(
      root,
      optionsFor(root, {
        pages: ['pages/index/index'],
        usingComponents: {
          foo: '/components/foo/index',
        },
      }),
    );

    const fooComponents = result.projectStructure.nodes.filter(
      (node) => node.type === 'Component' && node.label === 'components/foo',
    );
    expect(fooComponents).toHaveLength(1);
  });

  it('does not aggregate dependency-only modules into page structural stats', async () => {
    const root = createFixture({
      'app.json': JSON.stringify({ pages: ['pages/index/index'] }),
      'app.js': '',
      'pages/index/index.js': "const util = require('../../utils/util');\n",
      'pages/index/index.wxml': '<view />\n',
      'utils/util.js': 'module.exports = {};\n',
    });

    const result = await analyzeProject(root, optionsFor(root, { pages: ['pages/index/index'] }));
    const tree = buildTreeWithStats(result.projectStructure);
    const pageNode = tree?.children?.find((child) => child.id === 'page:pages/index/index');

    expect(pageNode?.properties?.reachableModuleIds?.has(path.join(root, 'utils/util.js'))).toBe(
      false,
    );
    expect(pageNode?.properties?.fileCount).toBe(2);
  });
});
