import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import { analyzeProject } from '../../src/analyzer/analyzer';
import { AnalyzerOptions } from '../../src/types/command-options';

// Mock fs
jest.mock('fs');

// Mock glob
jest.mock('glob', () => ({
  sync: jest.fn(),
}));

// Mock path (using actual path logic)
const actualPath = jest.requireActual('path');
jest.mock('path', () => ({
  ...actualPath,
  resolve: jest.fn((...args) => actualPath.resolve(...args)),
  join: jest.fn((...args) => actualPath.join(...args)),
  relative: jest.fn((...args) => actualPath.relative(...args)),
  dirname: jest.fn((p) => actualPath.dirname(p)),
  extname: jest.fn((p) => actualPath.extname(p)),
  isAbsolute: jest.fn((p) => actualPath.isAbsolute(p)),
}));

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
const mockGraphNodes: string[] = []; // Store nodes added via mock
const mockGraphOutEdges: Record<string, string[]> = {}; // Store edges added via mock
jest.mock('../../src/analyzer/dependency-graph', () => ({
  DependencyGraph: jest.fn().mockImplementation(() => {
    mockGraphNodes.length = 0; // Clear previous nodes
    Object.keys(mockGraphOutEdges).forEach(key => delete mockGraphOutEdges[key]); // Clear previous edges
    return {
      addNode: jest.fn((node: string) => {
          mockAddNode(node); // Call spy
          if (!mockGraphNodes.includes(node)) mockGraphNodes.push(node);
      }),
      addEdge: jest.fn((from: string, to: string) => {
          mockAddEdge(from, to); // Call spy
          if (!mockGraphOutEdges[from]) mockGraphOutEdges[from] = [];
          if (!mockGraphOutEdges[from].includes(to)) mockGraphOutEdges[from].push(to);
      }),
      // Need to mock methods used by findUnusedFiles (DFS part)
      nodes: jest.fn(() => [...mockGraphNodes]),
      outEdges: jest.fn((node: string) => mockGraphOutEdges[node] || []),
      hasNode: jest.fn((node: string) => {
          mockHasNode(node); // Call spy
          return mockGraphNodes.includes(node);
      }),
      // Mock other methods if needed by analyzer logic (inDegree etc.)
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
      
    // Reset path mocks
    (path.resolve as jest.Mock).mockImplementation((...args) => actualPath.resolve(...args));
    (path.join as jest.Mock).mockImplementation((...args) => actualPath.join(...args));

  });
    
   afterEach(() => {
     consoleLogSpy.mockRestore();
     consoleWarnSpy.mockRestore();
     consoleErrorSpy.mockRestore();
   });

  it('should throw error if project root does not exist', async () => {
    mockFs.existsSync.mockReturnValue(false);
    await expect(analyzeProject(projectRoot, defaultOptions))
      .rejects
      .toThrow(`小程序目录不存在: ${projectRoot}`);
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
        'specific-file.js'
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

    mockGlob.sync.mockReturnValue(allFiles);
    
    // Mock dependencies returned by parser
    mockParseFile.mockImplementation(async (filePath) => {
      if (filePath === fileA) return [fileB]; // A depends on B
      if (filePath === fileB) return [fileC, fileD]; // B depends on C and D (D is outside allFiles)
      if (filePath === fileC) return []; // C has no deps
      return [];
    });

    const { dependencyGraph, unusedFiles } = await analyzeProject(projectRoot, defaultOptions);

    // Check nodes were added
    expect(mockAddNode).toHaveBeenCalledWith(fileA);
    expect(mockAddNode).toHaveBeenCalledWith(fileB);
    expect(mockAddNode).toHaveBeenCalledWith(fileC);
    expect(mockAddNode).toHaveBeenCalledTimes(3); // Only files found by glob

    // Check parser was called for each file
    expect(mockParseFile).toHaveBeenCalledWith(fileA);
    expect(mockParseFile).toHaveBeenCalledWith(fileB);
    expect(mockParseFile).toHaveBeenCalledWith(fileC);
    expect(mockParseFile).toHaveBeenCalledTimes(3);

    // Check edges were added correctly (only for deps within allFiles)
    expect(mockAddEdge).toHaveBeenCalledWith(fileA, fileB);
    expect(mockAddEdge).toHaveBeenCalledWith(fileB, fileC);
    expect(mockAddEdge).not.toHaveBeenCalledWith(fileB, fileD); // D was not in allFiles
    expect(mockAddEdge).toHaveBeenCalledTimes(2);
  });

  it('should find unused files using default entry points (app.js/app.json) and essential files', async () => {
    const appJs = actualPath.resolve(projectRoot, 'app.js');
    const appJson = actualPath.resolve(projectRoot, 'app.json');
    const pageA = actualPath.resolve(projectRoot, 'pages/a.js');
    const pageB = actualPath.resolve(projectRoot, 'pages/b.js');
    const utilC = actualPath.resolve(projectRoot, 'utils/c.js');
    const unusedD = actualPath.resolve(projectRoot, 'unused/d.js');
    const projConf = actualPath.resolve(projectRoot, 'project.config.json'); // Essential
    const allFiles = [appJs, appJson, pageA, pageB, utilC, unusedD, projConf];

    mockGlob.sync.mockReturnValue(allFiles);
    // Mock fs.existsSync for entry file checks and essential file checks
    mockFs.existsSync.mockImplementation(p => allFiles.includes(p));

    // Mock parseFile to setup dependency chain: app.js -> pageA -> utilC, app.json -> pageA, pageB (unreachable)
    mockParseFile.mockImplementation(async (filePath) => {
        if (filePath === appJs) return [pageA];
        if (filePath === appJson) return [pageA]; // Assume app.json lists pageA
        if (filePath === pageA) return [utilC];
        // pageB, utilC, unusedD, projConf have no dependencies
        return [];
    });

    const { unusedFiles } = await analyzeProject(projectRoot, defaultOptions);

    // Graph built based on mocks: A->B, A->C, D->A
    // Build graph based on parseFile mocks for findUnusedFiles logic:
    // Nodes: appJs, appJson, pageA, pageB, utilC, unusedD, projConf
    // Edges: appJs->pageA, appJson->pageA, pageA->utilC
    // Expected reachable: appJs, appJson, pageA, utilC, projConf (essential)
    // Expected unused: pageB, unusedD

    expect(unusedFiles).toHaveLength(2);
    expect(unusedFiles).toEqual(expect.arrayContaining([pageB, unusedD]));
    expect(unusedFiles).not.toContain(projConf); // Essential file should not be unused
    expect(unusedFiles).not.toContain(appJs); // Entry file
     // Check that hasNode was called during DFS traversal (example check)
     expect(mockHasNode).toHaveBeenCalledWith(appJs);
     expect(mockHasNode).toHaveBeenCalledWith(appJson);
     expect(mockHasNode).toHaveBeenCalledWith(pageA);
     expect(mockHasNode).toHaveBeenCalledWith(utilC);
     expect(mockHasNode).toHaveBeenCalledWith(projConf);
     expect(mockHasNode).toHaveBeenCalledWith(pageB); // Checked but found unused
     expect(mockHasNode).toHaveBeenCalledWith(unusedD); // Checked but found unused
  });

  it('should use options.entryFile as the entry point if specified and exists', async () => {
    const customEntry = actualPath.resolve(projectRoot, 'src/main.js');
    const depA = actualPath.resolve(projectRoot, 'src/depA.js');
    const unusedB = actualPath.resolve(projectRoot, 'unused/b.js');
    const appJs = actualPath.resolve(projectRoot, 'app.js'); // Default entry, should be ignored
    const allFiles = [customEntry, depA, unusedB, appJs];

    mockGlob.sync.mockReturnValue(allFiles);
    mockFs.existsSync.mockImplementation(p => allFiles.includes(p));
    mockParseFile.mockImplementation(async (filePath) => {
      if (filePath === customEntry) return [depA];
      return [];
    });

    const options: AnalyzerOptions = { ...defaultOptions, entryFile: 'src/main.js' };
    const { unusedFiles } = await analyzeProject(projectRoot, options);

    // Expected reachable: customEntry, depA
    // Expected unused: unusedB, appJs
    expect(unusedFiles).toHaveLength(2);
    expect(unusedFiles).toEqual(expect.arrayContaining([unusedB, appJs]));
    expect(unusedFiles).not.toContain(customEntry);
    expect(unusedFiles).not.toContain(depA);
    // Check log message
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`使用自定义入口文件: ${customEntry}`));
    // Check default entry point was not used for DFS start (though hasNode might be called)
    expect(mockHasNode).not.toHaveBeenCalledWith(appJs); // This check depends on mock Graph implementation detail
  });

  it('should warn if options.entryFile does not exist and fallback to defaults', async () => {
     const nonExistentEntry = 'src/nonexistent.js';
     const appJs = actualPath.resolve(projectRoot, 'app.js');
     const depA = actualPath.resolve(projectRoot, 'depA.js');
     const allFiles = [appJs, depA];

     mockGlob.sync.mockReturnValue(allFiles);
     // Mock that only app.js and depA exist
     mockFs.existsSync.mockImplementation(p => p === appJs || p === depA);
     mockParseFile.mockImplementation(async (filePath) => {
         if (filePath === appJs) return [depA];
         return [];
     });

     const options: AnalyzerOptions = { ...defaultOptions, entryFile: nonExistentEntry };
     const { unusedFiles } = await analyzeProject(projectRoot, options);

     // Should fallback to app.js as entry
     expect(unusedFiles).toHaveLength(0);
     expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`警告: 自定义入口文件不存在: ${actualPath.resolve(projectRoot, nonExistentEntry)}`));
     expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`使用入口文件: ${appJs}`)); // Check fallback log
  });

  it('should use options.entryContent to determine entry points', async () => {
    const page1Js = actualPath.resolve(projectRoot, 'pages/page1/page1.js');
    const page1Wxml = actualPath.resolve(projectRoot, 'pages/page1/page1.wxml');
    const page2Js = actualPath.resolve(projectRoot, 'sub/page2/page2.js');
    const utilA = actualPath.resolve(projectRoot, 'utils/a.js');
    const unusedC = actualPath.resolve(projectRoot, 'unused/c.js');
    const allFiles = [page1Js, page1Wxml, page2Js, utilA, unusedC];

    mockGlob.sync.mockReturnValue(allFiles);
    mockFs.existsSync.mockImplementation(p => allFiles.includes(p));
    mockParseFile.mockImplementation(async (filePath) => {
      if (filePath === page1Js) return [utilA];
      // page2Js depends on nothing
      return [];
    });

    const entryContent = {
        pages: ["pages/page1/page1"],
        subpackages: [
            { root: "sub", pages: ["page2/page2"] }
        ]
    };
    const options: AnalyzerOptions = { ...defaultOptions, entryContent: entryContent };
    const { unusedFiles } = await analyzeProject(projectRoot, options);
    
    // Expected reachable: page1Js, page1Wxml, utilA, page2Js
    // Expected unused: unusedC
    expect(unusedFiles).toHaveLength(1);
    expect(unusedFiles).toEqual([unusedC]);
    expect(unusedFiles).not.toContain(page1Js);
    expect(unusedFiles).not.toContain(page1Wxml);
    expect(unusedFiles).not.toContain(page2Js);
    expect(unusedFiles).not.toContain(utilA);
    expect(consoleLogSpy).toHaveBeenCalledWith('使用提供的入口文件内容');
    // Check that DFS started from the parsed entry points
    expect(mockHasNode).toHaveBeenCalledWith(page1Js);
    expect(mockHasNode).toHaveBeenCalledWith(page1Wxml);
    expect(mockHasNode).toHaveBeenCalledWith(page2Js);
  });

  it('should treat files in options.essentialFiles as used, even if unreferenced', async () => {
    const appJs = actualPath.resolve(projectRoot, 'app.js');
    const essentialUtil = actualPath.resolve(projectRoot, 'utils/essential.js');
    const essentialConfig = actualPath.resolve(projectRoot, 'config/prod.json');
    const unusedScript = actualPath.resolve(projectRoot, 'scripts/deploy.js');
    const allFiles = [appJs, essentialUtil, essentialConfig, unusedScript];

    mockGlob.sync.mockReturnValue(allFiles);
    mockFs.existsSync.mockImplementation(p => allFiles.includes(p));
    // Mock that app.js has no dependencies
    mockParseFile.mockResolvedValue([]);

    const options: AnalyzerOptions = {
      ...defaultOptions,
      // Provide essential files with relative and absolute paths
      essentialFiles: ['utils/essential.js', essentialConfig]
    };
    const { unusedFiles } = await analyzeProject(projectRoot, options);

    // Expected reachable: appJs (entry), essentialUtil, essentialConfig
    // Expected unused: unusedScript
    expect(unusedFiles).toHaveLength(1);
    expect(unusedFiles).toEqual([unusedScript]);
    expect(unusedFiles).not.toContain(appJs);
    expect(unusedFiles).not.toContain(essentialUtil);
    expect(unusedFiles).not.toContain(essentialConfig);
     // Check that essential files were added to the DFS start set
     expect(mockHasNode).toHaveBeenCalledWith(essentialUtil);
     expect(mockHasNode).toHaveBeenCalledWith(essentialConfig);
  });

  it('should handle parsing errors gracefully (skip file)', async () => {
      const appJs = actualPath.resolve(projectRoot, 'app.js');
      const badFile = actualPath.resolve(projectRoot, 'bad.js');
      const goodFile = actualPath.resolve(projectRoot, 'good.js');
      const allFiles = [appJs, badFile, goodFile];

      mockGlob.sync.mockReturnValue(allFiles);
      mockFs.existsSync.mockImplementation(p => allFiles.includes(p));
      mockParseFile.mockImplementation(async (filePath) => {
          if (filePath === appJs) return [goodFile]; // App depends on good file
          if (filePath === badFile) throw new Error('Parsing failed!');
          if (filePath === goodFile) return [];
          return [];
      });

      // Enable verbose logging to check warning
      const options: AnalyzerOptions = { ...defaultOptions, verbose: true };
      const { unusedFiles } = await analyzeProject(projectRoot, options);
      
      // Expected reachable: appJs, goodFile
      // Expected unused: badFile (since parsing failed, it couldn't establish/find dependencies)
      expect(unusedFiles).toHaveLength(1);
      expect(unusedFiles).toEqual([badFile]);
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`无法解析文件 ${badFile}: Parsing failed!`));
      // Ensure graph building continued for other files
      expect(mockAddEdge).toHaveBeenCalledWith(appJs, goodFile);
  });

  // More tests for unused file finding etc. will go here

}); 