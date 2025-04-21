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
      // console.log(`Mock AliasResolver instantiated with root: ${projectRoot}`);
      return {
        initialize: mockAliasInitialize.mockReturnValue(false), // Default: no alias config found
        resolve: mockAliasResolve,
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
  });

  // --- WXML Parsing Tests ---
  describe('parseWXML', () => {
    it('should parse <import>, <include>, <wxs>, and image src attributes', async () => {
      const filePath = 'pages/home/home.wxml';
      const fileContent = `
        <import src="../template/header.wxml"/>
        <include src='/template/footer.wxml'/> <!-- Leading slash -->
        <wxs src="../../utils/tools.wxs" module="tools"></wxs>
        <image src="../../assets/logo.png"></image>
        <image src="/static/images/banner.jpg"></image>
        <image src="@/assets/icon.svg"></image> <!-- Alias path -->
      `;
      mockFileContent(filePath, fileContent);

      const headerPath = 'pages/template/header.wxml';
      const footerPath = 'template/footer.wxml'; // Relative to project root due to leading slash
      const toolsPath = 'utils/tools.wxs';
      const logoPath = 'assets/logo.png';
      const bannerPath = 'static/images/banner.jpg'; // Relative to project root
      const iconPath = 'src/assets/icon.svg'; // Resolved alias
      const absIconPath = actualPath.resolve(projectRoot, iconPath);

      // 输出测试设置信息
      console.log('Test setup - parseWXML paths:');
      console.log('filePath:', filePath);
      console.log('headerPath:', headerPath);
      console.log('footerPath:', footerPath);
      console.log('toolsPath:', toolsPath);
      console.log('logoPath:', logoPath);
      console.log('bannerPath:', bannerPath);
      console.log('iconPath:', iconPath);

      // Mock AliasResolver for the image path
      mockAliasInitialize.mockReturnValue(true);
      mockAliasResolve.mockImplementation((p) => {
        console.log('mockAliasResolve called with:', p);
        return p === '@/assets/icon.svg' ? absIconPath : null;
      });
      parser = new FileParser(projectRoot, { fileTypes: ['.wxml'] }); // Recreate parser with alias config

      // Mock file existence
      mockPathExists([headerPath, footerPath, toolsPath, logoPath, bannerPath, iconPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Log final dependencies for debugging
      // console.log('Final deps for parseWXML/src:', dependencies);

      expect(dependencies).toHaveLength(6);
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, headerPath),
          actualPath.resolve(projectRoot, footerPath),
          actualPath.resolve(projectRoot, toolsPath),
          actualPath.resolve(projectRoot, logoPath),
          actualPath.resolve(projectRoot, bannerPath),
          absIconPath,
        ]),
      );
      expect(mockAliasResolve).toHaveBeenCalledWith('@/assets/icon.svg', expect.any(String));
    });

    it('should parse custom component dependencies via usingComponents in corresponding .json', async () => {
      const wxmlPath = 'pages/user/user.wxml';
      const jsonPath = 'pages/user/user.json';
      const wxmlContent = `
        <view>User Page</view>
        <user-profile data="{{userInfo}}"></user-profile>
        <component-lib.avatar src="{{avatarUrl}}"></component-lib.avatar> 
        <another-comp></another-comp> 
      `;
      const jsonContent = JSON.stringify({
        component: true,
        usingComponents: {
          'user-profile': '../../components/profile/profile', // Relative path
          'component-lib.avatar': 'plugin://myPlugin/avatar', // Plugin path - should be ignored by parser
          'another-comp': '/components/common/another', // Root path
          'unused-comp': 'components/unused', // Defined but not used in WXML (still a dependency)
        },
      });

      mockFileContent(wxmlPath, wxmlContent);
      mockFileContent(jsonPath, jsonContent);

      // Paths for the first component (profile)
      const profileCompBase = 'components/profile/profile';
      const profileCompJs = profileCompBase + '.js';
      const profileCompWxml = profileCompBase + '.wxml';
      const profileCompJson = profileCompBase + '.json';
      // Paths for the second component (another)
      const anotherCompBase = 'components/common/another'; // Resolved from root path '/'
      const anotherCompTs = anotherCompBase + '.ts';
      const anotherCompWxml = anotherCompBase + '.wxml';
      // Paths for the third component (unused)
      const unusedCompBase = 'components/unused';
      const unusedCompWxss = unusedCompBase + '.wxss';

      // Mock existence of components' files (assuming some exist)
      mockPathExists([
        jsonPath, // The .json file itself must exist
        profileCompJs,
        profileCompWxml,
        profileCompJson,
        anotherCompTs,
        anotherCompWxml,
        unusedCompWxss,
      ]);

      // Log mocked paths specifically for this test
      console.log('usingComponents Test - Mocked Paths:', Array.from(mockedExistingPaths).sort());

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, wxmlPath));

      // Log final dependencies for debugging
      // console.log('Final deps for parseWXML/usingComponents:', dependencies);

      // Should include all files associated with components found in usingComponents, except plugin paths
      expect(dependencies).toHaveLength(6); // 3 for profile, 2 for another, 1 for unused
      expect(dependencies).toEqual(
        expect.arrayContaining([
          // profile component files
          actualPath.resolve(projectRoot, profileCompJs),
          actualPath.resolve(projectRoot, profileCompWxml),
          actualPath.resolve(projectRoot, profileCompJson),
          // another component files
          actualPath.resolve(projectRoot, anotherCompTs),
          actualPath.resolve(projectRoot, anotherCompWxml),
          // unused component files
          actualPath.resolve(projectRoot, unusedCompWxss),
        ]),
      );
      // Verify the json was read
      expect(mockFs.readFileSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, jsonPath),
        'utf-8',
      );
    });

    it('should handle case where corresponding .json file does not exist or is invalid', async () => {
      const wxmlPath = 'pages/simple/simple.wxml';
      const jsonPath = 'pages/simple/simple.json';
      const wxmlContent = `<my-comp></my-comp>`; // Has custom component usage
      mockFileContent(wxmlPath, wxmlContent);

      // Mock that the .json file does NOT exist
      mockPathExists([wxmlPath]);
      const absJsonPath = actualPath.resolve(projectRoot, jsonPath);
      // Manipulate the global mock set directly for this test case
      mockedExistingPaths.delete(absJsonPath);

      let dependencies = await parser.parseFile(actualPath.resolve(projectRoot, wxmlPath));
      expect(dependencies).toHaveLength(0);
      // Verify readFileSync was not called for the (non-existent) JSON
      expect(mockFs.readFileSync).not.toHaveBeenCalledWith(absJsonPath, 'utf-8');

      // Mock that the .json exists but is invalid
      jest.clearAllMocks(); // Clear mocks to reset existsSync behavior
      // Re-mock basic existence needed for the second part
      mockedExistingPaths = new Set<string>(); // Reset state
      mockedStats = new Map<string, Partial<fs.Stats>>();
      mockedFileContents = new Map<string, string>();
      mockPathExists([wxmlPath, jsonPath]); // Now JSON exists
      mockFileContent(wxmlPath, wxmlContent); // Need WXML content again
      mockFileContent(jsonPath, 'invalid json content'); // Set invalid content

      dependencies = await parser.parseFile(actualPath.resolve(projectRoot, wxmlPath));
      expect(dependencies).toHaveLength(0); // Should not find component deps if JSON is invalid
    });
  });

  // --- WXSS Parsing Tests ---
  describe('parseWXSS', () => {
    it('should parse @import statements and url() paths', async () => {
      const filePath = 'styles/main.wxss';
      const fileContent = `
        @import "./base.wxss";
        @import '/common/theme.wxss'; /* Root path */
        @import '@/mixins/responsive.wxss'; /* Alias path */

        .background {
          background-image: url(../assets/bg.png);
        }
        .icon {
          background: url("/static/icons/icon.svg") no-repeat;
        }
        .logo {
          content: url(@/assets/logo.jpg);
        }
      `;
      mockFileContent(filePath, fileContent);

      const basePath = 'styles/base.wxss';
      const themePath = 'common/theme.wxss'; // From root
      const mixinPath = 'src/mixins/responsive.wxss'; // Resolved alias
      const bgPath = 'assets/bg.png';
      const iconPath = 'static/icons/icon.svg'; // From root
      const logoPath = 'src/assets/logo.jpg'; // Resolved alias
      const absMixinPath = actualPath.resolve(projectRoot, mixinPath);
      const absLogoPath = actualPath.resolve(projectRoot, logoPath);

      // Mock AliasResolver
      mockAliasInitialize.mockReturnValue(true);
      mockAliasResolve.mockImplementation((p) => {
        if (p === '@/mixins/responsive.wxss') return absMixinPath;
        if (p === '@/assets/logo.jpg') return absLogoPath;
        return null;
      });
      parser = new FileParser(projectRoot, { fileTypes: ['.wxss'] });

      // Mock file existence
      mockPathExists([basePath, themePath, mixinPath, bgPath, iconPath, logoPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(6);
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, basePath),
          actualPath.resolve(projectRoot, themePath),
          absMixinPath,
          actualPath.resolve(projectRoot, bgPath),
          actualPath.resolve(projectRoot, iconPath),
          absLogoPath,
        ]),
      );
      expect(mockAliasResolve).toHaveBeenCalledTimes(2); // Called for the two alias paths
    });

    it('should not return dependencies if @import or url() targets do not exist', async () => {
      const filePath = 'styles/empty.wxss';
      const fileContent = `
         @import "./nonexistent.wxss";
         .error { background: url(../nonexistent.png); }
       `;
      mockFileContent(filePath, fileContent);
      mockPathExists([]); // Nothing exists

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(0);
      // Check that existsSync was called for the base paths (without extensions initially)
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'styles/nonexistent.wxss'),
      );
      // For url(), the relative path ../nonexistent.png resolves to /workspace/test-project/nonexistent.png
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'nonexistent.png'),
      );
    });
  });

  // --- JSON Parsing Tests ---
  describe('parseJSON', () => {
    it('should parse "pages" and "subpackages" (app.json style)', async () => {
      const filePath = 'app.json';
      const fileContent = JSON.stringify({
        pages: ['pages/index/index', 'pages/logs/logs'],
        subpackages: [
          {
            root: 'packageA',
            pages: ['pages/feature1/feature1', 'pages/feature2/feature2'],
          },
          {
            root: 'packageB',
            pages: ['pages/feature3/feature3'],
          },
        ],
      });
      mockFileContent(filePath, fileContent);

      const indexJs = 'pages/index/index.js';
      const indexWxml = 'pages/index/index.wxml';
      const logsJson = 'pages/logs/logs.json';
      const feature1Ts = 'packageA/pages/feature1/feature1.ts';
      const feature1Wxml = 'packageA/pages/feature1/feature1.wxml';
      const feature2Js = 'packageA/pages/feature2/feature2.js';
      const feature3Wxss = 'packageB/pages/feature3/feature3.wxss';

      // Mock existence of page/subpackage files
      mockPathExists([
        indexJs,
        indexWxml,
        logsJson,
        feature1Ts,
        feature1Wxml,
        feature2Js,
        feature3Wxss,
      ]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      // Should find all related files for each page entry
      expect(dependencies).toHaveLength(7);
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, indexJs),
          actualPath.resolve(projectRoot, indexWxml),
          actualPath.resolve(projectRoot, logsJson),
          actualPath.resolve(projectRoot, feature1Ts),
          actualPath.resolve(projectRoot, feature1Wxml),
          actualPath.resolve(projectRoot, feature2Js),
          actualPath.resolve(projectRoot, feature3Wxss),
        ]),
      );
    });

    it('should parse "usingComponents" (component.json style)', async () => {
      const filePath = 'components/my-comp/my-comp.json';
      const fileContent = JSON.stringify({
        component: true,
        usingComponents: {
          'inner-comp': './inner/inner-comp',
          'shared-util': '@/utils/shared', // Alias
          'plugin-button': 'plugin://myPlugin/button', // Ignore plugin
        },
      });
      mockFileContent(filePath, fileContent);

      const innerCompBase = 'components/my-comp/inner/inner-comp';
      const innerCompJs = innerCompBase + '.js';
      const innerCompWxml = innerCompBase + '.wxml';
      const sharedUtilBase = 'src/utils/shared'; // Resolved alias
      const sharedUtilTs = sharedUtilBase + '.ts';
      const absSharedUtilPath = actualPath.resolve(projectRoot, sharedUtilBase + '.ts');

      // Mock AliasResolver
      mockAliasInitialize.mockReturnValue(true);
      mockAliasResolve.mockImplementation((p) =>
        p === '@/utils/shared' ? absSharedUtilPath.replace(/\.ts$/, '') : null,
      ); // Resolve alias base path
      parser = new FileParser(projectRoot, { fileTypes: ['.json'] });

      // Mock file existence
      mockPathExists([innerCompJs, innerCompWxml, sharedUtilTs]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(3); // 2 for inner-comp, 1 for shared-util
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, innerCompJs),
          actualPath.resolve(projectRoot, innerCompWxml),
          absSharedUtilPath, // Resolved alias path with extension
        ]),
      );
      expect(mockAliasResolve).toHaveBeenCalledWith('@/utils/shared', expect.any(String));
    });

    it('should return empty array for JSON without relevant fields or invalid JSON', async () => {
      const filePath = 'data.json';
      // Valid JSON, but no relevant fields
      mockFileContent(filePath, JSON.stringify({ name: 'test', value: 123 }));
      let dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));
      expect(dependencies).toHaveLength(0);

      // Invalid JSON
      mockFileContent(filePath, 'invalid json content');
      dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));
      expect(dependencies).toHaveLength(0);
      // Should not throw, just return empty
    });
  });

  // --- WXS Parsing Tests ---
  describe('parseWXS', () => {
    it('should parse require statements in WXS files', async () => {
      const filePath = 'utils/filter.wxs';
      const fileContent = `
        var common = require('./common.wxs');
        var config = require("../config.wxs");
        module.exports = { /* ... */ };
      `;
      mockFileContent(filePath, fileContent);

      const commonPath = 'utils/common.wxs';
      const configPath = 'config.wxs';

      // Mock existence
      mockPathExists([commonPath, configPath]);

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toEqual(
        expect.arrayContaining([
          actualPath.resolve(projectRoot, commonPath),
          actualPath.resolve(projectRoot, configPath),
        ]),
      );
      // Aliases are not typically used in WXS require, expect AliasResolver not called
      expect(mockAliasResolve).not.toHaveBeenCalled();
    });

    it('should handle require paths that do not exist', async () => {
      const filePath = 'utils/another.wxs';
      const fileContent = `var missing = require('./nonexistent.wxs');`;
      mockFileContent(filePath, fileContent);
      mockPathExists([filePath], 'dir'); // Nothing exists

      const dependencies = await parser.parseFile(actualPath.resolve(projectRoot, filePath));

      expect(dependencies).toHaveLength(0);
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        actualPath.resolve(projectRoot, 'utils/nonexistent.wxs'),
      );
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
