import { FileParser } from '../../src/parser/file-parser';
import { AnalyzerOptions } from '../../src/types/command-options';

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
      fileTypes: ['js', 'json', 'wxml', 'wxss'],
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
});
