import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { analyzeWxmlTags } from '../../src/commands/lint/analyzeWxmlTags';
import { lintComponentUsage } from '../../src/commands/lint/component-linter';
import { PathResolver } from '../../src/utils/path-resolver';

describe('component usage linting', () => {
  let tempDir: string;
  let wxmlPath: string;
  let jsonPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-lens-component-lint-'));
    wxmlPath = path.join(tempDir, 'index.wxml');
    jsonPath = path.join(tempDir, 'index.json');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('counts a locally declared component even when its name is a standard WXML tag', () => {
    fs.writeFileSync(wxmlPath, '<rich-text />');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ usingComponents: { 'rich-text': '/components/custom-rich-text' } }),
    );

    const issue = lintComponentUsage(
      wxmlPath,
      jsonPath,
      new Map([['rich-text', new Set([wxmlPath])]]),
      {},
    );

    expect(issue.declaredNotUsed).toEqual([]);
    expect(issue.usedNotDeclared).toEqual([]);
  });

  it('does not count unreachable componentPlaceholder mappings as usage', () => {
    fs.writeFileSync(wxmlPath, '<view />');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        usingComponents: {
          'async-component': '/components/async',
          'loading-placeholder': '/components/loading',
        },
        componentPlaceholder: {
          'async-component': 'loading-placeholder',
        },
      }),
    );

    const issue = lintComponentUsage(
      wxmlPath,
      jsonPath,
      new Map([['view', new Set([wxmlPath])]]),
      {},
    );

    expect(issue.declaredNotUsed.map(({ componentTag }) => componentTag)).toEqual([
      'async-component',
      'loading-placeholder',
    ]);
  });

  it('counts a one-step componentPlaceholder for a rendered component as usage', () => {
    fs.writeFileSync(wxmlPath, '<async-component />');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        usingComponents: {
          'async-component': '/components/async',
          'loading-placeholder': '/components/loading',
        },
        componentPlaceholder: {
          'async-component': 'loading-placeholder',
        },
      }),
    );

    const issue = lintComponentUsage(
      wxmlPath,
      jsonPath,
      new Map([['async-component', new Set([wxmlPath])]]),
      {},
    );

    expect(issue.declaredNotUsed).toEqual([]);
    expect(issue.usedNotDeclared).toEqual([]);
  });

  it('reports a reachable custom placeholder that is not declared', () => {
    fs.writeFileSync(wxmlPath, '<async-component />');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        usingComponents: { 'async-component': '/components/async' },
        componentPlaceholder: { 'async-component': 'loading-placeholder' },
      }),
    );

    const issue = lintComponentUsage(
      wxmlPath,
      jsonPath,
      new Map([['async-component', new Set([wxmlPath])]]),
      {},
    );

    expect(issue.usedNotDeclared).toEqual([
      {
        componentTag: 'loading-placeholder',
        usedIn: [jsonPath],
        suggestion: `Consider adding 'loading-placeholder' to the usingComponents section in index.json`,
      },
    ]);
  });

  it('does not propagate componentPlaceholder mappings as a chain', () => {
    fs.writeFileSync(wxmlPath, '<async-component />');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        usingComponents: {
          'async-component': '/components/async',
          'first-placeholder': '/components/first-placeholder',
          'second-placeholder': '/components/second-placeholder',
        },
        componentPlaceholder: {
          'async-component': 'first-placeholder',
          'first-placeholder': 'second-placeholder',
        },
      }),
    );

    const issue = lintComponentUsage(
      wxmlPath,
      jsonPath,
      new Map([['async-component', new Set([wxmlPath])]]),
      {},
    );

    expect(issue.declaredNotUsed.map(({ componentTag }) => componentTag)).toEqual([
      'second-placeholder',
    ]);
  });

  it('does not report globally declared components as unused in every file', () => {
    fs.writeFileSync(wxmlPath, '<view />');
    fs.writeFileSync(jsonPath, JSON.stringify({ usingComponents: {} }));

    const issue = lintComponentUsage(wxmlPath, jsonPath, new Map([['view', new Set([wxmlPath])]]), {
      'global-component': '/components/global',
    });

    expect(issue.declaredNotUsed).toEqual([]);
  });

  it('reports all non-standard undeclared tags as components', () => {
    fs.writeFileSync(wxmlPath, '<div><missing-component /></div>');
    fs.writeFileSync(jsonPath, JSON.stringify({ usingComponents: {} }));
    const usedTags = new Map([
      ['div', new Set([wxmlPath])],
      ['missing-component', new Set([wxmlPath])],
    ]);

    const issue = lintComponentUsage(wxmlPath, jsonPath, usedTags, {});

    expect(issue.usedNotDeclared.map(({ componentTag }) => componentTag)).toEqual([
      'div',
      'missing-component',
    ]);
  });

  it('allows a declared custom component to shadow an HTML tag name', () => {
    fs.writeFileSync(wxmlPath, '<img />');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({ usingComponents: { img: '/components/custom-image' } }),
    );

    const issue = lintComponentUsage(
      wxmlPath,
      jsonPath,
      new Map([['img', new Set([wxmlPath])]]),
      {},
    );

    expect(issue.declaredNotUsed).toEqual([]);
    expect(issue.usedNotDeclared).toEqual([]);
  });

  it('does not treat ordinary component properties as component usage', () => {
    fs.writeFileSync(wxmlPath, '<dynamic-list componentType="order-item" />');
    fs.writeFileSync(
      jsonPath,
      JSON.stringify({
        usingComponents: {
          'dynamic-list': '/components/dynamic-list',
          'order-item': '/components/order-item',
        },
      }),
    );

    const issue = lintComponentUsage(
      wxmlPath,
      jsonPath,
      new Map([['dynamic-list', new Set([wxmlPath])]]),
      {},
    );

    expect(issue.declaredNotUsed.map(({ componentTag }) => componentTag)).toEqual(['order-item']);
  });

  it('finds components inside local and imported template declarations', async () => {
    const fixtureRoot = path.resolve(__dirname, '../../test-miniprogram');
    const fixtureWxml = path.join(fixtureRoot, 'pages/index/index.wxml');
    const fixtureJson = path.join(fixtureRoot, 'pages/index/index.json');
    const pathResolver = new PathResolver(fixtureRoot, {
      miniappRoot: fixtureRoot,
      appJsonPath: path.join(fixtureRoot, 'app.json'),
    });

    const usedTags = await analyzeWxmlTags(fixtureWxml, pathResolver);
    const issue = lintComponentUsage(fixtureWxml, fixtureJson, usedTags, {});
    const unusedTags = issue.declaredNotUsed.map(({ componentTag }) => componentTag);

    expect(usedTags.get('local-template-component')).toEqual(new Set([fixtureWxml]));
    expect(usedTags.get('external-template-component')).toEqual(
      new Set([path.join(fixtureRoot, 'templates/component-templates.wxml')]),
    );
    expect(usedTags.get('dynamic-template-component')).toEqual(
      new Set([path.join(fixtureRoot, 'templates/component-templates.wxml')]),
    );
    expect(unusedTags).not.toContain('local-template-component');
    expect(unusedTags).not.toContain('external-template-component');
    expect(unusedTags).not.toContain('dynamic-template-component');
    expect(unusedTags).toContain('unused-local-template-component');
    expect(unusedTags).toContain('unused-external-template-component');
  });

  it('continues to treat include files as inline rendered content', async () => {
    const includedWxmlPath = path.join(tempDir, 'included.wxml');
    fs.writeFileSync(wxmlPath, '<include src="./included.wxml" />');
    fs.writeFileSync(includedWxmlPath, '<included-component />');
    const pathResolver = new PathResolver(tempDir, {
      miniappRoot: tempDir,
      appJsonPath: path.join(tempDir, 'app.json'),
    });

    const usedTags = await analyzeWxmlTags(wxmlPath, pathResolver);

    expect(usedTags.get('included-component')).toEqual(new Set([includedWxmlPath]));
  });

  it('excludes template contents from included files', async () => {
    const includedWxmlPath = path.join(tempDir, 'included.wxml');
    fs.writeFileSync(wxmlPath, '<include src="./included.wxml" />');
    fs.writeFileSync(
      includedWxmlPath,
      [
        '<included-component />',
        '<template name="included-template"><template-component /></template>',
        '<template is="included-template" />',
        '<wxs module="helper">module.exports = {}</wxs>',
      ].join('\n'),
    );
    const pathResolver = new PathResolver(tempDir, {
      miniappRoot: tempDir,
      appJsonPath: path.join(tempDir, 'app.json'),
    });

    const usedTags = await analyzeWxmlTags(wxmlPath, pathResolver);

    expect(usedTags.get('included-component')).toEqual(new Set([includedWxmlPath]));
    expect(usedTags.has('template-component')).toBe(false);
    expect(usedTags.has('wxs')).toBe(false);
  });
});
