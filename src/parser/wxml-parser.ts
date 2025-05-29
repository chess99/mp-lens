// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Could not find a declaration file for module '@wxml/parser'
import { parse, Program, WXNode } from '@wxml/parser';
import { logger } from '../utils/debug-logger';
import { normalizeWxmlImportPath } from '../utils/wxml-path';

/**
 * Parser for WXML files that finds dependencies to other files using AST parsing.
 *
 * Path resolution rules for WeChat Mini Program WXML files:
 * 1. Paths starting with '/' are relative to the mini program root
 *    Example: <import src="/templates/header.wxml" />
 *
 * 2. Paths starting with './' or '../' are relative to the current file's directory
 *    Example: <import src="../templates/header.wxml" />
 *
 * 3. Paths with no prefix (like "templates/header.wxml") should be treated as relative
 *    to the current file's directory, equivalent to adding a './' prefix.
 *    This parser automatically adds the './' prefix to follow Mini Program conventions.
 */
export class WXMLParser {
  constructor() {
    // No dependencies needed for pure text analysis
  }

  async parse(content: string, filePath: string): Promise<string[]> {
    try {
      const dependencies = new Set<string>();

      // Parse WXML content to AST
      const ast = parse(content);

      this.processImportIncludeTags(ast, dependencies);
      this.processWxsTags(ast, dependencies);
      this.processImageSources(ast, dependencies);
      // NOTE: processCustomComponents is intentionally omitted as component
      // dependencies are defined in JSON files.

      return Array.from(dependencies);
    } catch (e: any) {
      logger.warn(`Error parsing WXML file ${filePath}: ${e.message}`);
      throw e; // Re-throw
    }
  }

  /**
   * Processes import and include tags to extract template dependencies
   */
  private processImportIncludeTags(ast: Program, dependencies: Set<string>): void {
    this.findImportIncludeTags(ast, (path: string) => {
      const normalizedPath = normalizeWxmlImportPath(path);
      logger.debug(`Found import/include: ${path} -> normalized: ${normalizedPath}`);
      dependencies.add(normalizedPath);
    });
  }

  /**
   * Processes wxs tags to extract WXS script dependencies
   */
  private processWxsTags(ast: Program, dependencies: Set<string>): void {
    this.findWxsTags(ast, (path: string) => {
      const normalizedPath = normalizeWxmlImportPath(path);
      logger.debug(`Found wxs: ${path} -> normalized: ${normalizedPath}`);
      dependencies.add(normalizedPath);
    });
  }

  /**
   * Processes image tags to extract image dependencies
   */
  private processImageSources(ast: Program, dependencies: Set<string>): void {
    this.findImageTags(ast, (src: string) => {
      // Skip data URIs, remote URLs, and template expressions
      if (src.startsWith('data:') || /^(http|https):\/\//.test(src) || /{{.*?}}/.test(src)) {
        return;
      }

      const normalizedPath = normalizeWxmlImportPath(src);
      logger.debug(`Found image: ${src} -> normalized: ${normalizedPath}`);
      dependencies.add(normalizedPath);
    });
  }

  /**
   * Recursively finds import and include tags in the AST
   */
  private findImportIncludeTags(ast: WXNode | Program, callback: (path: string) => void): void {
    if (ast.type === 'WXElement' && (ast.name === 'import' || ast.name === 'include')) {
      // Find src attribute from startTag.attributes
      const attrs = ast.startTag?.attributes;
      if (attrs && Array.isArray(attrs)) {
        const srcAttr = attrs.find((attr) => attr.key === 'src');
        if (srcAttr && srcAttr.value) {
          callback(srcAttr.value);
        }
      }
    }

    // Recursively process children
    if (ast.type === 'WXElement' && Array.isArray(ast.children)) {
      for (const child of ast.children) {
        this.findImportIncludeTags(child, callback);
      }
    }

    // Handle Program/body
    if (ast.type === 'Program' && Array.isArray(ast.body)) {
      for (const node of ast.body) {
        this.findImportIncludeTags(node, callback);
      }
    }
  }

  /**
   * Recursively finds wxs tags in the AST
   */
  private findWxsTags(ast: WXNode | Program, callback: (path: string) => void): void {
    // Handle WXScript (wxs tags)
    if (ast.type === 'WXScript' && ast.name === 'wxs') {
      // Find src attribute from startTag.attributes
      const attrs = ast.startTag?.attributes;
      if (attrs && Array.isArray(attrs)) {
        const srcAttr = attrs.find((attr) => attr.key === 'src');
        if (srcAttr && srcAttr.value) {
          callback(srcAttr.value);
        }
      }
    }

    // Also handle WXElement in case wxs is parsed as a regular element
    if (ast.type === 'WXElement' && ast.name === 'wxs') {
      // Find src attribute from startTag.attributes
      const attrs = ast.startTag?.attributes;
      if (attrs && Array.isArray(attrs)) {
        const srcAttr = attrs.find((attr) => attr.key === 'src');
        if (srcAttr && srcAttr.value) {
          callback(srcAttr.value);
        }
      }
    }

    // Recursively process children
    if (ast.type === 'WXElement' && Array.isArray(ast.children)) {
      for (const child of ast.children) {
        this.findWxsTags(child, callback);
      }
    }

    // Handle Program/body
    if (ast.type === 'Program' && Array.isArray(ast.body)) {
      for (const node of ast.body) {
        this.findWxsTags(node, callback);
      }
    }
  }

  /**
   * Recursively finds image tags in the AST
   */
  private findImageTags(ast: WXNode | Program, callback: (src: string) => void): void {
    if (ast.type === 'WXElement' && ast.name === 'image') {
      // Find src attribute from startTag.attributes
      const attrs = ast.startTag?.attributes;
      if (attrs && Array.isArray(attrs)) {
        const srcAttr = attrs.find((attr) => attr.key === 'src');
        if (srcAttr && srcAttr.value) {
          callback(srcAttr.value);
        }
      }
    }

    // Recursively process children
    if (ast.type === 'WXElement' && Array.isArray(ast.children)) {
      for (const child of ast.children) {
        this.findImageTags(child, callback);
      }
    }

    // Handle Program/body
    if (ast.type === 'Program' && Array.isArray(ast.body)) {
      for (const node of ast.body) {
        this.findImageTags(node, callback);
      }
    }
  }
}
