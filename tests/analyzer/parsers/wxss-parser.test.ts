import { WXSSParser } from '../../../src/analyzer/parsers/wxss-parser';

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

describe('WXSSParser', () => {
  let parser: WXSSParser;

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new WXSSParser();
  });

  describe('parse', () => {
    it('should parse @import statements', async () => {
      const filePath = actualPath.resolve('/project', 'styles/main.wxss');
      const content = `
        @import "base.wxss";
        @import './components/button.wxss';
        @import "../common/reset.wxss";
        @import "/styles/theme.wxss";
        
        .container {
          padding: 20px;
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        'base.wxss',
        './components/button.wxss',
        '../common/reset.wxss',
        '/styles/theme.wxss',
      ]);
    });

    it('should parse url() references in CSS', async () => {
      const filePath = actualPath.resolve('/project', 'styles/main.wxss');
      const content = `
        .background {
          background-image: url('images/bg.png');
        }
        
        .icon {
          background: url("../assets/icon.svg");
        }
        
        .logo {
          background-image: url(/images/logo.jpg);
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['images/bg.png', '../assets/icon.svg', '/images/logo.jpg']);
    });

    it('should parse mixed @import and url() references', async () => {
      const filePath = actualPath.resolve('/project', 'styles/main.wxss');
      const content = `
        @import "base.wxss";
        @import './theme.wxss';
        
        .header {
          background-image: url('images/header-bg.png');
        }
        
        @import "../common/utils.wxss";
        
        .footer {
          background: url("images/footer-bg.jpg");
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        'base.wxss',
        './theme.wxss',
        '../common/utils.wxss',
        'images/header-bg.png',
        'images/footer-bg.jpg',
      ]);
    });

    it('should skip data URIs', async () => {
      const filePath = actualPath.resolve('/project', 'styles/main.wxss');
      const content = `
        .icon {
          background-image: url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYi');
        }
        
        .normal {
          background-image: url('images/normal.png');
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['images/normal.png']);
    });

    it('should skip HTTP/HTTPS URLs', async () => {
      const filePath = actualPath.resolve('/project', 'styles/main.wxss');
      const content = `
        .remote {
          background-image: url('https://example.com/image.png');
        }
        
        .another-remote {
          background: url("http://cdn.example.com/bg.jpg");
        }
        
        .local {
          background-image: url('images/local.png');
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['images/local.png']);
    });

    it('should skip template expressions', async () => {
      const filePath = actualPath.resolve('/project', 'styles/main.wxss');
      const content = `
        .dynamic {
          background-image: url('{{imageUrl}}');
        }
        
        .another-dynamic {
          background: url("images/{{theme}}/bg.png");
        }
        
        .static {
          background-image: url('images/static.png');
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['images/static.png']);
    });

    it('should handle various quote styles', async () => {
      const filePath = actualPath.resolve('/project', 'styles/main.wxss');
      const content = `
        @import 'single-quotes.wxss';
        @import "double-quotes.wxss";
        
        .bg1 {
          background: url('single-quotes.png');
        }
        
        .bg2 {
          background: url("double-quotes.png");
        }
        
        .bg3 {
          background: url(no-quotes.png);
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        'single-quotes.wxss',
        'double-quotes.wxss',
        'single-quotes.png',
        'double-quotes.png',
        'no-quotes.png',
      ]);
    });

    it('should handle empty content', async () => {
      const filePath = actualPath.resolve('/project', 'styles/empty.wxss');
      const content = '';

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([]);
    });

    it('should handle content with no imports or urls', async () => {
      const filePath = actualPath.resolve('/project', 'styles/simple.wxss');
      const content = `
        .container {
          padding: 20px;
          margin: 10px;
          color: #333;
        }
        
        .button {
          background-color: #007aff;
          border-radius: 4px;
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([]);
    });

    it('should handle malformed CSS gracefully', async () => {
      const filePath = actualPath.resolve('/project', 'styles/malformed.wxss');
      const content = `
        @import "valid.wxss";
        
        .incomplete {
          background: url('image.png'
        
        @import "another-valid.wxss";
      `;

      const dependencies = await parser.parse(content, filePath);

      // Should still extract valid imports/urls even with malformed CSS
      expect(dependencies).toEqual(['valid.wxss', 'another-valid.wxss']);
    });
  });
});
