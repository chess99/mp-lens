// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Could not find a declaration file for module '@wxml/parser'
import { parse, Program, WXNode } from '@wxml/parser';
import * as fs from 'fs';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../../utils/path-resolver';
import { normalizeWxmlImportPath } from '../../utils/wxml-path';

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
        const resolvedPath = pathResolver.resolveAnyPath(importPath, wxmlFilePath, ['wxml']);
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
