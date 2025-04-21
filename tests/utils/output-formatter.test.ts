import chalk from 'chalk';
import * as path from 'path';
import { OutputOptions } from '../../src/types/command-options';
import { formatOutput } from '../../src/utils/output-formatter';

// Mock path module
jest.mock('path', () => ({
  ...jest.requireActual('path'), // Keep original methods if needed
  relative: jest.fn((from, to) => to.replace(from + path.sep, '')), // Simple relative path mock
  extname: jest.fn((p) => jest.requireActual('path').extname(p)), // Use actual extname logic initially
}));

// Mock chalk
jest.mock('chalk', () => {
  // Define the mock implementation inside the factory
  const mockChalkInstance = {
    bold: jest.fn((text: string) => `[bold]${text}[/bold]`),
    red: jest.fn((text: string) => `[red]${text}[/red]`),
    yellow: jest.fn((text: string) => `[yellow]${text}[/yellow]`),
    green: jest.fn((text: string) => `[green]${text}[/green]`),
    blue: jest.fn((text: string) => `[blue]${text}[/blue]`),
    gray: jest.fn((text: string) => `[gray]${text}[/gray]`),
    white: jest.fn((text: string) => `[white]${text}[/white]`),
    cyan: jest.fn((text: string) => `[cyan]${text}[/cyan]`),
  };
  // Return the mock instance, potentially wrapped if chalk is a function/class
  // Assuming chalk is an object with methods based on usage
  return mockChalkInstance;
});

describe('Output Formatter', () => {
  const projectRoot = '/path/to/project';
  const unusedFiles = [
    '/path/to/project/src/components/button.wxml',
    '/path/to/project/src/components/button.wxss',
    '/path/to/project/src/pages/index/index.js',
    '/path/to/project/src/utils/unused.ts',
    '/path/to/project/assets/logo.png',
    '/path/to/project/no_extension_file',
  ];
  const emptyUnusedFiles: string[] = [];

  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    // Configure mocks for specific test needs if necessary
    (path.relative as jest.Mock).mockImplementation((from, to) => {
      // Ensure consistent path separators for snapshot testing
      return to
        .replace(from, '')
        .replace(/^[\/\\]/, '')
        .replace(/\\/g, '/');
    });
    (path.extname as jest.Mock).mockImplementation((p) => jest.requireActual('path').extname(p));
  });

  describe('formatAsJson', () => {
    const options: OutputOptions = { format: 'json', projectRoot };

    it('should return correct JSON format for multiple unused files', () => {
      const output = formatOutput(unusedFiles, options);
      const parsedOutput = JSON.parse(output);

      // Fix timestamp before comparison
      expect(parsedOutput.timestamp).toBeDefined();
      delete parsedOutput.timestamp;

      expect(parsedOutput).toEqual({
        unusedFiles: [
          {
            absolutePath: unusedFiles[0],
            relativePath: 'src/components/button.wxml',
            type: 'wxml',
          },
          {
            absolutePath: unusedFiles[1],
            relativePath: 'src/components/button.wxss',
            type: 'wxss',
          },
          { absolutePath: unusedFiles[2], relativePath: 'src/pages/index/index.js', type: 'js' },
          { absolutePath: unusedFiles[3], relativePath: 'src/utils/unused.ts', type: 'ts' },
          { absolutePath: unusedFiles[4], relativePath: 'assets/logo.png', type: 'png' },
          { absolutePath: unusedFiles[5], relativePath: 'no_extension_file', type: '' }, // No extension
        ],
        totalCount: unusedFiles.length,
      });
    });

    it('should return correct JSON format for zero unused files', () => {
      const output = formatOutput(emptyUnusedFiles, options);
      const parsedOutput = JSON.parse(output);

      // Fix timestamp before comparison
      expect(parsedOutput.timestamp).toBeDefined();
      delete parsedOutput.timestamp;

      expect(parsedOutput).toEqual({
        unusedFiles: [],
        totalCount: 0,
      });
    });

    it('should handle files without extensions correctly in JSON', () => {
      const filesWithNoExt = ['/path/to/project/some_file_no_ext'];
      const output = formatOutput(filesWithNoExt, options);
      const parsedOutput = JSON.parse(output);

      // Fix timestamp before comparison
      expect(parsedOutput.timestamp).toBeDefined();
      delete parsedOutput.timestamp;

      expect(parsedOutput).toEqual({
        unusedFiles: [
          { absolutePath: filesWithNoExt[0], relativePath: 'some_file_no_ext', type: '' },
        ],
        totalCount: 1,
      });
    });
  });

  describe('formatAsText', () => {
    const options: OutputOptions = { format: 'text', projectRoot };

    it('should return correct text format for multiple unused files using snapshot', () => {
      const output = formatOutput(unusedFiles, options);
      // Using snapshot testing for complex text output with mocked colors
      expect(output).toMatchSnapshot();
    });

    it('should return specific message for zero unused files', () => {
      const output = formatOutput(emptyUnusedFiles, options);
      // Exact match for the specific message (including mocked color tags)
      expect(output).toBe('[green]未发现未使用的文件。[/green]');
      expect(chalk.green).toHaveBeenCalledWith('未发现未使用的文件。');
    });

    it('should group files by type correctly in text output', () => {
      const unusedFiles = [
        '/path/to/project/src/components/button.wxml',
        '/path/to/project/src/components/button.wxss',
        '/path/to/project/src/pages/index/index.js',
        '/path/to/project/src/utils/unused.ts',
        '/path/to/project/assets/logo.png',
        '/path/to/project/no_extension_file',
      ];
      const options: OutputOptions = { format: 'text', projectRoot };
      const output = formatOutput(unusedFiles, options);
      // Check if type headers are present, including surrounding newlines from the formatter
      expect(output).toContain('[cyan]WXML 文件 (1):\n');
      expect(output).toContain('[cyan]WXSS 文件 (1):\n');
      expect(output).toContain('[cyan]JS 文件 (1):\n');
      expect(output).toContain('[cyan]TS 文件 (1):\n');
      expect(output).toContain('[cyan]PNG 文件 (1):\n');
      expect(output).toContain('[cyan]UNKNOWN 文件 (1):\n');
    });

    it('should handle files without extensions correctly in text output (as UNKNOWN)', () => {
      const projectRoot = '/path/to/project';
      const options: OutputOptions = { format: 'text', projectRoot };
      const filesWithNoExt = ['/path/to/project/some_file_no_ext'];
      const output = formatOutput(filesWithNoExt, options);
      // Remove the leading \n check
      expect(output).toContain('[cyan]UNKNOWN 文件 (1):\n'); // Adjusted
      expect(output).toContain('[white]some_file_no_ext[/white]');
      expect(output).toMatchSnapshot(); // Keep snapshot check
    });
  });
});
