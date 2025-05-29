import { JavaScriptParser } from '../../src/parser/javascript-parser';

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

describe('WXS Parser (using JavaScriptParser)', () => {
  let parser: JavaScriptParser;

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new JavaScriptParser();
  });

  describe('parse', () => {
    it('should parse require statements in WXS files', async () => {
      const filePath = actualPath.resolve('/project', 'utils/format.wxs');
      const content = `
        var util = require('./util.wxs');
        var math = require('../common/math.wxs');
        
        module.exports = {
          formatTime: function(timestamp) {
            return util.formatNumber(timestamp) + math.round(timestamp);
          }
        };
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['./util.wxs', '../common/math.wxs']);
    });

    it('should parse require statements with absolute paths', async () => {
      const filePath = actualPath.resolve('/project', 'utils/format.wxs');
      const content = `
        var helper = require('/utils/helper.wxs');
        
        module.exports = {
          formatDate: function(date) {
            return helper.formatDate(date);
          }
        };
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['/utils/helper.wxs']);
    });

    it('should handle require statements without extensions', async () => {
      const filePath = actualPath.resolve('/project', 'utils/format.wxs');
      const content = `
        var util = require('./util');
        var math = require('../common/math');
        
        module.exports = {
          formatTime: function(timestamp) {
            return util.formatNumber(timestamp) + math.round(timestamp);
          }
        };
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['./util', '../common/math']);
    });

    it('should handle files with no requires', async () => {
      const filePath = actualPath.resolve('/project', 'utils/constants.wxs');
      const content = `
        var API_URL = 'https://api.example.com';
        var VERSION = '1.0.0';
        
        function helper() {
          return 'helper';
        }
        
        module.exports = {
          API_URL: API_URL,
          VERSION: VERSION,
          helper: helper
        };
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([]);
    });

    it('should handle syntax errors gracefully', async () => {
      const filePath = actualPath.resolve('/project', 'utils/broken.wxs');
      const content = `
        var util = require('./util.wxs');
        
        function broken() {
          // Missing closing brace
          if (true) {
            console.log('test');
        }
      `;

      // Should throw error for malformed syntax
      await expect(parser.parse(content, filePath)).rejects.toThrow();
    });

    it('should handle complex require patterns', async () => {
      const filePath = actualPath.resolve('/project', 'utils/complex.wxs');
      const content = `
        var util = require('./util.wxs');
        
        // This should not be parsed as it's not a direct require call
        var dynamicPath = './dynamic.wxs';
        var dynamic = require(dynamicPath);
        
        // This should be parsed
        var config = require('./config.wxs');
        
        function loadModule(path) {
          // This should not be parsed as path is not a string literal
          return require(path);
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['./util.wxs', './config.wxs']);
    });

    it('should handle empty files', async () => {
      const filePath = actualPath.resolve('/project', 'utils/empty.wxs');
      const content = '';

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([]);
    });

    it('should handle files with only comments', async () => {
      const filePath = actualPath.resolve('/project', 'utils/comments.wxs');
      const content = `
        // This is a comment file
        /* 
         * Multi-line comment
         * with no actual code
         */
        
        // Another comment
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([]);
    });
  });
});
