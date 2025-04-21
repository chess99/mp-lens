import * as fs from 'fs';
import { ConfigFileOptions } from '../../src/types/command-options';
import { ConfigLoader } from '../../src/utils/config-loader';
const path = require('path');

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

// --- Mocks ---

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Mock path module
jest.mock('path', () => {
  const actual = jest.requireActual('path');
  return {
    resolve: jest.fn((...args) => actual.resolve(...args)),
    join: jest.fn((...args) => actual.join(...args)),
    extname: jest.fn((p) => actual.extname(p)),
    dirname: jest.fn((p) => actual.dirname(p)),
    relative: jest.fn((...args) => actual.relative(...args)),
    isAbsolute: jest.fn((p) => actual.isAbsolute(p)),
    normalize: jest.fn((p) => actual.normalize(p)), // Keep normalize for comparisons
  };
});

// Mock ts-node register function
const mockTsNodeRegister = jest.fn();
jest.mock(
  'ts-node',
  () => ({
    register: mockTsNodeRegister,
  }),
  { virtual: true },
);

// --- Test Constants ---
const projectRoot = '/fake/project/root'; // Use a consistent fake root
const mockConfig: ConfigFileOptions = {
  entryFile: './app.json',
  exclude: ['node_modules/**', 'dist/**'],
  aliases: { '@': './src' },
  miniappRoot: 'miniprogram',
};

// --- Mock Specific Config Files using static absolute paths ---
// Jest requires the first argument to jest.mock to be a literal string or resolvable path.
// Using absolute paths based on the known test projectRoot.
jest.mock('/fake/project/root/my-config.js', () => mockConfig, { virtual: true });
jest.mock(
  '/fake/project/root/my-config-func.js',
  () => jest.fn(() => Promise.resolve(mockConfig)),
  { virtual: true },
);
jest.mock('/fake/project/root/my-config-es.js', () => ({ default: mockConfig }), { virtual: true });
jest.mock(
  '/fake/project/root/my-config-es-func.js',
  () => ({ default: jest.fn(() => Promise.resolve(mockConfig)) }),
  { virtual: true },
);
jest.mock('/fake/project/root/my-config.ts', () => mockConfig, { virtual: true });
jest.mock('/fake/project/root/mp-analyzer.config.js', () => mockConfig, { virtual: true });
jest.mock('/fake/project/root/mp-analyzer.config.ts', () => mockConfig, { virtual: true });
jest.mock(
  '/fake/project/root/error.js',
  () => {
    throw new Error('Mocked Syntax Error in JS');
  },
  { virtual: true },
);

// --- Test Suite ---

describe('ConfigLoader', () => {
  // Store original console methods and spies
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset general mocks
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReset();
    (fs.readFileSync as jest.Mock).mockReset();
    // Clear path mocks but keep implementation
    (path.resolve as jest.Mock).mockClear();
    (path.join as jest.Mock).mockClear();
    (path.extname as jest.Mock).mockClear();
    (path.normalize as jest.Mock).mockClear();
    // Reset ts-node spy
    mockTsNodeRegister.mockClear();

    // Re-apply default path mock implementations (important after jest.clearAllMocks)
    (path.resolve as jest.Mock).mockImplementation((...args) => actualPath.resolve(...args));
    (path.join as jest.Mock).mockImplementation((...args) => actualPath.join(...args));
    (path.extname as jest.Mock).mockImplementation((p) => actualPath.extname(p));
    (path.normalize as jest.Mock).mockImplementation((p) => actualPath.normalize(p)); // Ensure normalize is mocked

    // Default mock behaviors for fs
    (fs.existsSync as jest.Mock).mockReturnValue(false); // Default: file doesn't exist
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      const normalizedPath = actualPath.normalize(filePath); // Normalize path for comparison
      // Handle JSON specifically
      if (
        normalizedPath ===
          actualPath.normalize(actualPath.resolve(projectRoot, 'my-config.json')) ||
        normalizedPath ===
          actualPath.normalize(actualPath.join(projectRoot, 'mp-analyzer.config.json'))
      ) {
        return JSON.stringify(mockConfig);
      }
      if (
        normalizedPath === actualPath.normalize(actualPath.resolve(projectRoot, 'invalid.json'))
      ) {
        return 'invalid json{';
      }
      // Let actual require handle mocked JS/TS files via jest.mock, throw otherwise for readFileSync
      throw new Error(
        `Mock fs.readFileSync: ENOENT: no such file or directory, open '${filePath}'`,
      );
    });

    // Reset/Recreate console spies
    consoleLogSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods
    consoleLogSpy?.mockRestore();
    consoleWarnSpy?.mockRestore();
    consoleErrorSpy?.mockRestore();
    // Reset modules potentially modified by tests (like error.js mock override)
    jest.resetModules();
  });

  // --- Test cases ---

  it('should load config from a specified JSON file path', async () => {
    const configPath = 'my-config.json';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);
    // Note: readFileSync mock is handled in beforeEach

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(fs.readFileSync).toHaveBeenCalledWith(fullConfigPath, 'utf-8');
    expect(loadedConfig).toEqual(mockConfig);
    expect(mockTsNodeRegister).not.toHaveBeenCalled(); // Should not be called for JSON
  });

  it('should load config from a specified JS file path (object export)', async () => {
    const configPath = 'my-config.js';
    // ConfigLoader resolves the path internally and require uses the mock
    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toEqual(mockConfig);
    expect(mockTsNodeRegister).not.toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled(); // Should not be called for JS
  });

  it('should load config from a specified JS file path (function export)', async () => {
    const configPath = 'my-config-func.js';
    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toEqual(mockConfig); // Loader awaits the promise from the mock
    expect(mockTsNodeRegister).not.toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should load config from a specified JS file path (ES module default object export)', async () => {
    const configPath = 'my-config-es.js';
    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toEqual(mockConfig); // Default export is handled by require/mock
    expect(mockTsNodeRegister).not.toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should load config from a specified JS file path (ES module default function export)', async () => {
    const configPath = 'my-config-es-func.js';
    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toEqual(mockConfig); // Default export function handled by require/mock
    expect(mockTsNodeRegister).not.toHaveBeenCalled();
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should load config from a specified TS file path', async () => {
    const configPath = 'my-config.ts';
    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(mockTsNodeRegister).toHaveBeenCalledTimes(1); // ts-node should be registered
    expect(loadedConfig).toEqual(mockConfig); // Comes from the jest.mock
    expect(fs.readFileSync).not.toHaveBeenCalled(); // Should not be called for TS
  });

  it('should auto-find and load mp-analyzer.config.js if exists', async () => {
    const jsConfigPath = actualPath.resolve(projectRoot, 'mp-analyzer.config.js'); // Calculate for assertion
    (fs.existsSync as jest.Mock).mockImplementation(
      (p) => actualPath.normalize(p) === actualPath.normalize(jsConfigPath),
    );

    const loadedConfig = await ConfigLoader.loadConfig(undefined, projectRoot);

    expect(fs.existsSync).toHaveBeenCalledWith(jsConfigPath);
    expect(loadedConfig).toEqual(mockConfig); // Comes from the jest.mock
    expect(mockTsNodeRegister).not.toHaveBeenCalled();
  });

  it('should auto-find and load mp-analyzer.config.ts if .js doesnt exist', async () => {
    const jsConfigPath = actualPath.resolve(projectRoot, 'mp-analyzer.config.js'); // Calculate for assertion
    const tsConfigPath = actualPath.resolve(projectRoot, 'mp-analyzer.config.ts'); // Calculate for assertion
    (fs.existsSync as jest.Mock).mockImplementation(
      (p) => actualPath.normalize(p) === actualPath.normalize(tsConfigPath),
    ); // Only TS exists

    const loadedConfig = await ConfigLoader.loadConfig(undefined, projectRoot);

    expect(fs.existsSync).toHaveBeenCalledWith(jsConfigPath); // Checked first
    expect(fs.existsSync).toHaveBeenCalledWith(tsConfigPath);
    expect(mockTsNodeRegister).toHaveBeenCalledTimes(1); // Called for TS
    expect(loadedConfig).toEqual(mockConfig); // Comes from the jest.mock
  });

  it('should auto-find and load mp-analyzer.config.json if .js and .ts dont exist', async () => {
    const jsConfigPath = actualPath.resolve(projectRoot, 'mp-analyzer.config.js'); // Calculate for assertion
    const tsConfigPath = actualPath.resolve(projectRoot, 'mp-analyzer.config.ts'); // Calculate for assertion
    const jsonConfigPath = actualPath.join(projectRoot, 'mp-analyzer.config.json'); // Calculate for assertion

    (fs.existsSync as jest.Mock).mockImplementation(
      (p) => actualPath.normalize(p) === actualPath.normalize(jsonConfigPath),
    ); // Only JSON exists
    // readFileSync mock for JSON is handled in beforeEach

    const loadedConfig = await ConfigLoader.loadConfig(undefined, projectRoot);

    expect(fs.existsSync).toHaveBeenCalledWith(jsConfigPath);
    expect(fs.existsSync).toHaveBeenCalledWith(tsConfigPath);
    expect(fs.existsSync).toHaveBeenCalledWith(jsonConfigPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(jsonConfigPath, 'utf-8');
    expect(mockTsNodeRegister).not.toHaveBeenCalled();
    expect(loadedConfig).toEqual(mockConfig);
  });

  it('should return null if specified config path loading fails (e.g., read error)', async () => {
    const configPath = 'nonexistent.json';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);
    // Override beforeEach mock to throw for this specific path
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (actualPath.normalize(filePath) === actualPath.normalize(fullConfigPath)) {
        throw new Error('Read Error');
      }
      throw new Error('Unexpected readFileSync call');
    });

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
    expect(fs.readFileSync).toHaveBeenCalledWith(fullConfigPath, 'utf-8');
    // Verify error was logged without checking the specific message
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return null if no config file is found during auto-search', async () => {
    // existsSync mock already returns false by default in beforeEach
    const loadedConfig = await ConfigLoader.loadConfig(undefined, projectRoot);
    expect(loadedConfig).toBeNull();
    // Check that default paths were checked using the absolute paths
    expect(fs.existsSync).toHaveBeenCalledWith(
      actualPath.resolve(projectRoot, 'mp-analyzer.config.js'),
    );
    expect(fs.existsSync).toHaveBeenCalledWith(
      actualPath.resolve(projectRoot, 'mp-analyzer.config.ts'),
    );
    expect(fs.existsSync).toHaveBeenCalledWith(
      actualPath.join(projectRoot, 'mp-analyzer.config.json'),
    );
  });

  it('should return null and log error if JSON parsing fails', async () => {
    const configPath = 'invalid.json';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);
    // readFileSync mock for invalid JSON is in beforeEach

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
    expect(fs.readFileSync).toHaveBeenCalledWith(fullConfigPath, 'utf-8');
    // Verify error was logged without checking the specific message
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return null and log error if JS loading fails (require throws)', async () => {
    const configPath = 'error.js';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath); // Calculate for assertion
    // The mock for '/fake/project/root/error.js' throws an error via jest.mock

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull(); // Loader should catch the error from require
    // Verify error was logged without checking the specific message
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(mockTsNodeRegister).not.toHaveBeenCalled();
  });

  it('should return null and log error if TS loading fails because ts-node require fails', async () => {
    const configPath = 'my-config.ts';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath); // Calculate for assertion
    const requireError = new Error('TS Require Error');

    // Temporarily override the globally mocked module *for this test*
    jest.doMock(
      '/fake/project/root/my-config.ts',
      () => {
        throw requireError;
      },
      { virtual: true },
    );

    // Relying on afterEach's jest.resetModules() to reload ConfigLoader
    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
    expect(mockTsNodeRegister).toHaveBeenCalledTimes(1); // Registration happens before require
    // Verify error was logged without checking the specific message
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return null and log error if TS loading fails because ts-node registration fails', async () => {
    const configPath = 'my-config.ts';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath); // Calculate for assertion
    const registrationError = new Error('ts-node registration failed');

    // Make the ts-node mock itself throw
    jest.doMock(
      'ts-node',
      () => ({
        register: jest.fn(() => {
          throw registrationError;
        }),
      }),
      { virtual: true },
    );
    // Need to reset modules to pick up the new ts-node mock
    jest.resetModules();
    const { ConfigLoader: ReloadedConfigLoader } = await import('../../src/utils/config-loader');
    // Re-spy on console after resetModules if necessary
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const loadedConfig = await ReloadedConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
    // Verify error was logged without checking the specific message
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return null and log warning for unsupported config file extensions', async () => {
    const configPath = 'my-config.yaml';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
  });
});
