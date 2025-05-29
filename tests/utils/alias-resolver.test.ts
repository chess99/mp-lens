import * as fs from 'fs';
import * as path from 'path';
import { AliasResolver } from '../../src/utils/alias-resolver';
import { logger } from '../../src/utils/debug-logger'; // Import logger if needed for mock

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

// Mock fs
jest.mock('fs');
// Mock logger
jest.mock('../../src/utils/debug-logger', () => ({
  logger: {
    trace: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    verbose: jest.fn(), // Ensure all used methods are mocked
  },
}));

// Keep path mock simple: delegate to actual path functions
jest.mock('path', () => {
  const actual = jest.requireActual('path');
  return {
    resolve: jest.fn((...args) => actual.resolve(...args)),
    join: jest.fn((...args) => actual.join(...args)),
    relative: jest.fn((...args) => actual.relative(...args)),
    isAbsolute: jest.fn((p) => actual.isAbsolute(p)),
    dirname: jest.fn((p) => actual.dirname(p)),
    extname: jest.fn((p) => actual.extname(p)),
    sep: actual.sep, // Include path separator if needed
  };
});

describe('AliasResolver', () => {
  // Use POSIX paths for consistency in tests, even on Windows
  const projectRoot = '/workspace/my-project';
  const currentFilePath = '/workspace/my-project/src/some-file.ts'; // A typical file using the alias
  let resolver: AliasResolver;

  // Simplified fs mock setup helpers
  const mockTsConfig = (
    content: object | string,
    configPath = actualPath.join(projectRoot, 'tsconfig.json'),
  ) => {
    const configDir = actualPath.dirname(configPath);
    (fs.existsSync as jest.Mock).mockImplementation((p) => p === configPath);
    (fs.readFileSync as jest.Mock).mockImplementation((p) => {
      if (p === configPath) return typeof content === 'string' ? content : JSON.stringify(content);
      throw new Error(`ENOENT: readFileSync mock doesn't handle ${p}`);
    });
    // Mock path.dirname specifically for the tsconfig path if needed by the code
    (path.dirname as jest.Mock).mockImplementation((p) => {
      if (p === configPath) return configDir;
      return actualPath.dirname(p);
    });
  };

  const mockMpAnalyzerConfig = (
    content: object | string,
    configPath = actualPath.join(projectRoot, 'mp-lens.config.json'),
  ) => {
    (fs.existsSync as jest.Mock).mockImplementation((p) => p === configPath);
    (fs.readFileSync as jest.Mock).mockImplementation((p) => {
      if (p === configPath) return typeof content === 'string' ? content : JSON.stringify(content);
      throw new Error(`ENOENT: readFileSync mock doesn't handle ${p}`);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock behavior: no files exist
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.readFileSync as jest.Mock).mockImplementation((p) => {
      throw new Error(`ENOENT: File not found ${p}`);
    });

    // Ensure path mocks delegate correctly by default
    Object.values(path).forEach((mockFn) => {
      if (jest.isMockFunction(mockFn)) {
        // Re-assign the mock implementation to use the actual path function
        // This handles cases where a previous test might have overwritten a specific path mock function
        const funcName = (Object.keys(actualPath) as (keyof typeof actualPath)[]).find(
          (key) => actualPath[key] === mockFn.getMockImplementation(),
        );
        if (funcName && typeof actualPath[funcName] === 'function') {
          mockFn.mockImplementation((...args: any[]) =>
            (actualPath[funcName] as (...args: any[]) => any)(...args),
          );
        } else {
          // Attempt to re-apply based on common names if direct reference is lost
          const commonName = (Object.keys(path) as (keyof typeof path)[]).find(
            (key) => path[key] === mockFn,
          );
          if (commonName && typeof actualPath[commonName] === 'function') {
            mockFn.mockImplementation((...args: any[]) =>
              (actualPath[commonName] as (...args: any[]) => any)(...args),
            );
          }
        }
      }
    });
    // Explicitly reset critical mocks if needed
    (path.resolve as jest.Mock).mockImplementation((...args) => actualPath.resolve(...args));
    (path.join as jest.Mock).mockImplementation((...args) => actualPath.join(...args));
    (path.relative as jest.Mock).mockImplementation((...args) => actualPath.relative(...args));
    (path.dirname as jest.Mock).mockImplementation((p) => actualPath.dirname(p));
    (path.isAbsolute as jest.Mock).mockImplementation((p) => actualPath.isAbsolute(p));

    resolver = new AliasResolver(projectRoot);
    // Ensure clean state for each test
    (resolver as any).initialized = false;
    (resolver as any).aliases = {};
  });

  // --- Initialization Tests ---
  describe('initialize', () => {
    it('should load aliases from tsconfig.json in project root (absolute paths)', () => {
      const tsconfigPath = actualPath.join(projectRoot, 'tsconfig.json');
      const tsconfigDir = actualPath.dirname(tsconfigPath); // projectRoot
      mockTsConfig({
        compilerOptions: {
          baseUrl: './src', // Relative to tsconfig.json's location
          paths: {
            '@/*': ['./utils/*'], // e.g., @/ -> src/utils/
            '~components/*': ['./components/*', '../shared/components/*'], // e.g., ~components/ -> src/components/ OR shared/components/
          },
        },
      });
      const baseDir = actualPath.resolve(tsconfigDir, './src'); // /workspace/my-project/src

      const initialized = resolver.initialize();

      expect(initialized).toBe(true);
      expect(fs.readFileSync).toHaveBeenCalledWith(tsconfigPath, 'utf-8');
      expect(resolver.getAliases()).toEqual({
        '@': [actualPath.resolve(baseDir, './utils')], // /workspace/my-project/src/utils
        '~components': [
          actualPath.resolve(baseDir, './components'), // /workspace/my-project/src/components
          actualPath.resolve(baseDir, '../shared/components'), // /workspace/my-project/shared/components
        ],
      });
    });

    it('should find and load aliases from tsconfig.json in parent directory', () => {
      const parentDir = actualPath.dirname(projectRoot); // /workspace
      const tsconfigPathInParent = actualPath.join(parentDir, 'tsconfig.json');
      mockTsConfig(
        {
          // Mock only the parent tsconfig
          compilerOptions: {
            baseUrl: '.', // Relative to parent dir
            paths: { 'lib/*': ['global-libs/*'] }, // lib/ -> /workspace/global-libs/
          },
        },
        tsconfigPathInParent,
      );
      const baseDir = parentDir; // /workspace

      const initialized = resolver.initialize();

      expect(initialized).toBe(true);
      expect(fs.existsSync).toHaveBeenCalledWith(actualPath.join(projectRoot, 'tsconfig.json')); // Checked root first
      expect(fs.existsSync).toHaveBeenCalledWith(tsconfigPathInParent);
      expect(fs.readFileSync).toHaveBeenCalledWith(tsconfigPathInParent, 'utf-8');
      expect(resolver.getAliases()).toEqual({
        lib: [actualPath.resolve(baseDir, 'global-libs')], // /workspace/global-libs
      });
    });

    it('should load aliases from mp-lens.config.json (relative paths)', () => {
      const customConfigPath = actualPath.join(projectRoot, 'mp-lens.config.json');
      mockMpAnalyzerConfig({
        aliases: {
          $util: ['src/utils'], // Relative to project root
          $core: ['src/core'],
        },
      });

      const initialized = resolver.initialize();

      expect(initialized).toBe(true);
      expect(fs.readFileSync).toHaveBeenCalledWith(customConfigPath, 'utf-8');
      // tsconfig should have been checked first and failed
      expect(fs.existsSync).toHaveBeenCalledWith(actualPath.join(projectRoot, 'tsconfig.json'));
      // Aliases from custom config are stored as-is (relative)
      expect(resolver.getAliases()).toEqual({
        $util: ['src/utils'],
        $core: ['src/core'],
      });
    });

    it('should merge aliases, with custom config taking precedence', () => {
      const tsconfigPath = actualPath.join(projectRoot, 'tsconfig.json');
      const customConfigPath = actualPath.join(projectRoot, 'mp-lens.config.json');

      // Mock both files existing
      (fs.existsSync as jest.Mock).mockImplementation(
        (p) => p === tsconfigPath || p === customConfigPath,
      );

      // Mock tsconfig read
      const tsconfigContent = {
        compilerOptions: {
          baseUrl: '.',
          paths: { '@/*': ['src/*'], 'common/*': ['common/*'] },
        },
      };
      (fs.readFileSync as jest.Mock).mockImplementation((p) => {
        if (p === tsconfigPath) return JSON.stringify(tsconfigContent);
        if (p === customConfigPath) return JSON.stringify(customConfigContent);
        throw new Error(`ENOENT read ${p}`);
      });

      // Mock custom config read
      const customConfigContent = {
        aliases: { '@': ['source'], $lib: ['lib'] }, // Override '@', add '$lib'
      };

      const initialized = resolver.initialize();
      const finalAliases = resolver.getAliases();

      expect(initialized).toBe(true);
      // Check presence and values, ignore order
      expect(finalAliases).toHaveProperty('common', [actualPath.resolve(projectRoot, 'common')]);
      expect(finalAliases).toHaveProperty('@', ['source']); // Custom overrides tsconfig
      expect(finalAliases).toHaveProperty('$lib', ['lib']); // Custom added
      // Optionally check the number of keys if needed
      expect(Object.keys(finalAliases)).toHaveLength(3);
    });

    it('should return false if no config files are found', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false); // No files exist
      const initialized = resolver.initialize();
      expect(initialized).toBe(false);
      expect(resolver.getAliases()).toEqual({});
    });

    it('should handle errors during config file parsing but still load from others', () => {
      const tsconfigPath = actualPath.join(projectRoot, 'tsconfig.json');
      const customConfigPath = actualPath.join(projectRoot, 'mp-lens.config.json');

      // Mock both files existing
      (fs.existsSync as jest.Mock).mockImplementation(
        (p) => p === tsconfigPath || p === customConfigPath,
      );

      // Mock tsconfig read error, custom config reads successfully
      (fs.readFileSync as jest.Mock).mockImplementation((p) => {
        if (p === tsconfigPath) throw new Error('Invalid JSON');
        if (p === customConfigPath)
          return JSON.stringify({ aliases: { $custom: ['custom/path'] } });
        throw new Error(`ENOENT read ${p}`);
      });

      const initialized = resolver.initialize();

      // Should still initialize successfully from the custom config
      expect(initialized).toBe(true);
      // Should have loaded the alias from the valid custom config
      expect(resolver.getAliases()).toEqual({ $custom: ['custom/path'] });
      // Ensure logger.warn was called for the tsconfig error (or appropriate log level)
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('无法解析 tsconfig.json'));
    });
  });

  // --- Resolution Tests ---
  describe('resolve', () => {
    // Helper to set up aliases for these tests
    const setupAliases = (aliases: Record<string, string[]>) => {
      (resolver as any).aliases = aliases;
      (resolver as any).initialized = true;
    };

    it('should resolve alias from tsconfig (absolute target path)', () => {
      // tsconfig paths are resolved to absolute paths during initialization
      setupAliases({ '@': [actualPath.resolve(projectRoot, 'src/utils')] }); // Simulates loaded tsconfig alias
      const importPath = '@/helpers/math.ts';
      const expected = actualPath.resolve(projectRoot, 'src/utils/helpers/math.ts'); // Joins remaining path

      const resolved = resolver.resolve(importPath, currentFilePath);
      expect(resolved).toBe(expected);
    });

    it('should resolve alias from custom config (relative target path)', () => {
      // Custom config paths are stored relative, resolved against projectRoot here
      setupAliases({ '~': ['components'] }); // Simulates loaded custom alias
      const importPath = '~/button/style.css';
      // Resolves 'components' against projectRoot, then joins remaining path
      const expected = actualPath.resolve(projectRoot, 'components/button/style.css');

      const resolved = resolver.resolve(importPath, currentFilePath);
      expect(resolved).toBe(expected);
    });

    it('should resolve exact match alias from tsconfig (absolute target path)', () => {
      setupAliases({ Lib: [actualPath.resolve(projectRoot, 'libs/core-lib')] });
      const importPath = 'Lib';
      const expected = actualPath.resolve(projectRoot, 'libs/core-lib');

      const resolved = resolver.resolve(importPath, currentFilePath);
      expect(resolved).toBe(expected);
    });

    it('should resolve exact match alias from custom config (relative target path)', () => {
      setupAliases({ MyUtil: ['utils/my-special-util'] });
      const importPath = 'MyUtil';
      const expected = actualPath.resolve(projectRoot, 'utils/my-special-util');

      const resolved = resolver.resolve(importPath, currentFilePath);
      expect(resolved).toBe(expected);
    });

    it('should use the first target path if multiple are defined', () => {
      setupAliases({
        '~comp': [
          actualPath.resolve(projectRoot, 'src/comps'), // First target (absolute)
          'shared/comps', // Second target (relative) - should be ignored by resolve
        ],
      });
      const importPath = '~comp/modal/index.js';
      // Uses the first target path + remaining import path
      const expected = actualPath.resolve(projectRoot, 'src/comps/modal/index.js');

      const resolved = resolver.resolve(importPath, currentFilePath);
      expect(resolved).toBe(expected);
    });

    it('should return null if import path does not match any alias', () => {
      setupAliases({ '@': ['src'] });
      const importPath = './relative/path/file.js'; // Not an alias path

      const resolved = resolver.resolve(importPath, currentFilePath);
      expect(resolved).toBeNull();
    });

    it('should return null if alias matches but has no target paths defined', () => {
      setupAliases({ emptyAlias: [] });
      const importPath = 'emptyAlias/some/path';

      const resolved = resolver.resolve(importPath, currentFilePath);
      expect(resolved).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("Alias 'emptyAlias' found but has no target paths"),
      );
    });

    it('should resolve if alias prefix matches exactly without trailing slash', () => {
      setupAliases({ '@': [actualPath.resolve(projectRoot, 'src')] });
      const importPath = '@';
      const expectedBasePath = actualPath.resolve(projectRoot, 'src'); // Expect the base path

      const resolved = resolver.resolve(importPath, currentFilePath);
      expect(resolved).toBe(expectedBasePath);
    });

    it('should call initialize if not already initialized', () => {
      (resolver as any).initialized = false; // Force re-initialization
      (resolver as any).aliases = {};

      // Spy on the actual initialize method
      const initializeSpy = jest.spyOn(resolver as any, 'initialize');
      // Mock fs for the initialize call
      mockTsConfig({ compilerOptions: { paths: { '@/*': ['src/*'] } } });

      const importPath = '@/utils/core';
      const expected = actualPath.resolve(projectRoot, 'src/utils/core');

      // Call resolve, which should trigger initialize
      const resolved = resolver.resolve(importPath, currentFilePath);

      expect(initializeSpy).toHaveBeenCalledTimes(1);
      // After initialize runs (loading from mockTsConfig), resolve should work
      expect(resolved).toBe(expected);
      initializeSpy.mockRestore();
    });
  });

  // --- GetAliases Tests ---
  describe('getAliases', () => {
    it('should return the loaded aliases after initialization', () => {
      const mockLoadedAliases = { '@': [actualPath.resolve(projectRoot, 'src')] };
      // Spy on initialize and make it set the aliases
      const initializeSpy = jest.spyOn(resolver as any, 'initialize').mockImplementation(() => {
        (resolver as any).aliases = mockLoadedAliases;
        (resolver as any).initialized = true;
        return true; // Found aliases
      });

      // Call getAliases (which should trigger initialize)
      const aliases = resolver.getAliases();

      expect(initializeSpy).toHaveBeenCalledTimes(1);
      expect(aliases).toEqual(mockLoadedAliases);
      initializeSpy.mockRestore();
    });

    it('should return the current aliases if already initialized', () => {
      const preSetAliases = { '~': ['app'] };
      (resolver as any).aliases = preSetAliases;
      (resolver as any).initialized = true;
      const initializeSpy = jest.spyOn(resolver as any, 'initialize'); // Spy only

      const aliases = resolver.getAliases();

      expect(initializeSpy).not.toHaveBeenCalled();
      expect(aliases).toEqual(preSetAliases); // Should return the preset ones
      initializeSpy.mockRestore();
    });

    it('should return empty object if initialization finds no aliases', () => {
      // Spy on initialize and make it find nothing
      const initializeSpy = jest.spyOn(resolver as any, 'initialize').mockImplementation(() => {
        (resolver as any).aliases = {};
        (resolver as any).initialized = true;
        return false; // Indicate no aliases found
      });

      const aliases = resolver.getAliases();

      expect(initializeSpy).toHaveBeenCalledTimes(1);
      expect(aliases).toEqual({}); // Should be empty
      initializeSpy.mockRestore();
    });
  });
});
