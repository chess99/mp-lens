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
    it('should parse app.json pages and find all related files', async () => {
      const filePath = actualPath.resolve(projectRoot, 'app.json');
      const fileContent = `{
        "pages": [
          "pages/index/index",
          "pages/logs/logs",
          "pages/user/profile"
        ]
      }`;
      mockFileContent('app.json', fileContent);

      // Define expected paths
      const indexBasePath = actualPath.resolve(projectRoot, 'pages/index/index');
      const logsBasePath = actualPath.resolve(projectRoot, 'pages/logs/logs');
      const profileBasePath = actualPath.resolve(projectRoot, 'pages/user/profile');

      const indexJSPath = indexBasePath + '.js';
      const indexWXMLPath = indexBasePath + '.wxml';
      const indexWXSSPath = indexBasePath + '.wxss';
      const indexJSONPath = indexBasePath + '.json';

      const logsTSPath = logsBasePath + '.ts';
      const logsWXMLPath = logsBasePath + '.wxml';

      const profileJSPath = profileBasePath + '.js';

      // Mock existence of *all* related files
      mockPathExists([indexJSPath, indexWXMLPath, indexWXSSPath, indexJSONPath]);
      mockPathExists([logsTSPath, logsWXMLPath]);
      mockPathExists(profileJSPath);

      // Mock PathResolver to return *one* valid path for each page (e.g., the script file)
      mockResolveAnyPath.mockImplementation(
        (importPath: string, _containingFile: string, _extensions: string[]) => {
          if (importPath === '/pages/index/index') return indexJSPath;
          if (importPath === '/pages/logs/logs') return logsTSPath;
          if (importPath === '/pages/user/profile') return profileJSPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      // Assert all related files are included
      expect(dependencies).toEqual(
        expect.arrayContaining([
          indexJSPath,
          indexWXMLPath,
          indexWXSSPath,
          indexJSONPath,
          logsTSPath,
          logsWXMLPath,
          profileJSPath,
        ]),
      );
      expect(dependencies).toHaveLength(7); // Total number of expected files

      // Verify resolveAnyPath was called for each page entry
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/pages/index/index',
        filePath,
        parser['pageAllExtensions'], // Access private member for verification
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/pages/logs/logs',
        filePath,
        parser['pageAllExtensions'],
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/pages/user/profile',
        filePath,
        parser['pageAllExtensions'],
      );
    });

    it('should parse app.json subpackages and find all related files', async () => {
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

      // Define expected paths
      const pkg1IndexBasePath = actualPath.resolve(projectRoot, 'package1/pages/index');
      const pkg1DetailBasePath = actualPath.resolve(projectRoot, 'package1/pages/detail');
      const pkg2ListBasePath = actualPath.resolve(projectRoot, 'package2/pages/list');

      const pkg1IndexJSPath = pkg1IndexBasePath + '.js';
      const pkg1IndexWXMLPath = pkg1IndexBasePath + '.wxml';
      const pkg1DetailTSPath = pkg1DetailBasePath + '.ts';
      const pkg2ListJSPath = pkg2ListBasePath + '.js';
      const pkg2ListJSONPath = pkg2ListBasePath + '.json';

      // Mock existence
      mockPathExists([pkg1IndexJSPath, pkg1IndexWXMLPath]);
      mockPathExists(pkg1DetailTSPath);
      mockPathExists([pkg2ListJSPath, pkg2ListJSONPath]);

      // Mock PathResolver
      mockResolveAnyPath.mockImplementation(
        (importPath: string, _containingFile: string, _extensions: string[]) => {
          if (importPath === '/package1/pages/index') return pkg1IndexJSPath;
          if (importPath === '/package1/pages/detail') return pkg1DetailTSPath;
          if (importPath === '/package2/pages/list') return pkg2ListJSPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      // Assert all related files are included
      expect(dependencies).toEqual(
        expect.arrayContaining([
          pkg1IndexJSPath,
          pkg1IndexWXMLPath,
          pkg1DetailTSPath,
          pkg2ListJSPath,
          pkg2ListJSONPath,
        ]),
      );
      expect(dependencies).toHaveLength(5);

      // Verify resolveAnyPath calls
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/package1/pages/index',
        filePath,
        parser['pageAllExtensions'],
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/package1/pages/detail',
        filePath,
        parser['pageAllExtensions'],
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/package2/pages/list',
        filePath,
        parser['pageAllExtensions'],
      );
    });

    it('should parse app.json tabBar icon paths but not page paths', async () => {
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

      // Define icon paths
      const homeIconPath = actualPath.resolve(projectRoot, 'assets/home.png');
      const homeActiveIconPath = actualPath.resolve(projectRoot, 'assets/home-active.png');
      const profileIconPath = actualPath.resolve(projectRoot, 'assets/profile.png');
      const profileActiveIconPath = actualPath.resolve(projectRoot, 'assets/profile-active.png');

      // Mock icon existence
      mockPathExists([homeIconPath, homeActiveIconPath, profileIconPath, profileActiveIconPath]);

      // Mock PathResolver responses for icons ONLY
      mockResolveAnyPath.mockImplementation(
        (importPath: string, _containingFile: string, extensions: string[]) => {
          // Check if it's asking for an image
          if (extensions.includes('.png')) {
            if (importPath === 'assets/home.png') return homeIconPath;
            if (importPath === 'assets/home-active.png') return homeActiveIconPath;
            if (importPath === 'assets/profile.png') return profileIconPath;
            if (importPath === 'assets/profile-active.png') return profileActiveIconPath;
          }
          // Return null for anything else (like the pagePaths)
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      // Assert ONLY icons are included
      expect(dependencies).toEqual(
        expect.arrayContaining([
          homeIconPath,
          homeActiveIconPath,
          profileIconPath,
          profileActiveIconPath,
        ]),
      );
      expect(dependencies).toHaveLength(4);

      // Verify resolveAnyPath was called for icons
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        'assets/home.png',
        filePath,
        parser['imageExtensions'],
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        'assets/home-active.png',
        filePath,
        parser['imageExtensions'],
      );
      // Verify it was *not* called for page paths within the tabBar processor
      expect(mockResolveAnyPath).not.toHaveBeenCalledWith(
        'pages/index/index', // TabBar page paths aren't resolved by processTabBar
        filePath,
        expect.anything(),
      );
    });

    it('should parse page.json component references and find all related files', async () => {
      const filePath = actualPath.resolve(projectRoot, 'pages/index/index.json');
      const fileContent = `{
        "usingComponents": {
          "custom-button": "/components/button/button",
          "user-card": "../../components/user-card/user-card",
          "plugin-comp": "plugin://myPlugin/comp",
          "tab-bar": "../common/tab-bar"
        }
      }`;
      mockFileContent('pages/index/index.json', fileContent);

      // Define expected paths
      const buttonBasePath = actualPath.resolve(projectRoot, 'components/button/button');
      const userCardBasePath = actualPath.resolve(projectRoot, 'components/user-card/user-card');
      const tabBarBasePath = actualPath.resolve(projectRoot, 'pages/common/tab-bar');

      const buttonJSPath = buttonBasePath + '.js';
      const buttonWXMLPath = buttonBasePath + '.wxml';
      const buttonWXSSPath = buttonBasePath + '.wxss';
      const buttonJSONPath = buttonBasePath + '.json';

      const userCardTSPath = userCardBasePath + '.ts';
      const userCardWXMLPath = userCardBasePath + '.wxml';
      const userCardWXSSPath = userCardBasePath + '.wxss';

      const tabBarJSPath = tabBarBasePath + '.js';

      // Mock existence
      mockPathExists([buttonJSPath, buttonWXMLPath, buttonWXSSPath, buttonJSONPath]);
      mockPathExists([userCardTSPath, userCardWXMLPath, userCardWXSSPath]);
      mockPathExists(tabBarJSPath);

      // Mock PathResolver
      mockResolveAnyPath.mockImplementation(
        (importPath: string, _containingFile: string, _extensions: string[]) => {
          if (importPath === '/components/button/button') return buttonJSPath;
          if (importPath === '../../components/user-card/user-card') return userCardTSPath;
          if (importPath === '../common/tab-bar') return tabBarJSPath;
          // Return null for plugin paths or unresolved paths
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      // Assert all related files are included (excluding plugin)
      expect(dependencies).toEqual(
        expect.arrayContaining([
          buttonJSPath,
          buttonWXMLPath,
          buttonJSONPath,
          buttonWXSSPath,
          userCardTSPath,
          userCardWXMLPath,
          userCardWXSSPath,
          tabBarJSPath,
        ]),
      );
      expect(dependencies).toHaveLength(8);

      // Verify resolveAnyPath calls (excluding plugin)
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/components/button/button',
        filePath,
        parser['componentExtensions'],
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '../../components/user-card/user-card',
        filePath,
        parser['componentExtensions'],
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '../common/tab-bar',
        filePath,
        parser['componentExtensions'],
      );
      // Ensure plugin path was not resolved
      expect(mockResolveAnyPath).not.toHaveBeenCalledWith(
        expect.stringContaining('plugin://'),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should handle component generics and find all related files', async () => {
      const filePath = actualPath.resolve(projectRoot, 'components/list/list.json');
      const fileContent = `{
        "componentGenerics": {
          "list-item": {
            "default": "../generic-item/item"
          },
          "list-header": {
            "default": "/components/common/header"
          },
          "list-footer": {
          }
        }
      }`;
      mockFileContent('components/list/list.json', fileContent);

      const itemBasePath = actualPath.resolve(projectRoot, 'components/generic-item/item');
      const headerBasePath = actualPath.resolve(projectRoot, 'components/common/header');

      const itemJSPath = itemBasePath + '.js';
      const itemWXMLPath = itemBasePath + '.wxml';
      const itemWXSSPath = itemBasePath + '.wxss';
      const headerTSPath = headerBasePath + '.ts';

      mockPathExists([itemJSPath, itemWXMLPath, itemWXSSPath]);
      mockPathExists(headerTSPath);

      mockResolveAnyPath.mockImplementation(
        (importPath: string, _containingFile: string, _extensions: string[]) => {
          if (importPath === '../generic-item/item') return itemJSPath;
          if (importPath === '/components/common/header') return headerTSPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toEqual(
        expect.arrayContaining([itemJSPath, itemWXMLPath, itemWXSSPath, headerTSPath]),
      );
      expect(dependencies).toHaveLength(4);

      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '../generic-item/item',
        filePath,
        parser['componentExtensions'],
      );
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/components/common/header',
        filePath,
        parser['componentExtensions'],
      );
    });

    it('should handle non-existent page gracefully', async () => {
      const filePath = actualPath.resolve(projectRoot, 'app.json');
      const fileContent = `{"pages": ["pages/non-existent/page"]}`;
      mockFileContent('app.json', fileContent);

      // Mock PathResolver to return null (not resolved)
      mockResolveAnyPath.mockReturnValue(null);

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(0);
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '/pages/non-existent/page',
        filePath,
        parser['pageAllExtensions'],
      );
      // No fs.existsSync should be called if resolveAnyPath fails
      expect(mockFs.existsSync).not.toHaveBeenCalledWith(expect.stringContaining('non-existent'));
    });

    it('should handle non-existent component gracefully', async () => {
      const filePath = actualPath.resolve(projectRoot, 'page.json');
      const fileContent = `{"usingComponents": {"missing": "../components/missing"}}`;
      mockFileContent('page.json', fileContent);

      mockResolveAnyPath.mockReturnValue(null);

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(0);
      expect(mockResolveAnyPath).toHaveBeenCalledWith(
        '../components/missing',
        filePath,
        parser['componentExtensions'],
      );
      expect(mockFs.existsSync).not.toHaveBeenCalledWith(expect.stringContaining('missing'));
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
