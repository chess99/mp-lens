// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: Could not find a declaration file for module '@wxml/parser'
import { parse, Program, WXNode } from '@wxml/parser';
import * as fs from 'fs';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../../utils/path-resolver';
import { normalizeWxmlImportPath } from '../../utils/wxml-path';

type WXElementNode = Extract<WXNode, { type: 'WXElement' }>;

interface TemplateDefinition {
  filePath: string;
  name: string;
  node: WXElementNode;
}

interface WxmlReference {
  filePath: string;
  kind: 'import' | 'include';
}

interface ParsedWxmlFile {
  ast: Program;
  references: WxmlReference[];
}

/**
 * Analyzes the rendered content reachable from a WXML file.
 *
 * Imported template declarations are collected first, but their bodies only
 * count when reached through a static `<template is="name">`. Includes are
 * treated as inline content. This avoids treating every template in an
 * imported template library as used.
 */
export async function analyzeWxmlTags(
  wxmlFilePath: string,
  pathResolver: PathResolver,
  visited: Set<string> = new Set(),
): Promise<Map<string, Set<string>>> {
  const tagToFiles = new Map<string, Set<string>>();
  const parsedFiles = new Map<string, ParsedWxmlFile>();
  const templatesByFile = new Map<string, Map<string, TemplateDefinition>>();

  const loadFile = (filePath: string): void => {
    if (visited.has(filePath) || parsedFiles.has(filePath)) return;
    visited.add(filePath);

    try {
      const ast = parse(fs.readFileSync(filePath, 'utf-8'));
      const references = extractWxmlReferences(ast, filePath, pathResolver);
      parsedFiles.set(filePath, { ast, references });
      templatesByFile.set(filePath, extractTemplateDefinitions(ast, filePath));
      for (const reference of references) loadFile(reference.filePath);
    } catch (err) {
      logger.error(`Error analyzing WXML file ${filePath}: ${err}`);
    }
  };

  loadFile(wxmlFilePath);

  const renderedTemplateDefinitions = new Set<string>();
  const renderedFileStack = new Set<string>();

  const addTag = (tag: string, sourceFile: string): void => {
    if (!tagToFiles.has(tag)) tagToFiles.set(tag, new Set());
    tagToFiles.get(tag)!.add(sourceFile);
  };

  const getVisibleTemplates = (scopeFile: string): Map<string, TemplateDefinition> => {
    const visibleTemplates = new Map<string, TemplateDefinition>();
    const imports = parsedFiles
      .get(scopeFile)
      ?.references.filter((reference) => reference.kind === 'import');
    for (const imported of imports || []) {
      for (const [name, definition] of templatesByFile.get(imported.filePath) || []) {
        visibleTemplates.set(name, definition);
      }
    }
    for (const [name, definition] of templatesByFile.get(scopeFile) || []) {
      visibleTemplates.set(name, definition);
    }
    return visibleTemplates;
  };

  const resolveTemplates = (nameExpression: string, scopeFile: string): TemplateDefinition[] => {
    const visibleTemplates = getVisibleTemplates(scopeFile);
    if (!nameExpression.includes('{{')) {
      const definition = visibleTemplates.get(nameExpression);
      return definition ? [definition] : [];
    }

    const pattern = new RegExp(
      `^${nameExpression
        .split(/{{[\s\S]*?}}/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('.*')}$`,
    );
    return Array.from(visibleTemplates.entries())
      .filter(([name]) => pattern.test(name))
      .map(([, definition]) => definition);
  };

  const collectRenderedNode = (
    node: WXNode | Program,
    sourceFile: string,
    isIncludedContent = false,
  ): void => {
    if (node.type === 'Program') {
      for (const child of node.body || []) {
        collectRenderedNode(child, sourceFile, isIncludedContent);
      }
      return;
    }

    if (node.type !== 'WXElement') return;

    // WXML include inlines ordinary rendered content, but explicitly excludes
    // template and wxs nodes from the included file.
    if (isIncludedContent && (node.name === 'template' || node.name === 'wxs')) return;

    if (node.name === 'import') return;

    if (node.name === 'include') {
      const includePath = getAttributeValue(node, 'src');
      if (!includePath) return;
      const resolvedPath = resolveWxmlPath(includePath, sourceFile, pathResolver);
      if (resolvedPath) collectRenderedFile(resolvedPath, true);
      return;
    }

    if (node.name === 'template') {
      if (getAttributeValue(node, 'name')) return;
      const templateName = getAttributeValue(node, 'is');
      if (templateName) {
        for (const definition of resolveTemplates(templateName, sourceFile)) {
          const definitionId = `${definition.filePath}:${definition.name}`;
          if (!renderedTemplateDefinitions.has(definitionId)) {
            renderedTemplateDefinitions.add(definitionId);
            for (const child of definition.node.children || []) {
              collectRenderedNode(child, definition.filePath);
            }
          }
        }
      }
      return;
    }

    addTag(node.name, sourceFile);
    for (const attr of node.startTag?.attributes || []) {
      if (attr.key?.startsWith('generic:') && attr.value) addTag(attr.value, sourceFile);
    }
    for (const child of node.children || []) {
      collectRenderedNode(child, sourceFile, isIncludedContent);
    }
  };

  const collectRenderedFile = (filePath: string, isIncludedContent = false): void => {
    if (renderedFileStack.has(filePath)) return;
    const parsedFile = parsedFiles.get(filePath);
    if (!parsedFile) return;

    renderedFileStack.add(filePath);
    collectRenderedNode(parsedFile.ast, filePath, isIncludedContent);
    renderedFileStack.delete(filePath);
  };

  collectRenderedFile(wxmlFilePath);
  return tagToFiles;
}

function extractTemplateDefinitions(
  ast: WXNode | Program,
  filePath: string,
): Map<string, TemplateDefinition> {
  const definitions = new Map<string, TemplateDefinition>();

  walkElements(ast, (node) => {
    if (node.name !== 'template') return;
    const name = getAttributeValue(node, 'name');
    if (name) definitions.set(name, { filePath, name, node });
  });

  return definitions;
}

function extractWxmlReferences(
  ast: WXNode | Program,
  sourceFile: string,
  pathResolver: PathResolver,
): WxmlReference[] {
  const references: WxmlReference[] = [];

  walkElements(ast, (node) => {
    if (node.name !== 'import' && node.name !== 'include') return;
    const importPath = getAttributeValue(node, 'src');
    if (!importPath) return;
    const resolvedPath = resolveWxmlPath(importPath, sourceFile, pathResolver);
    if (resolvedPath) references.push({ filePath: resolvedPath, kind: node.name });
  });

  return references;
}

function resolveWxmlPath(
  importPath: string,
  sourceFile: string,
  pathResolver: PathResolver,
): string | null {
  try {
    return pathResolver.resolveAnyPath(normalizeWxmlImportPath(importPath), sourceFile, ['wxml']);
  } catch (err) {
    logger.warn(`Error processing import ${importPath} in ${sourceFile}: ${err}`);
    return null;
  }
}

function getAttributeValue(node: WXElementNode, key: string): string | undefined {
  const value = node.startTag?.attributes?.find((attr) => attr.key === key)?.value;
  return typeof value === 'string' ? value : undefined;
}

function walkElements(ast: WXNode | Program, callback: (node: WXElementNode) => void): void {
  if (ast.type === 'WXElement') {
    callback(ast);
    for (const child of ast.children || []) walkElements(child, callback);
  } else if (ast.type === 'Program') {
    for (const node of ast.body || []) walkElements(node, callback);
  }
}
