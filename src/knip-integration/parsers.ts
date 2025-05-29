/**
 * Parsers for extracting dependencies from various Mini Program file types.
 * These functions can be used as custom compilers for knip.
 *
 * @see https://knip.dev/features/compilers
 */

import { JavaScriptParser } from '../parser/javascript-parser';
import { WXMLParser } from '../parser/wxml-parser';
import { WXSSParser } from '../parser/wxss-parser';

/**
 * Parse WXML files for dependencies
 * Extracts imports from image sources, template imports, includes, and WXS modules.
 */
export async function parseWxml(text: string, filePath: string): Promise<string> {
  try {
    const parser = new WXMLParser();
    const dependencies = await parser.parse(text, filePath);
    // WXMLParser returns normalized paths (e.g., adds './' and handles relative paths).
    // It also filters out http, data URIs, and template expressions for images.
    return dependencies.map((dep) => `import '${dep}'`).join('\n');
  } catch (e) {
    // Maintain original behavior: return empty string on error.
    // The WXMLParser might log errors internally.
    return '';
  }
}

/**
 * Parse WXSS files for dependencies
 * Extracts style imports using @import statements.
 */
export async function parseWxss(text: string, filePath: string): Promise<string> {
  try {
    const parser = new WXSSParser();
    const dependencies = await parser.parse(text, filePath);

    // The WXSSParser extracts both @import and url() paths.
    // For knip, we are only interested in @import statements, similar to the original regex parser.
    // The original regex also did not normalize paths like adding './'.
    // We need to filter for actual @import paths found in the original text
    // and maintain their original form as WXSSParser doesn't change them.

    const importRegex = /@import\s+['"]([^'"]+)['"]/g;
    const originalImports = new Set<string>();
    let match;
    while ((match = importRegex.exec(text)) !== null) {
      if (match[1]) {
        originalImports.add(match[1]);
      }
    }

    // Filter dependencies to only include those that were actual @import statements
    const importDependencies = dependencies.filter((dep) => originalImports.has(dep));

    return importDependencies.map((dep) => `@import '${dep}'`).join('\n');
  } catch (e) {
    // console.error(`Error parsing WXSS with AST parser: ${filePath}`, e);
    return ''; // Keep original behavior on error
  }
}

/**
 * Parse WXS files for dependencies
 * Extracts require statements that reference other modules.
 */
export async function parseWxs(text: string, filePath: string): Promise<string> {
  try {
    const parser = new JavaScriptParser();
    // JavaScriptParser can handle both .js and .wxs, as .wxs is a subset of JavaScript.
    const dependencies = await parser.parse(text, filePath);

    // The original parseWxs converted require('path') to import 'path'.
    // JavaScriptParser returns the path directly from require or import statements.
    // We need to format them as `import 'path'`.
    // Path normalization (e.g. adding './') was not done by the original regex parser
    // for paths not starting with './' or '../', and JavaScriptParser also doesn't do this.
    // So, paths like 'module/utils' will remain as 'module/utils'.
    return dependencies.map((dep) => `import '${dep}'`).join('\n');
  } catch (e) {
    // console.error(`Error parsing WXS with AST parser: ${filePath}`, e);
    return ''; // Keep original behavior on error
  }
}

// We don't parse JSON files in the compiler because:
// 1. When a component path is referenced (e.g. "./foobar"), we can't determine if it's:
//    - "./foobar.json" (single file) or
//    - "./foobar/index.json" (directory)
// 2. The only purpose of this JSON compiler is to make getCompilerExtensions include
//    JSON files as project files, so they can be analyzed for usage
export function parseJson(text: string): string {
  return text;
}

/**
 * Parse WXML files for dependencies
 * Extracts imports from image sources, template imports, includes, and WXS modules.
 */
export async function parseWxmlAst(text: string, filePath: string): Promise<string> {
  try {
    const parser = new WXMLParser();
    const dependencies = await parser.parse(text, filePath);
    // The WXMLParser already normalizes paths including adding './' for relative paths.
    // And it filters out http, data URIs.
    return dependencies.map((dep) => `import '${dep}';`).join('\n');
  } catch (e) {
    // console.error(`Error parsing WXML with AST parser: ${filePath}`, e);
    return ''; // Keep original behavior on error
  }
}
