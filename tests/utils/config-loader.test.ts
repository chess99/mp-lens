import * as fs from 'fs';
import { ConfigFileOptions } from '../../src/types/command-options';
import { ConfigLoader } from '../../src/utils/config-loader';
const path = require('path');

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Mock path module (Alternative strategy)
jest.mock('path', () => ({
  // Explicitly mock required functions, delegating to actualPath inside
  resolve: jest.fn((...args) => actualPath.resolve(...args)),
  join: jest.fn((...args) => actualPath.join(...args)),
  extname: jest.fn((p) => actualPath.extname(p)),
  dirname: jest.fn((p) => actualPath.dirname(p)),
  // Add other path functions used in the test file if needed
  relative: jest.fn((...args) => actualPath.relative(...args)),
  isAbsolute: jest.fn((p) => actualPath.isAbsolute(p)),
}));

// Mock ts-node register function
const mockTsNodeRegister = jest.fn();
jest.mock('ts-node', () => ({
    register: mockTsNodeRegister,
}), { virtual: true }); // Use virtual mock as ts-node might not be installed

// Mock dynamic require used for .js and .ts files
const mockRequire = jest.fn();
let originalRequire: NodeRequire;

beforeAll(() => {
  originalRequire = require;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).require = mockRequire;
});

afterAll(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).require = originalRequire;
});

describe('ConfigLoader', () => {
  const projectRoot = '/fake/project/root'; // Use a consistent fake root
  const mockConfig: ConfigFileOptions = {
    entryFile: './app.json',
    exclude: ['node_modules/**', 'dist/**'],
    aliases: { '@': './src' },
    miniappRoot: 'miniprogram'
  };

  // Store original console methods
  const originalConsoleLog = console.log;
  const originalConsoleWarn = console.warn;
  const originalConsoleError = console.error;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;


  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReset();
    (fs.readFileSync as jest.Mock).mockReset();
    (path.resolve as jest.Mock).mockClear();
    (path.join as jest.Mock).mockClear();
    (path.extname as jest.Mock).mockClear();
    mockRequire.mockReset();
    mockTsNodeRegister.mockReset();

    // Re-apply default path mock implementations
    (path.resolve as jest.Mock).mockImplementation((...args) => actualPath.resolve(...args));
    (path.join as jest.Mock).mockImplementation((...args) => actualPath.join(...args));
    (path.extname as jest.Mock).mockImplementation((p) => actualPath.extname(p));


    // Default mock behaviors
    (fs.existsSync as jest.Mock).mockReturnValue(false); // Default: file doesn't exist
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      // Default readFileSync should probably throw if not specifically mocked
      throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
    });
    mockRequire.mockImplementation((id) => {
       // console.warn(`require mock called with: ${id}`);
      if (id === 'ts-node') return { register: mockTsNodeRegister };
      // Default require mock: throw error for unexpected requires
      throw new Error(`Cannot find module '${id}'`);
    });

    // Reset require.cache for dynamic requires
    // Object.keys(require.cache).forEach(key => {
    //     // Be careful not to delete core modules if tests depend on them implicitly
    //      if (key.includes(projectRoot)) { // Example: only clear cache for our fake project files
    //        delete require.cache[key];
    //      }
    // });
      
    // Spy on console methods AFTER resetting mocks
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); // Suppress log output during tests
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); // Suppress warn output
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); // Suppress error output
  });
    
  afterEach(() => {
      // Restore original console methods
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      consoleErrorSpy.mockRestore();
  });


  // --- Test cases ---

  it('should load config from a specified JSON file path', async () => {
    const configPath = 'my-config.json';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);
    const jsonContent = JSON.stringify(mockConfig);

    (fs.readFileSync as jest.Mock).mockReturnValue(jsonContent);

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(fs.readFileSync).toHaveBeenCalledWith(fullConfigPath, 'utf-8');
    expect(loadedConfig).toEqual(mockConfig);
  });

  it('should load config from a specified JS file path (object export)', async () => {
    const configPath = 'my-config.js';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);

    // Ensure path comparison in mock is robust
    mockRequire.mockImplementation((id) => {
      const resolvedId = actualPath.resolve(id); // Resolve the ID being required
      if (resolvedId === fullConfigPath) return mockConfig;
      if (id === 'ts-node') return { register: mockTsNodeRegister }; // Keep original check for module name
      throw new Error(`Unexpected require: ${id} (resolved: ${resolvedId})`);
    });

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
    expect(loadedConfig).toEqual(mockConfig);
    // Ensure require cache is cleared - check mockRequire was called (indirectly confirms cache bust)
    expect(mockRequire).toHaveBeenCalledTimes(1); // Or more if ts-node is involved etc.
  });

  it('should load config from a specified JS file path (function export)', async () => {
    const configPath = 'my-config-func.js';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);
    const configFunction = jest.fn().mockResolvedValue(mockConfig); // Use mockResolvedValue for async function

    // Ensure path comparison in mock is robust
    mockRequire.mockImplementation((id) => {
      const resolvedId = actualPath.resolve(id);
      if (resolvedId === fullConfigPath) return configFunction;
      if (id === 'ts-node') return { register: mockTsNodeRegister };
      throw new Error(`Unexpected require: ${id} (resolved: ${resolvedId})`);
    });

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
    expect(configFunction).toHaveBeenCalledTimes(1);
    expect(loadedConfig).toEqual(mockConfig);
  });
    
  it('should load config from a specified JS file path (ES module default object export)', async () => {
      const configPath = 'my-config-es.js';
      const fullConfigPath = actualPath.resolve(projectRoot, configPath);
      // Ensure path comparison in mock is robust
      mockRequire.mockImplementation((id) => {
          const resolvedId = actualPath.resolve(id);
          if (resolvedId === fullConfigPath) return { default: mockConfig }; // Simulate ES module export
          if (id === 'ts-node') return { register: mockTsNodeRegister };
          throw new Error(`Unexpected require: ${id} (resolved: ${resolvedId})`);
      });
      const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);
      expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
      expect(loadedConfig).toEqual(mockConfig);
  });

  it('should load config from a specified JS file path (ES module default function export)', async () => {
      const configPath = 'my-config-es-func.js';
      const fullConfigPath = actualPath.resolve(projectRoot, configPath);
      const configFunction = jest.fn().mockResolvedValue(mockConfig);
      // Ensure path comparison in mock is robust
      mockRequire.mockImplementation((id) => {
          const resolvedId = actualPath.resolve(id);
          if (resolvedId === fullConfigPath) return { default: configFunction }; // Simulate ES module export
          if (id === 'ts-node') return { register: mockTsNodeRegister };
          throw new Error(`Unexpected require: ${id} (resolved: ${resolvedId})`);
      });
      const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);
      expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
      expect(configFunction).toHaveBeenCalledTimes(1);
      expect(loadedConfig).toEqual(mockConfig);
  });


  it('should load config from a specified TS file path', async () => {
    const configPath = 'my-config.ts';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);

    // Ensure path comparison in mock is robust
    mockRequire.mockImplementation((id) => {
      const resolvedId = actualPath.resolve(id);
      if (resolvedId === fullConfigPath) return mockConfig; // ts-node handles the require
      if (id === 'ts-node') return { register: mockTsNodeRegister };
      throw new Error(`Unexpected require: ${id} (resolved: ${resolvedId})`);
    });

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(mockTsNodeRegister).toHaveBeenCalledTimes(1);
    // The actual require call for the config file happens *after* ts-node registration
    expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
    expect(loadedConfig).toEqual(mockConfig);
  });

  it('should auto-find and load mp-analyzer.config.js if exists', async () => {
    const jsConfigPath = actualPath.join(projectRoot, 'mp-analyzer.config.js');
    (fs.existsSync as jest.Mock).mockImplementation((p) => p === jsConfigPath);

    // Ensure path comparison in mock is robust
    mockRequire.mockImplementation((id) => {
      const resolvedId = actualPath.resolve(id);
      if (resolvedId === jsConfigPath) return mockConfig;
      if (id === 'ts-node') return { register: mockTsNodeRegister };
      throw new Error(`Unexpected require: ${id} (resolved: ${resolvedId})`);
    });

    const loadedConfig = await ConfigLoader.loadConfig(undefined, projectRoot);

    expect(fs.existsSync).toHaveBeenCalledWith(jsConfigPath);
    expect(mockRequire).toHaveBeenCalledWith(jsConfigPath);
    expect(loadedConfig).toEqual(mockConfig);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`找到配置文件: ${jsConfigPath}`));

  });

  it('should auto-find and load mp-analyzer.config.ts if .js doesnt exist', async () => {
    const jsConfigPath = actualPath.join(projectRoot, 'mp-analyzer.config.js');
    const tsConfigPath = actualPath.join(projectRoot, 'mp-analyzer.config.ts');
    (fs.existsSync as jest.Mock).mockImplementation((p) => p === tsConfigPath); // Only TS exists

    // Ensure path comparison in mock is robust
    mockRequire.mockImplementation((id) => {
      const resolvedId = actualPath.resolve(id);
      if (resolvedId === tsConfigPath) return mockConfig;
      if (id === 'ts-node') return { register: mockTsNodeRegister };
      throw new Error(`Unexpected require: ${id} (resolved: ${resolvedId})`);
    });

    const loadedConfig = await ConfigLoader.loadConfig(undefined, projectRoot);

    expect(fs.existsSync).toHaveBeenCalledWith(jsConfigPath); // Checked first
    expect(fs.existsSync).toHaveBeenCalledWith(tsConfigPath);
    expect(mockTsNodeRegister).toHaveBeenCalledTimes(1);
    expect(mockRequire).toHaveBeenCalledWith(tsConfigPath);
    expect(loadedConfig).toEqual(mockConfig);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`找到配置文件: ${tsConfigPath}`));
  });

  it('should auto-find and load mp-analyzer.config.json if .js and .ts dont exist', async () => {
    const jsConfigPath = actualPath.join(projectRoot, 'mp-analyzer.config.js');
    const tsConfigPath = actualPath.join(projectRoot, 'mp-analyzer.config.ts');
    const jsonConfigPath = actualPath.join(projectRoot, 'mp-analyzer.config.json');
    const jsonContent = JSON.stringify(mockConfig);

    (fs.existsSync as jest.Mock).mockImplementation((p) => p === jsonConfigPath); // Only JSON exists
    (fs.readFileSync as jest.Mock).mockReturnValue(jsonContent);

    const loadedConfig = await ConfigLoader.loadConfig(undefined, projectRoot);

    expect(fs.existsSync).toHaveBeenCalledWith(jsConfigPath);
    expect(fs.existsSync).toHaveBeenCalledWith(tsConfigPath);
    expect(fs.existsSync).toHaveBeenCalledWith(jsonConfigPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(jsonConfigPath, 'utf-8');
    expect(loadedConfig).toEqual(mockConfig);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining(`找到配置文件: ${jsonConfigPath}`));
  });

  it('should return null if specified config path loading fails (e.g., read error)', async () => {
    const configPath = 'non-existent-config.json';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);
    const readError = new Error('ENOENT: File not found');
    (fs.readFileSync as jest.Mock).mockImplementation(() => { throw readError; });

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`加载配置文件失败: ${readError.message}`));
  });

  it('should return null if no config file is found during auto-search', async () => {
    (fs.existsSync as jest.Mock).mockReturnValue(false); // None exist

    const loadedConfig = await ConfigLoader.loadConfig(undefined, projectRoot);

    expect(loadedConfig).toBeNull();
    expect(fs.existsSync).toHaveBeenCalledTimes(3); // Checked all 3 types
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('未找到配置文件，将使用默认配置'));
  });

  it('should return null and log error if JSON parsing fails', async () => {
    const configPath = 'invalid.json';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);
    (fs.readFileSync as jest.Mock).mockReturnValue('invalid json content {');
    const parseError = new SyntaxError('Unexpected token { in JSON at position 21'); // Example error

     // Need to actually call JSON.parse to get the error correctly
     const originalJsonParse = JSON.parse;
     // eslint-disable-next-line @typescript-eslint/no-explicit-any
     (JSON.parse as any) = jest.fn().mockImplementation(() => { throw parseError; });


    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
    expect(fs.readFileSync).toHaveBeenCalledWith(fullConfigPath, 'utf-8');
    expect(JSON.parse).toHaveBeenCalledWith('invalid json content {');
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`解析JSON配置文件失败: ${parseError.message}`));

    // Restore original JSON.parse
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (JSON.parse as any) = originalJsonParse;
  });

  it('should return null and log error if JS loading fails (require throws)', async () => {
    const configPath = 'error.js';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);
    const loadError = new Error('Syntax Error in JS');
    // Ensure path comparison in mock is robust
    mockRequire.mockImplementation((id) => {
        const resolvedId = actualPath.resolve(id);
        if (resolvedId === fullConfigPath) throw loadError;
        if (id === 'ts-node') return { register: mockTsNodeRegister };
        throw new Error(`Unexpected require: ${id} (resolved: ${resolvedId})`);
    });

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
    expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`加载JavaScript配置文件失败: ${loadError.message}`));
  });

  it('should return null and log error if TS loading fails because ts-node require fails', async () => {
    const configPath = 'config.ts';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath); // Need path for extname check
    const tsNodeError = new Error('Cannot find module ts-node');

    // Resolve path being required
    mockRequire.mockImplementation((id) => {
        if (id === 'ts-node') throw tsNodeError; // Check module name first
        const resolvedId = actualPath.resolve(id);
        // We shouldn't reach the require for fullConfigPath if ts-node fails
        if (resolvedId === fullConfigPath) throw new Error('Should not require config if ts-node fails');
        throw new Error(`Unexpected require: ${id} (resolved: ${resolvedId})`);
    });

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
    // Check that we attempted to require ts-node
    expect(mockRequire).toHaveBeenCalledWith('ts-node');
    // Check the specific error logged by the catch block around ts-node require
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`加载TypeScript配置需要安装ts-node: ${tsNodeError.message}`));
    // Check the outer error log message
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('加载TypeScript配置文件失败'));

  });

  it('should return null and log warning for unsupported config file extensions', async () => {
    const configPath = 'config.yaml';
    // No need to mock readFileSync or require as it should fail on ext check

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(loadedConfig).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('不支持的配置文件格式: .yaml'));
    // Ensure no read/require attempts were made for unsupported type
    expect(fs.readFileSync).not.toHaveBeenCalled();
    expect(mockRequire).not.toHaveBeenCalledWith(expect.stringContaining('config.yaml'));

  });

});