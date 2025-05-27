import * as fs from 'fs';
import * as path from 'path';
import { purgewxss } from '../../src/commands/purgewxss';
import { GlobalCliOptions } from '../../src/types/command-options';
import { HandledError } from '../../src/utils/errors';

describe('PurgeWXSS Command Integration Tests', () => {
  const testProjectRoot = path.resolve(__dirname, '../fixtures/basic-ts');
  const tempDir = path.resolve(__dirname, '../temp');

  beforeAll(() => {
    // 确保临时目录存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  beforeEach(() => {
    // 确保每个测试前临时目录都存在
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理测试文件，但保留目录
    if (fs.existsSync(tempDir)) {
      try {
        const files = fs.readdirSync(tempDir);
        files.forEach((file) => {
          const filePath = path.join(tempDir, file);
          const stat = fs.statSync(filePath);
          if (stat.isFile()) {
            fs.unlinkSync(filePath);
          }
        });
      } catch (error) {
        // 忽略清理错误
      }
    }
  });

  afterAll(() => {
    // 最后清理整个临时目录
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (error) {
        // 忽略清理错误
      }
    }
  });

  const baseCliOptions: GlobalCliOptions = {
    project: tempDir, // 使用临时目录作为项目根目录
    miniappRoot: '.',
    verboseLevel: 0,
    verbose: false,
    exclude: [],
    includeAssets: false,
  };

  describe('Specific File Processing', () => {
    it('should process specific WXSS file', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'test.wxml');
      const testWxssPath = path.join(tempDir, 'test.wxss');
      const appJsonPath = path.join(tempDir, 'app.json');

      fs.writeFileSync(testWxmlPath, '<view class="container">Hello World</view>');
      fs.writeFileSync(testWxssPath, '.container { color: red; }\n.unused { display: none; }');
      fs.writeFileSync(appJsonPath, JSON.stringify({ pages: [] }, null, 2));

      // 不使用 try-finally，让 afterEach 处理清理
      await purgewxss(baseCliOptions, testWxssPath);

      // 验证文件仍然存在（没有 --write 选项）
      expect(fs.existsSync(testWxssPath)).toBe(true);

      // 原始内容应该保持不变（没有 --write 选项）
      const content = fs.readFileSync(testWxssPath, 'utf-8');
      expect(content).toContain('.container');
      expect(content).toContain('.unused');
    });

    it('should process and write changes when --write option is enabled', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'write-test.wxml');
      const testWxssPath = path.join(tempDir, 'write-test.wxss');
      const appJsonPath = path.join(tempDir, 'app.json');

      fs.writeFileSync(testWxmlPath, '<view class="used">Content</view>');
      fs.writeFileSync(testWxssPath, '.used { color: blue; }\n.unused { display: none; }');
      fs.writeFileSync(appJsonPath, JSON.stringify({ pages: [] }, null, 2));

      await purgewxss(baseCliOptions, testWxssPath, { write: true });

      // 验证文件被修改
      expect(fs.existsSync(testWxssPath)).toBe(true);
      const content = fs.readFileSync(testWxssPath, 'utf-8');
      expect(content).toContain('.used');
      // 未使用的样式应该被移除
      expect(content).not.toContain('.unused');
    });
  });

  describe('Error Handling', () => {
    it('should throw HandledError for non-existent file', async () => {
      const nonExistentPath = '/nonexistent/file.wxss';

      // 使用真实存在的项目根目录
      const validCliOptions: GlobalCliOptions = {
        ...baseCliOptions,
        project: testProjectRoot, // 使用测试项目根目录而不是 tempDir
      };

      await expect(purgewxss(validCliOptions, nonExistentPath)).rejects.toThrow(HandledError);

      await expect(purgewxss(validCliOptions, nonExistentPath)).rejects.toThrow('WXSS 文件未找到');
    });

    it('should throw HandledError for non-WXSS file', async () => {
      // 创建非 WXSS 文件
      const nonWxssFile = path.join(tempDir, 'test.js');
      fs.writeFileSync(nonWxssFile, 'console.log("test");');

      // 期望的错误是文件类型错误，而不是文件未找到
      await expect(purgewxss(baseCliOptions, nonWxssFile)).rejects.toThrow(HandledError);

      await expect(purgewxss(baseCliOptions, nonWxssFile)).rejects.toThrow(
        '输入文件不是 .wxss 文件',
      );
    });

    it('should throw HandledError for directory instead of file', async () => {
      // 创建目录
      const testDir = path.join(tempDir, 'test-directory');
      fs.mkdirSync(testDir, { recursive: true });

      await expect(purgewxss(baseCliOptions, testDir)).rejects.toThrow(HandledError);

      await expect(purgewxss(baseCliOptions, testDir)).rejects.toThrow(
        '指定的 WXSS 输入不是一个文件',
      );
    });
  });

  describe('Whole Project Processing', () => {
    it('should process all WXSS files in project when no specific file provided', async () => {
      // 创建项目结构
      const appJsonPath = path.join(tempDir, 'app.json');
      const wxssPath1 = path.join(tempDir, 'page1.wxss');
      const wxmlPath1 = path.join(tempDir, 'page1.wxml');
      const wxssPath2 = path.join(tempDir, 'page2.wxss');
      const wxmlPath2 = path.join(tempDir, 'page2.wxml');

      fs.writeFileSync(appJsonPath, JSON.stringify({ pages: [] }, null, 2));
      fs.writeFileSync(wxmlPath1, '<view class="page1">Page 1</view>');
      fs.writeFileSync(wxssPath1, '.page1 { color: red; }');
      fs.writeFileSync(wxmlPath2, '<view class="page2">Page 2</view>');
      fs.writeFileSync(wxssPath2, '.page2 { color: blue; }');

      await purgewxss(baseCliOptions);

      // 验证文件仍然存在
      expect(fs.existsSync(wxssPath1)).toBe(true);
      expect(fs.existsSync(wxssPath2)).toBe(true);
    });

    it('should handle project with no WXSS files', async () => {
      // 创建只有 app.json 的项目
      const appJsonPath = path.join(tempDir, 'app.json');
      fs.writeFileSync(appJsonPath, JSON.stringify({ pages: [] }, null, 2));

      // 应该正常完成，不抛出错误
      await expect(purgewxss(baseCliOptions)).resolves.not.toThrow();
    });
  });

  describe('Position Parameter Handling', () => {
    it('should handle position parameter correctly', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'position.wxml');
      const testWxssPath = path.join(tempDir, 'position.wxss');
      const appJsonPath = path.join(tempDir, 'app.json');

      fs.writeFileSync(testWxmlPath, '<view class="position-test">Test</view>');
      fs.writeFileSync(testWxssPath, '.position-test { color: green; }');
      fs.writeFileSync(appJsonPath, JSON.stringify({ pages: [] }, null, 2));

      // 测试位置参数
      await purgewxss(baseCliOptions, testWxssPath);

      // 验证文件存在且内容正确
      expect(fs.existsSync(testWxssPath)).toBe(true);
      const content = fs.readFileSync(testWxssPath, 'utf-8');
      expect(content).toContain('.position-test');
    });

    it('should fallback to cmdOptions when position parameter is not provided', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'fallback.wxml');
      const testWxssPath = path.join(tempDir, 'fallback.wxss');
      const appJsonPath = path.join(tempDir, 'app.json');

      fs.writeFileSync(testWxmlPath, '<view class="fallback-test">Test</view>');
      fs.writeFileSync(testWxssPath, '.fallback-test { color: purple; }');
      fs.writeFileSync(appJsonPath, JSON.stringify({ pages: [] }, null, 2));

      // 测试通过 cmdOptions 传递路径
      await purgewxss(baseCliOptions, undefined, { wxssFilePathInput: testWxssPath });

      // 验证文件存在且内容正确
      expect(fs.existsSync(testWxssPath)).toBe(true);
      const content = fs.readFileSync(testWxssPath, 'utf-8');
      expect(content).toContain('.fallback-test');
    });
  });

  describe('File Path Resolution', () => {
    it('should handle absolute file paths', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'absolute.wxml');
      const testWxssPath = path.join(tempDir, 'absolute.wxss');
      const appJsonPath = path.join(tempDir, 'app.json');

      fs.writeFileSync(testWxmlPath, '<view class="absolute-test">Test</view>');
      fs.writeFileSync(testWxssPath, '.absolute-test { color: orange; }');
      fs.writeFileSync(appJsonPath, JSON.stringify({ pages: [] }, null, 2));

      // 使用绝对路径
      const absolutePath = path.resolve(testWxssPath);
      await purgewxss(baseCliOptions, absolutePath);

      expect(fs.existsSync(testWxssPath)).toBe(true);
    });

    it('should handle relative file paths', async () => {
      // 创建测试文件
      const testWxmlPath = path.join(tempDir, 'relative.wxml');
      const testWxssPath = path.join(tempDir, 'relative.wxss');
      const appJsonPath = path.join(tempDir, 'app.json');

      fs.writeFileSync(testWxmlPath, '<view class="relative-test">Test</view>');
      fs.writeFileSync(testWxssPath, '.relative-test { color: pink; }');
      fs.writeFileSync(appJsonPath, JSON.stringify({ pages: [] }, null, 2));

      const originalCwd = process.cwd();
      process.chdir(tempDir);

      try {
        // 使用相对路径
        await purgewxss(baseCliOptions, 'relative.wxss');

        expect(fs.existsSync(testWxssPath)).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
