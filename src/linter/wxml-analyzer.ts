// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Could not find a declaration file for module '@wxml/parser'
import { parse, Program, WXAttribute, WXNode } from '@wxml/parser';
import * as fs from 'fs';
import { PathResolver } from '../analyzer/utils/path-resolver';
import { logger } from '../utils/debug-logger';
import { normalizeWxmlImportPath } from '../utils/wxml-path';

/**
 * Analyzes a WXML file and all its imported/included templates recursively
 * to extract a map of tag name -> set of WXML files where it is used.
 *
 * @param wxmlFilePath Path to the WXML file to analyze
 * @param pathResolver Instance of PathResolver to resolve import/include paths
 * @param visited Set of already visited files (to prevent infinite loops)
 * @returns Map<tag, Set<wxmlFile>>
 */
export async function analyzeWxmlTags(
  wxmlFilePath: string,
  pathResolver: PathResolver,
  visited: Set<string> = new Set(),
): Promise<Map<string, Set<string>>> {
  // Check for circular imports
  if (visited.has(wxmlFilePath)) {
    return new Map();
  }
  visited.add(wxmlFilePath);

  const tagToFiles = new Map<string, Set<string>>();

  try {
    // Read WXML file content
    const content = fs.readFileSync(wxmlFilePath, 'utf-8');
    // Parse WXML content to AST
    const ast = parse(content);
    // Collect tags in this file
    collectTagsWithSource(ast, wxmlFilePath, tagToFiles);
    // Process imports and includes
    const importPaths = extractImportPaths(ast);
    for (const importPath of importPaths) {
      try {
        const resolvedPath = pathResolver.resolveAnyPath(importPath, wxmlFilePath, ['.wxml']);
        if (resolvedPath) {
          const importedTagToFiles = await analyzeWxmlTags(resolvedPath, pathResolver, visited);
          // Merge importedTagToFiles into tagToFiles
          for (const [tag, files] of importedTagToFiles.entries()) {
            if (!tagToFiles.has(tag)) tagToFiles.set(tag, new Set());
            for (const f of files) tagToFiles.get(tag)!.add(f);
          }
        }
      } catch (err) {
        logger.warn(`Error processing import ${importPath} in ${wxmlFilePath}: ${err}`);
      }
    }
    return tagToFiles;
  } catch (err) {
    logger.error(`Error analyzing WXML file ${wxmlFilePath}: ${err}`);
    return tagToFiles;
  }
}

/**
 * Collects all tag names in the AST, mapping each tag to the WXML file where it is found.
 */
function collectTagsWithSource(
  ast: WXNode | Program,
  wxmlFilePath: string,
  tagToFiles: Map<string, Set<string>>,
): void {
  if (ast.type === 'WXElement') {
    if (!tagToFiles.has(ast.name)) tagToFiles.set(ast.name, new Set());
    tagToFiles.get(ast.name)!.add(wxmlFilePath);
    // Process attributes for generic components
    const attrs = ast.startTag?.attributes;
    if (attrs && Array.isArray(attrs)) {
      for (const attr of attrs) {
        if (attr.key && attr.key.startsWith('generic:') && attr.value) {
          if (!tagToFiles.has(attr.value)) tagToFiles.set(attr.value, new Set());
          tagToFiles.get(attr.value)!.add(wxmlFilePath);
        }
      }
    }
  }
  // Recursively process children
  if (ast.type === 'WXElement' && Array.isArray(ast.children)) {
    for (const child of ast.children) {
      collectTagsWithSource(child, wxmlFilePath, tagToFiles);
    }
  }
  // Handle Program/body
  if (ast.type === 'Program' && Array.isArray(ast.body)) {
    for (const node of ast.body) {
      collectTagsWithSource(node, wxmlFilePath, tagToFiles);
    }
  }
}

/**
 * Extracts import and include paths from the AST
 *
 * @param ast WXML AST node or Program
 * @returns Array of import/include paths
 */
function extractImportPaths(ast: WXNode | Program): string[] {
  const importPaths: string[] = [];
  findImportTags(ast, importPaths);
  return importPaths;
}

/**
 * Recursively finds import and include tags in the AST
 *
 * @param ast WXML AST node or Program
 * @param importPaths Array to store found paths
 */
function findImportTags(ast: WXNode | Program, importPaths: string[]): void {
  if (ast.type === 'WXElement' && (ast.name === 'import' || ast.name === 'include')) {
    // Find src attribute from startTag.attributes per wxml-parser AST docs
    const attrs = ast.startTag?.attributes;
    if (attrs && Array.isArray(attrs)) {
      const srcAttr = attrs.find((attr) => attr.key === 'src');
      if (srcAttr && srcAttr.value) {
        importPaths.push(normalizeWxmlImportPath(srcAttr.value));
      }
    }
  }

  // Recursively process children
  if (ast.type === 'WXElement' && Array.isArray(ast.children)) {
    for (const child of ast.children) {
      findImportTags(child, importPaths);
    }
  }

  // Handle Program/body
  if (ast.type === 'Program' && Array.isArray(ast.body)) {
    for (const node of ast.body) {
      findImportTags(node, importPaths);
    }
  }
}

// New structures and functions for PurgeCSS analysis:

export interface WxmlPurgeAnalysisResult {
  wxmlFilePaths: Set<string>; // All WXML files processed (original + imports)
  tagNames: Set<string>; // All unique tag names found
  staticClassNames: Set<string>; // All unique static class names
  dynamicClassValues: Set<string>; // Raw dynamic class expressions like "{{classExpr}}"
}

/**
 * Analyzes a WXML file and its imports/includes to extract tags, static classes,
 * and dynamic class expressions for PurgeCSS.
 *
 * @param initialWxmlFilePath Path to the initial WXML file to analyze
 * @param pathResolver Instance of PathResolver to resolve import/include paths
 * @param visited Set of already visited files (to prevent infinite loops and redundant work)
 * @returns Promise<WxmlPurgeAnalysisResult>
 */
export async function analyzeWxmlForPurge(
  initialWxmlFilePath: string,
  pathResolver: PathResolver,
  visited: Set<string> = new Set(),
): Promise<WxmlPurgeAnalysisResult> {
  const aggregatedResult: WxmlPurgeAnalysisResult = {
    wxmlFilePaths: new Set(),
    tagNames: new Set(),
    staticClassNames: new Set(),
    dynamicClassValues: new Set(),
  };

  await _analyzeWxmlRecursiveForPurge(initialWxmlFilePath, pathResolver, visited, aggregatedResult);
  return aggregatedResult;
}

async function _analyzeWxmlRecursiveForPurge(
  currentWxmlFilePath: string,
  pathResolver: PathResolver,
  visited: Set<string>,
  aggregatedResult: WxmlPurgeAnalysisResult,
): Promise<void> {
  if (visited.has(currentWxmlFilePath)) {
    return;
  }
  visited.add(currentWxmlFilePath);
  aggregatedResult.wxmlFilePaths.add(currentWxmlFilePath);

  try {
    const content = fs.readFileSync(currentWxmlFilePath, 'utf-8');
    const ast = parse(content);

    collectWxmlData(ast, currentWxmlFilePath, aggregatedResult);

    const importPaths = extractImportPaths(ast); // Reuse existing import path extraction
    for (const importPath of importPaths) {
      try {
        const resolvedPath = pathResolver.resolveAnyPath(importPath, currentWxmlFilePath, [
          '.wxml',
        ]);
        if (resolvedPath) {
          await _analyzeWxmlRecursiveForPurge(
            resolvedPath,
            pathResolver,
            visited,
            aggregatedResult,
          );
        }
      } catch (err) {
        logger.warn(
          `Error processing import ${importPath} in ${currentWxmlFilePath} for purge analysis: ${err}`,
        );
      }
    }
  } catch (err) {
    logger.error(`Error analyzing WXML file ${currentWxmlFilePath} for purge analysis: ${err}`);
  }
}

/**
 * Collects tags, static classes, and dynamic class attributes from the AST.
 */
function collectWxmlData(
  node: WXNode | Program,
  wxmlFilePath: string, // current wxml file path for context if needed
  result: WxmlPurgeAnalysisResult,
): void {
  if (node.type === 'WXElement') {
    result.tagNames.add(node.name);

    const attrs = node.startTag?.attributes as WXAttribute[] | undefined; // Type assertion for safety
    if (attrs && Array.isArray(attrs)) {
      for (const attr of attrs) {
        if (attr.key === 'class' && typeof attr.value === 'string') {
          const classValue = attr.value;
          // Split by space for static classes, but keep {{...}} intact
          const classParts = classValue.match(/\{\{[^}]*\}\}|[^{}\s]+/g) || [];

          for (const part of classParts) {
            if (part.startsWith('{{') && part.endsWith('}}')) {
              result.dynamicClassValues.add(part);
              // Try to extract literal strings from within {{...}} as potential static classes
              // This helps if PurgeCSS's default extractor doesn't look inside mustaches.
              const literalRegex = /['"]([^'"]+)['"]/g;
              let match;
              while ((match = literalRegex.exec(part)) !== null) {
                if (match[1]) {
                  match[1]
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .forEach((cls: string) => result.staticClassNames.add(cls));
                }
              }
            } else {
              // Static class name
              part
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .forEach((cls: string) => result.staticClassNames.add(cls));
            }
          }
        } else if (
          attr.key &&
          attr.key.startsWith('generic:') &&
          attr.value &&
          typeof attr.value === 'string'
        ) {
          // Handle generic component values as potential tags
          result.tagNames.add(attr.value);
        }
      }
    }
  }

  // Recursively process children
  if (node.type === 'WXElement' && Array.isArray(node.children)) {
    for (const child of node.children) {
      collectWxmlData(child, wxmlFilePath, result);
    }
  }
  // Handle Program/body
  if (node.type === 'Program' && Array.isArray(node.body)) {
    for (const item of node.body) {
      collectWxmlData(item, wxmlFilePath, result);
    }
  }
}
