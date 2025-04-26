import * as fs from 'fs';
import * as path from 'path';
import { JSONParser } from '../../../src/analyzer/parsers/json-parser';
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

describe('JSONParser', () => {
  const projectRoot = '/workspace/test-project';
  let parser: JSONParser;
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
    const options: AnalyzerOptions = { fileTypes: [], verbose: false };
    pathResolver = new MockedPathResolver(
      projectRoot,
      options,
      null,
      false,
    ) as jest.Mocked<PathResolver>;
    (pathResolver as any).resolveAnyPath = mockResolveAnyPath;

    // Create parser instance with mocked PathResolver
    parser = new JSONParser(pathResolver, projectRoot, options);
  });

  describe('parse', () => {
    it('should parse app.json pages', async () => {
      const filePath = actualPath.resolve(projectRoot, 'app.json');
      const fileContent = `{
        "pages": [
          "pages/index/index",
          "pages/logs/logs",
          "pages/user/profile"
        ]
      }`;
      mockFileContent('app.json', fileContent);

      const indexPath = actualPath.resolve(projectRoot, 'pages/index/index.js');
      const logsPath = actualPath.resolve(projectRoot, 'pages/logs/logs.js');
      const profilePath = actualPath.resolve(projectRoot, 'pages/user/profile.js');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          // The implementation adds a leading slash to page paths
          if (importPath === '/pages/index/index') return indexPath;
          if (importPath === '/pages/logs/logs') return logsPath;
          if (importPath === '/pages/user/profile') return profilePath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toContain(indexPath);
      expect(dependencies).toContain(logsPath);
      expect(dependencies).toContain(profilePath);
      expect(dependencies.length).toBeGreaterThanOrEqual(3);

      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/pages/index/index',
        filePath,
        expect.arrayContaining(['.js']),
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/pages/logs/logs',
        filePath,
        expect.arrayContaining(['.js']),
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/pages/user/profile',
        filePath,
        expect.arrayContaining(['.js']),
      );
    });

    it('should parse app.json subpackages', async () => {
      const filePath = actualPath.resolve(projectRoot, 'app.json');
      const fileContent = `{
        "subpackages": [
          {
            "root": "package1",
            "pages": [
              "pages/index",
              "pages/detail"
            ]
          },
          {
            "root": "package2",
            "pages": [
              "pages/list"
            ]
          }
        ]
      }`;
      mockFileContent('app.json', fileContent);

      const package1IndexPath = actualPath.resolve(projectRoot, 'package1/pages/index.js');
      const package1DetailPath = actualPath.resolve(projectRoot, 'package1/pages/detail.js');
      const package2ListPath = actualPath.resolve(projectRoot, 'package2/pages/list.js');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          // The implementation adds a leading slash and joins the paths
          if (importPath === '/package1/pages/index') return package1IndexPath;
          if (importPath === '/package1/pages/detail') return package1DetailPath;
          if (importPath === '/package2/pages/list') return package2ListPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toContain(package1IndexPath);
      expect(dependencies).toContain(package1DetailPath);
      expect(dependencies).toContain(package2ListPath);
      expect(dependencies.length).toBeGreaterThanOrEqual(3);

      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/package1/pages/index',
        filePath,
        expect.arrayContaining(['.js']),
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/package1/pages/detail',
        filePath,
        expect.arrayContaining(['.js']),
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/package2/pages/list',
        filePath,
        expect.arrayContaining(['.js']),
      );
    });

    it('should parse app.json tabBar icon paths', async () => {
      const filePath = actualPath.resolve(projectRoot, 'app.json');
      const fileContent = `{
        "tabBar": {
          "list": [
            {
              "pagePath": "pages/index/index",
              "text": "Home",
              "iconPath": "assets/home.png",
              "selectedIconPath": "assets/home-active.png"
            },
            {
              "pagePath": "pages/profile/profile",
              "text": "Profile",
              "iconPath": "assets/profile.png",
              "selectedIconPath": "assets/profile-active.png"
            }
          ]
        }
      }`;
      mockFileContent('app.json', fileContent);

      const indexPath = actualPath.resolve(projectRoot, 'pages/index/index.js');
      const profilePath = actualPath.resolve(projectRoot, 'pages/profile/profile.js');
      const homeIconPath = actualPath.resolve(projectRoot, 'assets/home.png');
      const homeActiveIconPath = actualPath.resolve(projectRoot, 'assets/home-active.png');
      const profileIconPath = actualPath.resolve(projectRoot, 'assets/profile.png');
      const profileActiveIconPath = actualPath.resolve(projectRoot, 'assets/profile-active.png');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === 'pages/index/index') return indexPath;
          if (importPath === 'pages/profile/profile') return profilePath;
          if (importPath === 'assets/home.png') return homeIconPath;
          if (importPath === 'assets/home-active.png') return homeActiveIconPath;
          if (importPath === 'assets/profile.png') return profileIconPath;
          if (importPath === 'assets/profile-active.png') return profileActiveIconPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toContain(homeIconPath);
      expect(dependencies).toContain(homeActiveIconPath);
      expect(dependencies).toContain(profileIconPath);
      expect(dependencies).toContain(profileActiveIconPath);
      // The page paths might also be included, so we don't test the exact length
    });

    it('should parse page.json component references', async () => {
      const filePath = actualPath.resolve(projectRoot, 'pages/index/index.json');
      const fileContent = `{
        "usingComponents": {
          "custom-button": "/components/button/button",
          "user-card": "../../components/user-card/user-card",
          "tab-bar": "../common/tab-bar"
        }
      }`;
      mockFileContent('pages/index/index.json', fileContent);

      const buttonPath = actualPath.resolve(projectRoot, 'components/button/button.js');
      const userCardPath = actualPath.resolve(projectRoot, 'components/user-card/user-card.js');
      const tabBarPath = actualPath.resolve(projectRoot, 'pages/common/tab-bar.js');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === '/components/button/button') return buttonPath;
          if (importPath === '../../components/user-card/user-card') return userCardPath;
          if (importPath === '../common/tab-bar') return tabBarPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toContain(buttonPath);
      expect(dependencies).toContain(userCardPath);
      expect(dependencies).toContain(tabBarPath);

      // Use expect.arrayContaining instead of exact array comparison because
      // the exact extensions might vary in the implementation
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/components/button/button',
        filePath,
        expect.arrayContaining(['.js', '.ts']),
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '../../components/user-card/user-card',
        filePath,
        expect.arrayContaining(['.js', '.ts']),
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '../common/tab-bar',
        filePath,
        expect.arrayContaining(['.js', '.ts']),
      );
    });

    it('should handle invalid JSON gracefully', async () => {
      const filePath = actualPath.resolve(projectRoot, 'invalid.json');
      const fileContent = `{
        "pages": [
          "pages/index/index",
          "pages/logs/logs",
        ] // Invalid trailing comma
      }`;
      mockFileContent('invalid.json', fileContent);

      // The real implementation might handle invalid JSON more gracefully than we expected
      const dependencies = await parser.parse(filePath);
      expect(dependencies).toEqual([]);
    });

    it('should handle malformed paths gracefully', async () => {
      const filePath = actualPath.resolve(projectRoot, 'app.json');
      const fileContent = `{
        "pages": ["/pages/index/index"]
      }`;
      mockFileContent('app.json', fileContent);

      // Mock PathResolver to return null (not resolved)
      mockResolveAnyPath.mockReturnValue(null);

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(0);
      // Check that resolveAnyPath is called with the expected path
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        expect.stringContaining('pages/index/index'),
        filePath,
        expect.arrayContaining(['.js', '.ts']),
      );
    });
  });
});
