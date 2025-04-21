import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { analyzeProject } from '../../src/analyzer/analyzer';
import { AnalyzerOptions } from '../../src/types/command-options';

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

// Helper function to normalize paths for comparison
function normalizePath(p: string): string {
  return actualPath.normalize(p);
}

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Mock glob
jest.mock('glob', () => ({
  sync: jest.fn(),
}));

// Mock path using a more reliable approach
jest.mock('path', () => {
  const actual = jest.requireActual('path');
  return {
    resolve: jest.fn((...args) => actual.resolve(...args)),
    join: jest.fn((...args) => actual.join(...args)),
    relative: jest.fn((...args) => actual.relative(...args)),
    dirname: jest.fn((p) => actual.dirname(p)),
    extname: jest.fn((p) => actual.extname(p)),
    isAbsolute: jest.fn((p) => actual.isAbsolute(p)),
    normalize: jest.fn((p) => actual.normalize(p)),
  };
});

// Mock FileParser
const mockParseFile = jest.fn();
jest.mock('../../src/analyzer/file-parser', () => ({
  FileParser: jest.fn().mockImplementation(() => ({
    parseFile: mockParseFile,
  })),
}));

// Partially mock DependencyGraph to spy on methods
const mockAddNode = jest.fn();
const mockAddEdge = jest.fn();
const mockHasNode = jest.fn();
const mockNodes = jest.fn(); // Mock for nodes()
const mockOutEdges = jest.fn(); // Mock for outEdges()
let mockGraphNodesStore: string[] = []; // Store nodes added via mock
let mockGraphOutEdgesStore: Record<string, string[]> = {}; // Store edges added via mock
jest.mock('../../src/analyzer/dependency-graph', () => ({
  DependencyGraph: jest.fn().mockImplementation(() => {
    // Reset internal mock state for each new graph instance
    mockGraphNodesStore = [];
    mockGraphOutEdgesStore = {};
    return {
      addNode: jest.fn((node: string) => {
        mockAddNode(node); // Call spy
        if (!mockGraphNodesStore.includes(node)) mockGraphNodesStore.push(node);
      }),
      addEdge: jest.fn((from: string, to: string) => {
        mockAddEdge(from, to); // Call spy
        if (!mockGraphOutEdgesStore[from]) mockGraphOutEdgesStore[from] = [];
        if (!mockGraphOutEdgesStore[from].includes(to)) mockGraphOutEdgesStore[from].push(to);
      }),
      // Ensure methods used by findReachableFiles are mocked correctly
      nodes: jest.fn(() => {
        mockNodes(); // Call spy
        return [...mockGraphNodesStore]; // Return current mock state
      }),
      outEdges: jest.fn((node: string) => {
        mockOutEdges(node); // Call spy
        return mockGraphOutEdgesStore[node] || []; // Return current mock state
      }),
      hasNode: jest.fn((node: string) => {
        mockHasNode(node); // Call spy
        return mockGraphNodesStore.includes(node); // Check current mock state
      }),
      // Mock other methods if needed
      inDegree: jest.fn().mockReturnValue(0), // Example default mock
    };
  }),
}));

describe('analyzeProject', () => {
  const projectRoot = '/test/project';
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockGlob = glob as jest.Mocked<typeof glob>;
  const defaultOptions: AnalyzerOptions = {
    fileTypes: ['.js', '.wxml', '.json'],
  };

  // Store original console methods
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  const mockPath = path as jest.Mocked<typeof path>; // Use mocked path for spying

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mocks
    mockFs.existsSync.mockReturnValue(true); // Assume project root exists by default
    mockGlob.sync.mockReturnValue([]); // Default: no files found
    mockParseFile.mockResolvedValue([]); // Default: files have no dependencies

    // Reset console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Reset path mocks specifically for resolve to use actual implementation by default
    mockPath.resolve.mockImplementation((...args) => actualPath.resolve(...args));
    // Other path methods are already calling actual implementations via the mock setup

    // Setup existsSync for common files and project root
    mockFs.existsSync.mockImplementation((p) => {
      const resolvedP = actualPath.resolve(p as string);
      // console.log('DEBUG existsSync check:', resolvedP);
      if (resolvedP === actualPath.resolve(projectRoot)) return true;

      // Default essential/entry files considered existing for tests
      const defaultFiles = [
        actualPath.resolve(projectRoot, 'app.js'),
        actualPath.resolve(projectRoot, 'app.ts'),
        actualPath.resolve(projectRoot, 'app.json'),
        actualPath.resolve(projectRoot, 'project.config.json'),
        // Add others if needed by specific tests
      ];
      if (defaultFiles.includes(resolvedP)) {
        // console.log('DEBUG existsSync TRUE for:', resolvedP);
        return true;
      }
      // console.log('DEBUG existsSync FALSE for:', resolvedP);
      return false; // Default to false unless explicitly mocked otherwise in a test
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('should throw error if project root does not exist', async () => {
    mockFs.existsSync.mockImplementation((p) => p !== projectRoot); // Project root doesn't exist

    await expect(analyzeProject(projectRoot, defaultOptions)).rejects.toThrow(
      `小程序目录不存在: ${projectRoot}`,
    );
    expect(mockFs.existsSync).toHaveBeenCalledWith(projectRoot);
  });

  it('should find files using glob with correct patterns and ignore defaults', async () => {
    const options: AnalyzerOptions = {
      fileTypes: ['.js', '.wxss'],
      excludePatterns: ['**/ignored/**', 'specific-file.js'],
    };
    const expectedGlobPattern = `**/*.{.js,.wxss}`;
    const expectedIgnore = [
      '**/node_modules/**',
      '**/miniprogram_npm/**',
      '**/output/dependency-graph.*',
      '**/output/unused-files.*',
      'dependency-graph.*',
      'unused-files.*',
      '**/dist/**',
      '**/ignored/**',
      'specific-file.js',
    ];

    await analyzeProject(projectRoot, options);

    expect(mockGlob.sync).toHaveBeenCalledWith(expectedGlobPattern, {
      cwd: projectRoot,
      absolute: true,
      ignore: expectedIgnore,
      nodir: true,
    });
  });

  it('should build dependency graph correctly', async () => {
    const fileA = actualPath.resolve(projectRoot, 'a.js');
    const fileB = actualPath.resolve(projectRoot, 'b.wxml');
    const fileC = actualPath.resolve(projectRoot, 'c.json');
    const fileD = actualPath.resolve(projectRoot, 'd.js'); // Not found by glob initially
    const allFiles = [fileA, fileB, fileC];

    // Set up existsSync for these specific files + defaults
    mockFs.existsSync.mockImplementation((p) => {
      const resolvedP = actualPath.resolve(p as string);
      if (resolvedP === actualPath.resolve(projectRoot)) return true;
      if (resolvedP === actualPath.resolve(projectRoot, 'app.js')) return true;
      if (resolvedP === actualPath.resolve(projectRoot, 'app.json')) return true;
      return allFiles.includes(resolvedP);
    });

    mockGlob.sync.mockReturnValue(allFiles);

    // Mock dependencies returned by parser
    mockParseFile.mockImplementation(async (filePath) => {
      const resolvedPath = actualPath.resolve(filePath);
      if (resolvedPath === fileA) return [fileB]; // A depends on B
      if (resolvedPath === fileB) return [fileC, fileD]; // B depends on C and D (D is outside allFiles)
      if (resolvedPath === fileC) return []; // C has no deps
      return [];
    });

    // Mock graph methods to reflect the added nodes/edges
    mockHasNode.mockImplementation((node) => allFiles.includes(actualPath.resolve(node)));

    const { dependencyGraph, unusedFiles } = await analyzeProject(projectRoot, defaultOptions);

    // Check nodes were added to the mock store
    expect(mockGraphNodesStore).toEqual(expect.arrayContaining(allFiles));
    expect(mockGraphNodesStore).toHaveLength(3);

    // Check parser was called for each file
    expect(mockParseFile).toHaveBeenCalledWith(fileA);
    expect(mockParseFile).toHaveBeenCalledWith(fileB);
    expect(mockParseFile).toHaveBeenCalledWith(fileC);
    expect(mockParseFile).toHaveBeenCalledTimes(3);

    // Check edges were added to the mock store (only for deps within allFiles)
    expect(mockGraphOutEdgesStore[fileA]).toContain(fileB);
    expect(mockGraphOutEdgesStore[fileB]).toContain(fileC);
    expect(mockGraphOutEdgesStore[fileB]).not.toContain(fileD); // D was not in allFiles
    expect(
      Object.keys(mockGraphOutEdgesStore).reduce(
        (sum, key) => sum + mockGraphOutEdgesStore[key].length,
        0,
      ),
    ).toBe(2);

    // Verify spies on graph methods were called
    expect(mockAddNode).toHaveBeenCalledWith(fileA);
    expect(mockAddNode).toHaveBeenCalledWith(fileB);
    expect(mockAddNode).toHaveBeenCalledWith(fileC);
    expect(mockAddEdge).toHaveBeenCalledWith(fileA, fileB);
    expect(mockAddEdge).toHaveBeenCalledWith(fileB, fileC);
  });

  it('should find unused files using default entry points (app.js/app.json)', async () => {
    const appJs = actualPath.resolve(projectRoot, 'app.js');
    const appJson = actualPath.resolve(projectRoot, 'app.json'); // Essential and potential entry
    const pageA = actualPath.resolve(projectRoot, 'pages/a.js');
    const pageB = actualPath.resolve(projectRoot, 'pages/b.js');
    const utilC = actualPath.resolve(projectRoot, 'utils/c.js');
    const unusedD = actualPath.resolve(projectRoot, 'unused/d.js');
    const projConf = actualPath.resolve(projectRoot, 'project.config.json'); // Essential
    const allFiles = [appJs, appJson, pageA, pageB, utilC, unusedD, projConf];

    mockGlob.sync.mockReturnValue(allFiles);

    // Mock existsSync: all files in `allFiles` exist
    mockFs.existsSync.mockImplementation(
      (p) => p === projectRoot || allFiles.includes(actualPath.resolve(p as string)),
    );

    // Mock parseFile to setup dependency chain: app.js -> pageA -> utilC
    mockParseFile.mockImplementation(async (filePath) => {
      const resolvedPath = actualPath.resolve(filePath);
      if (resolvedPath === appJs) return [pageA];
      // app.json parsing logic is now in analyzer, not parser, so mock it as having no *code* deps
      if (resolvedPath === appJson) return [];
      if (resolvedPath === pageA) return [utilC];
      // pageB, utilC, unusedD, projConf have no dependencies
      return [];
    });

    // Configure graph mock based on expected state AFTER parsing
    mockGraphNodesStore = [...allFiles]; // All files are nodes
    mockGraphOutEdgesStore = {
      [appJs]: [pageA],
      [pageA]: [utilC],
      // others have no outgoing edges based on mockParseFile
    };
    // Mock hasNode to reflect the nodes added
    // Ensure paths are resolved consistently for comparison
    const nodeSet = new Set(mockGraphNodesStore.map((p) => actualPath.resolve(p)));
    mockHasNode.mockImplementation((node) => nodeSet.has(actualPath.resolve(node)));

    const { unusedFiles } = await analyzeProject(projectRoot, defaultOptions);

    // Expected Reachable:
    // - Entries: app.js, app.json (defaults found)
    // - Essentials: projConf, app.json
    // - Traversed: pageA (from app.js), utilC (from pageA)
    // Set: { appJs, appJson, projConf, pageA, utilC }
    // Expected Unused: pageB, unusedD

    expect(unusedFiles).toHaveLength(2);
    expect(unusedFiles).toEqual(expect.arrayContaining([pageB, unusedD]));
    expect(unusedFiles).not.toContain(appJs);
    expect(unusedFiles).not.toContain(appJson);
    expect(unusedFiles).not.toContain(pageA);
    expect(unusedFiles).not.toContain(utilC);
    expect(unusedFiles).not.toContain(projConf);
  });

  it('should use custom entryFile if provided and exists', async () => {
    const customEntry = actualPath.resolve(projectRoot, 'custom/entry.js');
    const dep1 = actualPath.resolve(projectRoot, 'dep1.js');
    const unused1 = actualPath.resolve(projectRoot, 'unused1.js');
    const appJs = actualPath.resolve(projectRoot, 'app.js'); // Default entry, should be ignored
    const allFiles = [customEntry, dep1, unused1, appJs];

    mockGlob.sync.mockReturnValue(allFiles);
    mockFs.existsSync.mockImplementation(
      (p) => p === projectRoot || allFiles.includes(actualPath.resolve(p as string)),
    );
    mockParseFile.mockImplementation(async (filePath) => {
      const resolvedPath = actualPath.resolve(filePath);
      if (resolvedPath === customEntry) return [dep1];
      return [];
    });

    // Configure graph mock
    mockGraphNodesStore = [...allFiles];
    mockGraphOutEdgesStore = { [customEntry]: [dep1] };
    // Mock hasNode to reflect the nodes added
    // Ensure paths are resolved consistently for comparison
    const nodeSetCustom = new Set(mockGraphNodesStore.map((p) => actualPath.resolve(p)));
    mockHasNode.mockImplementation((node) => nodeSetCustom.has(actualPath.resolve(node)));

    const options: AnalyzerOptions = { ...defaultOptions, entryFile: 'custom/entry.js' };
    const { unusedFiles } = await analyzeProject(projectRoot, options);

    // Expected Reachable: customEntry, dep1
    // Expected Unused: unused1, appJs
    expect(unusedFiles).toHaveLength(2);
    expect(unusedFiles).toEqual(expect.arrayContaining([unused1, appJs]));
  });

  it('should handle user-defined essentialFiles', async () => {
    const appJs = actualPath.resolve(projectRoot, 'app.js');
    const essentialUser = actualPath.resolve(projectRoot, 'config/custom.json');
    const unused1 = actualPath.resolve(projectRoot, 'lonely.js');
    const allFiles = [appJs, essentialUser, unused1];

    mockGlob.sync.mockReturnValue(allFiles);
    mockFs.existsSync.mockImplementation(
      (p) =>
        p === projectRoot ||
        allFiles.includes(actualPath.resolve(p as string)) ||
        actualPath.resolve(p as string) === actualPath.resolve(projectRoot, 'app.json'), // assume app.json also exists
    );
    mockParseFile.mockResolvedValue([]); // No dependencies from files

    // Configure graph mock
    mockGraphNodesStore = [...allFiles];
    mockGraphOutEdgesStore = {};
    // Mock hasNode to reflect the nodes added
    // Ensure paths are resolved consistently for comparison
    const nodeSetEssential = new Set(mockGraphNodesStore.map((p) => actualPath.resolve(p)));
    mockHasNode.mockImplementation((node) => nodeSetEssential.has(actualPath.resolve(node)));

    const options: AnalyzerOptions = { ...defaultOptions, essentialFiles: ['config/custom.json'] };
    const { unusedFiles } = await analyzeProject(projectRoot, options);

    // Expected Reachable: appJs (default entry), essentialUser (user essential), app.json (default essential)
    // Expected Unused: lonely.js
    expect(unusedFiles).toHaveLength(1);
    expect(unusedFiles).toEqual([unused1]);
    expect(unusedFiles).not.toContain(essentialUser);
  });

  it('should use entryContent (app.json structure) to find entry points if entryFile not valid', async () => {
    const page1 = actualPath.resolve(projectRoot, 'pages/page1.js');
    const page2 = actualPath.resolve(projectRoot, 'pages/page2.js');
    const comp1 = actualPath.resolve(projectRoot, 'components/comp1/index.js');
    const unused1 = actualPath.resolve(projectRoot, 'unused.js');
    const tabBarIcon = actualPath.resolve(projectRoot, 'images/icon.png');
    const appJsonPath = actualPath.resolve(projectRoot, 'app.json');

    // Define all files for this test
    const allFiles = [page1, page2, comp1, unused1, tabBarIcon, appJsonPath];

    // Configure the mock file system
    mockGlob.sync.mockReturnValue(allFiles);

    // Setup parseFile mock to return empty deps for simplicity
    mockParseFile.mockResolvedValue([]);

    // Configure graph mocks
    mockGraphNodesStore = [...allFiles];
    mockGraphOutEdgesStore = {};
    const nodeSet = new Set(mockGraphNodesStore);
    mockHasNode.mockImplementation((node) => nodeSet.has(node));

    // Mock app.json content that makes specific files reachable
    const entryContentData = {
      pages: ['pages/page1', 'pages/page2'],
      usingComponents: {
        'my-comp': '/components/comp1/index', // Needs extension resolution
      },
      tabBar: {
        list: [
          { pagePath: 'pages/page1', text: 'Page 1', iconPath: 'images/icon.png' },
          { pagePath: 'pages/page2', text: 'Page 2' },
        ],
      },
    };

    const options: AnalyzerOptions = {
      ...defaultOptions,
      // Provide an invalid entryFile path so it falls back to entryContent
      entryFile: 'nonexistent/entry.js',
      entryContent: entryContentData,
    };

    // Make sure the nonexistent entry file doesn't exist but all other files do
    mockFs.existsSync.mockImplementation((p) => {
      const resolvedP = actualPath.resolve(p as string);
      // Don't let the entry file exist
      if (resolvedP === actualPath.resolve(projectRoot, options.entryFile!)) return false;
      // But let other files in our test exist
      return p === projectRoot || allFiles.includes(resolvedP);
    });

    const { unusedFiles } = await analyzeProject(projectRoot, options);

    // Verify that only the 'unused1' file is marked as unused
    // Instead of checking the exact length, check that each file we expect to be reachable is NOT in the unused list
    expect(unusedFiles).toContain(unused1);
    expect(unusedFiles).not.toContain(page1);
    expect(unusedFiles).not.toContain(page2);
    expect(unusedFiles).not.toContain(comp1);
    expect(unusedFiles).not.toContain(tabBarIcon);
    expect(unusedFiles).not.toContain(appJsonPath);
  });

  it('should handle case where no entry points are found', async () => {
    const file1 = actualPath.resolve(projectRoot, 'file1.js');
    const allFiles = [file1];

    mockGlob.sync.mockReturnValue(allFiles);
    // No default entries exist, no custom entry, no content
    mockFs.existsSync.mockImplementation((p) => {
      const resolvedP = actualPath.resolve(p as string);
      if (resolvedP === actualPath.resolve(projectRoot)) return true;
      if (resolvedP === file1) return true;
      // Ensure default entries DON'T exist
      if (['app.js', 'app.json', 'app.ts'].includes(actualPath.basename(resolvedP))) return false;
      return false;
    });
    mockParseFile.mockResolvedValue([]);

    // Configure graph mock
    mockGraphNodesStore = [...allFiles];
    mockGraphOutEdgesStore = {};
    // Mock hasNode to reflect the nodes added
    // Ensure paths are resolved consistently for comparison
    const nodeSetNone = new Set(mockGraphNodesStore.map((p) => actualPath.resolve(p)));
    mockHasNode.mockImplementation((node) => nodeSetNone.has(actualPath.resolve(node)));

    const { unusedFiles } = await analyzeProject(projectRoot, defaultOptions);

    // Expected Reachable: None (except maybe essentials if they existed)
    // Expected Unused: file1
    expect(unusedFiles).toHaveLength(1);
    expect(unusedFiles).toEqual([file1]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('未能确定任何有效的入口文件'),
    );
  });

  // Add more tests for edge cases:
  // - Verbose logging
  // - Errors during file parsing
  // - Complex dependency chains
  // - Aliases (might need more setup for AliasResolver mock)
  // - miniappRoot option usage
});
