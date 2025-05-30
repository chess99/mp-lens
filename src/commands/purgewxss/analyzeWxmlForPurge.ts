// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Could not find a declaration file for module '@wxml/parser'
import { parse, Program, WXAttribute, WXNode } from '@wxml/parser';
import * as fs from 'fs';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../../utils/path-resolver';
import { normalizeWxmlImportPath } from '../../utils/wxml-path';

export interface WxmlPurgeAnalysisResult {
  wxmlFilePaths: Set<string>; // All WXML files processed (original + imports)
  tagNames: Set<string>; // All unique tag names found
  staticClassNames: Set<string>; // All unique static class names
  dynamicClassValues: Set<string>; // Raw DYNAMIC but SAFE class expressions like "{{classExpr}}}"
  // Store risky patterns for logging and to inform decisions like skipping WXSS processing
  riskyDynamicClassPatterns: Array<{ filePath: string; expression: string }>;
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
    riskyDynamicClassPatterns: [], // Initialize new field
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
 * Checks if a WXML class expression (the content inside {{...}}) is safe.
 * Safe: simple literals, or ternary operators yielding simple literals.
 * Unsafe: contains '+' for concatenation, unless it's part of a more complex, unhandled safe pattern.
 * @param expression The content of the class binding, e.g., "condition ? 'classA' : 'classB'" or "'prefix-' + varName"
 */
export function isSafeClassExpression(expression: string): boolean {
  const trimmedExpression = expression.trim();

  // Regex for: condition ? 'literal' : 'literal'  OR  condition ? "literal" : "literal"
  // Allows for empty strings as literals e.g. condition ? 'my-class' : ''
  // It also allows for non-literal conditions.
  const safeTernaryRegex = /^(?:[^?]+)\s*\?\s*('[^']*'|"[^"]*")\s*:\s*('[^']*'|"[^"]*")$/;
  if (safeTernaryRegex.test(trimmedExpression)) {
    return true;
  }

  // Regex for simple string literal: 'literal' OR "literal"
  const simpleLiteralRegex = /^('[^']*'|"[^"]*")$/;
  if (simpleLiteralRegex.test(trimmedExpression)) {
    return true;
  }

  // If it's not a safe ternary or simple literal, and contains '+', it's considered risky.
  if (trimmedExpression.includes('+')) {
    return false;
  }

  // Default to safe if no '+' is found and it's not an explicitly identified risky pattern.
  // This means expressions like `{{ myObject.classKey }}` or `{{ [classA, classB] }}`
  // would be considered "safe" by this specific rule if they don't use '+'.
  return true;
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
              const innerExpression = part.substring(2, part.length - 2);
              if (isSafeClassExpression(innerExpression)) {
                result.dynamicClassValues.add(part);
                // Try to extract literal strings from within SAFE {{...}} as potential static classes
                const literalRegex = /['"]([^'"]+)['"]/g;
                let match;
                while ((match = literalRegex.exec(part)) !== null) {
                  if (match[1]) {
                    match[1]
                      .trim()
                      .split(/\\s+/)
                      .filter(Boolean)
                      .forEach((cls: string) => result.staticClassNames.add(cls));
                  }
                }
              } else {
                // This is a risky dynamic class pattern
                result.riskyDynamicClassPatterns.push({
                  filePath: wxmlFilePath,
                  expression: part,
                });
                // Optionally, log here or ensure it's logged by the caller
                logger.warn(`Risky dynamic class pattern found in ${wxmlFilePath}: ${part}`);
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
