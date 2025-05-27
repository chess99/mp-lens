// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Could not find a declaration file for module '@wxml/parser'
import { parse, Program, WXNode } from '@wxml/parser';
import * as fs from 'fs';
import { AnalyzerOptions } from '../../types/command-options';
import { logger } from '../../utils/debug-logger';
import { normalizeWxmlImportPath } from '../../utils/wxml-path';
import { PathResolver } from '../utils/path-resolver';

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
  private pathResolver: PathResolver;
  private projectRoot: string; // Needed for root-relative paths in imports/includes/wxs
  private options: AnalyzerOptions; // Needed for verbose logging option

  constructor(pathResolver: PathResolver, projectRoot: string, options: AnalyzerOptions) {
    this.pathResolver = pathResolver;
    this.projectRoot = projectRoot;
    this.options = options;
  }

  async parse(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>();

      // Parse WXML content to AST
      const ast = parse(content);

      this.processImportIncludeTags(ast, filePath, dependencies);
      this.processWxsTags(ast, filePath, dependencies);
      this.processImageSources(ast, filePath, dependencies);
      // NOTE: processCustomComponents is intentionally omitted as component
      // dependencies are defined in JSON files.

      return Array.from(dependencies);
    } catch (e: any) {
      logger.warn(`Error parsing WXML file ${filePath}: ${e.message}`);
      throw e; // Re-throw
    }
  }

  private processImportIncludeTags(
    ast: WXNode | Program,
    filePath: string,
    dependencies: Set<string>,
  ): void {
    const allowedExtensions = ['.wxml'];

    this.findImportIncludeTags(ast, (importPath: string) => {
      if (importPath.includes('{{')) {
        logger.trace(`Skipping dynamic import/include path: ${importPath} in ${filePath}`);
        return;
      }

      // Normalize the import path using the utility function
      const normalizedPath = normalizeWxmlImportPath(importPath);

      // Handle root-relative paths explicitly for <import> and <include>
      if (normalizedPath.startsWith('/')) {
        // Use PathResolver.resolveAnyPath for consistency, treating it as non-relative.
        const resolvedPath = this.pathResolver.resolveAnyPath(
          normalizedPath,
          filePath,
          allowedExtensions,
        );
        if (resolvedPath) {
          dependencies.add(resolvedPath);
        } else if (this.options.verbose) {
          logger.trace(
            `processImportIncludeTags: Could not resolve root path ${normalizedPath} from ${filePath}`,
          );
        }
      } else {
        // Handle relative paths using resolveAnyPath
        const depPath = this.pathResolver.resolveAnyPath(
          normalizedPath,
          filePath,
          allowedExtensions,
        );
        if (depPath) dependencies.add(depPath);
      }
    });
  }

  private processWxsTags(ast: WXNode | Program, filePath: string, dependencies: Set<string>): void {
    const allowedExtensions = ['.wxs'];

    this.findWxsTags(ast, (wxsPath: string) => {
      if (wxsPath.includes('{{')) {
        logger.trace(`Skipping dynamic wxs path: ${wxsPath} in ${filePath}`);
        return;
      }

      // Normalize paths to ensure non-absolute, non-relative paths are treated as relative
      const normalizedPath = normalizeWxmlImportPath(wxsPath);

      // Use resolveAnyPath - it handles root-relative, relative, and alias paths
      const depPath = this.pathResolver.resolveAnyPath(normalizedPath, filePath, allowedExtensions);
      if (depPath) {
        dependencies.add(depPath);
      }
    });
  }

  private processImageSources(
    ast: WXNode | Program,
    filePath: string,
    dependencies: Set<string>,
  ): void {
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

    this.findImageTags(ast, (src: string) => {
      if (!src || src.includes('{{') || /^data:/.test(src) || /^(http|https):/.test(src)) {
        let reason = 'empty';
        if (src) {
          // src is not empty, determine other reason
          if (src.includes('{{')) {
            reason = 'dynamic (contains {{)';
          } else if (/^data:/.test(src)) {
            reason = 'data URI';
          } else if (/^(http|https):/.test(src)) {
            reason = 'HTTP/HTTPS URL';
          }
        }
        logger.trace(
          `Skipping image src resolution for '${src}' in file '${filePath}'. Reason: ${reason}.`,
        );
        return;
      }

      // Normalize paths to ensure non-absolute, non-relative paths are treated as relative
      const normalizedPath = normalizeWxmlImportPath(src);

      const resolvedPath = this.pathResolver.resolveAnyPath(
        normalizedPath,
        filePath,
        allowedExtensions,
      );
      if (resolvedPath) {
        dependencies.add(resolvedPath);
      }
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
