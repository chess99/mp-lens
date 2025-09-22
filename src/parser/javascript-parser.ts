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
    } catch (e: unknown) {
      // Log the error but re-throw it so the central handler in FileParser catches it
      const message = e instanceof Error ? e.message : String(e);
      logger.warn(`Error parsing JavaScript file ${filePath}: ${message}`);
      throw e; // Re-throw the error
    }
  }

  private parseToAST(content: string, filePath: string): t.File {
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
      }) as unknown as t.File;
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
      }) as unknown as t.File;
    }
  }

  private traverseAST(ast: t.File, dependencies: Set<string>): void {
    traverse(ast, {
      // Handle ES6 import statements
      ImportDeclaration: (path) => {
        const source = path.node.source;
        if (t.isStringLiteral(source)) {
          const importPath = source.value;
          dependencies.add(importPath);
        }
      },

      // Handle re-exports: export * from '...'
      ExportAllDeclaration: (path) => {
        const source = path.node.source;
        if (t.isStringLiteral(source)) {
          dependencies.add(source.value);
        }
      },

      // Handle re-exports: export { ... } from '...'
      ExportNamedDeclaration: (path) => {
        const source = path.node.source;
        if (source && t.isStringLiteral(source)) {
          dependencies.add(source.value);
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

        // Handle require.resolve('...')
        if (
          t.isMemberExpression(node.callee) &&
          t.isIdentifier(node.callee.object) &&
          node.callee.object.name === 'require' &&
          t.isIdentifier(node.callee.property) &&
          node.callee.property.name === 'resolve' &&
          node.arguments.length >= 1 &&
          t.isStringLiteral(node.arguments[0])
        ) {
          const resolvedPath = node.arguments[0].value;
          dependencies.add(resolvedPath);
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

      // Handle TypeScript import equals: import x = require('...')
      TSImportEqualsDeclaration: (path) => {
        const moduleRef = path.node.moduleReference;
        if (t.isTSExternalModuleReference(moduleRef)) {
          const expr = moduleRef.expression;
          if (t.isStringLiteral(expr)) {
            dependencies.add(expr.value);
          }
        }
      },
    });
  }
}
