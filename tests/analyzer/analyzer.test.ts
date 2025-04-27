import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { analyzeProject } from '../../src/analyzer/analyzer';
import { AnalyzerOptions } from '../../src/types/command-options';
import { findPureAmbientDeclarationFiles } from '../../src/utils/typescript-helper';

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
    basename: jest.fn((p, ext) => actual.basename(p, ext)),
  };
});

// Mock FileParser globally, but allow specific tests/describes to adjust behavior
const mockParseFile = jest.fn();
let fileParserInstanceChecks: Record<string, jest.Mock> = {};
jest.mock('../../src/analyzer/file-parser', () => ({
  FileParser: jest.fn().mockImplementation((pRoot, opts) => {
    // Allow specific checks to be registered by tests
    if (fileParserInstanceChecks[pRoot]) {
      fileParserInstanceChecks[pRoot](pRoot, opts);
    }
    // Default implementation returns the mock parser
    return {
      parseFile: mockParseFile,
    };
  }),
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

// Mock our typescript helper
jest.mock('../../src/utils/typescript-helper', () => ({
  findPureAmbientDeclarationFiles: jest.fn().mockReturnValue([]),
}));

describe('analyzeProject', () => {
  // Define base project root
  const trueProjectRoot = actualPath.resolve('/test/project');
  // Define a potential miniapp subdirectory
  const miniappSubdir = 'src';
  const defaultMiniappRoot = trueProjectRoot; // Default: miniapp is project root
  const subDirMiniappRoot = actualPath.resolve(trueProjectRoot, miniappSubdir);

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

  // --- Global Setup ---
  beforeEach(() => {
    jest.clearAllMocks(); // Clear mocks for every test

    // Reset specific check registry
    fileParserInstanceChecks = {};

    // Default mocks setup (can be overridden by specific test blocks)
    mockFs.existsSync.mockReturnValue(true);
    mockGlob.sync.mockReturnValue([]);
    mockParseFile.mockResolvedValue([]);
    mockPath.resolve.mockImplementation((...args) => actualPath.resolve(...args));

    // Configure basic file existence for default root case
    mockFs.existsSync.mockImplementation((p) => {
      const resolvedP = actualPath.resolve(p as string);
      const defaultExisting = [
        trueProjectRoot,
        actualPath.resolve(trueProjectRoot, 'app.js'),
        actualPath.resolve(trueProjectRoot, 'app.json'),
        actualPath.resolve(trueProjectRoot, 'project.config.json'),
        actualPath.resolve(trueProjectRoot, 'package.json'),
      ];
      return defaultExisting.includes(resolvedP);
    });
    mockHasNode.mockImplementation((node) => mockFs.existsSync(node)); // Basic link

    // Reset console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  // --- Global Teardown ---
  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // --- Basic Tests (implicitly use projectRoot === miniappRoot) ---

  it('should throw error if the resolved miniapp root does not exist', async () => {
    // Case 1: No miniappRoot option, projectRoot doesn't exist
    mockFs.existsSync.mockReturnValue(false); // Nothing exists
    await expect(analyzeProject(trueProjectRoot, defaultOptions)).rejects.toThrow(
      `小程序目录不存在: ${trueProjectRoot}`,
    );
    expect(mockFs.existsSync).toHaveBeenCalledWith(trueProjectRoot);

    // Case 2: miniappRoot option specified, resolved path doesn't exist
    jest.clearAllMocks(); // Clear mocks for next case
    const options = { ...defaultOptions, miniappRoot: miniappSubdir };
    mockFs.existsSync.mockImplementation((p) => {
      const resolvedP = actualPath.resolve(p as string);
      // Only project root exists, not the subdir miniapp root
      return resolvedP === trueProjectRoot;
    });
    await expect(analyzeProject(trueProjectRoot, options)).rejects.toThrow(
      `小程序目录不存在: ${subDirMiniappRoot}`,
    );
    expect(mockFs.existsSync).toHaveBeenCalledWith(subDirMiniappRoot); // Check existence of miniapp root
  });

  it('should handle case where no entry points are found', async () => {
    // Setup mock FS with no default entries (app.js, app.json, etc.)
    mockFs.existsSync.mockImplementation(
      (p) => actualPath.resolve(p as string) === trueProjectRoot,
    ); // Only root exists
    mockGlob.sync.mockReturnValue([]); // Glob returns nothing
    mockHasNode.mockReturnValue(false); // No nodes in graph

    // Expect the specific error to be thrown
    await expect(analyzeProject(trueProjectRoot, defaultOptions)).rejects.toThrow(
      'Failed to determine any valid entry points (app.js/ts, app.json pages/components).',
    );
  });

  // --- Tests for Standard Case (projectRoot === miniappRoot) ---
  describe('when projectRoot is miniappRoot', () => {
    const currentProjectRoot = trueProjectRoot;
    const currentMiniappRoot = defaultMiniappRoot; // same as project root

    // Setup specific mocks for this standard case to ensure isolation
    beforeEach(() => {
      // Clear any potentially interfering mocks from other blocks
      jest.clearAllMocks();

      // Re-apply necessary mocks for the standard case
      mockPath.resolve.mockImplementation((...args) => actualPath.resolve(...args));

      // Mock existsSync: Ensure project/miniapp root exists PLUS common defaults
      mockFs.existsSync.mockImplementation((p) => {
        const resolvedP = actualPath.resolve(p as string);
        const defaultExisting = [
          currentProjectRoot,
          actualPath.resolve(currentProjectRoot, 'app.js'),
          actualPath.resolve(currentProjectRoot, 'app.json'),
          actualPath.resolve(currentProjectRoot, 'project.config.json'),
        ];
        if (defaultExisting.includes(resolvedP)) return true;
        // Allow specific tests below to override for their files
        return false;
      });

      // Default mocks for glob, parseFile etc for this suite
      mockGlob.sync.mockReturnValue([]);
      mockParseFile.mockResolvedValue([]);
      mockHasNode.mockImplementation((node) => mockFs.existsSync(node)); // Basic link

      // Mock FileParser instantiation - REMOVED nested mock
      /* const { FileParser } = jest.requireActual('../../src/analyzer/file-parser');
      jest.mock('../../src/analyzer/file-parser', () => ({
        FileParser: jest.fn().mockImplementation((pRoot, opts) => {
          expect(pRoot).toBe(currentProjectRoot);
          // When miniappRoot option is not provided, it should default to projectRoot
          expect(opts?.miniappRoot || pRoot).toBe(currentMiniappRoot);
          return { parseFile: mockParseFile };
        }),
      })); */
      // Clear the global FileParser mock calls just in case
      const { FileParser } = require('../../src/analyzer/file-parser');
      (FileParser as jest.Mock).mockClear();

      // Reset console spies
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      // Restore console spies
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should find files using glob with correct patterns and ignore defaults', async () => {
      const options: AnalyzerOptions = {
        fileTypes: ['.js', '.wxss'],
        excludePatterns: ['**/ignored/**', 'specific-file.js'],
      };
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

      const file1 = actualPath.resolve(currentMiniappRoot, 'some/file.js');
      const appJs = actualPath.resolve(currentMiniappRoot, 'app.js'); // Exists via global mock
      const appJson = actualPath.resolve(currentMiniappRoot, 'app.json'); // Exists via global mock

      // Override existsSync for file1 for this test
      const originalExistsSync = mockFs.existsSync.getMockImplementation() || (() => false);
      mockFs.existsSync.mockImplementation((p) => {
        if (actualPath.resolve(p as string) === file1) return true;
        return originalExistsSync(p);
      });
      mockGlob.sync.mockReturnValue([file1, appJs, appJson]); // Glob returns these files
      mockHasNode.mockImplementation((node) =>
        [file1, appJs, appJson].includes(actualPath.resolve(node)),
      );

      // Pass only projectRoot, miniappRoot should default to it
      await analyzeProject(currentProjectRoot, options);

      // Assertions focus on glob.sync arguments - cwd should be the miniappRoot (which is projectRoot here)
      expect(mockGlob.sync).toHaveBeenCalledWith(
        expect.stringContaining('.js,.wxss'), // Check pattern contains correct types
        expect.objectContaining({
          cwd: currentMiniappRoot,
          absolute: true,
          ignore: expectedIgnore,
          nodir: true,
        }),
      );
    });

    it('should build dependency graph correctly', async () => {
      const appJs = actualPath.resolve(currentMiniappRoot, 'app.js');
      const appJson = actualPath.resolve(currentMiniappRoot, 'app.json');
      const fileA = actualPath.resolve(currentMiniappRoot, 'a.js');
      const fileB = actualPath.resolve(currentMiniappRoot, 'b.wxml');
      const fileC = actualPath.resolve(currentMiniappRoot, 'c.json');
      const fileD = actualPath.resolve(currentMiniappRoot, 'd.js');
      const filesReturnedByGlob = [appJs, appJson, fileA, fileB, fileC, fileD]; // Files glob returns
      const allNodesExpected = filesReturnedByGlob; // Nodes added should match glob results
      const allExistingFiles = [currentProjectRoot, ...filesReturnedByGlob]; // Filesystem check includes root

      // Mock existsSync for all expected nodes for this test, INCLUDING THE ROOT
      mockFs.existsSync.mockImplementation((p) =>
        allExistingFiles.includes(actualPath.resolve(p as string)),
      );
      // Glob returns only the files, not the root directory itself
      mockGlob.sync.mockReturnValue(filesReturnedByGlob);
      // hasNode should check against the nodes expected to be added
      mockHasNode.mockImplementation((node) => allNodesExpected.includes(actualPath.resolve(node)));

      // Mock parseFile
      mockParseFile.mockImplementation(async (filePath) => {
        const resolvedPath = actualPath.resolve(filePath);
        if (resolvedPath === appJs) return [fileA]; // App depends on A
        if (resolvedPath === fileA) return [fileB]; // A depends on B
        if (resolvedPath === fileB) return [fileC, fileD]; // B depends on C and D
        return []; // C, D, app.json have no further deps
      });

      // Mock FileParser instantiation check for this scenario
      const { FileParser } = jest.requireActual('../../src/analyzer/file-parser');
      jest.mock('../../src/analyzer/file-parser', () => ({
        FileParser: jest.fn().mockImplementation((pRoot, opts) => {
          expect(pRoot).toBe(currentProjectRoot);
          // When miniappRoot option is not provided, it should default to projectRoot
          expect(opts?.miniappRoot || pRoot).toBe(currentMiniappRoot);
          return { parseFile: mockParseFile };
        }),
      }));

      const { unusedFiles } = await analyzeProject(currentProjectRoot, defaultOptions);

      // Check nodes were added
      expect(mockGraphNodesStore).toEqual(expect.arrayContaining(allNodesExpected));
      expect(mockGraphNodesStore).toHaveLength(allNodesExpected.length);

      // Check edges were added
      expect(mockAddEdge).toHaveBeenCalledWith(appJs, fileA);
      expect(mockAddEdge).toHaveBeenCalledWith(fileA, fileB);
      expect(mockAddEdge).toHaveBeenCalledWith(fileB, fileC);
      expect(mockAddEdge).toHaveBeenCalledWith(fileB, fileD);

      // Check unused files (assuming app.js/app.json are entry/essential)
      // A, B, C, D are all reachable from app.js
      expect(unusedFiles).toEqual([]); // Expect no unused files in this specific setup
    });

    it('should find unused files using default entry points (app.js/app.json)', async () => {
      const appJs = actualPath.resolve(currentMiniappRoot, 'app.js');
      const appJson = actualPath.resolve(currentMiniappRoot, 'app.json'); // Essential and potential entry
      const pageA = actualPath.resolve(currentMiniappRoot, 'pages/a.js');
      const pageB = actualPath.resolve(currentMiniappRoot, 'pages/b.js');
      const utilC = actualPath.resolve(currentMiniappRoot, 'utils/c.js');
      const unusedD = actualPath.resolve(currentMiniappRoot, 'unused/d.js');
      const projConf = actualPath.resolve(currentMiniappRoot, 'project.config.json'); // Essential
      const allFiles = [currentProjectRoot, appJs, appJson, pageA, pageB, utilC, unusedD, projConf]; // Add root explicitly
      const nodeSet = new Set(allFiles); // Files present in the graph

      // Override existsSync for this specific test, INCLUDING THE ROOT
      mockFs.existsSync.mockImplementation((p) =>
        allFiles.includes(actualPath.resolve(p as string)),
      );
      mockGlob.sync.mockReturnValue(allFiles.filter((p) => p !== currentProjectRoot)); // Glob finds all these files except root
      mockParseFile.mockImplementation(async (filePath) => {
        const resolvedPath = actualPath.resolve(filePath);
        if (resolvedPath === appJs) return [pageA, pageB]; // app.js requires pageA and pageB
        if (resolvedPath === pageA) return [utilC]; // pageA requires utilC
        return []; // pageB, utilC, unusedD have no dependencies
      });
      mockHasNode.mockImplementation((node) => nodeSet.has(actualPath.resolve(node)));

      const { unusedFiles } = await analyzeProject(currentProjectRoot, defaultOptions);

      // Expected Reachable:
      // - Essentials: app.json, project.config.json
      // - Entries: app.js (default)
      // - From app.js: pageA, pageB
      // - From pageA: utilC
      // Expected Unused: unusedD
      expect(unusedFiles).toEqual([unusedD]);
    });

    it('should use custom entryFile if provided and exists', async () => {
      const customEntry = actualPath.resolve(currentMiniappRoot, 'custom/entry.js');
      const dep1 = actualPath.resolve(currentMiniappRoot, 'dep1.js');
      const unused1 = actualPath.resolve(currentMiniappRoot, 'unused1.js');
      const appJs = actualPath.resolve(currentMiniappRoot, 'app.js'); // Default entry, should be ignored if custom exists
      const allFiles = [currentProjectRoot, customEntry, dep1, unused1, appJs]; // Add root explicitly

      // Override mocks for this test, INCLUDING THE ROOT
      mockGlob.sync.mockReturnValue(allFiles.filter((p) => p !== currentProjectRoot));
      mockFs.existsSync.mockImplementation((p) =>
        allFiles.includes(actualPath.resolve(p as string)),
      );
      mockParseFile.mockImplementation(async (filePath) => {
        if (actualPath.resolve(filePath) === customEntry) return [dep1]; // Custom entry depends on dep1
        return [];
      });
      mockHasNode.mockImplementation((node) => allFiles.includes(actualPath.resolve(node)));

      const options: AnalyzerOptions = { ...defaultOptions, entryFile: 'custom/entry.js' };
      const { unusedFiles } = await analyzeProject(currentProjectRoot, options);

      // Expected Reachable: customEntry, dep1 (plus essentials like app.json if mocked)
      // Expected Unused: unused1, appJs (as custom entry overrides default)
      // --- Updated Assertion based on refactored resolveEntryPoints ---
      // app.js is now *always* added as a runtime entry if it exists.
      // So, only unused1 should be unused here.
      expect(unusedFiles).toEqual([unused1]);
      expect(unusedFiles).not.toContain(customEntry);
      expect(unusedFiles).not.toContain(dep1);
      expect(unusedFiles).not.toContain(appJs); // Verify app.js is now treated as reachable
    });

    it('should handle user-defined essentialFiles', async () => {
      const appJs = actualPath.resolve(currentMiniappRoot, 'app.js');
      const essentialUser = actualPath.resolve(currentMiniappRoot, 'config/custom.json');
      const unused1 = actualPath.resolve(currentMiniappRoot, 'lonely.js');
      const appJson = actualPath.resolve(currentMiniappRoot, 'app.json'); // Assume exists
      const allFiles = [currentProjectRoot, appJs, essentialUser, unused1, appJson]; // Add root explicitly

      // Override mocks for this test, INCLUDING THE ROOT
      mockGlob.sync.mockReturnValue(allFiles.filter((p) => p !== currentProjectRoot));
      mockFs.existsSync.mockImplementation((p) =>
        allFiles.includes(actualPath.resolve(p as string)),
      );
      mockParseFile.mockResolvedValue([]); // No dependencies from files
      mockHasNode.mockImplementation((node) => allFiles.includes(actualPath.resolve(node)));

      const options: AnalyzerOptions = {
        ...defaultOptions,
        essentialFiles: ['config/custom.json'],
      };
      const { unusedFiles } = await analyzeProject(currentProjectRoot, options);

      // Expected Reachable: appJs (default entry), essentialUser (user essential), app.json (default essential)
      // Expected Unused: unused1
      expect(unusedFiles).toEqual([unused1]);
    });

    it('should use entryContent (app.json structure) to find entry points if entryFile not valid', async () => {
      const page1 = actualPath.resolve(currentMiniappRoot, 'pages/page1.js');
      const page2 = actualPath.resolve(currentMiniappRoot, 'pages/page2.js');
      const comp1 = actualPath.resolve(currentMiniappRoot, 'components/comp1/index.js');
      const unused1 = actualPath.resolve(currentMiniappRoot, 'unused.js');
      const tabBarIcon = actualPath.resolve(currentMiniappRoot, 'images/icon.png');
      const appJsonPath = actualPath.resolve(currentMiniappRoot, 'app.json'); // The source of entryContent

      const allFiles = [currentProjectRoot, page1, page2, comp1, unused1, tabBarIcon, appJsonPath]; // Add root explicitly
      const nodeSet = new Set(allFiles);

      const entryContentData = {
        pages: ['pages/page1', 'pages/page2'], // Will resolve to page1.js, page2.js
        usingComponents: {
          'my-comp': 'components/comp1/index', // Will resolve to comp1.js
        },
        tabBar: {
          list: [{ pagePath: 'pages/page1', iconPath: 'images/icon.png' }], // icon.png is entry
        },
      };

      const options: AnalyzerOptions = {
        ...defaultOptions,
        entryFile: 'non-existent-entry.js', // Provide an invalid entry file
        entryContent: entryContentData, // Provide content instead
      };

      // Override mocks for this test, INCLUDING THE ROOT
      mockGlob.sync.mockReturnValue(allFiles.filter((p) => p !== currentProjectRoot));
      mockFs.existsSync.mockImplementation((p) => {
        const resolvedP = actualPath.resolve(p as string);
        if (resolvedP === actualPath.resolve(currentMiniappRoot, options.entryFile!)) return false; // entry file doesn't exist
        return allFiles.includes(resolvedP); // Other files (including root) exist
      });
      mockParseFile.mockResolvedValue([]); // Assume no further deps for simplicity
      mockHasNode.mockImplementation((node) => nodeSet.has(actualPath.resolve(node)));

      const { unusedFiles } = await analyzeProject(currentProjectRoot, options);

      // Verify that only the 'unused1' file is marked as unused
      expect(unusedFiles).toEqual([unused1]);
    });

    // --- Test specific scenario: --entry-file app.json used ---
    it('should include app.js/ts as entry points even when app.json is explicitly provided', async () => {
      const currentProjectRoot = trueProjectRoot;
      const currentMiniappRoot = defaultMiniappRoot; // Standard case
      const appJs = actualPath.resolve(currentMiniappRoot, 'app.js');
      const appJson = actualPath.resolve(currentMiniappRoot, 'app.json');
      const pageA = actualPath.resolve(currentMiniappRoot, 'pages/a.js'); // Defined in app.json
      const utilB = actualPath.resolve(currentMiniappRoot, 'utils/b.js'); // Imported by app.js
      const unusedC = actualPath.resolve(currentMiniappRoot, 'unused.js');

      const allFiles = [currentProjectRoot, appJs, appJson, pageA, utilB, unusedC];

      const appJsonContentData = {
        pages: ['pages/a'], // Defines pageA
      };

      // --- Mock Setup for this specific test ---
      jest.clearAllMocks();
      mockPath.resolve.mockImplementation((...args) => actualPath.resolve(...args));

      // Mock existsSync for the files involved
      mockFs.existsSync.mockImplementation((p) =>
        allFiles.includes(actualPath.resolve(p as string)),
      );

      // Mock reading app.json when analyzer requests it
      mockFs.readFileSync.mockImplementation((p) => {
        if (actualPath.resolve(p as string) === appJson) {
          return JSON.stringify(appJsonContentData);
        }
        throw new Error(`Unexpected readFileSync call: ${p}`);
      });

      // Mock glob to return relevant files
      const filesFoundByGlob = [appJs, appJson, pageA, utilB, unusedC];
      mockGlob.sync.mockReturnValue(filesFoundByGlob);

      // Mock parsing: app.js imports utilB
      mockParseFile.mockImplementation(async (filePath) => {
        if (actualPath.resolve(filePath) === appJs) return [utilB];
        return [];
      });

      // Mock graph state methods
      const graphNodes = [...new Set([...filesFoundByGlob, appJson])]; // Essentials/Entries added
      mockHasNode.mockImplementation((node) => graphNodes.includes(actualPath.resolve(node)));
      mockNodes.mockImplementation(() => graphNodes);
      mockOutEdges.mockImplementation((node) => {
        if (actualPath.resolve(node) === appJs) return [utilB];
        return [];
      });
      // --- End Mock Setup ---

      const options: AnalyzerOptions = {
        ...defaultOptions,
        entryFile: 'app.json', // Explicitly provide app.json as the entry file
      };

      const { unusedFiles } = await analyzeProject(currentProjectRoot, options);

      // Assertions:
      // Entry points should be: app.json (explicit), app.js (runtime default), pageA (from app.json content)
      // Reachable should be: app.json, app.js, pageA, utilB (from app.js)
      // Unused should be: unusedC

      expect(unusedFiles).toEqual([unusedC]);
      expect(unusedFiles).not.toContain(appJs);
      expect(unusedFiles).not.toContain(utilB);
      expect(unusedFiles).not.toContain(pageA);
      expect(unusedFiles).not.toContain(appJson);
    });
  }); // End describe 'when projectRoot is miniappRoot'

  // --- Test Suite for MiniApp in Subdirectory ---
  describe('when miniapp is in a subdirectory', () => {
    const currentProjectRoot = trueProjectRoot;
    const currentMiniappRoot = subDirMiniappRoot;
    const optionsWithSubdir: AnalyzerOptions = {
      ...defaultOptions,
      miniappRoot: miniappSubdir, // Specify relative path for miniapp root
    };

    // Files existing only in project root
    const pkgJson = actualPath.resolve(currentProjectRoot, 'package.json');
    const tsConfigJson = actualPath.resolve(currentProjectRoot, 'tsconfig.json'); // Example project essential
    // Files existing only in miniapp root
    const appJson = actualPath.resolve(currentMiniappRoot, 'app.json');
    const appJs = actualPath.resolve(currentMiniappRoot, 'app.js');
    const projConfJson = actualPath.resolve(currentMiniappRoot, 'project.config.json');
    const pageAJs = actualPath.resolve(currentMiniappRoot, 'pages/a/a.js');
    const pageAWxml = actualPath.resolve(currentMiniappRoot, 'pages/a/a.wxml');
    const unusedPageJs = actualPath.resolve(currentMiniappRoot, 'pages/unused/unused.js');

    // --- Setup for Subdirectory Tests ---
    beforeEach(() => {
      // Clear mocks from global beforeEach first - this might be too broad
      // jest.clearAllMocks();
      // Restore mocks might also be too broad
      // jest.restoreAllMocks();

      // Instead, clear specific mocks that are set globally but need overriding
      mockFs.existsSync.mockClear();
      mockGlob.sync.mockClear();
      mockParseFile.mockClear();
      mockHasNode.mockClear();
      mockNodes.mockClear();
      mockOutEdges.mockClear();
      // Clear the FileParser constructor mock calls, but keep the global mock definition
      const { FileParser } = require('../../src/analyzer/file-parser');
      (FileParser as jest.Mock).mockClear();

      // Register a specific check for the FileParser constructor for this suite
      fileParserInstanceChecks[currentProjectRoot] = jest.fn((pRoot, opts) => {
        expect(pRoot).toBe(currentProjectRoot);
        expect(opts?.miniappRoot).toBe(currentMiniappRoot);
      });

      // Re-apply necessary path mock if cleared
      mockPath.resolve.mockImplementation((...args) => actualPath.resolve(...args));

      // Mock FileParser instantiation check specifically for this describe block
      // Use jest.doMock inside beforeEach for scoped mocking - REMOVED, using registration now
      /* jest.doMock('../../src/analyzer/file-parser', () => ({
        FileParser: jest.fn().mockImplementation((pRoot, opts) => {
          expect(pRoot).toBe(currentProjectRoot);
          expect(opts?.miniappRoot).toBe(currentMiniappRoot);
          return { parseFile: mockParseFile }; // Use the shared mock parseFile
        }),
      })); */

      // Define file sets for clarity in mocks
      const projectEssentials = [pkgJson, tsConfigJson];
      const miniappEssentials = [appJson, projConfJson]; // app.json is also an entry point
      const miniappSourceFiles = [appJs, pageAJs, pageAWxml, unusedPageJs];
      const allExistingFiles = [
        currentProjectRoot,
        currentMiniappRoot,
        ...projectEssentials,
        ...miniappEssentials,
        ...miniappSourceFiles,
      ];
      const filesFoundByGlob = [appJs, appJson, projConfJson, pageAJs, pageAWxml, unusedPageJs]; // Files within miniappRoot found by glob
      const allGraphNodes = [
        ...new Set([...filesFoundByGlob, ...projectEssentials, ...miniappEssentials]),
      ]; // All nodes expected in the graph

      // Mock existsSync for roots and specific files for this describe block
      mockFs.existsSync.mockImplementation((p) =>
        allExistingFiles.includes(actualPath.resolve(p as string)),
      );

      // Mock glob to return files within miniapp root for this describe block
      mockGlob.sync.mockImplementation((pattern, globOptions) => {
        expect(globOptions?.cwd).toBe(currentMiniappRoot);
        return filesFoundByGlob;
      });

      // Mock parseFile for dependencies within miniapp for this describe block
      mockParseFile.mockImplementation(async (filePath) => {
        const resolvedPath = actualPath.resolve(filePath);
        if (resolvedPath === appJs) return [pageAJs];
        if (resolvedPath === pageAJs) return [pageAWxml];
        return []; // Other files have no deps
      });

      // --- Crucial Mocks for Reachability Testing ---
      // Ensure DependencyGraph mock reflects the state *after* nodes/edges are added

      // 1. Mock hasNode: Reflects all files found by glob + existing essential files
      mockHasNode.mockImplementation((node) => {
        const resolvedNode = actualPath.resolve(node);
        return allGraphNodes.includes(resolvedNode) && mockFs.existsSync(resolvedNode);
      });

      // 2. Mock nodes(): Returns all nodes added (glob files + essentials)
      mockNodes.mockImplementation(() => allGraphNodes.filter((node) => mockFs.existsSync(node)));

      // 3. Mock outEdges(): Returns edges based on mockParseFile results
      mockOutEdges.mockImplementation((node) => {
        const resolvedNode = actualPath.resolve(node);
        if (resolvedNode === appJs) return [pageAJs];
        if (resolvedNode === pageAJs) return [pageAWxml];
        return [];
      });
      // --- End Reachability Mocks ---

      // Reset console spies needed for each test within describe
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    // --- Teardown for Subdirectory Tests ---
    afterEach(() => {
      // Restore spies after each test in this block
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    // --- Subdirectory Test Cases ---

    it('should call glob.sync with miniappRoot as cwd', async () => {
      await analyzeProject(currentProjectRoot, optionsWithSubdir);
      // Assertion is inside the glob mock in beforeEach
      expect(mockGlob.sync).toHaveBeenCalled();
    });

    it('should resolve essential files against correct roots and identify unused correctly', async () => {
      // Scenario:
      // - pkgJson & tsConfigJson (project root essential) should NOT be listed as unused.
      // - projConfJson & appJson (miniapp root essential) should NOT be listed as unused.
      // - unusedPageJs (miniapp root non-essential, not reached) SHOULD be listed.

      const { unusedFiles } = await analyzeProject(currentProjectRoot, optionsWithSubdir);

      // Assert: unusedPageJs *is* listed, essentials *are not*
      expect(unusedFiles).toContain(unusedPageJs);
      expect(unusedFiles).not.toContain(pkgJson);
      expect(unusedFiles).not.toContain(tsConfigJson);
      expect(unusedFiles).not.toContain(projConfJson);
      expect(unusedFiles).not.toContain(appJson); // Also essential/entry
      // Check reachable files aren't listed either
      expect(unusedFiles).not.toContain(appJs);
      expect(unusedFiles).not.toContain(pageAJs);
      expect(unusedFiles).not.toContain(pageAWxml);
    });

    it('should resolve default entry points (app.json) relative to miniappRoot for reachability', async () => {
      // This is implicitly tested by the previous test's reachability.
      // If app.json wasn't found correctly in miniappRoot, reachability from it would fail.
      const { unusedFiles } = await analyzeProject(currentProjectRoot, optionsWithSubdir);
      expect(unusedFiles).not.toContain(appJs);
      expect(unusedFiles).not.toContain(pageAJs);
      expect(unusedFiles).not.toContain(pageAWxml);
    });

    it('should resolve custom entry file relative to miniappRoot', async () => {
      const customEntryRel = 'custom-entry.js'; // Relative to miniapp root
      const customEntryAbs = actualPath.resolve(currentMiniappRoot, customEntryRel);
      const fileDependedOnByCustom = actualPath.resolve(currentMiniappRoot, 'dep.js');

      const optionsWithCustomEntry: AnalyzerOptions = {
        ...optionsWithSubdir,
        entryFile: customEntryRel,
      };

      // Override mocks for this specific test case
      const specificExistingFiles = [
        currentProjectRoot,
        currentMiniappRoot,
        pkgJson,
        projConfJson, // Essentials
        customEntryAbs,
        fileDependedOnByCustom, // Files for this test
      ];
      mockFs.existsSync.mockImplementation((p) =>
        specificExistingFiles.includes(actualPath.resolve(p as string)),
      );
      const specificGlobFiles = [customEntryAbs, fileDependedOnByCustom];
      mockGlob.sync.mockReturnValue(specificGlobFiles);
      mockHasNode.mockImplementation((node) =>
        specificExistingFiles.includes(actualPath.resolve(node)),
      );
      mockParseFile.mockImplementation(async (filePath) => {
        if (actualPath.resolve(filePath) === customEntryAbs) return [fileDependedOnByCustom];
        return [];
      });

      const { unusedFiles } = await analyzeProject(currentProjectRoot, optionsWithCustomEntry);

      // Assert: Neither custom entry nor its dependency are listed as unused
      expect(unusedFiles).not.toContain(customEntryAbs);
      expect(unusedFiles).not.toContain(fileDependedOnByCustom);
      // Essentials should also not be unused
      expect(unusedFiles).not.toContain(pkgJson);
      expect(unusedFiles).not.toContain(projConfJson);
    });

    it('should instantiate FileParser with correct roots', async () => {
      // Re-require the mocked module here to access the mock constructor
      const { FileParser } = require('../../src/analyzer/file-parser');
      await analyzeProject(currentProjectRoot, optionsWithSubdir);
      // Verify the mock constructor was called with the correct project root
      expect(FileParser).toHaveBeenCalledWith(
        currentProjectRoot,
        expect.objectContaining({ miniappRoot: currentMiniappRoot }),
      );
      // Verify our registered check was called (ensures the assertion inside it ran)
      expect(fileParserInstanceChecks[currentProjectRoot]).toHaveBeenCalled();
    });
  }); // End describe 'when miniapp is in a subdirectory'

  describe('findUnusedFiles with TypeScript support', () => {
    const currentProjectRoot = trueProjectRoot;
    const miniappRoot = currentProjectRoot; // In this test, project root is the same as miniapp root

    it('should treat pure ambient declaration files as essential', async () => {
      const appJs = actualPath.resolve(miniappRoot, 'app.js');
      const regularFile = actualPath.resolve(miniappRoot, 'regular.js');
      const pureDts = actualPath.resolve(miniappRoot, 'types/pure-ambient.d.ts');
      const moduleDts = actualPath.resolve(miniappRoot, 'types/module.d.ts');
      const allFiles = [currentProjectRoot, appJs, regularFile, pureDts, moduleDts];

      // Setup our dependency graph
      mockGlob.sync.mockReturnValue(allFiles.filter((p) => p !== currentProjectRoot));

      // Mock hasNode - all files exist
      mockHasNode.mockImplementation((node) => allFiles.includes(actualPath.resolve(node)));

      // Mock parseFile - no dependencies
      mockParseFile.mockResolvedValue([]);

      // Mock pure ambient file detection - only pureDts is a pure ambient file
      (findPureAmbientDeclarationFiles as jest.Mock).mockReturnValue([pureDts]);

      // Mock nodes & outEdges which are used in findUnusedFiles
      mockNodes.mockReturnValue(allFiles.filter((p) => p !== currentProjectRoot));
      mockOutEdges.mockReturnValue([]);

      const { unusedFiles } = await analyzeProject(currentProjectRoot, defaultOptions);

      // The regular file should be unused, but the pure ambient d.ts file should be preserved
      expect(unusedFiles).toContain(regularFile);
      expect(unusedFiles).toContain(moduleDts); // Module-style d.ts should still be marked unused
      expect(unusedFiles).not.toContain(pureDts); // Pure ambient d.ts should be preserved

      // Verify findPureAmbientDeclarationFiles was called
      expect(findPureAmbientDeclarationFiles).toHaveBeenCalledWith(
        currentProjectRoot,
        expect.any(Array),
      );
    });
  });

  // Add more tests as needed for edge cases, options combinations etc.
}); // End describe 'analyzeProject'
