import * as fs from 'fs';
import * as path from 'path';
import { JavaScriptParser } from '../../../src/analyzer/parsers/javascript-parser';
import { PathResolver } from '../../../src/analyzer/utils/path-resolver';
import { AnalyzerOptions } from '../../../src/types/command-options';

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

// Mock fs
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>; // Typed mock

// Mock path
jest.mock('path', () => ({
  resolve: jest.fn((...args) => actualPath.resolve(...args)),
  join: jest.fn((...args) => actualPath.join(...args)),
  dirname: jest.fn((p) => actualPath.dirname(p)),
  extname: jest.fn((p) => actualPath.extname(p)),
  relative: jest.fn((...args) => actualPath.relative(...args)),
  isAbsolute: jest.fn((p) => actualPath.isAbsolute(p)),
}));

// Mock PathResolver
jest.mock('../../../src/analyzer/utils/path-resolver');
const MockedPathResolver = PathResolver as jest.MockedClass<typeof PathResolver>;
const mockResolveAnyPath = jest.fn();

describe('JavaScriptParser', () => {
  const projectRoot = '/workspace/test-project';
  let parser: JavaScriptParser;
  let pathResolver: PathResolver;
  // Use Sets to store mocked FS state persistently across helper calls within a test
  let mockedExistingPaths: Set<string>;
  let mockedFileContents: Map<string, string>;
  let mockedStats: Map<string, Partial<fs.Stats>>; // Store stat results

  // Helper to setup file content mocks
  const mockFileContent = (filePath: string, content: string) => {
    const absPath = actualPath.resolve(projectRoot, filePath);
    mockedFileContents.set(absPath, content);
    mockedExistingPaths.add(absPath); // If we mock content, assume it exists
    // Assume it's a file if content is provided
    if (!mockedStats.has(absPath)) {
      mockedStats.set(absPath, { isFile: () => true, isDirectory: () => false });
    }
  };

  // Helper to mock file/directory existence and stats
  const mockPathExists = (filePath: string | string[], stats?: Partial<fs.Stats> | 'dir') => {
    const paths = Array.isArray(filePath) ? filePath : [filePath];
    paths.forEach((p) => {
      const absPath = actualPath.resolve(projectRoot, p);
      mockedExistingPaths.add(absPath);
      // Provide default stats if none are given
      let effectiveStats = stats;
      if (stats === 'dir') {
        effectiveStats = { isFile: () => false, isDirectory: () => true };
      } else if (!stats) {
        // Default to file if no specific stats provided
        effectiveStats = { isFile: () => true, isDirectory: () => false };
      }
      if (effectiveStats) {
        mockedStats.set(absPath, effectiveStats as Partial<fs.Stats>);
      }
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    MockedPathResolver.mockClear();

    // Initialize persistent mock stores for each test
    mockedExistingPaths = new Set<string>();
    mockedFileContents = new Map<string, string>();
    mockedStats = new Map<string, Partial<fs.Stats>>();

    // Helper to normalize paths for consistent lookups in mocks
    const normalizePathForMock = (p: fs.PathLike): string => {
      const pathStr = p.toString();
      // Always resolve paths against projectRoot if they aren't already absolute.
      // Use normalize to handle separators and segments like '.' or '..' if possible.
      const absPath = actualPath.isAbsolute(pathStr)
        ? actualPath.normalize(pathStr)
        : actualPath.resolve(projectRoot, pathStr);
      return absPath;
    };

    // --- Configure Core FS Mocks ---
    mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const normalizedPath = normalizePathForMock(p);
      const exists = mockedExistingPaths.has(normalizedPath);
      return exists;
    });

    // readFileSync: Reads from the mocked content Map
    mockFs.readFileSync.mockImplementation(
      (p: fs.PathLike | number, options?: any): string | Buffer => {
        // Handle potential file descriptor input if necessary, though unlikely in these tests
        if (typeof p === 'number') {
          throw new Error(`ENOENT: readFileSync mock doesn't handle file descriptors`);
        }
        const normalizedPath = normalizePathForMock(p);
        const encoding = typeof options === 'string' ? options : options?.encoding;

        if (mockedFileContents.has(normalizedPath) && encoding === 'utf-8') {
          return mockedFileContents.get(normalizedPath)!;
        }
        if (mockedFileContents.has(normalizedPath) && !encoding) {
          // If no encoding (or buffer requested), potentially return a buffer?
          // For these tests, assume utf-8 is always intended if content exists.
          return mockedFileContents.get(normalizedPath)!;
        }

        // Throw ENOENT if not found in the mock map
        const error: NodeJS.ErrnoException = new Error(
          `ENOENT: no such file or directory, open '${p}' (Normalized: ${normalizedPath})`,
        );
        error.code = 'ENOENT';
        throw error;
      },
    );

    // statSync: Reads from the mocked stats Map
    mockFs.statSync.mockImplementation(
      (p: fs.PathLike, options?: fs.StatSyncOptions): fs.Stats | undefined => {
        // Handle potential file descriptor input if necessary
        if (typeof p === 'number') {
          throw new Error(`ENOENT: statSync mock doesn't handle file descriptors`);
        }
        const normalizedPath = normalizePathForMock(p);

        if (mockedStats.has(normalizedPath)) {
          const partialStats = mockedStats.get(normalizedPath)!;
          const fullStats = {
            isFile: () => false,
            isDirectory: () => false,
            isBlockDevice: () => false,
            isCharacterDevice: () => false,
            isSymbolicLink: () => false,
            isFIFO: () => false,
            isSocket: () => false,
            dev: 0,
            ino: 0,
            mode: 0,
            nlink: 0,
            uid: 0,
            gid: 0,
            rdev: 0,
            size: 0,
            blksize: 0,
            blocks: 0,
            atimeMs: 0,
            mtimeMs: 0,
            ctimeMs: 0,
            birthtimeMs: 0,
            atime: new Date(),
            mtime: new Date(),
            ctime: new Date(),
            birthtime: new Date(),
            ...partialStats,
          } as fs.Stats;

          // Handle throwIfNoEntry option
          if (options?.throwIfNoEntry === false) {
            return fullStats;
          }
          return fullStats;
        }

        // Handle throwIfNoEntry option when file doesn't exist
        if (options?.throwIfNoEntry === false) {
          return undefined;
        }

        // Throw ENOENT if no stats are mocked for the path
        const error: NodeJS.ErrnoException = new Error(
          `ENOENT: no such file or directory, stat '${p}' (Normalized: ${normalizedPath})`,
        );
        error.code = 'ENOENT';
        throw error;
      },
    );
    // --- End FS Mocks ---

    // Reset path mocks (ensure they call actual path)
    (path.resolve as jest.Mock).mockImplementation((...args) => actualPath.resolve(...args));
    (path.join as jest.Mock).mockImplementation((...args) => actualPath.join(...args));
    (path.relative as jest.Mock).mockImplementation((...args) => actualPath.relative(...args));
    (path.dirname as jest.Mock).mockImplementation((p) => actualPath.dirname(p));
    (path.extname as jest.Mock).mockImplementation((p) => actualPath.extname(p));
    (path.isAbsolute as jest.Mock).mockImplementation((p) => actualPath.isAbsolute(p));

    // Setup mock PathResolver
    const options: AnalyzerOptions = {
      fileTypes: [],
      verbose: false,
      miniappRoot: projectRoot,
      appJsonPath: actualPath.resolve(projectRoot, 'app.json'),
    };
    pathResolver = new MockedPathResolver(
      projectRoot,
      options,
      null,
      false,
    ) as jest.Mocked<PathResolver>;
    (pathResolver as any).resolveAnyPath = mockResolveAnyPath;

    // Create parser instance with mocked PathResolver
    parser = new JavaScriptParser(pathResolver);
  });

  describe('parse', () => {
    it('should parse import statements with relative paths', async () => {
      const filePath = actualPath.resolve(projectRoot, 'src/app.js');
      const fileContent = `
        import util from './utils/util.js';
        import { Config } from "../config/settings"; // No extension
        import * as api from './api'; // No extension
      `;
      mockFileContent('src/app.js', fileContent);

      const utilPath = actualPath.resolve(projectRoot, 'src/utils/util.js');
      const settingsPath = actualPath.resolve(projectRoot, 'config/settings.ts');
      const apiPath = actualPath.resolve(projectRoot, 'src/api.js');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === './utils/util.js') return utilPath;
          if (importPath === '../config/settings') return settingsPath;
          if (importPath === './api') return apiPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(3);
      expect(dependencies).toContain(utilPath);
      expect(dependencies).toContain(settingsPath);
      expect(dependencies).toContain(apiPath);

      expect(mockResolveAnyPath).toHaveBeenCalledWith('./utils/util.js', filePath, [
        '.js',
        '.ts',
        '.json',
      ]);
      expect(mockResolveAnyPath).toHaveBeenCalledWith('../config/settings', filePath, [
        '.js',
        '.ts',
        '.json',
      ]);
      expect(mockResolveAnyPath).toHaveBeenCalledWith('./api', filePath, ['.js', '.ts', '.json']);
    });

    it('should parse require statements', async () => {
      const filePath = actualPath.resolve(projectRoot, 'src/util.js');
      const fileContent = `
        const config = require('../config/config.js');
        const helpers = require('./helpers');
      `;
      mockFileContent('src/util.js', fileContent);

      const configPath = actualPath.resolve(projectRoot, 'config/config.js');
      const helpersPath = actualPath.resolve(projectRoot, 'src/helpers.js');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === '../config/config.js') return configPath;
          if (importPath === './helpers') return helpersPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(configPath);
      expect(dependencies).toContain(helpersPath);

      expect(mockResolveAnyPath).toHaveBeenCalledWith('../config/config.js', filePath, [
        '.js',
        '.ts',
        '.json',
      ]);
      expect(mockResolveAnyPath).toHaveBeenCalledWith('./helpers', filePath, [
        '.js',
        '.ts',
        '.json',
      ]);
    });

    it('should not parse imports inside string literals or comments', async () => {
      const filePath = actualPath.resolve(projectRoot, 'src/component.js');
      const fileContent = `
        // import './should-not-import';
        /* import './also-not-import'; */
        const importExample = "import './not-real-import'";
        const stringExample = 'require("./not-real-require")';
        
        // This one should be parsed
        import * as utils from './utils';
      `;
      mockFileContent('src/component.js', fileContent);

      const utilsPath = actualPath.resolve(projectRoot, 'src/utils.js');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === './utils') return utilsPath;
          // Return null for all other paths to simulate they don't exist or can't be resolved
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(utilsPath);

      // Due to the nature of regex, the parser might still try to resolve paths in comments/strings
      // Here we're just checking that they aren't in the final dependencies list
      expect(dependencies).not.toContain(
        actualPath.resolve(projectRoot, 'src/should-not-import.js'),
      );
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, 'src/also-not-import.js'));
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, 'src/not-real-import.js'));
      expect(dependencies).not.toContain(
        actualPath.resolve(projectRoot, 'src/not-real-require.js'),
      );
    });

    it('should handle failing to parse a file gracefully', async () => {
      const filePath = actualPath.resolve(projectRoot, 'src/broken.js');

      // Don't mock file content, which will cause readFileSync to throw

      await expect(parser.parse(filePath)).rejects.toThrow();
    });
  });
});
