import { WXMLParser } from '../../src/parser/wxml-parser';

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

describe('WXMLParser', () => {
  let parser: WXMLParser;

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new WXMLParser();
  });

  describe('parse', () => {
    it('should parse import statements', async () => {
      const filePath = actualPath.resolve('/project', 'pages/index/index.wxml');
      const content = `
        <import src="../../templates/header.wxml" />
        <import src="../common/footer.wxml" />
        <import src="/templates/sidebar.wxml" />
        <import src="components/button.wxml" />
        
        <view class="container">
          <template is="header" />
          <template is="footer" />
        </view>
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        '../../templates/header.wxml',
        '../common/footer.wxml',
        '/templates/sidebar.wxml',
        './components/button.wxml',
      ]);
    });

    it('should parse include statements', async () => {
      const filePath = actualPath.resolve('/project', 'pages/index/index.wxml');
      const content = `
        <include src="../../templates/header.wxml" />
        <include src="../common/footer.wxml" />
        <include src="/templates/sidebar.wxml" />
        
        <view class="container">
          <text>Content</text>
        </view>
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        '../../templates/header.wxml',
        '../common/footer.wxml',
        '/templates/sidebar.wxml',
      ]);
    });

    it('should parse wxs tags', async () => {
      const filePath = actualPath.resolve('/project', 'pages/index/index.wxml');
      const content = `
        <wxs module="utils" src="../../utils/format.wxs"></wxs>
        <wxs module="math" src="../common/math.wxs"></wxs>
        <wxs module="helper" src="/utils/helper.wxs"></wxs>
        
        <view class="container">
          <text>{{utils.formatDate(date)}}</text>
        </view>
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        '../../utils/format.wxs',
        '../common/math.wxs',
        '/utils/helper.wxs',
      ]);
    });

    it('should parse image sources', async () => {
      const filePath = actualPath.resolve('/project', 'pages/index/index.wxml');
      const content = `
        <view class="container">
          <image src="../../assets/logo.png" />
          <image src="../images/banner.jpg" />
          <image src="/images/icon.svg" />
          <image src="images/avatar.png" />
        </view>
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        '../../assets/logo.png',
        '../images/banner.jpg',
        '/images/icon.svg',
        './images/avatar.png',
      ]);
    });

    it('should parse mixed dependencies', async () => {
      const filePath = actualPath.resolve('/project', 'pages/index/index.wxml');
      const content = `
        <import src="../../templates/header.wxml" />
        <wxs module="utils" src="../utils/format.wxs"></wxs>
        
        <view class="container">
          <template is="header" />
          <image src="images/logo.png" />
          <text>{{utils.formatDate(date)}}</text>
        </view>
        
        <include src="/templates/footer.wxml" />
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        '../../templates/header.wxml',
        '/templates/footer.wxml',
        '../utils/format.wxs',
        './images/logo.png',
      ]);
    });

    it('should skip data URIs in images', async () => {
      const filePath = actualPath.resolve('/project', 'pages/index/index.wxml');
      const content = `
        <view class="container">
          <image src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==" />
          <image src="images/normal.png" />
        </view>
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['./images/normal.png']);
    });

    it('should skip HTTP/HTTPS URLs in images', async () => {
      const filePath = actualPath.resolve('/project', 'pages/index/index.wxml');
      const content = `
        <view class="container">
          <image src="https://example.com/image.png" />
          <image src="http://cdn.example.com/logo.jpg" />
          <image src="images/local.png" />
        </view>
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['./images/local.png']);
    });

    it('should skip template expressions', async () => {
      const filePath = actualPath.resolve('/project', 'pages/index/index.wxml');
      const content = `
        <view class="container">
          <image src="{{imageUrl}}" />
          <image src="images/{{theme}}/bg.png" />
          <image src="images/static.png" />
        </view>
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['./images/static.png']);
    });

    it('should handle empty content', async () => {
      const filePath = actualPath.resolve('/project', 'pages/empty/empty.wxml');
      const content = '';

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([]);
    });

    it('should handle content with no dependencies', async () => {
      const filePath = actualPath.resolve('/project', 'pages/simple/simple.wxml');
      const content = `
        <view class="container">
          <text>Hello World</text>
          <button>Click me</button>
        </view>
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([]);
    });
  });
});
