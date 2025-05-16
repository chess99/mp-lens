import * as fs from 'fs';
import * as path from 'path';
import { WXMLParser } from '../../../src/analyzer/parsers/wxml-parser';
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

describe('WXMLParser', () => {
  const projectRoot = '/workspace/test-project';
  let parser: WXMLParser;
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
    parser = new WXMLParser(pathResolver, projectRoot, options);
  });

  describe('parse', () => {
    it('should parse import and include tags with relative paths', async () => {
      const filePath = actualPath.resolve(projectRoot, 'pages/index/index.wxml');
      const fileContent = `
        <import src="../../templates/header.wxml" />
        <include src="../common/footer.wxml" />
      `;
      mockFileContent('pages/index/index.wxml', fileContent);

      const headerPath = actualPath.resolve(projectRoot, 'templates/header.wxml');
      const footerPath = actualPath.resolve(projectRoot, 'pages/common/footer.wxml');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === '../../templates/header.wxml') return headerPath;
          if (importPath === '../common/footer.wxml') return footerPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(headerPath);
      expect(dependencies).toContain(footerPath);

      expect(mockResolveAnyPath).toHaveBeenCalledWith('../../templates/header.wxml', filePath, [
        '.wxml',
      ]);
      expect(mockResolveAnyPath).toHaveBeenCalledWith('../common/footer.wxml', filePath, ['.wxml']);
    });

    it('should parse import and include tags with root-relative paths', async () => {
      const filePath = actualPath.resolve(projectRoot, 'pages/index/index.wxml');
      const fileContent = `
        <import src="/templates/header.wxml" />
        <include src="/common/footer.wxml" />
      `;
      mockFileContent('pages/index/index.wxml', fileContent);

      const headerPath = actualPath.resolve(projectRoot, 'templates/header.wxml');
      const footerPath = actualPath.resolve(projectRoot, 'common/footer.wxml');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === '/templates/header.wxml') return headerPath;
          if (importPath === '/common/footer.wxml') return footerPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(headerPath);
      expect(dependencies).toContain(footerPath);

      expect(mockResolveAnyPath).toHaveBeenCalledWith('/templates/header.wxml', filePath, [
        '.wxml',
      ]);
      expect(mockResolveAnyPath).toHaveBeenCalledWith('/common/footer.wxml', filePath, ['.wxml']);
    });

    it('should parse wxs tags', async () => {
      const filePath = actualPath.resolve(projectRoot, 'pages/index/index.wxml');
      const fileContent = `
        <wxs src="../../utils/format.wxs" module="format" />
        <wxs src="/utils/helper.wxs" module="helper" />
      `;
      mockFileContent('pages/index/index.wxml', fileContent);

      const formatPath = actualPath.resolve(projectRoot, 'utils/format.wxs');
      const helperPath = actualPath.resolve(projectRoot, 'utils/helper.wxs');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === '../../utils/format.wxs') return formatPath;
          if (importPath === '/utils/helper.wxs') return helperPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(formatPath);
      expect(dependencies).toContain(helperPath);

      expect(mockResolveAnyPath).toHaveBeenCalledWith('../../utils/format.wxs', filePath, ['.wxs']);
      expect(mockResolveAnyPath).toHaveBeenCalledWith('/utils/helper.wxs', filePath, ['.wxs']);
    });

    it('should parse image sources', async () => {
      const filePath = actualPath.resolve(projectRoot, 'pages/index/index.wxml');
      const fileContent = `
        <image src="../../assets/logo.png" />
        <image src="/images/bg.jpg" />
      `;
      mockFileContent('pages/index/index.wxml', fileContent);

      const logoPath = actualPath.resolve(projectRoot, 'assets/logo.png');
      const bgPath = actualPath.resolve(projectRoot, 'images/bg.jpg');

      // Mock PathResolver responses
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === '../../assets/logo.png') return logoPath;
          if (importPath === '/images/bg.jpg') return bgPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(2);
      expect(dependencies).toContain(logoPath);
      expect(dependencies).toContain(bgPath);

      expect(mockResolveAnyPath).toHaveBeenCalledWith('../../assets/logo.png', filePath, [
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.webp',
      ]);
      expect(mockResolveAnyPath).toHaveBeenCalledWith('/images/bg.jpg', filePath, [
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.webp',
      ]);
    });

    it('should skip dynamic, data URI, and remote image sources', async () => {
      const filePath = actualPath.resolve(projectRoot, 'pages/index/index.wxml');
      const fileContent = `
        <image src="{{dynamicPath}}" />
        <image src="data:image/png;base64,iVBORw..." />
        <image src="https://example.com/image.png" />
      `;
      mockFileContent('pages/index/index.wxml', fileContent);

      const dependencies = await parser.parse(filePath);

      // No dependencies should be found
      expect(dependencies).toHaveLength(0);

      // PathResolver should not be called for these cases
      expect(mockResolveAnyPath).not.toHaveBeenCalled();
    });

    it('should handle failing to parse a file gracefully', async () => {
      const filePath = actualPath.resolve(projectRoot, 'pages/nonexistent/index.wxml');

      // Don't mock file content, which will cause readFileSync to throw

      await expect(parser.parse(filePath)).rejects.toThrow();
    });

    it('should treat unprefixed paths as relative to current file directory', async () => {
      const filePath = actualPath.resolve(projectRoot, 'pages/index/index.wxml');
      const fileContent = `
        <import src="templates/header.wxml" />
        <wxs src="scripts/utils.wxs" module="utils" />
        <image src="images/logo.png" />
      `;
      mockFileContent('pages/index/index.wxml', fileContent);

      const headerPath = actualPath.resolve(projectRoot, 'pages/index/templates/header.wxml');
      const utilsPath = actualPath.resolve(projectRoot, 'pages/index/scripts/utils.wxs');
      const logoPath = actualPath.resolve(projectRoot, 'pages/index/images/logo.png');

      // Mock PathResolver responses - expect the normalized paths with './' prefix
      mockResolveAnyPath.mockImplementation(
        (importPath: string, containingFile: string, extensions: string[]) => {
          if (importPath === './templates/header.wxml') return headerPath;
          if (importPath === './scripts/utils.wxs') return utilsPath;
          if (importPath === './images/logo.png') return logoPath;
          return null;
        },
      );

      const dependencies = await parser.parse(filePath);

      expect(dependencies).toHaveLength(3);
      expect(dependencies).toContain(headerPath);
      expect(dependencies).toContain(utilsPath);
      expect(dependencies).toContain(logoPath);

      // Verify normalization
      expect(mockResolveAnyPath).toHaveBeenCalledWith('./templates/header.wxml', filePath, [
        '.wxml',
      ]);
      expect(mockResolveAnyPath).toHaveBeenCalledWith('./scripts/utils.wxs', filePath, ['.wxs']);
      expect(mockResolveAnyPath).toHaveBeenCalledWith('./images/logo.png', filePath, [
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.webp',
      ]);
    });
  });
});
