import { parseJson, parseWxml, parseWxs, parseWxss } from '../../src/knip-integration/parsers';

describe('knip-integration parsers', () => {
  describe('parseWxml', () => {
    it('should parse image source paths', async () => {
      const wxml = `
        <view>
          <image src="./assets/logo.png" />
          <image src="../images/icon.jpg" />
          <image src="images/banner.gif" />
        </view>
      `;
      const result = await parseWxml(wxml, 'test.wxml');
      expect(result).toContain("import './assets/logo.png'");
      expect(result).toContain("import '../images/icon.jpg'");
      expect(result).toContain("import './images/banner.gif'");
    });

    it('should skip images with template variables and absolute URLs', async () => {
      const wxml = `
        <view>
          <image src="{{imageUrl}}" />
          <image src="https://example.com/image.png" />
          <image src="data:image/png;base64,..." />
        </view>
      `;
      const result = await parseWxml(wxml, 'test.wxml');
      expect(result).not.toContain('{{imageUrl}}');
      expect(result).not.toContain('https://example.com/image.png');
      expect(result).not.toContain('data:image/png');
    });

    it('should parse template import statements', async () => {
      const wxml = `
        <import src="./templates/header.wxml" />
        <import src="../common/footer.wxml" />
        <import src="components/button.wxml" />
      `;
      const result = await parseWxml(wxml, 'test.wxml');
      expect(result).toContain("import './templates/header.wxml'");
      expect(result).toContain("import '../common/footer.wxml'");
      expect(result).toContain("import './components/button.wxml'");
    });

    it('should parse template include statements', async () => {
      const wxml = `
        <include src="./templates/sidebar.wxml" />
        <include src="../shared/modal.wxml" />
        <include src="layouts/main.wxml" />
      `;
      const result = await parseWxml(wxml, 'test.wxml');
      expect(result).toContain("import './templates/sidebar.wxml'");
      expect(result).toContain("import '../shared/modal.wxml'");
      expect(result).toContain("import './layouts/main.wxml'");
    });

    it('should parse WXS module imports', async () => {
      const wxml = `
        <wxs src="./utils/format.wxs" module="format" />
        <wxs src="../common/helper.wxs" module="helper" />
        <wxs src="scripts/validator.wxs" module="validator" />
      `;
      const result = await parseWxml(wxml, 'test.wxml');
      expect(result).toContain("import './utils/format.wxs'");
      expect(result).toContain("import '../common/helper.wxs'");
      expect(result).toContain("import './scripts/validator.wxs'");
    });

    it('should handle empty content', async () => {
      const result = await parseWxml('', 'test.wxml');
      expect(result).toBe('');
    });

    it('should handle parsing errors and return empty string', async () => {
      // Test that invalid WXML doesn't crash and returns empty string
      const result = await parseWxml('<invalid xml', 'test.wxml');
      expect(result).toBe('');
    });
  });

  describe('parseWxss', () => {
    it('should parse @import statements', async () => {
      const wxss = `
        @import "./common/base.wxss";
        @import '../styles/theme.wxss';
        @import "components/button.wxss"; /* No leading ./ */
        url('./assets/font.woff2'); /* Should be ignored by this knip parser */
        
        .container {
          background: red;
        }
      `;
      const result = await parseWxss(wxss, 'test.wxss');
      expect(result).toContain("@import './common/base.wxss'");
      expect(result).toContain("@import '../styles/theme.wxss'");
      expect(result).toContain("@import 'components/button.wxss'"); // Path kept as is
      expect(result).not.toContain('./assets/font.woff2');
    });

    it('should handle empty content', async () => {
      const result = await parseWxss('', 'test.wxss');
      expect(result).toBe('');
    });

    it('should handle parsing errors and return empty string', async () => {
      // Test that invalid WXSS doesn't crash and returns empty string
      const result = await parseWxss('invalid css {', 'test.wxss');
      expect(result).toBe('');
    });
  });

  describe('parseWxs', () => {
    it('should parse require statements', async () => {
      const wxs = `
        var utils = require('./utils/helper.wxs');
        var format = require("../common/format.wxs");
        var validator = require('scripts/validator.wxs'); // No leading ./
        
        module.exports = {
          test: function() {}
        };
      `;
      const result = await parseWxs(wxs, 'test.wxs');
      expect(result).toContain("import './utils/helper.wxs'");
      expect(result).toContain("import '../common/format.wxs'");
      expect(result).toContain("import 'scripts/validator.wxs'"); // Path kept as is
    });

    it('should handle ES6 import statements if present (though uncommon in .wxs)', async () => {
      const wxsWithImport = `
        import tool from './tools.wxs';
        var another = require('../common/another.wxs');
      `;
      const result = await parseWxs(wxsWithImport, 'test.wxs');
      expect(result).toContain("import './tools.wxs'");
      expect(result).toContain("import '../common/another.wxs'");
    });

    it('should handle empty content', async () => {
      const result = await parseWxs('', 'test.wxs');
      expect(result).toBe('');
    });

    it('should handle parsing errors and return empty string', async () => {
      // Test that invalid WXS (JS) doesn't crash and returns empty string
      const result = await parseWxs('invalid js {', 'test.wxs');
      expect(result).toBe('');
    });
  });

  describe('parseJson', () => {
    it('should return the original text content', () => {
      const json = '{"component": true, "usingComponents": {"my-comp": "./my-comp"}}';
      const result = parseJson(json);
      expect(result).toBe(json);
    });

    it('should handle empty content', () => {
      const result = parseJson('');
      expect(result).toBe('');
    });
  });
});
