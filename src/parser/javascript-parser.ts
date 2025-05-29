import { parse, ParserPlugin } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as path from 'path';
import { logger } from '../utils/debug-logger';

export class JavaScriptParser {
  constructor() {
    // No dependencies needed for pure text analysis
  }

  async parse(content: string, filePath: string): Promise<string[]> {
    try {
      const dependencies = new Set<string>();

      // Parse the file content to AST
      const ast = this.parseToAST(content, filePath);

      // Traverse AST to find import/require statements
      this.traverseAST(ast, dependencies);

      return Array.from(dependencies);
    } catch (e: any) {
      // Log the error but re-throw it so the central handler in FileParser catches it
      logger.warn(`Error parsing JavaScript file ${filePath}: ${e.message}`);
      throw e; // Re-throw the error
    }
  }

  private parseToAST(content: string, filePath: string) {
    const isTypeScript = path.extname(filePath) === '.ts';

    const basePlugins: ParserPlugin[] = [
      'jsx',
      'objectRestSpread',
      'functionBind',
      'exportDefaultFrom',
      'exportNamespaceFrom',
      'decorators-legacy',
      'classProperties',
      'asyncGenerators',
      'functionSent',
      'dynamicImport',
      'numericSeparator',
      'optionalChaining',
      'importMeta',
      'bigInt',
      'optionalCatchBinding',
      'throwExpressions',
      'nullishCoalescingOperator',
      'topLevelAwait',
    ];

    const plugins: ParserPlugin[] = isTypeScript ? [...basePlugins, 'typescript'] : basePlugins;

    try {
      return parse(content, {
        sourceType: 'module',
        allowImportExportEverywhere: true,
        allowReturnOutsideFunction: true,
        plugins,
      });
    } catch (parseError) {
      // If parsing as module fails, check if it contains import/export
      const hasImportExport = /\b(import|export)\b/.test(content);
      if (hasImportExport) {
        // If it has import/export but failed to parse as module, re-throw the error
        throw parseError;
      }

      // If no import/export, try as script
      logger.trace(`Failed to parse ${filePath} as module, trying as script: ${parseError}`);
      return parse(content, {
        sourceType: 'script',
        allowReturnOutsideFunction: true,
        plugins,
      });
    }
  }

  private traverseAST(ast: any, dependencies: Set<string>): void {
    traverse(ast, {
      // Handle ES6 import statements
      ImportDeclaration: (path) => {
        const source = path.node.source;
        if (t.isStringLiteral(source)) {
          const importPath = source.value;
          dependencies.add(importPath);
        }
      },

      // Handle CommonJS require() calls
      CallExpression: (path) => {
        const { node } = path;

        // Check if it's a require() call
        if (
          t.isIdentifier(node.callee) &&
          node.callee.name === 'require' &&
          node.arguments.length === 1 &&
          t.isStringLiteral(node.arguments[0])
        ) {
          const requirePath = node.arguments[0].value;
          dependencies.add(requirePath);
        }
      },

      // Handle dynamic imports
      Import: (path) => {
        const parent = path.parent;
        if (
          t.isCallExpression(parent) &&
          parent.arguments.length === 1 &&
          t.isStringLiteral(parent.arguments[0])
        ) {
          const importPath = parent.arguments[0].value;
          dependencies.add(importPath);
        }
      },
    });
  }
}
