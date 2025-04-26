import * as path from 'path';
import { logger } from '../../src/utils/debug-logger';
import { loadTsConfigTypes } from '../../src/utils/tsconfig-helper';

// Mock the fs module
const mockFs = {
  files: {} as Record<string, string>, // path -> content
  dirs: new Set<string>(), // set of directory paths
  stats: {} as Record<string, { isFile: () => boolean; isDirectory: () => boolean }>,
};

jest.mock('fs', () => ({
  __setMockFS: (
    files: Record<string, string>,
    dirs?: string[],
    stats?: Record<string, 'file' | 'dir'>,
  ) => {
    mockFs.files = {};
    mockFs.dirs = new Set<string>();
    mockFs.stats = {};
    mockFs.dirs.add('/'); // Root always exists

    // Populate files and their stats
    for (const filePath in files) {
      const absolutePath = path.resolve(filePath);
      mockFs.files[absolutePath] = files[filePath];
      mockFs.stats[absolutePath] = { isFile: () => true, isDirectory: () => false };
      // Add parent directories
      let currentDir = path.dirname(absolutePath);
      while (currentDir !== path.dirname(currentDir)) {
        // Check against root
        mockFs.dirs.add(currentDir);
        mockFs.stats[currentDir] = { isFile: () => false, isDirectory: () => true };
        currentDir = path.dirname(currentDir);
      }
    }
    // Populate explicit directories and their stats
    if (dirs) {
      dirs.forEach((dirPath) => {
        const absolutePath = path.resolve(dirPath);
        mockFs.dirs.add(absolutePath);
        mockFs.stats[absolutePath] = { isFile: () => false, isDirectory: () => true };
        // Add parent directories
        let currentDir = path.dirname(absolutePath);
        while (currentDir !== path.dirname(currentDir)) {
          mockFs.dirs.add(currentDir);
          mockFs.stats[currentDir] = { isFile: () => false, isDirectory: () => true };
          currentDir = path.dirname(currentDir);
        }
      });
    }
    // Populate explicit stats
    if (stats) {
      for (const p in stats) {
        const absolutePath = path.resolve(p);
        const type = stats[p];
        mockFs.stats[absolutePath] = {
          isFile: () => type === 'file',
          isDirectory: () => type === 'dir',
        };
        if (type === 'dir') mockFs.dirs.add(absolutePath);
      }
    }
  },
  existsSync: jest.fn((p: string) => {
    const absP = path.resolve(p);
    return mockFs.files.hasOwnProperty(absP) || mockFs.dirs.has(absP);
  }),
  readFileSync: jest.fn((p: string, enc: string) => {
    const absP = path.resolve(p);
    if (mockFs.files.hasOwnProperty(absP)) {
      if (enc !== 'utf-8') throw new Error('Mock only supports utf-8');
      return mockFs.files[absP];
    }
    throw new Error(`ENOENT: no such file or directory, open '${p}'`);
  }),
  readdirSync: jest.fn((p: string, options?: { withFileTypes?: boolean }) => {
    const absP = path.resolve(p);
    if (!mockFs.dirs.has(absP)) {
      throw new Error(`ENOENT: no such file or directory, scandir '${p}'`);
    }
    const entries = new Set<string>();
    Object.keys(mockFs.files).forEach((fp) => {
      if (path.dirname(fp) === absP) entries.add(path.basename(fp));
    });
    mockFs.dirs.forEach((dp) => {
      if (path.dirname(dp) === absP) entries.add(path.basename(dp));
    });

    if (options?.withFileTypes) {
      return Array.from(entries).map((name) => {
        const entryPath = path.resolve(absP, name);
        const stat = mockFs.stats[entryPath];
        return {
          name,
          isFile: () => stat?.isFile() ?? false,
          isDirectory: () => stat?.isDirectory() ?? false,
        };
      });
    }
    return Array.from(entries);
  }),
  statSync: jest.fn((p: string) => {
    const absP = path.resolve(p);
    if (mockFs.stats.hasOwnProperty(absP)) {
      return mockFs.stats[absP];
    }
    throw new Error(`ENOENT: no such file or directory, stat '${p}'`);
  }),
}));

// Mock the logger
jest.mock('../../src/utils/debug-logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    trace: jest.fn(),
  },
}));

// Access the mocked fs for setup
const fs = jest.requireMock('fs');

describe('loadTsConfigTypes', () => {
  const projectRoot = '/project';
  const tsConfigPath = path.resolve(projectRoot, 'tsconfig.json');

  beforeEach(() => {
    jest.clearAllMocks();
    fs.__setMockFS({}); // Reset mock file system
    // Ensure project root directory exists in mock
    mockFs.dirs.add(projectRoot);
    mockFs.stats[projectRoot] = { isFile: () => false, isDirectory: () => true };
  });

  it('should return empty array if tsconfig.json does not exist', () => {
    const result = loadTsConfigTypes(projectRoot);
    expect(result).toEqual([]);
    expect(logger.debug).toHaveBeenCalledWith('tsconfig.json not found, skipping types parsing.');
  });

  it('should return empty array if tsconfig.json is invalid JSON', () => {
    fs.__setMockFS({ [tsConfigPath]: 'invalid json{' });
    const result = loadTsConfigTypes(projectRoot);
    expect(result).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to read or parse tsconfig.json'),
    );
  });

  it('should return empty array if compilerOptions or types is missing', () => {
    fs.__setMockFS({ [tsConfigPath]: JSON.stringify({ compilerOptions: {} }) }); // No types
    expect(loadTsConfigTypes(projectRoot)).toEqual([]);

    fs.__setMockFS({ [tsConfigPath]: JSON.stringify({}) }); // No compilerOptions
    expect(loadTsConfigTypes(projectRoot)).toEqual([]);
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('compilerOptions.types not found'),
    );
  });

  it('should return empty array if types is not an array', () => {
    fs.__setMockFS({
      [tsConfigPath]: JSON.stringify({ compilerOptions: { types: 'not-an-array' } }),
    });
    expect(loadTsConfigTypes(projectRoot)).toEqual([]);
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('compilerOptions.types not found'),
    );
  });

  it('should ignore module names and return empty array', () => {
    fs.__setMockFS({
      [tsConfigPath]: JSON.stringify({
        compilerOptions: { types: ['node', 'jest', 'miniprogram-api-typings'] },
      }),
    });
    const result = loadTsConfigTypes(projectRoot);
    expect(result).toEqual([]);
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring tsconfig type reference (assumed module): node'),
    );
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring tsconfig type reference (assumed module): jest'),
    );
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining(
        'Ignoring tsconfig type reference (assumed module): miniprogram-api-typings',
      ),
    );
  });

  it('should resolve and return absolute paths for relative file paths', () => {
    const typeFilePath = '/project/src/types/wx.d.ts';
    fs.__setMockFS({
      [tsConfigPath]: JSON.stringify({ compilerOptions: { types: ['./src/types/wx.d.ts'] } }),
      [typeFilePath]: 'declare var wx: any;',
    });
    const result = loadTsConfigTypes(projectRoot);
    expect(result).toEqual([path.resolve(typeFilePath)]);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Adding file from tsconfig types: src/types/wx.d.ts'),
    );
  });

  it('should resolve and return absolute paths for files in relative directory paths', () => {
    const typeDirPath = '/project/src/types';
    const file1 = path.resolve(typeDirPath, 'common.d.ts');
    const file2 = path.resolve(typeDirPath, 'api.d.ts');
    const subDir = path.resolve(typeDirPath, 'sub');
    const file3 = path.resolve(subDir, 'sub-type.d.ts');

    fs.__setMockFS(
      {
        [tsConfigPath]: JSON.stringify({ compilerOptions: { types: ['./src/types'] } }),
        [file1]: 'declare interface Common {}',
        [file2]: 'declare interface API {}',
        [file3]: 'declare interface Sub {}',
      },
      [subDir], // Explicitly add subDir
    );

    const result = loadTsConfigTypes(projectRoot);
    expect(result).toHaveLength(3);
    expect(result).toContain(file1);
    expect(result).toContain(file2);
    expect(result).toContain(file3);
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Adding files in directory from tsconfig types: src/types'),
    );
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('Added 3 files from directory ./src/types'),
    );
  });

  it('should handle a mix of module names and paths, returning only resolved paths', () => {
    const typeFilePath = '/project/src/my-types.d.ts';
    fs.__setMockFS({
      [tsConfigPath]: JSON.stringify({
        compilerOptions: { types: ['node', './src/my-types.d.ts'] },
      }),
      [typeFilePath]: 'declare var myType: any;',
    });
    const result = loadTsConfigTypes(projectRoot);
    expect(result).toEqual([path.resolve(typeFilePath)]);
    expect(logger.trace).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring tsconfig type reference (assumed module): node'),
    );
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Adding file from tsconfig types: src/my-types.d.ts'),
    );
  });

  it('should ignore paths that do not exist', () => {
    fs.__setMockFS({
      [tsConfigPath]: JSON.stringify({ compilerOptions: { types: ['./nonexistent/type.d.ts'] } }),
    });
    const result = loadTsConfigTypes(projectRoot);
    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(`Could not resolve tsconfig type path './nonexistent/type.d.ts'`),
    );
  });

  it('should handle errors when reading a directory listed in types', () => {
    const typeDirPath = path.resolve(projectRoot, 'src/types');
    fs.__setMockFS(
      { [tsConfigPath]: JSON.stringify({ compilerOptions: { types: ['./src/types'] } }) },
      [typeDirPath],
    );

    // Mock readdirSync to throw an error for this specific directory
    (fs.readdirSync as jest.Mock).mockImplementation(
      (p: string, options?: { withFileTypes?: boolean }) => {
        if (path.resolve(p) === typeDirPath) {
          throw new Error('Permission Denied');
        }
        // Fallback to original mock or default behavior for other paths
        const absP = path.resolve(p);
        if (!mockFs.dirs.has(absP)) {
          throw new Error(`ENOENT: no such file or directory, scandir '${p}'`);
        }
        const entries = new Set<string>();
        Object.keys(mockFs.files).forEach((fp) => {
          if (path.dirname(fp) === absP) entries.add(path.basename(fp));
        });
        mockFs.dirs.forEach((dp) => {
          if (path.dirname(dp) === absP) entries.add(path.basename(dp));
        });

        // Correctly implement fallback for withFileTypes
        if (options?.withFileTypes) {
          return Array.from(entries).map((name) => {
            const entryPath = path.resolve(absP, name);
            const stat = mockFs.stats[entryPath];
            return {
              name,
              isFile: () => stat?.isFile() ?? false,
              isDirectory: () => stat?.isDirectory() ?? false,
            };
          });
        }
        return Array.from(entries);
      },
    );

    const result = loadTsConfigTypes(projectRoot);
    expect(result).toEqual([]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `Error reading directory for types ${typeDirPath}: Permission Denied`,
      ),
    );
  });

  it('should deduplicate paths if a file is listed directly and via directory', () => {
    const typeDirPath = '/project/src/types';
    const file1 = path.resolve(typeDirPath, 'common.d.ts');
    fs.__setMockFS({
      [tsConfigPath]: JSON.stringify({
        compilerOptions: { types: ['./src/types', './src/types/common.d.ts'] },
      }),
      [file1]: 'declare interface Common {}',
    });

    const result = loadTsConfigTypes(projectRoot);
    expect(result).toHaveLength(1);
    expect(result).toEqual([file1]);
  });
});
