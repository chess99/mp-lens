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

// Mock path (Alternative strategy)
jest.mock('path', () => ({
  resolve: jest.fn((...args) => actualPath.resolve(...args)),
  join: jest.fn((...args) => actualPath.join(...args)),
  dirname: jest.fn((p) => actualPath.dirname(p)),
  extname: jest.fn((p) => actualPath.extname(p)),
  // Add other functions used in the test file if needed
  relative: jest.fn((...args) => actualPath.relative(...args)),
  isAbsolute: jest.fn((p) => actualPath.isAbsolute(p)),
}));

// Mock AliasResolver
const mockAliasResolve = jest.fn();
const mockGetAliases = jest.fn();
const mockAliasInitialize = jest.fn();
jest.mock('../../src/utils/alias-resolver', () => {
  return {
    AliasResolver: jest.fn().mockImplementation((projectRoot) => {
      return {
        // Default mocks can be overridden in tests
        initialize: mockAliasInitialize.mockReturnValue(false),
        // mockAliasResolve should now return the potential base path, NOT the final resolved file
        resolve: mockAliasResolve.mockImplementation((importPath: string, sourceFile: string) => {
          // Default mock implementation returns null
          // Tests should override this mock to return a potential base path
          // e.g., if importPath is '@/utils/helper' and alias is '@' => 'src',
          // this mock (when overridden) should return '/workspace/test-project/src/utils/helper'
          return null;
        }),
        getAliases: mockGetAliases.mockReturnValue({}),
      };
    }),
  };
});

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

    // Initialize persistent mock stores for each test
    mockedExistingPaths = new Set<string>();
    mockedFileContents = new Map<string, string>();
    mockedStats = new Map<string, Partial<fs.Stats>>();

    // Log the mocked paths Set *after* it's initialized for debugging
    // console.log('Initial mockedExistingPaths:', Array.from(mockedExistingPaths));

    // --- Configure Core FS Mocks ---
    mockFs.existsSync.mockImplementation((p) => {
      const resolvedP = typeof p === 'string' ? actualPath.resolve(p) : '';
      const exists = mockedExistingPaths.has(resolvedP);
      // Log the check and the current state of the mocked set
      // console.log(`existsSync Mock Check: Path='${resolvedP}', Exists=${exists}, Set=${JSON.stringify(Array.from(mockedExistingPaths))}`);
      return exists;
    });

    // readFileSync: Reads from the mocked content Map
    mockFs.readFileSync.mockImplementation((p, enc) => {
      const resolvedP = typeof p === 'string' ? actualPath.resolve(p) : '';
      if (mockedFileContents.has(resolvedP) && enc === 'utf-8') {
        return mockedFileContents.get(resolvedP)!;
      }
      // Throw ENOENT if not found in the mock map
      const error: NodeJS.ErrnoException = new Error(
        `ENOENT: no such file or directory, open '${p}'`,
      );
      error.code = 'ENOENT';
      throw error;
    });

    // statSync: Reads from the mocked stats Map
    mockFs.statSync.mockImplementation((p) => {
      const resolvedP = typeof p === 'string' ? actualPath.resolve(p) : '';
      if (mockedStats.has(resolvedP)) {
        // Return a default Stats object merged with the mocked partial stats
        const partialStats = mockedStats.get(resolvedP)!;
        return {
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
      }
      // Throw ENOENT if no stats are mocked for the path
      const error: NodeJS.ErrnoException = new Error(
        `ENOENT: no such file or directory, stat '${p}'`,
      );
      error.code = 'ENOENT';
      throw error;
    });
    // --- End FS Mocks ---

    // Reset AliasResolver mocks
    mockAliasInitialize.mockReturnValue(false); // Default: no alias config
    mockGetAliases.mockReturnValue({});
    mockAliasResolve.mockReturnValue(null); // Default: alias resolution fails

    // Reset path mocks (ensure they call actual path)
    (path.resolve as jest.Mock).mockImplementation((...args) => actualPath.resolve(...args));
    (path.join as jest.Mock).mockImplementation((...args) => actualPath.join(...args));
    (path.relative as jest.Mock).mockImplementation((...args) => actualPath.relative(...args));
    (path.dirname as jest.Mock).mockImplementation((p) => actualPath.dirname(p));
    (path.extname as jest.Mock).mockImplementation((p) => actualPath.extname(p));
    (path.isAbsolute as jest.Mock).mockImplementation((p) => actualPath.isAbsolute(p));

    // Create a new parser for each test with default options
    // Force verbose to true to see detailed path resolution logs
    const options: AnalyzerOptions = {
      fileTypes: ['.js', '.ts', '.wxml', '.wxss', '.json', '.wxs'],
      verbose: true,
    };
    parser = new FileParser(projectRoot, options);
  });

  // --- Constructor Tests ---
  it('should initialize AliasResolver on construction', () => {
    expect(AliasResolver).toHaveBeenCalledWith(projectRoot);
    expect(mockAliasInitialize).toHaveBeenCalledTimes(1);
  });

  it('should use miniappRoot for AliasResolver if provided', () => {
    const miniappRoot = actualPath.join(projectRoot, 'miniprogram');
    const options: AnalyzerOptions = { fileTypes: [], miniappRoot: miniappRoot };
    jest.clearAllMocks(); // Clear mocks before creating new parser
    parser = new FileParser(projectRoot, options);
    expect(AliasResolver).toHaveBeenCalledWith(miniappRoot);
    expect(mockAliasInitialize).toHaveBeenCalledTimes(1);
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
      expect(mockAliasResolve).not.toHaveBeenCalled();
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
      expect(mockAliasResolve).not.toHaveBeenCalled();
    });

    it('should use AliasResolver for aliased import paths', async () => {
      const filePath = 'src/components/my-component.js';
      const fileContent = `
        import helper from '@/utils/helper'; 
        const service = require('$services/user'); 
        // @alias-import { data } from '~data/config'; // Test special comment
      `;
      mockFileContent(filePath, fileContent);

      // Assume alias resolver is configured and initialized successfully
      mockAliasInitialize.mockReturnValue(true);

      const helperPath = 'src/utils/helper.ts';
      const userServicePath = 'src/services/user.js';
      const dataConfigPath = 'data/config.json';
      const absHelperPath = actualPath.resolve(projectRoot, helperPath);
      const absUserServicePath = actualPath.resolve(projectRoot, userServicePath);
      const absDataConfigPath = actualPath.resolve(projectRoot, dataConfigPath);

      // Mock AliasResolver resolve calls
      mockAliasResolve.mockImplementation((importPath, sourceFile) => {
        if (importPath === '@/utils/helper') return absHelperPath;
        if (importPath === '$services/user') return absUserServicePath;
        if (importPath === '~data/config') return absDataConfigPath;
        return null; // Default fallback
      });

      // Mock that the resolved files exist
      mockPathExists([helperPath, userServicePath, dataConfigPath]);

      // Recreate parser instance AFTER setting up AliasResolver initialize mock
      parser = new FileParser(projectRoot, { fileTypes: ['.js'] });

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Check AliasResolver was called for each alias path
      expect(mockAliasResolve).toHaveBeenCalledWith(
        '@/utils/helper',
        actualPath.resolve(projectRoot, filePath),
      );
      expect(mockAliasResolve).toHaveBeenCalledWith(
        '$services/user',
        actualPath.resolve(projectRoot, filePath),
      );
      expect(mockAliasResolve).toHaveBeenCalledWith(
        '~data/config',
        actualPath.resolve(projectRoot, filePath),
      );

      expect(dependencies).toHaveLength(3);
      expect(dependencies).toEqual(
        expect.arrayContaining([absHelperPath, absUserServicePath, absDataConfigPath]),
      );
    });

    it('should parse WeChat specific path strings like pages/ and components/', async () => {
      const filePath = 'src/app.js';
      const fileContent = `
        wx.navigateTo({ url: 'pages/profile/index' });
        const comp = require('components/user-card/card'); // Treated as normal require
        const path = '/pages/logs/logs'; // Leading slash
        someFunction("components/list-item"); // Double quotes
      `;
      mockFileContent(filePath, fileContent);

      const profilePageJs = 'pages/profile/index.js';
      const profilePageWxml = 'pages/profile/index.wxml';
      const logsPageJson = 'pages/logs/logs.json';
      const listItemCompTs = 'components/list-item.ts';
      const userCardCompJs = 'components/user-card/card.js'; // Handled by require mock below

      // Mock existence of target files (assuming some extensions)
      mockPathExists([
        profilePageJs,
        profilePageWxml,
        logsPageJson,
        listItemCompTs,
        userCardCompJs,
      ]);

      // Mock require for the component path
      mockAliasResolve.mockImplementation((importPath, sourceFile) => {
        // Assume require('components/...') is treated like a relative path if not an alias
        if (importPath === 'components/user-card/card') {
          const targetPath = actualPath.resolve(
            actualPath.dirname(actualPath.resolve(projectRoot, filePath)),
            importPath,
          );
          // Simulate resolvePath finding the .js file
          return actualPath.resolve(projectRoot, userCardCompJs);
        }
        return null;
      });

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Log final dependencies for debugging
      // console.log('Final deps for parseJavaScript/WeChat:', dependencies);

      // Should find page paths and component path based on string patterns and existence check
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, profilePageJs),
          actualPath.resolve(projectRoot, profilePageWxml),
          actualPath.resolve(projectRoot, logsPageJson),
          actualPath.resolve(projectRoot, listItemCompTs),
          actualPath.resolve(projectRoot, userCardCompJs), // Found via require mock
        ]),
      );
      // Verify that pages/ and components/ strings were checked with existsSync
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'pages/profile/index.js'),
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'pages/profile/index.wxml'),
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'pages/profile/index.json'),
      ); // Checked but maybe not found
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'pages/logs/logs.json'),
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'components/list-item.ts'),
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'components/list-item.js'),
      ); // Example check
    });

    it('should not return dependencies if resolved paths do not exist', async () => {
      const filePath = 'src/logic.js';
      const fileContent = `
        import './nonexistent.js';
        const config = require('../nonexistent/config');
        // @alias-import from '@/nonexistent/alias';
        wx.navigateTo({ url: 'pages/nonexistent' });
      `;
      mockFileContent(filePath, fileContent);

      // Mock AliasResolver to return a path, but mock existsSync to return false for it
      mockAliasInitialize.mockReturnValue(true);
      const nonExistentAliasPath = actualPath.resolve(projectRoot, 'src/nonexistent/alias.ts');
      mockAliasResolve.mockImplementation((p) =>
        p === '@/nonexistent/alias' ? nonExistentAliasPath : null,
      );

      // Mock that NO files exist
      mockPathExists([]);

      // Recreate parser with alias config enabled
      parser = new FileParser(projectRoot, { fileTypes: ['.js'] });

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(0);
      // Verify AliasResolver was called
      expect(mockAliasResolve).toHaveBeenCalledWith('@/nonexistent/alias', expect.any(String));
      // Verify attempts were made to resolve paths
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'src/nonexistent.js'),
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'nonexistent/config.js'),
      ); // Example ext check
      expect(mockFs.existsSync).toHaveBeenCalledWith(nonExistentAliasPath); // Checked resolved alias path
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'pages/nonexistent.js'),
      ); // WX path check
    });

    it('should resolve aliases correctly for JS/TS imports', async () => {
      const filePath = 'src/pages/home.js';
      const fileContent = `
        import Helper from '@/utils/helper'; // Expect .js or .ts
        const config = require('~config/settings'); // Expect .json
      `;
      mockFileContent(filePath, fileContent);

      // --- Mock Alias Setup ---
      const aliasMap = {
        '@': [actualPath.resolve(projectRoot, 'src')], // Absolute path for @
        '~config': ['configs'], // Relative path for ~config
      };
      mockAliasInitialize.mockReturnValue(true); // Indicate alias config exists
      mockGetAliases.mockReturnValue(aliasMap);

      // Configure mockAliasResolve to return potential BASE paths
      mockAliasResolve.mockImplementation((importPath: string, _sourceFile: string) => {
        if (importPath === '@/utils/helper') {
          // AliasResolver should return the base path without extension
          return actualPath.resolve(projectRoot, 'src/utils/helper');
        }
        if (importPath === '~config/settings') {
          // AliasResolver should return the base path without extension
          return actualPath.resolve(projectRoot, 'configs/settings');
        }
        return null;
      });
      // --- End Alias Mock Setup ---

      // --- Mock File System Setup ---
      // Define the files that actually exist
      const helperPath = 'src/utils/helper.ts'; // The actual file for the first import
      const helperWxmlPath = 'src/utils/helper.wxml'; // A competing file type
      const settingsPath = 'configs/settings.json'; // The actual file for the second import

      mockPathExists([helperPath, helperWxmlPath, settingsPath]);
      // --- End File System Mock Setup ---

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      expect(dependencies).toHaveLength(2);
      // Check that the *correct* files were resolved based on allowed extensions for JS
      expect(dependencies).toContain(actualPath.resolve(projectRoot, helperPath)); // Should resolve to .ts
      expect(dependencies).toContain(actualPath.resolve(projectRoot, settingsPath)); // Should resolve to .json
      // Verify that the competing .wxml file was NOT included
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, helperWxmlPath));

      // Verify AliasResolver.resolve was called correctly
      expect(mockAliasResolve).toHaveBeenCalledWith(
        '@/utils/helper',
        actualPath.resolve(projectRoot, filePath),
      );
      expect(mockAliasResolve).toHaveBeenCalledWith(
        '~config/settings',
        actualPath.resolve(projectRoot, filePath),
      );
    });

    it('should handle index file resolution for aliases in JS', async () => {
      const filePath = 'src/app.js';
      const fileContent = `import Button from '@/components/button';`;
      mockFileContent(filePath, fileContent);

      const aliasMap = { '@': [actualPath.resolve(projectRoot, 'src')] };
      mockAliasInitialize.mockReturnValue(true);
      mockGetAliases.mockReturnValue(aliasMap);

      // mockAliasResolve returns the base directory path from the alias
      const buttonBaseDir = actualPath.resolve(projectRoot, 'src/components/button');
      mockAliasResolve.mockImplementation((importPath: string) => {
        if (importPath === '@/components/button') return buttonBaseDir;
        return null;
      });

      // Mock the directory and the index file existence
      const buttonIndexFile = 'src/components/button/index.js';
      mockPathExists(buttonBaseDir, 'dir'); // Mock the directory itself
      mockPathExists(buttonIndexFile); // Mock the index.js file within it

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, buttonIndexFile));
      expect(mockAliasResolve).toHaveBeenCalledWith('@/components/button', expect.any(String));
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
      expect(mockAliasResolve).not.toHaveBeenCalled();
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
      expect(mockAliasResolve).not.toHaveBeenCalled();
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
      expect(mockAliasResolve).not.toHaveBeenCalled();
    });

    it('should resolve aliases correctly for WXML imports/includes/wxs', async () => {
      const filePath = 'src/pages/product/detail.wxml';
      const fileContent = `
        <import src="@/templates/common/price"/> <!-- Alias, no extension -->
        <wxs src="@/common/filters" module="f"></wxs> <!-- Alias, no extension -->
        <image src="@assets/placeholder"></image> <!-- Alias, no extension -->
      `;
      mockFileContent(filePath, fileContent);

      // --- Mock Alias Setup ---
      const aliasMap = {
        '@': [actualPath.resolve(projectRoot, 'src')],
        '@assets': [actualPath.resolve(projectRoot, 'src/assets')],
      };
      mockAliasInitialize.mockReturnValue(true);
      mockGetAliases.mockReturnValue(aliasMap);

      // Configure mockAliasResolve to return potential BASE paths (no extension)
      const priceBasePath = actualPath.resolve(projectRoot, 'src/templates/common/price');
      const filterBasePath = actualPath.resolve(projectRoot, 'src/common/filters');
      const placeholderBasePath = actualPath.resolve(projectRoot, 'src/assets/placeholder');

      mockAliasResolve.mockImplementation((importPath: string) => {
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

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

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
      expect(mockAliasResolve).toHaveBeenCalledWith('@/templates/common/price', expect.any(String));
      expect(mockAliasResolve).toHaveBeenCalledWith('@/common/filters', expect.any(String));
      expect(mockAliasResolve).toHaveBeenCalledWith('@assets/placeholder', expect.any(String));
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
      expect(mockAliasResolve).not.toHaveBeenCalled();
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
      expect(mockAliasResolve).not.toHaveBeenCalled();
    });

    it('should resolve aliases correctly for WXSS @import and url()', async () => {
      const filePath = 'src/pages/settings/page.wxss';
      const fileContent = `
        @import "@/styles/mixins"; /* Alias, no extension -> .wxss */
        .background { background: url('~assets/backgrounds/main'); } /* Alias, no extension -> image */
      `;
      mockFileContent(filePath, fileContent);

      // --- Mock Alias Setup ---
      const aliasMap = {
        '@': [actualPath.resolve(projectRoot, 'src')],
        '~assets': ['assets'], // Relative alias
      };
      mockAliasInitialize.mockReturnValue(true);
      mockGetAliases.mockReturnValue(aliasMap);

      // Configure mockAliasResolve to return potential BASE paths
      const mixinsBasePath = actualPath.resolve(projectRoot, 'src/styles/mixins');
      const bgBasePath = actualPath.resolve(projectRoot, 'assets/backgrounds/main');

      mockAliasResolve.mockImplementation((importPath: string) => {
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

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, mixinsPath)); // @import -> .wxss
      expect(dependencies).toContain(actualPath.resolve(projectRoot, bgPath)); // url() -> .png
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingMixinJs));
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingBgWxml));

      // Verify AliasResolver.resolve was called with the original alias paths
      expect(mockAliasResolve).toHaveBeenCalledWith('@/styles/mixins', expect.any(String));
      expect(mockAliasResolve).toHaveBeenCalledWith('~assets/backgrounds/main', expect.any(String));
    });
  });

  // --- JSON Parsing Tests ---
  describe('parseJSON', () => {
    it('should parse usingComponents with relative and root paths', async () => {
      const filePath = 'src/components/complex/comp.json';
      const fileContent = JSON.stringify({
        component: true,
        usingComponents: {
          header: './header', // Relative, no extension
          footer: '/components/common/footer', // Root, no extension
          icon: '../../core/icon/icon.js', // Relative with extension
        },
      });
      mockFileContent(filePath, fileContent);

      // Define actual existing files
      const headerCompPath = 'src/components/complex/header.wxml'; // Assume wxml exists
      const footerCompPath = 'components/common/footer.json'; // Assume json exists
      const iconCompPath = 'src/core/icon/icon.js';
      // Add related files (these should also be added by the parser)
      const headerJsonPath = 'src/components/complex/header.json';
      const footerWxmlPath = 'components/common/footer.wxml';

      mockPathExists([
        headerCompPath,
        footerCompPath,
        iconCompPath,
        headerJsonPath,
        footerWxmlPath,
      ]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Expecting resolved path + related files
      expect(dependencies).toHaveLength(5);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, headerCompPath));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, headerJsonPath));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, footerCompPath));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, footerWxmlPath));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, iconCompPath));
      expect(mockAliasResolve).not.toHaveBeenCalled();
    });

    it('should parse app.json specific fields (pages, subpackages, tabBar)', async () => {
      const filePath = 'app.json'; // Assume at project root
      const fileContent = JSON.stringify({
        pages: ['pages/index/index', 'pages/user/user'],
        subPackages: [
          {
            root: 'modules/moduleA',
            pages: ['views/view1', 'views/view2'],
          },
        ],
        tabBar: {
          list: [
            {
              pagePath: 'pages/index/index',
              text: 'Home',
              iconPath: 'assets/tab/home.png',
              selectedIconPath: 'assets/tab/home_active.png',
            },
            {
              pagePath: 'pages/user/user',
              text: 'User',
              iconPath: '/static/icons/user.svg', // Root path
            },
          ],
        },
      });
      mockFileContent(filePath, fileContent);

      // Mock existence of related files (assuming .js is the primary file)
      mockPathExists([
        'pages/index/index.js',
        'pages/index/index.wxml',
        'pages/user/user.js',
        'pages/user/user.wxss',
        'modules/moduleA/views/view1.js',
        'modules/moduleA/views/view2.js',
        'assets/tab/home.png',
        'assets/tab/home_active.png',
        'static/icons/user.svg',
      ]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Check that all related files are included
      expect(dependencies).toContain(actualPath.resolve(projectRoot, 'pages/index/index.js'));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, 'pages/index/index.wxml')); // Related file
      expect(dependencies).toContain(actualPath.resolve(projectRoot, 'pages/user/user.js'));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, 'pages/user/user.wxss')); // Related file
      expect(dependencies).toContain(
        actualPath.resolve(projectRoot, 'modules/moduleA/views/view1.js'),
      );
      expect(dependencies).toContain(
        actualPath.resolve(projectRoot, 'modules/moduleA/views/view2.js'),
      );
      expect(dependencies).toContain(actualPath.resolve(projectRoot, 'assets/tab/home.png'));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, 'assets/tab/home_active.png'));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, 'static/icons/user.svg'));
      expect(dependencies).toHaveLength(9); // Ensure no extras
      expect(mockAliasResolve).not.toHaveBeenCalled();
    });

    it('should resolve aliases correctly for usingComponents', async () => {
      const filePath = 'src/pages/cart/cart.json';
      const fileContent = JSON.stringify({
        component: true,
        usingComponents: {
          'item-card': '@/components/item-card', // Alias, no ext
          overlay: '~common/overlay/index', // Alias, maps to index file
        },
      });
      mockFileContent(filePath, fileContent);

      // --- Mock Alias Setup ---
      const aliasMap = {
        '@': [actualPath.resolve(projectRoot, 'src')],
        '~common': ['common-components'], // Relative alias
      };
      mockAliasInitialize.mockReturnValue(true);
      mockGetAliases.mockReturnValue(aliasMap);

      const itemCardBasePath = actualPath.resolve(projectRoot, 'src/components/item-card');
      const overlayBasePath = actualPath.resolve(projectRoot, 'common-components/overlay/index');

      mockAliasResolve.mockImplementation((importPath: string) => {
        if (importPath === '@/components/item-card') return itemCardBasePath;
        if (importPath === '~common/overlay/index') return overlayBasePath;
        return null;
      });
      // --- End Alias Setup ---

      // --- Mock File System ---
      // item-card component exists as item-card.js (+ related)
      const itemCardJs = 'src/components/item-card.js';
      const itemCardWxml = 'src/components/item-card.wxml';
      // overlay component exists as index.ts in the directory (+ related)
      const overlayDir = 'common-components/overlay';
      const overlayIndexTs = 'common-components/overlay/index.ts';
      const overlayIndexJson = 'common-components/overlay/index.json';
      const competingItemCardJson = 'src/components/item-card.json'; // Doesn't exist

      mockPathExists([itemCardJs, itemCardWxml, overlayIndexTs, overlayIndexJson]);
      mockPathExists(overlayDir, 'dir'); // Mock the directory for index lookup
      // --- End File System ---

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      // Allowed extensions for components: .js, .ts, .json, .wxml
      expect(dependencies).toHaveLength(4); // item-card.js, item-card.wxml, overlay/index.ts, overlay/index.json
      expect(dependencies).toContain(actualPath.resolve(projectRoot, itemCardJs));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, itemCardWxml));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, overlayIndexTs));
      expect(dependencies).toContain(actualPath.resolve(projectRoot, overlayIndexJson));
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingItemCardJson));

      expect(mockAliasResolve).toHaveBeenCalledWith('@/components/item-card', expect.any(String));
      expect(mockAliasResolve).toHaveBeenCalledWith('~common/overlay/index', expect.any(String));
    });

    // Add tests for componentGenerics if needed
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
      expect(mockAliasResolve).not.toHaveBeenCalled();
    });

    it('should resolve aliases correctly for WXS require()', async () => {
      const filePath = 'src/filters/main.wxs';
      const fileContent = `var formatter = require("@/common/formatter");`; // Alias, no ext
      mockFileContent(filePath, fileContent);

      // --- Mock Alias Setup ---
      const aliasMap = { '@': [actualPath.resolve(projectRoot, 'src')] };
      mockAliasInitialize.mockReturnValue(true);
      mockGetAliases.mockReturnValue(aliasMap);

      const formatterBasePath = actualPath.resolve(projectRoot, 'src/common/formatter');
      mockAliasResolve.mockImplementation((importPath: string) => {
        if (importPath === '@/common/formatter') return formatterBasePath;
        return null;
      });
      // --- End Alias Setup ---

      // --- Mock File System ---
      const formatterPath = 'src/common/formatter.wxs'; // Expected target
      const competingFormatterJs = 'src/common/formatter.js'; // Should not be picked
      mockPathExists([formatterPath, competingFormatterJs]);
      // --- End File System ---

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // --- Assertions ---
      expect(dependencies).toHaveLength(1);
      expect(dependencies).toContain(actualPath.resolve(projectRoot, formatterPath)); // require -> .wxs
      expect(dependencies).not.toContain(actualPath.resolve(projectRoot, competingFormatterJs));
      expect(mockAliasResolve).toHaveBeenCalledWith('@/common/formatter', expect.any(String));
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
