import * as path from 'path';
import { logger } from '../../src/utils/debug-logger';
import { findAppJsonConfig } from '../../src/utils/fs-finder';

// Mock the fs module
// We'll use a simple in-memory representation for files and directories
const mockFs = {
  files: {} as Record<string, string>, // path -> content
  dirs: new Set<string>(), // set of directory paths
};

jest.mock('fs', () => ({
  // Helper to set up the mock file system for a test
  __setMockFiles: (files: Record<string, string>) => {
    mockFs.files = {};
    mockFs.dirs = new Set<string>();
    mockFs.dirs.add('/'); // Root always exists
    for (const filePath in files) {
      const absolutePath = path.resolve(filePath); // Ensure absolute
      mockFs.files[absolutePath] = files[filePath];
      // Add all parent directories
      let currentDir = path.dirname(absolutePath);
      while (currentDir !== '/' && currentDir !== '.') {
        mockFs.dirs.add(currentDir);
        currentDir = path.dirname(currentDir);
      }
      mockFs.dirs.add(path.dirname(absolutePath));
    }
    // Add base directories from file paths
    Object.keys(files).forEach((filePath) => {
      mockFs.dirs.add(path.dirname(path.resolve(filePath)));
    });
  },
  // Mock readdirSync
  readdirSync: jest.fn((dirPath: string, options?: { withFileTypes?: boolean }) => {
    const normalizedDirPath = path.resolve(dirPath);
    if (!mockFs.dirs.has(normalizedDirPath)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`);
    }

    const entries = new Set<string>();
    // Find direct children files
    for (const filePath in mockFs.files) {
      if (path.dirname(filePath) === normalizedDirPath) {
        entries.add(path.basename(filePath));
      }
    }
    // Find direct children directories
    for (const dir of mockFs.dirs) {
      if (path.dirname(dir) === normalizedDirPath && dir !== '/') {
        entries.add(path.basename(dir));
      }
    }

    if (options?.withFileTypes) {
      return Array.from(entries).map((name) => ({
        name,
        isDirectory: () => mockFs.dirs.has(path.resolve(normalizedDirPath, name)),
        isFile: () => mockFs.files.hasOwnProperty(path.resolve(normalizedDirPath, name)),
        // Add other Dirent methods if needed (isSymbolicLink, etc.)
      }));
    }
    return Array.from(entries);
  }),
  // Mock readFileSync
  readFileSync: jest.fn((filePath: string, encoding: string) => {
    const normalizedPath = path.resolve(filePath);
    if (mockFs.files.hasOwnProperty(normalizedPath)) {
      if (encoding !== 'utf-8') throw new Error('Mock only supports utf-8');
      return mockFs.files[normalizedPath];
    }
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  }),
  // Mock existsSync if needed (though readdir/readFile checks might suffice)
  existsSync: jest.fn((filePath: string) => {
    const normalizedPath = path.resolve(filePath);
    return mockFs.files.hasOwnProperty(normalizedPath) || mockFs.dirs.has(normalizedPath);
  }),
}));

// Mock the logger to prevent console spam during tests
jest.mock('../../src/utils/debug-logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
    setProjectRoot: jest.fn(),
    setLevel: jest.fn(),
    getLevel: jest.fn(),
  },
}));

// Access the mocked fs for setup
const fs = jest.requireMock('fs');

describe('findAppJsonConfig', () => {
  const projectRoot = '/project';

  beforeEach(() => {
    // Clear mocks before each test
    jest.clearAllMocks();
    // Set default empty file system
    fs.__setMockFiles({});
    // Add project root directory
    mockFs.dirs.add(projectRoot);
  });

  it('should find the correct app.json when one valid file exists', () => {
    const mockFiles = {
      ['/project/src/app.json']: JSON.stringify({ pages: ['pages/index'] }),
      ['/project/src/pages/index.js']: 'console.log("hello")',
    };
    fs.__setMockFiles(mockFiles);

    const result = findAppJsonConfig(projectRoot);

    expect(result).toEqual({
      entryFile: path.resolve(projectRoot, 'src/app.json'),
      miniappRoot: path.resolve(projectRoot, 'src'),
    });
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('自动检测到入口文件: src/app.json'),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('自动检测到小程序根目录: src'),
    );
  });

  it('should return null if no app.json is found', () => {
    const mockFiles = {
      ['/project/src/somefile.js']: 'console.log("hello")',
    };
    fs.__setMockFiles(mockFiles);

    const result = findAppJsonConfig(projectRoot);

    expect(result).toBeNull();
    expect(logger.debug).toHaveBeenCalledWith('No valid app.json found for auto-detection.');
  });

  it('should return null if app.json has invalid content (no pages array)', () => {
    const mockFiles = {
      ['/project/src/app.json']: JSON.stringify({ otherProp: 'value' }), // No pages array
    };
    fs.__setMockFiles(mockFiles);

    const result = findAppJsonConfig(projectRoot);

    expect(result).toBeNull();
    expect(logger.trace).toHaveBeenCalledWith(expect.stringContaining('Skipping invalid app.json'));
  });

  it('should return null if app.json is not valid JSON', () => {
    const mockFiles = {
      ['/project/src/app.json']: '{', // Invalid JSON
    };
    fs.__setMockFiles(mockFiles);

    const result = findAppJsonConfig(projectRoot);

    expect(result).toBeNull();
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('Error reading/parsing app.json'),
    );
  });

  it('should return "ambiguous" if multiple valid app.json files are found', () => {
    const mockFiles = {
      ['/project/app.json']: JSON.stringify({ pages: ['pages/root'] }),
      ['/project/src/app.json']: JSON.stringify({ pages: ['pages/src'] }),
    };
    fs.__setMockFiles(mockFiles);

    const result = findAppJsonConfig(projectRoot);

    expect(result).toBe('ambiguous');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('发现多个有效的 app.json 文件'),
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('app.json')); // Check for the first location
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('src/app.json')); // Check for the second location
  });

  it('should ignore app.json within default excluded directories (node_modules)', () => {
    const mockFiles = {
      ['/project/node_modules/some_dep/app.json']: JSON.stringify({ pages: ['pages/nm'] }),
      ['/project/src/utils.js']: '',
    };
    fs.__setMockFiles(mockFiles);
    // Manually add node_modules dir for readdirSync mock
    mockFs.dirs.add(path.resolve(projectRoot, 'node_modules'));
    mockFs.dirs.add(path.resolve(projectRoot, 'node_modules/some_dep'));

    const result = findAppJsonConfig(projectRoot);

    expect(result).toBeNull();
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('Skipping excluded directory: node_modules'),
    );
  });

  it('should ignore app.json within default excluded directories (dist)', () => {
    const mockFiles = {
      ['/project/dist/app.json']: JSON.stringify({ pages: ['pages/dist'] }),
      ['/project/src/app.json']: JSON.stringify({ pages: ['pages/src'] }), // Valid one
    };
    fs.__setMockFiles(mockFiles);
    // Manually add excluded dir for readdirSync mock
    mockFs.dirs.add(path.resolve(projectRoot, 'dist'));

    const result = findAppJsonConfig(projectRoot);

    // Should find the one in src/
    expect(result).toEqual({
      entryFile: path.resolve(projectRoot, 'src/app.json'),
      miniappRoot: path.resolve(projectRoot, 'src'),
    });
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('Skipping excluded directory: dist'),
    );
  });

  it('should handle read errors gracefully (e.g., permission denied on readdirSync)', () => {
    const mockFiles = {
      ['/project/src/app.json']: JSON.stringify({ pages: ['pages/src'] }),
      ['/project/unreadable/app.json']: JSON.stringify({ pages: ['pages/unreadable'] }),
    };
    fs.__setMockFiles(mockFiles);
    mockFs.dirs.add(path.resolve(projectRoot, 'unreadable')); // Add the dir

    // Mock readdirSync to throw an error for a specific directory
    const originalReaddirSync = jest.requireActual('fs').readdirSync;
    (fs.readdirSync as jest.Mock).mockImplementation((dirPath, options) => {
      if (path.resolve(dirPath) === path.resolve(projectRoot, 'unreadable')) {
        throw new Error('EACCES: permission denied');
      }
      // Use the mock's logic for other directories (more robust than calling original)
      const normalizedDirPath = path.resolve(dirPath);
      if (!mockFs.dirs.has(normalizedDirPath)) {
        throw new Error('ENOENT');
      }
      // ... (rest of mock readdirSync logic from setup) ...
      const entries = new Set<string>();
      for (const filePath in mockFs.files) {
        if (path.dirname(filePath) === normalizedDirPath) {
          entries.add(path.basename(filePath));
        }
      }
      for (const dir of mockFs.dirs) {
        if (path.dirname(dir) === normalizedDirPath && dir !== '/') {
          entries.add(path.basename(dir));
        }
      }
      if (options?.withFileTypes) {
        return Array.from(entries).map((name) => ({
          name,
          isDirectory: () => mockFs.dirs.has(path.resolve(normalizedDirPath, name)),
          isFile: () => mockFs.files.hasOwnProperty(path.resolve(normalizedDirPath, name)),
        }));
      }
      return Array.from(entries);
    });

    const result = findAppJsonConfig(projectRoot);

    // Should still find the valid one in /src
    expect(result).toEqual({
      entryFile: path.resolve(projectRoot, 'src/app.json'),
      miniappRoot: path.resolve(projectRoot, 'src'),
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('读取目录'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('EACCES: permission denied'));
  });
});
