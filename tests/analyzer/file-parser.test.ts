import * as fs from 'fs';
import * as path from 'path';
import { FileParser } from '../../src/analyzer/file-parser';
import { AnalyzerOptions } from '../../src/types/command-options';
import { AliasResolver } from '../../src/utils/alias-resolver';

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

// Mock fs
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>; // Typed mock

// Mock path (Restoring this block)
jest.mock('path', () => ({
  resolve: jest.fn((...args) => actualPath.resolve(...args)),
  join: jest.fn((...args) => actualPath.join(...args)),
  dirname: jest.fn((p) => actualPath.dirname(p)),
  extname: jest.fn((p) => actualPath.extname(p)),
  // Add other functions used in the test file if needed
  relative: jest.fn((...args) => actualPath.relative(...args)),
  isAbsolute: jest.fn((p) => actualPath.isAbsolute(p)),
}));

// Mock AliasResolver module (auto-mocks constructor and methods)
jest.mock('../../src/utils/alias-resolver');
// Get a typed reference to the MOCKED constructor
const MockedAliasResolver = AliasResolver as jest.MockedClass<typeof AliasResolver>;

describe('FileParser', () => {
  const projectRoot = '/workspace/test-project';
  let parser: FileParser;
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
    MockedAliasResolver.mockClear();
    // Apply casting here
    (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(false);
    (AliasResolver.prototype.resolve as jest.Mock).mockReturnValue(null);
    (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue({});

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

    // Create a *default* parser instance.
    // It will receive an instance of the mocked AliasResolver via its constructor.
    const defaultOptions: AnalyzerOptions = {
      fileTypes: ['.js', '.ts', '.wxml', '.wxss', '.json', '.wxs'],
      verbose: false,
    };
    parser = new FileParser(projectRoot, defaultOptions);
    // Check that the constructor was called as expected by the default parser instance
    expect(MockedAliasResolver).toHaveBeenCalledTimes(1);
    // Apply casting here
    expect(AliasResolver.prototype.initialize as jest.Mock).toHaveBeenCalledTimes(1);
    // Apply casting here
    (AliasResolver.prototype.initialize as jest.Mock).mockClear();
  });

  // --- Constructor Tests --- (Use default parser)
  it('should initialize AliasResolver on construction', () => {
    // The checks are essentially done in beforeEach now
    expect(MockedAliasResolver).toHaveBeenCalledWith(projectRoot);
  });

  it('should use miniappRoot for AliasResolver if provided', () => {
    const miniappRoot = actualPath.join(projectRoot, 'miniprogram');
    const options: AnalyzerOptions = { fileTypes: [], miniappRoot: miniappRoot };
    // Clear mocks specifically for this test if needed, though beforeEach does it
    // jest.clearAllMocks();
    // MockedAliasResolver.mockClear();
    // (AliasResolver.prototype.initialize as jest.Mock).mockClear();

    // Create a specific parser for this test
    const specificParser = new FileParser(projectRoot, options);
    // The constructor mock should have been called again, with the new root
    expect(MockedAliasResolver).toHaveBeenCalledWith(miniappRoot);
    // Apply casting here
    expect(AliasResolver.prototype.initialize as jest.Mock).toHaveBeenCalled();
  });

  // --- JavaScript/TypeScript Parsing Tests ---
  describe('parseJavaScript', () => {
    it('should parse import statements with relative paths', async () => {
      const filePath = 'src/app.js';
      const fileContent = `
        import util from './utils/util.js';
        import { Config } from "../config/settings"; // No extension
        import * as api from './api'; // No extension
      `;
      mockFileContent(filePath, fileContent);

      const utilPath = 'src/utils/util.js';
      const settingsPath = 'config/settings.ts'; // Assume .ts exists
      const apiPath = 'src/api.js'; // Assume .js exists

      // Mock existence of target files
      mockPathExists([utilPath, settingsPath, apiPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(3);
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, utilPath),
          actualPath.resolve(projectRoot, settingsPath),
          actualPath.resolve(projectRoot, apiPath),
        ]),
      );
      // Verify alias resolver was NOT called for relative paths
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    it('should parse require statements with relative paths', async () => {
      const filePath = 'src/server/main.ts';
      const fileContent = `
        const database = require('../db/connection'); // No extension
        const { router } = require("./routes.js");
      `;
      mockFileContent(filePath, fileContent);

      const dbPath = 'src/db/connection.js'; // Assume .js exists
      const routesPath = 'src/server/routes.js';

      mockPathExists([dbPath, routesPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, dbPath),
          actualPath.resolve(projectRoot, routesPath),
        ]),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    it('should use AliasResolver for aliased import paths', async () => {
      const filePath = 'src/components/my-component.js';
      const fileContent = `
        import helper from '@/utils/helper'; 
        const service = require('$services/user'); 
      `;
      mockFileContent(filePath, fileContent);

      // --- Setup Alias Mocks on Prototype FIRST ---
      const helperBasePath = actualPath.resolve(projectRoot, 'src/utils/helper');
      const userServiceBasePath = actualPath.resolve(projectRoot, 'src/services/user');
      // Apply casting here
      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue({
        '@': [
          /*...*/
        ],
        $services: [
          /*...*/
        ],
      });
      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        if (importPath === '@/utils/helper') return helperBasePath;
        if (importPath === '$services/user') return userServiceBasePath;
        return null;
      });

      // --- Mock FS ---
      const helperActualPath = 'src/utils/helper.ts';
      const userServiceActualPath = 'src/services/user.js';
      mockPathExists([helperActualPath, userServiceActualPath]);

      // --- Recreate parser AFTER setting mocks for prototype ---
      // This parser instance will get the overridden prototype methods
      const testParser = new FileParser(projectRoot, { fileTypes: ['.js', '.ts'], verbose: false });

      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      // Apply casting here
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@/utils/helper',
        expect.any(String),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '$services/user',
        expect.any(String),
      );
      expect(dependencies).toHaveLength(2);
      // ... contain checks ...
    });

    it('should NOT parse WeChat specific path strings from JS, only imports/requires', async () => {
      const filePath = 'pages/home/home.js';
      const fileContent = `
        import config from '../../config'; // STANDARD IMPORT
        function navigate() {\n          // These string literals should be IGNORED by the parser\n          wx.navigateTo({ url: 'pages/detail/detail' });\n          wx.redirectTo({ url: '/pages/logs/logs?id=1' });\n          console.log("Go to components/card/index");\n          const path = \`components/list-item/list-item\`;\n          const path2 = '/components/footer';\n        }\n        require('../../utils/old-style.js'); // STANDARD REQUIRE\n      `;
      mockFileContent(filePath, fileContent);

      // Mock existing target files (even if they exist, they shouldn't be found from JS strings)
      mockPathExists('pages/detail/detail.js');
      mockPathExists('pages/logs/logs.js');
      mockPathExists('components/card/index.wxml');
      mockPathExists('components/list-item/list-item.wxml');
      mockPathExists('components/footer.wxml');
      // Mock standard imports/requires - THESE SHOULD BE FOUND
      mockPathExists('config.js');
      mockPathExists('utils/old-style.js');

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Assert that the string literals ARE NOT included
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, 'pages/detail/detail.js'));
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, 'pages/logs/logs.js'));
      expect(dependencies).not.toContain(
        actualPath.resolve(projectRoot, 'components/card/index.wxml'),
      );
      expect(dependencies).not.toContain(
        actualPath.resolve(projectRoot, 'components/list-item/list-item.wxml'),
      );
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, 'components/footer.wxml'));

      // Assert that standard import/require ARE included
      expect(dependencies).toContain(actualPath.resolve(projectRoot, 'config.js'));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, 'utils/old-style.js'));

      // Assert the total count reflects ONLY the standard imports/requires
      expect(dependencies).toHaveLength(2); // Only the import and require should be found
    });

    it('should handle require statements correctly', async () => {
      const filePath = 'src/server/main.ts';
      const fileContent = `
        const database = require('../db/connection'); // No extension
        const { router } = require("./routes.js");
      `;
      mockFileContent(filePath, fileContent);

      const dbPath = 'src/db/connection.js'; // Assume .js exists
      const routesPath = 'src/server/routes.js';

      mockPathExists([dbPath, routesPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, dbPath),
          actualPath.resolve(projectRoot, routesPath),
        ]),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    it('should handle index file resolution for aliases in JS', async () => {
      const filePath = 'src/app.js';
      const fileContent = `import Button from '@/components/button';`;
      mockFileContent(filePath, fileContent);

      // --- Setup Alias Mocks on Prototype FIRST ---
      const aliasMap = { '@': [actualPath.resolve(projectRoot, 'src')] };
      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue(aliasMap);
      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        const buttonBaseDir = actualPath.resolve(projectRoot, 'src/components/button');
        if (importPath === '@/components/button') return buttonBaseDir;
        return null;
      });

      // --- Mock File System Setup ---
      const buttonBaseDir = actualPath.resolve(projectRoot, 'src/components/button'); // Path for dir mock
      const buttonIndexFile = 'src/components/button/index.js';
      mockPathExists(buttonBaseDir, 'dir');
      mockPathExists(buttonIndexFile);

      // --- Recreate parser with these mocks active ---
      const testParser = new FileParser(projectRoot, { fileTypes: ['.js', '.ts'], verbose: false });

      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, buttonIndexFile)); // Expect the index file
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@/components/button',
        expect.any(String),
      );
    });

    // Add more JS tests: non-existent paths, type imports, etc.
  });

  // --- WXML Parsing Tests ---
  describe('parseWXML', () => {
    it('should parse <import> and <include> tags with relative paths', async () => {
      const filePath = 'src/pages/user/profile.wxml';
      const fileContent = `
        <import src="../../components/header.wxml"/>
        <include src="./user_info.wxml" />
        <import src="/templates/footer"/> <!-- Root path, no extension -->
      `;
      mockFileContent(filePath, fileContent);

      const headerPath = 'src/components/header.wxml';
      const userInfoPath = 'src/pages/user/user_info.wxml';
      const footerPath = 'templates/footer.wxml'; // Assume .wxml exists for root path

      mockPathExists([headerPath, userInfoPath, footerPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(3);
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, headerPath),
          actualPath.resolve(projectRoot, userInfoPath),
          actualPath.resolve(projectRoot, footerPath),
        ]),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    it('should parse <wxs> tags with relative src', async () => {
      const filePath = 'src/pages/index/index.wxml';
      const fileContent = `<wxs src="../../utils/formatter.wxs" module="fmt" />`;
      mockFileContent(filePath, fileContent);

      const wxsPath = 'src/utils/formatter.wxs';
      mockPathExists(wxsPath);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, wxsPath));
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    it('should parse <image> tags with relative and root src (excluding URLs/data)', async () => {
      const filePath = 'src/components/card/card.wxml';
      const fileContent = `
        <image src="../../assets/logo.png"></image>
        <image src="/static/icons/default.svg"></image>
        <image src="{{dynamic_image}}"></image>
        <image src="http://example.com/remote.jpg"></image>
        <image src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="></image>
      `;
      mockFileContent(filePath, fileContent);

      const logoPath = 'src/assets/logo.png';
      const iconPath = 'static/icons/default.svg';

      mockPathExists([logoPath, iconPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, logoPath));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, iconPath));
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    it('should resolve aliases correctly for WXML imports/includes/wxs/image', async () => {
      const filePath = 'src/pages/product/detail.wxml';
      const fileContent = `
        <import src="@/templates/common/price"/> <!-- Alias, no extension -->
        <wxs src="@/common/filters" module="f"></wxs> <!-- Alias, no extension -->
        <image src="@assets/placeholder"></image> <!-- Alias, no extension -->
      `;
      mockFileContent(filePath, fileContent);

      // --- Setup Alias Mocks on Prototype FIRST ---
      const aliasMap = {
        '@': [actualPath.resolve(projectRoot, 'src')],
        '@assets': [actualPath.resolve(projectRoot, 'src/assets')],
      };
      // Apply casting here
      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue(aliasMap);

      // Configure mockAliasResolve to return potential BASE paths (no extension)
      const priceBasePath = actualPath.resolve(projectRoot, 'src/templates/common/price');
      const filterBasePath = actualPath.resolve(projectRoot, 'src/common/filters');
      const placeholderBasePath = actualPath.resolve(projectRoot, 'src/assets/placeholder');

      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        if (importPath === '@/templates/common/price') return priceBasePath;
        if (importPath === '@/common/filters') return filterBasePath;
        if (importPath === '@assets/placeholder') return placeholderBasePath;
        return null;
      });
      // --- End Alias Mock Setup ---

      // --- Mock File System Setup ---
      // Define the actual files that exist
      const pricePath = 'src/templates/common/price.wxml'; // The expected import target
      const filterPath = 'src/common/filters.wxs'; // The expected wxs target
      const placeholderPath = 'src/assets/placeholder.jpg'; // The expected image target (assume jpg)
      const competingJsPath = 'src/templates/common/price.js'; // Should NOT be picked for <import>
      const competingWxmlPath = 'src/assets/placeholder.wxml'; // Should NOT be picked for <image>

      mockPathExists([pricePath, filterPath, placeholderPath, competingJsPath, competingWxmlPath]);
      // --- End File System Mock Setup ---

      // --- Recreate parser with these mocks active ---
      const testParser = new FileParser(projectRoot, {
        fileTypes: ['.wxml', '.wxs', '.jpg', '.png'],
        verbose: false,
      });

      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      // FileParser should have called resolveAnyPath with correct context-specific extensions
      expect(dependencies).toHaveLength(3);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, pricePath)); // import -> .wxml
      expect(dependencies).toContain(actualPath.resolve(projectRoot, filterPath)); // wxs -> .wxs
      expect(dependencies).toContain(actualPath.resolve(projectRoot, placeholderPath)); // image -> .jpg
      // Verify competing files were NOT included
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingJsPath));
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingWxmlPath));

      // Verify AliasResolver.resolve was called with the original alias paths
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@/templates/common/price',
        expect.any(String),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@/common/filters',
        expect.any(String),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@assets/placeholder',
        expect.any(String),
      );
    });

    // REMOVED processCustomComponents tests as the logic was removed
  });

  // --- WXSS Parsing Tests ---
  describe('parseWXSS', () => {
    it('should parse @import statements with relative paths', async () => {
      const filePath = 'src/styles/theme.wxss';
      const fileContent = `
        @import "./base.wxss";
        @import "../components/button.wxss";
        @import "/static/fonts.wxss"; /* Root path */
      `;
      mockFileContent(filePath, fileContent);

      const basePath = 'src/styles/base.wxss';
      const buttonPath = 'src/components/button.wxss';
      const fontPath = 'static/fonts.wxss';

      mockPathExists([basePath, buttonPath, fontPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(3);
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, basePath),
          actualPath.resolve(projectRoot, buttonPath),
          actualPath.resolve(projectRoot, fontPath),
        ]),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    it('should parse url() references (excluding http/data)', async () => {
      const filePath = 'src/app.wxss';
      const fileContent = `
        .logo { background: url('/assets/logo.png'); }
        .icon { background-image: url("./icons/home.svg"); }
        .external { background: url(https://example.com/bg.jpg); }
        .inline { background: url('data:image/png;base64,abc'); }
      `;
      mockFileContent(filePath, fileContent);

      const logoPath = 'assets/logo.png';
      const iconPath = 'src/icons/home.svg'; // Relative to app.wxss

      mockPathExists([logoPath, iconPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, logoPath));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, iconPath));
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    it('should resolve aliases correctly for WXSS @import and url()', async () => {
      const filePath = 'src/pages/settings/page.wxss';
      const fileContent = `
        @import "@/styles/mixins"; /* Alias, no extension -> .wxss */
        .background { background: url('~assets/backgrounds/main'); } /* Alias, no extension -> image */
      `;
      mockFileContent(filePath, fileContent);

      // --- Setup Alias Mocks on Prototype FIRST ---
      const aliasMap = {
        '@': [actualPath.resolve(projectRoot, 'src')],
        '~assets': ['assets'], // Relative alias
      };
      // Apply casting here
      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue(aliasMap);

      // Configure mockAliasResolve to return potential BASE paths
      const mixinsBasePath = actualPath.resolve(projectRoot, 'src/styles/mixins');
      const bgBasePath = actualPath.resolve(projectRoot, 'assets/backgrounds/main');

      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        if (importPath === '@/styles/mixins') return mixinsBasePath;
        if (importPath === '~assets/backgrounds/main') return bgBasePath;
        return null;
      });
      // --- End Alias Mock Setup ---

      // --- Mock File System Setup ---
      const mixinsPath = 'src/styles/mixins.wxss'; // Expected for @import
      const bgPath = 'assets/backgrounds/main.png'; // Expected for url()
      const competingMixinJs = 'src/styles/mixins.js'; // Should not be picked
      const competingBgWxml = 'assets/backgrounds/main.wxml'; // Should not be picked

      mockPathExists([mixinsPath, bgPath, competingMixinJs, competingBgWxml]);
      // --- End File System Mock Setup ---

      // --- Recreate parser with these mocks active ---
      const testParser = new FileParser(projectRoot, {
        fileTypes: ['.wxss', '.png', '.jpg'],
        verbose: false,
      });

      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, mixinsPath)); // @import -> .wxss
      expect(dependencies).toContain(actualPath.resolve(projectRoot, bgPath)); // url() -> .png
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingMixinJs));
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingBgWxml));

      // Verify AliasResolver.resolve was called with the original alias paths
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@/styles/mixins',
        expect.any(String),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '~assets/backgrounds/main',
        expect.any(String),
      );
    });
  });

  // --- JSON Parsing Tests (Updated Expectations) ---
  // Test focus: Ensure parseJSON correctly resolves the *primary* file for each entry
  // using resolveAnyPath, without finding related files itself.
  describe('parseJSON', () => {
    it('should parse usingComponents and resolve the primary component file', async () => {
      const filePath = 'src/components/complex/comp.json';
      const fileContent = JSON.stringify({
        component: true,
        usingComponents: {
          header: './header', // Relative, no extension -> finds header.wxml
          footer: '/components/common/footer', // Root, no extension -> finds footer.json
          icon: '../../core/icon/icon.js', // Relative with extension -> finds icon.js
          button: './button/index', // Relative index -> finds button/index.js
        },
      });
      mockFileContent(filePath, fileContent);

      // --- Mock File System ---
      // Define ONLY the files that should be directly resolved by parseJSON
      const headerCompWxml = 'src/components/complex/header.wxml';
      const footerCompWxml = 'components/common/footer.wxml'; // <-- File that will be found first
      const iconCompJs = 'src/core/icon/icon.js';
      const buttonCompIndexJs = 'src/components/complex/button/index.js';

      // Mock existence for the files expected to be found AND the competing .wxml for footer
      mockPathExists([headerCompWxml, footerCompWxml, iconCompJs, buttonCompIndexJs]);
      mockPathExists('src/components/complex/button', 'dir');
      mockPathExists(['components/common/footer.json']); // Mock json too for realism if needed

      // Use default parser
      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      // Expecting ONLY the primary resolved file for each component entry
      expect(dependencies).toHaveLength(4);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, headerCompWxml));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, footerCompWxml));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, iconCompJs));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, buttonCompIndexJs));

      // Ensure related files (like header.json) were NOT added by parseJSON
      expect(dependencies).not.toContain(
        actualPath.resolve(projectRoot, 'components/common/footer.json'),
      );

      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled(); // No aliases here
    });

    it('should parse app.json fields and resolve primary page/icon files', async () => {
      const filePath = 'app.json'; // Assume at project root
      const fileContent = JSON.stringify({
        pages: ['pages/index/index', 'pages/user/user'], // Expect .js or .ts
        subPackages: [
          {
            root: 'modules/moduleA',
            pages: ['views/view1', 'views/view2'], // Expect .js or .ts
          },
        ],
        tabBar: {
          list: [
            {
              pagePath: 'pages/index/index', // Resolved above
              text: 'Home',
              iconPath: 'assets/tab/home.png', // Expect .png
              selectedIconPath: 'assets/tab/home_active', // Expect image ext
            },
            {
              pagePath: 'pages/user/user', // Resolved above
              text: 'User',
              iconPath: '/static/icons/user.svg', // Root path, expect .svg
            },
          ],
        },
      });
      mockFileContent(filePath, fileContent);

      // --- Mock File System ---
      // Define ONLY the files expected to be directly resolved by parseJSON
      const indexPageJs = 'pages/index/index.js'; // Primary page file
      const userPageTs = 'pages/user/user.ts'; // Primary page file (assume .ts)
      const view1SubPageJs = 'modules/moduleA/views/view1.js'; // Primary subpage file
      const view2SubPageJs = 'modules/moduleA/views/view2.js'; // Primary subpage file
      const homeIconPng = 'assets/tab/home.png';
      const homeActiveIconJpg = 'assets/tab/home_active.jpg'; // Assume .jpg exists
      const userIconSvg = 'static/icons/user.svg';

      // Mock existence for expected primary/resolved files
      mockPathExists([
        indexPageJs,
        userPageTs,
        view1SubPageJs,
        view2SubPageJs,
        homeIconPng,
        homeActiveIconJpg,
        userIconSvg,
      ]);

      // Mock related files NOT expected in direct results (for realism)
      mockPathExists(['pages/index/index.wxml', 'pages/user/user.wxss']);
      // --- End File System ---

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      // Check that ONLY the primary resolved files are included
      expect(dependencies).toHaveLength(7);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, indexPageJs));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, userPageTs));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, view1SubPageJs));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, view2SubPageJs));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, homeIconPng));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, homeActiveIconJpg));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, userIconSvg));

      // Ensure related files (like index.wxml) were NOT added
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, 'pages/index/index.wxml'));
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, 'pages/user/user.wxss'));

      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled(); // No aliases here
    });

    it('should resolve app.json page entry even if only WXML exists', async () => {
      const filePath = 'app.json';
      const fileContent = JSON.stringify({
        pages: ['pages/onlywxml/index'], // Page with only WXML
      });
      mockFileContent(filePath, fileContent);

      // Mock ONLY the WXML file existence
      const pageWxml = 'pages/onlywxml/index.wxml';
      mockPathExists([pageWxml]);
      // Crucially, do NOT mock .js or .ts for this page

      // Use default parser
      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Expect the WXML file to be added as a dependency (entry point)
      expect(dependencies).toContain(actualPath.resolve(projectRoot, pageWxml));
      expect(dependencies).toHaveLength(1); // Should only find the WXML
    });

    it('should resolve aliases correctly for usingComponents and return primary file', async () => {
      const filePath = 'src/pages/cart/cart.json';
      const fileContent = JSON.stringify({
        component: true,
        usingComponents: {
          'item-card': '@/components/item-card', // Alias, no ext -> finds item-card.js
          overlay: '~common/overlay/index', // Alias, no ext -> finds index.ts
        },
      });
      mockFileContent(filePath, fileContent);

      // --- Setup Alias Mocks on Prototype FIRST ---
      const aliasMap = {
        '@': [actualPath.resolve(projectRoot, 'src')],
        '~common': ['common-components'], // Relative alias base path
      };
      // Apply casting here
      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue(aliasMap);

      // Configure mockAliasResolve to return potential BASE paths
      const itemCardBasePath = actualPath.resolve(projectRoot, 'src/components/item-card');
      const overlayBasePath = actualPath.resolve(projectRoot, 'common-components/overlay/index');

      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        if (importPath === '@/components/item-card') return itemCardBasePath;
        if (importPath === '~common/overlay/index') return overlayBasePath;
        return null;
      });
      // --- End Alias Setup ---

      // --- Mock File System ---
      // Define ONLY the files expected to be directly resolved by parseJSON
      const itemCardJs = 'src/components/item-card.js'; // Primary file
      const overlayIndexTs = 'common-components/overlay/index.ts'; // Primary file

      // Mock existence for the primary files
      mockPathExists([itemCardJs, overlayIndexTs]);
      // Mock the directory for the overlay index lookup
      mockPathExists('common-components/overlay', 'dir');

      // Mock related/competing files NOT expected in direct results
      mockPathExists(['src/components/item-card.wxml', 'common-components/overlay/index.json']);
      const competingItemCardJson = 'src/components/item-card.json'; // Doesn't exist
      // --- End File System ---

      // --- Recreate parser with these mocks active ---
      const testParser = new FileParser(projectRoot, {
        fileTypes: ['.json', '.js', '.ts', '.wxml'],
        verbose: false,
      });

      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      // Expecting ONLY the single primary resolved file per component
      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, itemCardJs)); // Found item-card.js
      expect(dependencies).toContain(actualPath.resolve(projectRoot, overlayIndexTs)); // Found overlay/index.ts

      // Ensure related/competing files were NOT added by parseJSON
      expect(dependencies).not.toContain(
        actualPath.resolve(projectRoot, 'src/components/item-card.wxml'),
      );
      expect(dependencies).not.toContain(
        actualPath.resolve(projectRoot, 'common-components/overlay/index.json'),
      );
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingItemCardJson));

      // Verify AliasResolver.resolve was called by resolveAnyPath
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@/components/item-card',
        expect.any(String),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '~common/overlay/index',
        expect.any(String),
      );
    });

    it('should handle componentGenerics correctly with aliases', async () => {
      const filePath = 'src/components/generic-holder/comp.json';
      const fileContent = JSON.stringify({
        component: true,
        componentGenerics: {
          myGeneric: {
            default: '../../generics/default-impl', // Relative, no ext -> finds default-impl.wxml
          },
          otherGeneric: {
            default: '@/generics/other-impl', // Alias, no ext -> finds other-impl.js
          },
        },
      });
      mockFileContent(filePath, fileContent);

      // --- Setup Alias Mocks on Prototype FIRST ---
      const aliasMap = { '@': [actualPath.resolve(projectRoot, 'src')] };
      // Apply casting here
      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue(aliasMap);

      const otherImplBasePath = actualPath.resolve(projectRoot, 'src/generics/other-impl');
      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        if (importPath === '@/generics/other-impl') return otherImplBasePath;
        return null;
      });
      // --- End Alias Setup ---

      // --- Mock File System ---
      const defaultImplJs = 'src/generics/default-impl.js'; // <-- File that will be found first
      const otherImplJs = 'src/generics/other-impl.js';

      // Mock existence for the files expected to be found first + competing
      mockPathExists([defaultImplJs, otherImplJs]);
      mockPathExists(['src/generics/default-impl.wxml']); // Mock wxml too

      // --- Recreate parser with these mocks active ---
      const testParser = new FileParser(projectRoot, {
        fileTypes: ['.json', '.wxml', '.js', '.ts'],
        verbose: false,
      });

      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      expect(dependencies).toHaveLength(2);
      // Change expectation: Expect .js because it comes first in componentExtensions
      expect(dependencies).toContain(actualPath.resolve(projectRoot, defaultImplJs));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, otherImplJs));
      expect(dependencies).not.toContain(
        actualPath.resolve(projectRoot, 'src/generics/default-impl.wxml'), // Ensure wxml wasn't added
      );

      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@/generics/other-impl',
        expect.any(String),
      );
    });

    it('should return empty array for JSON without relevant fields or invalid JSON', async () => {
      const filePath = 'data.json';
      // Valid JSON, but no relevant fields
      mockFileContent(filePath, JSON.stringify({ name: 'test', value: 123 }));
      let dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));
      expect(dependencies).toHaveLength(0);

      // Invalid JSON
      mockFileContent(filePath, 'invalid json content');
      // Mock existsSync for the invalid file itself
      mockPathExists(filePath);
      dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));
      expect(dependencies).toHaveLength(0);
      // Should not throw, just return empty and log error
      // Verify logger was called (how to test logger output? Check if logger.error/warn mock was called)
    });
  });

  // --- WXS Parsing Tests ---
  describe('parseWXS', () => {
    it('should parse require() statements with relative paths', async () => {
      const filePath = 'src/utils/tools.wxs';
      const fileContent = `var math = require("./math.wxs"); module.exports = {};`;
      mockFileContent(filePath, fileContent);

      const mathPath = 'src/utils/math.wxs';
      mockPathExists(mathPath);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, mathPath));
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalled();
    });

    it('should resolve aliases correctly for WXS require()', async () => {
      const filePath = 'src/filters/main.wxs';
      const fileContent = `var formatter = require("@/common/formatter");`; // Alias, no ext
      mockFileContent(filePath, fileContent);

      // --- Setup Alias Mocks on Prototype FIRST ---
      const aliasMap = { '@': [actualPath.resolve(projectRoot, 'src')] };
      // Apply casting here
      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue(aliasMap);

      const formatterBasePath = actualPath.resolve(projectRoot, 'src/common/formatter');
      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        if (importPath === '@/common/formatter') return formatterBasePath;
        return null;
      });
      // --- End Alias Setup ---

      // --- Mock File System ---
      const formatterPath = 'src/common/formatter.wxs'; // Expected target
      const competingFormatterJs = 'src/common/formatter.js'; // Should not be picked
      mockPathExists([formatterPath, competingFormatterJs]);
      // --- End File System ---

      // --- Recreate parser with these mocks active ---
      const testParser = new FileParser(projectRoot, { fileTypes: ['.wxs'], verbose: false });

      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, formatterPath)); // require -> .wxs
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingFormatterJs));
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@/common/formatter',
        expect.any(String),
      );
    });

    it('should return empty array if required WXS file does not exist', async () => {
      const filePath = 'src/filters/main.wxs';
      const fileContent = `var helper = require("./nonexistent.wxs");`;
      mockFileContent(filePath, fileContent);
      mockPathExists([]); // Nothing exists
      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));
      expect(dependencies).toHaveLength(0);
    });
  });

  // --- Path Resolution Tests (implicitly tested, but can add specific ones) ---
  describe('Path Resolution Helpers', () => {
    // Tests for resolveImportPath and resolvePath nuances if needed
    it('resolvePath should handle absolute paths correctly', async () => {
      // This is indirectly tested in other places, but add an explicit check
      // Need to access the private method, or test via a public method that uses it.
      // Let's test via parseWXML with an absolute src path
      const filePath = 'pages/test.wxml';
      const absImagePath = actualPath.resolve(projectRoot, 'images/abs.png');
      const fileContent = `<image src="${absImagePath}"></image>`;
      mockFileContent(filePath, fileContent);
      mockPathExists([absImagePath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));
      expect(dependencies).toEqual([absImagePath]);
    });
  });

  // --- NPM Package Detection and Alias Resolution Tests ---
  describe('NPM Package Detection and Alias Resolution', () => {
    it('should not attempt to resolve npm package imports starting with @', async () => {
      const filePath = 'src/app.ts';
      const fileContent = `
        import analytics from '@analytics/wechat-sdk';
        import { Component } from '@mtfe/component-lib';
      `;
      mockFileContent(filePath, fileContent);

      // Set up alias configuration
      const aliasMap = {
        '@mtfe': [actualPath.resolve(projectRoot, 'src/npm/@mtfe')],
        '@common': [actualPath.resolve(projectRoot, 'src/common')],
      };

      // Apply casting here
      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue(aliasMap);

      // Mock the AliasResolver.resolve to return paths for configured aliases only
      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        if (importPath.startsWith('@mtfe/')) {
          return actualPath.resolve(projectRoot, 'src/npm', importPath);
        }
        return null;
      });

      // Mock existence of the component library file
      const componentLibPath = 'src/npm/@mtfe/component-lib.ts';
      mockPathExists([componentLibPath]);

      // Create a fresh parser with the mocked alias resolver
      const testParser = new FileParser(projectRoot, { fileTypes: ['.ts', '.js'], verbose: false });

      // Parse the file
      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Verify that the analyzer found the @mtfe import (configured alias)
      // but ignored @analytics/wechat-sdk (npm package)
      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, componentLibPath));
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@mtfe/component-lib',
        expect.any(String),
      );
      // Verify it was NOT called for the npm package
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalledWith(
        '@analytics/wechat-sdk',
        expect.any(String),
      );
    });

    it('should correctly identify npm packages vs configured aliases', async () => {
      const filePath = 'src/utils/index.ts';
      const fileContent = `
        import { logger } from '@common/logger';
        import { fetch } from '@fetch/core';
        import lib from '@analytics/web-sdk';
      `;
      mockFileContent(filePath, fileContent);

      // Set up alias configuration with multiple aliases
      const aliasMap = {
        '@common': [actualPath.resolve(projectRoot, 'src/common')],
        '@components': [actualPath.resolve(projectRoot, 'src/components')],
        '@utils': [actualPath.resolve(projectRoot, 'src/utils')],
      };

      // Apply casting here
      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue(aliasMap);

      // Mock the AliasResolver.resolve to return paths for configured aliases
      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        if (importPath.startsWith('@common/')) {
          return actualPath.resolve(projectRoot, 'src/common', importPath.substring(8));
        }
        return null;
      });

      // Mock existence of the logger file
      const loggerPath = 'src/common/logger.ts';
      mockPathExists([loggerPath]);

      // Create a fresh parser
      const testParser = new FileParser(projectRoot, { fileTypes: ['.ts', '.js'], verbose: false });

      // Parse the file
      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Verify that the analyzer found the @common import (configured alias)
      // but ignored @fetch/core and @analytics/web-sdk (npm packages)
      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, loggerPath));
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@common/logger',
        expect.any(String),
      );
      // Verify it was NOT called for npm packages
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalledWith(
        '@fetch/core',
        expect.any(String),
      );
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalledWith(
        '@analytics/web-sdk',
        expect.any(String),
      );
    });

    it('should correctly handle exact alias matches without slashes', async () => {
      const filePath = 'src/app.ts';
      const fileContent = `
        import * as common from '@common';
        import * as analytics from '@analytics';
      `;
      mockFileContent(filePath, fileContent);

      // Set up alias configuration with one alias that matches exactly
      const aliasMap = {
        '@common': [actualPath.resolve(projectRoot, 'src/common')],
        '@utils': [actualPath.resolve(projectRoot, 'src/utils')],
      };

      (AliasResolver.prototype.initialize as jest.Mock).mockReturnValue(true);
      (AliasResolver.prototype.getAliases as jest.Mock).mockReturnValue(aliasMap);

      (AliasResolver.prototype.resolve as jest.Mock).mockImplementation((importPath) => {
        if (importPath === '@common') {
          return actualPath.resolve(projectRoot, 'src/common');
        }
        return null;
      });

      // Mock existence of common as a directory with an index.ts file
      const commonIndexPath = 'src/common/index.ts';
      mockPathExists(['src/common'], 'dir');
      mockPathExists([commonIndexPath]);

      const testParser = new FileParser(projectRoot, { fileTypes: ['.ts', '.js'], verbose: false });
      const dependencies = await testParser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Should find the index.ts for the exact alias match
      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, commonIndexPath));
      expect(AliasResolver.prototype.resolve as jest.Mock).toHaveBeenCalledWith(
        '@common',
        expect.any(String),
      );
      // Should not try to resolve @analytics as an alias
      expect(AliasResolver.prototype.resolve as jest.Mock).not.toHaveBeenCalledWith(
        '@analytics',
        expect.any(String),
      );
    });
  });

  // --- General File Type Handling ---
  describe('General File Handling', () => {
    it('should return empty dependencies for image files', async () => {
      const imagePath = 'assets/logo.png';
      // No need to mock content, just existence for the parseFile call
      mockPathExists([imagePath]);
      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, imagePath));
      expect(dependencies).toEqual([]);
    });

    it('should return empty dependencies for unknown file types', async () => {
      const unknownPath = 'config/custom.config';
      mockFileContent(unknownPath, 'some content');
      mockPathExists([unknownPath]);
      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, unknownPath));
      expect(dependencies).toEqual([]);
    });
  });
});
