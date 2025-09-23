import { LessParser } from '../../src/parser/less-parser';

describe('LessParser', () => {
  let parser: LessParser;

  beforeEach(() => {
    parser = new LessParser();
  });

  describe('parse', () => {
    it('should parse @import statements', async () => {
      const content = `
        @import "variables.less";
        @import 'mixins.less';
        @import "components/button.less";
      `;

      const dependencies = await parser.parse(content, 'test.less');

      expect(dependencies).toEqual(['variables.less', 'mixins.less', 'components/button.less']);
    });

    it('should parse url() references', async () => {
      const content = `
        .background {
          background-image: url('images/bg.png');
          background-image: url("icons/arrow.svg");
        }
      `;

      const dependencies = await parser.parse(content, 'test.less');

      expect(dependencies).toEqual(['images/bg.png', 'icons/arrow.svg']);
    });

    it('should ignore data URLs and external URLs', async () => {
      const content = `
        .test {
          background: url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==);
          background: url(https://example.com/image.png);
          background: url(http://example.com/image.png);
        }
      `;

      const dependencies = await parser.parse(content, 'test.less');

      expect(dependencies).toEqual([]);
    });

    it('should ignore template variables in URLs', async () => {
      const content = `
        .test {
          background: url({{imageUrl}});
          background: url({{baseUrl}}/image.png);
        }
      `;

      const dependencies = await parser.parse(content, 'test.less');

      expect(dependencies).toEqual([]);
    });

    it('should handle mixed content', async () => {
      const content = `
        @import "variables.less";
        
        .component {
          background: url('images/bg.jpg');
          @import "mixins.less";
        }
      `;

      const dependencies = await parser.parse(content, 'test.less');

      expect(dependencies).toEqual(['variables.less', 'mixins.less', 'images/bg.jpg']);
    });

    it('should handle empty content', async () => {
      const dependencies = await parser.parse('', 'test.less');
      expect(dependencies).toEqual([]);
    });

    it('should handle content with no dependencies', async () => {
      const content = `
        .class {
          color: red;
          font-size: 14px;
        }
      `;

      const dependencies = await parser.parse(content, 'test.less');
      expect(dependencies).toEqual([]);
    });
  });
});
