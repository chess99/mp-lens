import { parse, ParserPlugin } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../utils/path-resolver';

export class JavaScriptParser {
  private pathResolver: PathResolver;

  constructor(pathResolver: PathResolver) {
    this.pathResolver = pathResolver;
  }

  async parse(filePath: string): Promise<string[]> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const dependencies = new Set<string>();

      // Allowed extensions for JS/TS imports
      const allowedExtensions = ['.js', '.ts', '.json'];

      // Parse the file content to AST
      const ast = this.parseToAST(content, filePath);

      // Traverse AST to find import/require statements
      this.traverseAST(ast, filePath, allowedExtensions, dependencies);

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

  private traverseAST(
    ast: any,
    filePath: string,
    allowedExtensions: string[],
    dependencies: Set<string>,
  ): void {
    traverse(ast, {
      // Handle ES6 import statements
      ImportDeclaration: (path) => {
        const source = path.node.source;
        if (t.isStringLiteral(source)) {
          const importPath = source.value;

          // Skip type-only imports in TypeScript
          if (path.node.importKind === 'type') {
            logger.trace(`Skipping type-only import: '${importPath}' in ${filePath}`);
            return;
          }

          // Check if any specifiers are type-only
          const hasValueImports = path.node.specifiers.some((spec) => {
            if (t.isImportSpecifier(spec)) {
              return spec.importKind !== 'type';
            }
            return true; // Default and namespace imports are always value imports
          });

          if (!hasValueImports) {
            logger.trace(`Skipping type-only import: '${importPath}' in ${filePath}`);
            return;
          }

          this.addDependency(importPath, filePath, allowedExtensions, dependencies);
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
          this.addDependency(requirePath, filePath, allowedExtensions, dependencies);
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
          this.addDependency(importPath, filePath, allowedExtensions, dependencies);
        }
      },
    });
  }

  private addDependency(
    importPath: string,
    filePath: string,
    allowedExtensions: string[],
    dependencies: Set<string>,
  ): void {
    const depPath = this.pathResolver.resolveAnyPath(importPath, filePath, allowedExtensions);
    if (depPath) {
      dependencies.add(depPath);
    }
  }
}
