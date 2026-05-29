import { FileParser } from '../../src/parser/file-parser';
import { AnalyzerOptions } from '../../src/types/command-options';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// 暴露私有方法进行测试的技巧
class TestableFileParser extends FileParser {
  public testIsImagePath(filePath: string): boolean {
    // @ts-expect-error - 访问私有方法用于测试
    return this.isImagePath(filePath);
  }
}

describe('FileParser', () => {
  let parser: TestableFileParser;

  beforeEach(() => {
    const options: AnalyzerOptions = {
      miniappRoot: '/test/project',
      appJsonPath: '/test/project/app.json',
    };
    parser = new TestableFileParser('/test/project', options);
  });

  describe('isImagePath', () => {
    it('should correctly identify image files by extension', () => {
      // 正确的图片文件
      expect(parser.testIsImagePath('logo.png')).toBe(true);
      expect(parser.testIsImagePath('avatar.jpg')).toBe(true);
      expect(parser.testIsImagePath('icon.jpeg')).toBe(true);
      expect(parser.testIsImagePath('banner.gif')).toBe(true);
      expect(parser.testIsImagePath('vector.svg')).toBe(true);
      expect(parser.testIsImagePath('photo.webp')).toBe(true);

      // 带路径的图片文件
      expect(parser.testIsImagePath('./images/logo.png')).toBe(true);
      expect(parser.testIsImagePath('/assets/avatar.jpg')).toBe(true);
      expect(parser.testIsImagePath('../icons/menu.svg')).toBe(true);
    });

    it('should not identify non-image files as images', () => {
      // 明显的非图片文件
      expect(parser.testIsImagePath('script.js')).toBe(false);
      expect(parser.testIsImagePath('style.css')).toBe(false);
      expect(parser.testIsImagePath('config.json')).toBe(false);
      expect(parser.testIsImagePath('template.html')).toBe(false);
      expect(parser.testIsImagePath('data.txt')).toBe(false);
    });

    it('should handle edge cases with image-like names correctly', () => {
      // 包含图片扩展名但不是图片的文件（这是关键测试）
      expect(parser.testIsImagePath('myimage.jpg.js')).toBe(false);
      expect(parser.testIsImagePath('avatar.png.component.js')).toBe(false);
      expect(parser.testIsImagePath('icon.svg.backup')).toBe(false);
      expect(parser.testIsImagePath('photo.webp.ts')).toBe(false);

      // 包含图片相关词汇但不是图片的文件
      expect(parser.testIsImagePath('ImageUploader.js')).toBe(false);
      expect(parser.testIsImagePath('iconHelpers.ts')).toBe(false);
      expect(parser.testIsImagePath('avatar/index.js')).toBe(false);
      expect(parser.testIsImagePath('logoService.json')).toBe(false);
      expect(parser.testIsImagePath('components/image-viewer.js')).toBe(false);
    });

    it('should handle case insensitive extensions', () => {
      expect(parser.testIsImagePath('LOGO.PNG')).toBe(true);
      expect(parser.testIsImagePath('Avatar.JPG')).toBe(true);
      expect(parser.testIsImagePath('Icon.Svg')).toBe(true);
      expect(parser.testIsImagePath('banner.GIF')).toBe(true);
    });

    it('should handle files without extensions', () => {
      expect(parser.testIsImagePath('logo')).toBe(false);
      expect(parser.testIsImagePath('image')).toBe(false);
      expect(parser.testIsImagePath('/path/to/file')).toBe(false);
    });

    it('should handle empty and special paths', () => {
      expect(parser.testIsImagePath('')).toBe(false);
      expect(parser.testIsImagePath('.')).toBe(false);
      expect(parser.testIsImagePath('..')).toBe(false);
      expect(parser.testIsImagePath('.hidden.png')).toBe(true);
    });
  });

  describe('parseFile', () => {
    function createFixture(files: Record<string, string>) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mp-lens-parser-'));
      for (const [relativePath, content] of Object.entries(files)) {
        const absolutePath = path.join(root, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, content);
      }
      const options: AnalyzerOptions = {
        miniappRoot: root,
        appJsonPath: path.join(root, 'app.json'),
      };
      return { root, parser: new FileParser(root, options) };
    }

    it('returns resolved dependencies with dependency kinds', async () => {
      const { root, parser } = createFixture({
        'pages/index/index.js': "const util = require('../../utils/util');\n",
        'pages/index/index.wxml':
          '<import src="../../templates/card.wxml" /><image src="../../assets/logo.png" />',
        'pages/index/index.wxss':
          "@import 'base.wxss';\n.icon{background:url('../../assets/icon.svg')}",
        'pages/index/base.wxss': '',
        'utils/util.js': '',
        'templates/card.wxml': '<view />',
        'assets/logo.png': '',
        'assets/icon.svg': '',
      });

      await expect(parser.parseFile(path.join(root, 'pages/index/index.js'))).resolves.toEqual([
        expect.objectContaining({
          kind: 'script',
          rawPath: '../../utils/util',
          targetFile: path.join(root, 'utils/util.js'),
        }),
      ]);

      await expect(parser.parseFile(path.join(root, 'pages/index/index.wxml'))).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'template',
            rawPath: '../../templates/card.wxml',
            targetFile: path.join(root, 'templates/card.wxml'),
          }),
          expect.objectContaining({
            kind: 'resource',
            rawPath: '../../assets/logo.png',
            targetFile: path.join(root, 'assets/logo.png'),
          }),
        ]),
      );

      await expect(parser.parseFile(path.join(root, 'pages/index/index.wxss'))).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'style',
            rawPath: 'base.wxss',
            targetFile: path.join(root, 'pages/index/base.wxss'),
          }),
          expect.objectContaining({
            kind: 'resource',
            rawPath: '../../assets/icon.svg',
            targetFile: path.join(root, 'assets/icon.svg'),
          }),
        ]),
      );
    });
  });
});
