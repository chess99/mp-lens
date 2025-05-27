import * as fs from 'fs';
import * as path from 'path';
import { graph } from '../../src/commands/graph';
import { GlobalCliOptions } from '../../src/types/command-options';
import { HandledError } from '../../src/utils/errors';

describe('Graph Command Integration Tests', () => {
  const testProjectRoot = path.resolve(__dirname, '../fixtures/basic-ts');
  const outputDir = path.resolve(__dirname, '../temp');

  beforeAll(() => {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // 清理生成的文件，但要检查目录是否存在
    if (fs.existsSync(outputDir)) {
      try {
        const files = fs.readdirSync(outputDir);
        files.forEach((file) => {
          if (
            file.includes('graph') ||
            file.includes('test') ||
            file.includes('structure') ||
            file.includes('miniapp') ||
            file.includes('exclude') ||
            file.includes('absolute') ||
            file.includes('relative')
          ) {
            const filePath = path.join(outputDir, file);
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
          }
        });
      } catch (error) {
        // 忽略清理错误
      }
    }
  });

  afterAll(() => {
    // 清理输出目录
    if (fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
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

  describe('HTML Format Generation', () => {
    it('should generate HTML graph with default output path', async () => {
      const outputPath = path.join(outputDir, 'test-graph.html');

      await graph(baseCliOptions, {
        format: 'html',
        output: outputPath,
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('mp-lens');

      // 检查文件大小（HTML 文件应该比较大）
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(1000); // 至少 1KB
    });

    it('should generate HTML graph without output path', async () => {
      // 在临时目录中运行，避免污染项目根目录
      const originalCwd = process.cwd();
      process.chdir(outputDir);

      try {
        await graph(baseCliOptions, {
          format: 'html',
        });

        const defaultPath = path.join(outputDir, 'mp-lens-graph.html');
        expect(fs.existsSync(defaultPath)).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('JSON Format Generation', () => {
    it('should generate JSON graph with specified output path', async () => {
      const outputPath = path.join(outputDir, 'test-graph.json');

      await graph(baseCliOptions, {
        format: 'json',
        output: outputPath,
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');
      const jsonData = JSON.parse(content);

      expect(jsonData).toHaveProperty('nodes');
      expect(jsonData).toHaveProperty('links');
      expect(Array.isArray(jsonData.nodes)).toBe(true);
      expect(Array.isArray(jsonData.links)).toBe(true);
    });

    it('should generate valid JSON structure', async () => {
      const outputPath = path.join(outputDir, 'structure-test.json');

      await graph(baseCliOptions, {
        format: 'json',
        output: outputPath,
      });

      const content = fs.readFileSync(outputPath, 'utf-8');
      const jsonData = JSON.parse(content);

      // 验证节点结构
      if (jsonData.nodes.length > 0) {
        const node = jsonData.nodes[0];
        expect(node).toHaveProperty('id');
        expect(node).toHaveProperty('type');
      }

      // 验证链接结构
      if (jsonData.links.length > 0) {
        const link = jsonData.links[0];
        expect(link).toHaveProperty('source');
        expect(link).toHaveProperty('target');
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw HandledError for unsupported format', async () => {
      await expect(
        graph(baseCliOptions, {
          format: 'xml' as any,
        }),
      ).rejects.toThrow(HandledError);

      await expect(
        graph(baseCliOptions, {
          format: 'xml' as any,
        }),
      ).rejects.toThrow('不支持的输出格式: xml');
    });

    it('should handle invalid project path gracefully', async () => {
      const invalidCliOptions: GlobalCliOptions = {
        ...baseCliOptions,
        project: '/nonexistent/path',
      };

      await expect(
        graph(invalidCliOptions, {
          format: 'html',
        }),
      ).rejects.toThrow();
    });
  });

  describe('Configuration Options', () => {
    it('should respect miniappRoot option', async () => {
      const outputPath = path.join(outputDir, 'miniapp-test.json');

      // 创建 src 子目录和必要的文件
      const srcDir = path.join(outputDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const appJsonPath = path.join(srcDir, 'app.json');
      fs.writeFileSync(appJsonPath, JSON.stringify({ pages: [] }, null, 2));

      const cliOptionsWithMiniappRoot: GlobalCliOptions = {
        ...baseCliOptions,
        project: outputDir, // 使用 outputDir 作为项目根目录
        miniappRoot: 'src', // 指向 src 子目录
      };

      try {
        await graph(cliOptionsWithMiniappRoot, {
          format: 'json',
          output: outputPath,
        });

        expect(fs.existsSync(outputPath)).toBe(true);
      } finally {
        // 清理测试文件
        if (fs.existsSync(srcDir)) {
          fs.rmSync(srcDir, { recursive: true, force: true });
        }
      }
    });

    it('should handle exclude patterns', async () => {
      const outputPath = path.join(outputDir, 'exclude-test.json');

      const cliOptionsWithExclude: GlobalCliOptions = {
        ...baseCliOptions,
        exclude: ['node_modules/**', 'dist/**'],
      };

      await graph(cliOptionsWithExclude, {
        format: 'json',
        output: outputPath,
      });

      expect(fs.existsSync(outputPath)).toBe(true);
      const content = fs.readFileSync(outputPath, 'utf-8');
      const jsonData = JSON.parse(content);

      // 验证排除的文件不在结果中
      const nodeIds = jsonData.nodes.map((node: any) => node.id);
      expect(nodeIds.some((id: string) => id.includes('node_modules'))).toBe(false);
    });
  });

  describe('Output Path Resolution', () => {
    it('should handle absolute output paths', async () => {
      const absolutePath = path.resolve(outputDir, 'absolute-test.html');

      await graph(baseCliOptions, {
        format: 'html',
        output: absolutePath,
      });

      expect(fs.existsSync(absolutePath)).toBe(true);
    });

    it('should handle relative output paths', async () => {
      const originalCwd = process.cwd();
      process.chdir(outputDir);

      try {
        await graph(baseCliOptions, {
          format: 'html',
          output: 'relative-test.html',
        });

        const expectedPath = path.join(outputDir, 'relative-test.html');
        expect(fs.existsSync(expectedPath)).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
