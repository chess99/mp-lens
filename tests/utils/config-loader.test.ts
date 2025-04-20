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
jest.mock('path', () => {
  const actual = jest.requireActual('path');
  return {
    resolve: jest.fn((...args) => actual.resolve(...args)),
    join: jest.fn((...args) => actual.join(...args)),
    extname: jest.fn((p) => actual.extname(p)),
    dirname: jest.fn((p) => actual.dirname(p)),
    relative: jest.fn((...args) => actual.relative(...args)),
    isAbsolute: jest.fn((p) => actual.isAbsolute(p)),
    // Add normalize to ensure path comparisons are consistent
    normalize: jest.fn((p) => actual.normalize(p)),
  };
});

// Mock ts-node register function
const mockTsNodeRegister = jest.fn();
jest.mock('ts-node', () => ({
    register: mockTsNodeRegister,
}), { virtual: true }); // Use virtual mock as ts-node might not be installed

// Mock dynamic require used for .js and .ts files
const mockRequire = jest.fn();
let originalRequire: NodeRequire;

// Helper function to normalize paths for comparison
function normalizePath(p: string): string {
  return actualPath.normalize(p);
}

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
    
    // Setup a more flexible mockRequire implementation
    mockRequire.mockImplementation((id) => {
      // Handle ts-node module
      if (id === 'ts-node') return { register: mockTsNodeRegister };
      
      // Normalize paths for comparison
      const normalizedId = normalizePath(id);
      
      // Create normalized versions of all config paths for robust comparison
      const jsConfigPath = normalizePath(actualPath.join(projectRoot, 'mp-analyzer.config.js'));
      const tsConfigPath = normalizePath(actualPath.join(projectRoot, 'mp-analyzer.config.ts'));
      const myConfigPath = normalizePath(actualPath.resolve(projectRoot, 'my-config.js'));
      const myConfigFuncPath = normalizePath(actualPath.resolve(projectRoot, 'my-config-func.js'));
      const myConfigEsPath = normalizePath(actualPath.resolve(projectRoot, 'my-config-es.js'));
      const myConfigEsFuncPath = normalizePath(actualPath.resolve(projectRoot, 'my-config-es-func.js'));
      const myConfigTsPath = normalizePath(actualPath.resolve(projectRoot, 'my-config.ts'));
      
      // Match based on normalized paths
      if (normalizedId === jsConfigPath) return mockConfig;
      if (normalizedId === tsConfigPath) return mockConfig;
      if (normalizedId === myConfigPath) return mockConfig;
      if (normalizedId === myConfigFuncPath) return jest.fn().mockResolvedValue(mockConfig);
      if (normalizedId === myConfigEsPath) return { default: mockConfig };
      if (normalizedId === myConfigEsFuncPath) return { default: jest.fn().mockResolvedValue(mockConfig) };
      if (normalizedId === myConfigTsPath) return mockConfig;
      
      // For error.js test case
      if (normalizedId.includes('error.js')) {
        throw new Error('Syntax Error in JS');
      }
      
      // Default case
      throw new Error(`Cannot find module '${id}'`);
    });

    // Reset console spies
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); 
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {}); 
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {}); 
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

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
    expect(loadedConfig).toEqual(mockConfig);
  });

  it('should load config from a specified JS file path (function export)', async () => {
    const configPath = 'my-config-func.js';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
    expect(loadedConfig).toEqual(mockConfig);
  });
    
  it('should load config from a specified JS file path (ES module default object export)', async () => {
      const configPath = 'my-config-es.js';
      const fullConfigPath = actualPath.resolve(projectRoot, configPath);
      
      const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);
      
      expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
      expect(loadedConfig).toEqual(mockConfig);
  });

  it('should load config from a specified JS file path (ES module default function export)', async () => {
      const configPath = 'my-config-es-func.js';
      const fullConfigPath = actualPath.resolve(projectRoot, configPath);
      
      const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);
      
      expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
      expect(loadedConfig).toEqual(mockConfig);
  });

  it('should load config from a specified TS file path', async () => {
    const configPath = 'my-config.ts';
    const fullConfigPath = actualPath.resolve(projectRoot, configPath);

    const loadedConfig = await ConfigLoader.loadConfig(configPath, projectRoot);

    expect(mockTsNodeRegister).toHaveBeenCalledTimes(1);
    expect(mockRequire).toHaveBeenCalledWith(fullConfigPath);
    expect(loadedConfig).toEqual(mockConfig);
  });

  it('should auto-find and load mp-analyzer.config.js if exists', async () => {
    const jsConfigPath = actualPath.join(projectRoot, 'mp-analyzer.config.js');
    (fs.existsSync as jest.Mock).mockImplementation((p) => p === jsConfigPath);

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