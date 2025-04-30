import * as path from 'path';
import { analyzeProject } from '../../src/analyzer/analyzer';
import { AnalyzerOptions } from '../../src/types/command-options';

// Use the real path module
const actualPath = path;

describe('analyzeProject Integration Tests', () => {
  // Define the path to the test fixture project
  const fixtureProjectRoot = actualPath.resolve(__dirname, '../../test-miniprogram');

  // Default options for the analyzer
  const defaultOptions: AnalyzerOptions = {
    fileTypes: ['js', 'json', 'wxml', 'wxss'], // Analyzer expects types without leading dots
    // excludePatterns: ['**/node_modules/**'], // Default exclusion often needed
  };

  // Explicitly define entryContent based on test-miniprogram/app.json
  // This helps bypass potential issues with file scanning in the test environment.
  const testEntryContent = {
    pages: ['pages/index/index'],
  };

  const optionsWithEntryContent: AnalyzerOptions = {
    ...defaultOptions,
    entryContent: testEntryContent,
    entryFile: undefined, // Ensure entryContent takes precedence
  };

  it('should correctly identify unused files in test-miniprogram', async () => {
    // Expected unused files based on manual analysis and CLI output
    const expectedUnusedRelativePaths = [
      'unused-script.js',
      'unused-styles.wxss',
      'isolated/a.js',
      'isolated/b.js',
      'isolated/c.js',
      'components/test-component/test-component.js',
    ];
    const expectedUnusedFiles = expectedUnusedRelativePaths.map((file) =>
      actualPath.resolve(fixtureProjectRoot, file),
    );

    // List of files expected to be essential or reachable
    const essentialOrReachable = [
      'app.js',
      'app.json',
      'app.wxss',
      'pages/index/index.js',
      'pages/index/index.wxml',
      'pages/index/index.wxss',
      'pages/index/index.json',
      'utils/util.js', // Used by index.js and test-component.js
      'tsconfig.json', // Default essential
      'mp-lens.config.js', // Default essential
    ].map((file) => actualPath.resolve(fixtureProjectRoot, file));

    // Run the analyzer on the fixture project using entryContent
    const { unusedFiles } = await analyzeProject(fixtureProjectRoot, optionsWithEntryContent);

    // Sort arrays for consistent comparison
    const sortedUnusedFiles = [...unusedFiles].sort();
    const sortedExpectedUnused = [...expectedUnusedFiles].sort();

    // Assertion 1: Check the exact list of unused files
    expect(sortedUnusedFiles).toEqual(sortedExpectedUnused);

    // Assertion 2: Check essential/reachable files are NOT in the unused list
    for (const filePath of essentialOrReachable) {
      expect(unusedFiles).not.toContain(filePath);
    }
  });

  // Future tests could cover scenarios like:
  // - Project with miniappRoot subdirectory
  // - Project with TypeScript files
  // - Project using aliases
  // - Project with specific configurations (e.g., custom entry point)
});
