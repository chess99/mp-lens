import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerOptions } from '../../src/types/command-options';
import { PathResolver } from '../../src/utils/path-resolver';

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

describe('PathResolver', () => {
  const projectRoot = '/workspace/test-project';
  let pathResolver: PathResolver;

  // Use Sets to store mocked FS state persistently across helper calls within a test
  let mockedExistingPaths: Set<string>;
  let mockedFileContents: Map<string, string>;
  let mockedStats: Map<string, Partial<fs.Stats>>; // Store stat results

  // Helper to setup file content mocks
  const _mockFileContent = (filePath: string, content: string) => {
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

    // Initialize persistent mock stores for each test
    mockedExistingPaths = new Set<string>();
    mockedFileContents = new Map<string, string>();
    mockedStats = new Map<string, Partial<fs.Stats>>();

    // Helper to normalize paths for consistent lookups in mocks
    const normalizePathForMock = (p: fs.PathLike): string => {
      const pathStr = p.toString();
      // For absolute paths, just normalize them directly
      // For relative paths, resolve them against projectRoot
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

    // statSync: Reads from the mocked stats Map
    mockFs.statSync.mockImplementation((p: fs.PathLike): fs.Stats => {
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

        return fullStats;
      }

      // Throw ENOENT if no stats are mocked for the path
      const error: NodeJS.ErrnoException = new Error(
        `ENOENT: no such file or directory, stat '${p}' (Normalized: ${normalizedPath})`,
      );
      error.code = 'ENOENT';
      throw error;
    });
    // --- End FS Mocks ---

    // Reset path mocks (ensure they call actual path)
    (path.resolve as jest.Mock).mockImplementation((...args) => actualPath.resolve(...args));
    (path.join as jest.Mock).mockImplementation((...args) => actualPath.join(...args));
    (path.relative as jest.Mock).mockImplementation((...args) => actualPath.relative(...args));
    (path.dirname as jest.Mock).mockImplementation((p) => actualPath.dirname(p));
    (path.extname as jest.Mock).mockImplementation((p) => actualPath.extname(p));
    (path.isAbsolute as jest.Mock).mockImplementation((p) => actualPath.isAbsolute(p));

    const options: AnalyzerOptions = {
      verbose: false,
      miniappRoot: projectRoot,
      appJsonPath: actualPath.resolve(projectRoot, 'app.json'),
    };

    // Create pathResolver instance
    pathResolver = new PathResolver(projectRoot, options);
  });

  describe('resolveAnyPath', () => {
    it('should resolve relative paths', () => {
      const sourcePath = actualPath.resolve(projectRoot, 'src/index.js');
      const targetFile = actualPath.resolve(projectRoot, 'src/utils/helper.js');

      // Mock the file existence
      mockPathExists(targetFile);

      const resolved = pathResolver.resolveAnyPath('./utils/helper.js', sourcePath, ['js', 'ts']);

      expect(resolved).toBe(targetFile);
    });

    it('should resolve root-relative paths', () => {
      const sourcePath = actualPath.resolve(projectRoot, 'src/index.js');
      const targetFile = actualPath.resolve(projectRoot, 'utils/helper.js');

      // Mock the file existence
      mockPathExists(targetFile);

      const resolved = pathResolver.resolveAnyPath('/utils/helper.js', sourcePath, ['js', 'ts']);

      expect(resolved).toBe(targetFile);
    });

    it('should resolve paths with different extensions', () => {
      const sourcePath = actualPath.resolve(projectRoot, 'src/index.js');
      const targetFile = actualPath.resolve(projectRoot, 'src/utils/helper.ts');

      // Mock the file existence
      mockPathExists(targetFile);

      const resolved = pathResolver.resolveAnyPath('./utils/helper', sourcePath, ['js', 'ts']);

      expect(resolved).toBe(targetFile);
    });

    it('should resolve directory imports to index files', () => {
      const sourcePath = actualPath.resolve(projectRoot, 'src/index.js');
      const directory = actualPath.resolve(projectRoot, 'src/components');
      const indexFile = actualPath.resolve(projectRoot, 'src/components/index.js');

      // Mock the directory and index file existence
      mockPathExists(directory, 'dir');
      mockPathExists(indexFile);

      const resolved = pathResolver.resolveAnyPath('./components', sourcePath, ['js', 'ts']);

      expect(resolved).toBe(indexFile);
    });

    it('should resolve alias paths through provided aliases', () => {
      const sourcePath = actualPath.resolve(projectRoot, 'src/index.js');
      const aliasPath = '@/utils/helper';
      const resolvedAliasPath = actualPath.resolve(projectRoot, 'src/utils/helper.js');

      // Recreate pathResolver with aliases in options
      const optionsWithAliases: AnalyzerOptions = {
        verbose: false,
        miniappRoot: projectRoot,
        appJsonPath: actualPath.resolve(projectRoot, 'app.json'),
        aliases: { '@': 'src' },
      };
      const resolverWithAliases = new PathResolver(projectRoot, optionsWithAliases);

      // Mock the file existence
      mockPathExists(resolvedAliasPath);

      const resolved = resolverWithAliases.resolveAnyPath(aliasPath, sourcePath, ['js', 'ts']);

      expect(resolved).toBe(resolvedAliasPath);
      // No AliasResolver used anymore
    });

    it('should return null for non-existent files', () => {
      const sourcePath = actualPath.resolve(projectRoot, 'src/index.js');

      // No mocked files means the file doesn't exist

      const resolved = pathResolver.resolveAnyPath('./utils/nonexistent', sourcePath, ['js', 'ts']);

      expect(resolved).toBeNull();
    });

    it('should skip npm package imports', () => {
      const sourcePath = actualPath.resolve(projectRoot, 'src/index.js');

      const resolved = pathResolver.resolveAnyPath('react', sourcePath, ['js', 'ts']);

      expect(resolved).toBeNull();
    });

    it('should handle absolute paths correctly', () => {
      const absolutePath = actualPath.resolve('/absolute/path/to/file.js');
      const sourcePath = actualPath.resolve(projectRoot, 'src/index.js');

      // Mock the file existence at the absolute path
      mockPathExists(absolutePath);

      const resolved = pathResolver.resolveAnyPath(absolutePath, sourcePath, ['js', 'ts']);

      expect(resolved).toBe(absolutePath);
    });
  });
});
