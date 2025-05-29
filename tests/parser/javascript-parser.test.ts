import { JavaScriptParser } from '../../src/parser/javascript-parser';

// Get actual path module *before* mocking
const actualPath = jest.requireActual('path');

describe('JavaScriptParser', () => {
  let parser: JavaScriptParser;

  beforeEach(() => {
    jest.clearAllMocks();
    parser = new JavaScriptParser();
  });

  describe('parse', () => {
    it('should parse ES6 import statements', async () => {
      const filePath = actualPath.resolve('/project', 'src/utils.js');
      const content = `
        import React from 'react';
        import { Component } from 'react';
        import * as utils from './utils';
        import config from '../config/app.json';
        import './styles.css';
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['react', './utils', '../config/app.json', './styles.css']);
    });

    it('should parse CommonJS require statements', async () => {
      const filePath = actualPath.resolve('/project', 'src/app.js');
      const content = `
        const fs = require('fs');
        const path = require('path');
        const utils = require('./utils');
        const config = require('../config/app.json');
        const helper = require('./helpers/index');
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        'fs',
        'path',
        './utils',
        '../config/app.json',
        './helpers/index',
      ]);
    });

    it('should parse dynamic imports', async () => {
      const filePath = actualPath.resolve('/project', 'src/app.js');
      const content = `
        async function loadModule() {
          const module1 = await import('./module1');
          const module2 = await import('../shared/module2');
          const config = await import('./config.json');
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['./module1', '../shared/module2', './config.json']);
    });

    it('should parse mixed import types', async () => {
      const filePath = actualPath.resolve('/project', 'src/app.js');
      const content = `
        import React from 'react';
        const utils = require('./utils');
        
        async function loadConfig() {
          const config = await import('./config.json');
          return config;
        }
        
        import './styles.css';
        const helper = require('../helpers/index');
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([
        'react',
        './utils',
        './config.json',
        './styles.css',
        '../helpers/index',
      ]);
    });

    it('should handle TypeScript files', async () => {
      const filePath = actualPath.resolve('/project', 'src/app.ts');
      const content = `
        import { Component } from 'react';
        import type { User } from './types';
        import utils from './utils';
        
        interface Config {
          apiUrl: string;
        }
        
        const config: Config = require('./config.json');
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['react', './types', './utils', './config.json']);
    });

    it('should handle WXS files with restricted imports', async () => {
      const filePath = actualPath.resolve('/project', 'src/utils.wxs');
      const content = `
        var helper = require('./helper.wxs');
        var math = require('../common/math.wxs');
        
        module.exports = {
          formatDate: helper.formatDate,
          calculate: math.add
        };
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['./helper.wxs', '../common/math.wxs']);
    });

    it('should handle files with no imports', async () => {
      const filePath = actualPath.resolve('/project', 'src/constants.js');
      const content = `
        const API_URL = 'https://api.example.com';
        const VERSION = '1.0.0';
        
        function helper() {
          return 'helper';
        }
        
        module.exports = {
          API_URL,
          VERSION,
          helper
        };
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([]);
    });

    it('should handle syntax errors gracefully', async () => {
      const filePath = actualPath.resolve('/project', 'src/broken.js');
      const content = `
        import React from 'react';
        
        function broken() {
          // Missing closing brace
          if (true) {
            console.log('test');
        }
      `;

      // Should throw error for malformed syntax
      await expect(parser.parse(content, filePath)).rejects.toThrow();
    });

    it('should parse script files without import/export', async () => {
      const filePath = actualPath.resolve('/project', 'src/script.js');
      const content = `
        var utils = require('./utils');
        var config = require('./config.json');
        
        function main() {
          console.log('Hello World');
        }
        
        main();
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['./utils', './config.json']);
    });

    it('should handle complex require patterns', async () => {
      const filePath = actualPath.resolve('/project', 'src/app.js');
      const content = `
        const { readFile } = require('fs');
        const utils = require('./utils');
        
        // This should not be parsed as it's not a direct require call
        const dynamicPath = './dynamic';
        const dynamic = require(dynamicPath);
        
        // This should be parsed
        const config = require('./config.json');
        
        function loadModule(path) {
          // This should not be parsed as path is not a string literal
          return require(path);
        }
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['fs', './utils', './config.json']);
    });

    it('should handle JSX syntax', async () => {
      const filePath = actualPath.resolve('/project', 'src/component.js');
      const content = `
        import React from 'react';
        import { Button } from './components/Button';
        import './component.css';
        
        function MyComponent() {
          return (
            <div>
              <Button onClick={() => console.log('clicked')}>
                Click me
              </Button>
            </div>
          );
        }
        
        export default MyComponent;
      `;

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual(['react', './components/Button', './component.css']);
    });

    it('should handle empty files', async () => {
      const filePath = actualPath.resolve('/project', 'src/empty.js');
      const content = '';

      const dependencies = await parser.parse(content, filePath);

      expect(dependencies).toEqual([]);
    });

    it('should handle files with only comments', async () => {
      const filePath = actualPath.resolve('/project', 'src/comments.js');
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
