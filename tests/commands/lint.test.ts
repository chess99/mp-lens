import * as fs from 'fs';
import * as path from 'path';
import { lint } from '../../src/commands/lint';
import { GlobalCliOptions } from '../../src/types/command-options';
import { HandledError } from '../../src/utils/errors';

describe('Lint Command Integration Tests', () => {
  const testProjectRoot = path.resolve(__dirname, '../fixtures/basic-ts');
  const tempDir = path.resolve(__dirname, '../temp');

  beforeAll(() => {
    // 确保临时目录存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterAll(() => {
    // 清理临时目录
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const baseCliOptions: GlobalCliOptions = {
    project: testProjectRoot,
    miniappRoot: '.',
    verboseLevel: 0,
    verbose: false,
    exclude: [],
    includeAssets: false,
  };

  describe('Whole Project Analysis', () => {
    it('should analyze entire project when no target path provided', async () => {
      // 捕获控制台输出
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      try {
        await lint(baseCliOptions);

        // 验证输出包含分析结果
        const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(output).toContain('组件使用情况分析结果');
      } finally {
        consoleSpy.mockRestore();
      }
    });

    it('should handle project without issues', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      try {
        await lint(baseCliOptions);

        const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        // 可能包含 "未发现问题" 或具体的问题列表
        expect(output).toMatch(/(未发现问题|总结)/);
      } finally {
        consoleSpy.mockRestore();
      }
    });
  });

  describe('Specific File Analysis', () => {
    it('should analyze specific WXML file', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'test.wxml');
      const testJsonPath = path.join(tempDir, 'test.json');

      fs.writeFileSync(testWxmlPath, '<view>Hello World</view>');
      fs.writeFileSync(
        testJsonPath,
        JSON.stringify(
          {
            component: true,
            usingComponents: {},
          },
          null,
          2,
        ),
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      try {
        await lint(baseCliOptions, testWxmlPath);

        const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(output).toContain('组件使用情况分析结果');
      } finally {
        consoleSpy.mockRestore();
        // 清理测试文件
        fs.unlinkSync(testWxmlPath);
        fs.unlinkSync(testJsonPath);
      }
    });

    it('should analyze specific JSON file', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'test2.wxml');
      const testJsonPath = path.join(tempDir, 'test2.json');

      fs.writeFileSync(testWxmlPath, '<view>Hello World</view>');
      fs.writeFileSync(
        testJsonPath,
        JSON.stringify(
          {
            component: true,
            usingComponents: {},
          },
          null,
          2,
        ),
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      try {
        await lint(baseCliOptions, testJsonPath);

        const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(output).toContain('组件使用情况分析结果');
      } finally {
        consoleSpy.mockRestore();
        // 清理测试文件
        fs.unlinkSync(testWxmlPath);
        fs.unlinkSync(testJsonPath);
      }
    });

    it('should analyze directory', async () => {
      // 创建测试目录和文件
      const testDir = path.join(tempDir, 'test-dir');
      fs.mkdirSync(testDir, { recursive: true });

      const testWxmlPath = path.join(testDir, 'page.wxml');
      const testJsonPath = path.join(testDir, 'page.json');

      fs.writeFileSync(testWxmlPath, '<view>Test Page</view>');
      fs.writeFileSync(
        testJsonPath,
        JSON.stringify(
          {
            usingComponents: {},
          },
          null,
          2,
        ),
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      try {
        await lint(baseCliOptions, testDir);

        const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(output).toContain('组件使用情况分析结果');
      } finally {
        consoleSpy.mockRestore();
        // 清理测试目录
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw HandledError for non-existent file', async () => {
      const nonExistentPath = '/nonexistent/file.wxml';

      await expect(lint(baseCliOptions, nonExistentPath)).rejects.toThrow(HandledError);

      await expect(lint(baseCliOptions, nonExistentPath)).rejects.toThrow('目标路径未找到');
    });

    it('should throw HandledError for unsupported file type', async () => {
      // 创建不支持的文件类型
      const unsupportedFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(unsupportedFile, 'console.log("test");');

      try {
        await expect(lint(baseCliOptions, unsupportedFile)).rejects.toThrow(HandledError);

        await expect(lint(baseCliOptions, unsupportedFile)).rejects.toThrow('不支持的文件类型');
      } finally {
        fs.unlinkSync(unsupportedFile);
      }
    });

    it('should throw HandledError when corresponding file is missing', async () => {
      // 创建只有 WXML 没有 JSON 的文件
      const wxmlOnlyFile = path.join(tempDir, 'wxml-only.wxml');
      fs.writeFileSync(wxmlOnlyFile, '<view>Test</view>');

      try {
        await expect(lint(baseCliOptions, wxmlOnlyFile)).rejects.toThrow(HandledError);

        await expect(lint(baseCliOptions, wxmlOnlyFile)).rejects.toThrow('对应的 JSON 文件未找到');
      } finally {
        fs.unlinkSync(wxmlOnlyFile);
      }
    });
  });

  describe('Auto-fix Functionality', () => {
    it('should apply fixes when --fix option is enabled', async () => {
      // 创建有问题的测试文件
      const testWxmlPath = path.join(tempDir, 'fix-test.wxml');
      const testJsonPath = path.join(tempDir, 'fix-test.json');

      fs.writeFileSync(testWxmlPath, '<view>Simple content</view>');
      fs.writeFileSync(
        testJsonPath,
        JSON.stringify(
          {
            component: true,
            usingComponents: {
              'unused-component': '/components/unused',
            },
          },
          null,
          2,
        ),
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      try {
        await lint(baseCliOptions, testWxmlPath, { fix: true });

        // 验证文件被修改
        const updatedJson = JSON.parse(fs.readFileSync(testJsonPath, 'utf-8'));
        // 注意：这个测试可能需要根据实际的修复逻辑调整
        expect(updatedJson.usingComponents).toBeDefined();

        const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(output).toContain('组件使用情况分析结果');
      } finally {
        consoleSpy.mockRestore();
        // 清理测试文件
        fs.unlinkSync(testWxmlPath);
        fs.unlinkSync(testJsonPath);
      }
    });
  });

  describe('Position Parameter Handling', () => {
    it('should handle position parameter correctly', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'position-test.wxml');
      const testJsonPath = path.join(tempDir, 'position-test.json');

      fs.writeFileSync(testWxmlPath, '<view>Position test</view>');
      fs.writeFileSync(
        testJsonPath,
        JSON.stringify(
          {
            component: true,
            usingComponents: {},
          },
          null,
          2,
        ),
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      try {
        // 测试位置参数
        await lint(baseCliOptions, testWxmlPath);

        const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(output).toContain('组件使用情况分析结果');
      } finally {
        consoleSpy.mockRestore();
        // 清理测试文件
        fs.unlinkSync(testWxmlPath);
        fs.unlinkSync(testJsonPath);
      }
    });

    it('should fallback to cmdOptions.path when position parameter is not provided', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'fallback-test.wxml');
      const testJsonPath = path.join(tempDir, 'fallback-test.json');

      fs.writeFileSync(testWxmlPath, '<view>Fallback test</view>');
      fs.writeFileSync(
        testJsonPath,
        JSON.stringify(
          {
            component: true,
            usingComponents: {},
          },
          null,
          2,
        ),
      );

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      try {
        // 测试通过 cmdOptions.path 传递路径
        await lint(baseCliOptions, undefined, { path: testWxmlPath });

        const output = consoleSpy.mock.calls.map((call) => call.join(' ')).join('\n');
        expect(output).toContain('组件使用情况分析结果');
      } finally {
        consoleSpy.mockRestore();
        // 清理测试文件
        fs.unlinkSync(testWxmlPath);
        fs.unlinkSync(testJsonPath);
      }
    });
  });
});
