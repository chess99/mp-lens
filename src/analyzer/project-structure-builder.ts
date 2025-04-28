import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { logger } from '../utils/debug-logger';
import { FileParser } from './file-parser';
import { GraphLink, GraphNode, LinkType, NodeType, ProjectStructure } from './project-structure';

export class ProjectStructureBuilder {
  private nodes: Map<string, GraphNode> = new Map();
  private links: GraphLink[] = [];
  private miniappRoot: string;
  private projectRoot: string;
  private fileParser: FileParser;
  private options: AnalyzerOptions;
  private rootNodeId: string | null = null;
  private processedJsonFiles: Set<string> = new Set(); // Avoid infinite loops

  // --- Start: Added appJson details to constructor ---
  private appJsonPath: string | null;
  private appJsonContent: any;
  // --- End: Added appJson details ---

  // --- Start: Add allFiles ---
  private allFiles: string[];
  // --- End: Add allFiles ---

  // --- Start: Add tracking for parsed dependencies --- //
  private parsedModules: Set<string> = new Set();
  // --- End: Add tracking for parsed dependencies --- //

  constructor(
    projectRoot: string,
    miniappRoot: string,
    appJsonPath: string | null,
    appJsonContent: any,
    // --- Start: Added allFiles param ---
    allFiles: string[],
    // --- End: Added allFiles param ---
    options: AnalyzerOptions,
  ) {
    this.projectRoot = projectRoot;
    this.miniappRoot = miniappRoot;
    this.options = options;
    this.appJsonPath = appJsonPath;
    this.appJsonContent = appJsonContent;
    // --- Start: Store allFiles ---
    this.allFiles = allFiles;
    // --- End: Store allFiles ---

    // Pass necessary options to FileParser
    this.fileParser = new FileParser(projectRoot, {
      ...options,
      miniappRoot: miniappRoot,
    });

    logger.info('Starting project structure analysis...');

    // --- Start: Initialize all nodes first --- //
    logger.debug(`Initializing nodes for ${this.allFiles.length} found files.`);
    for (const filePath of this.allFiles) {
      this.addNodeForFile(filePath, 'Module', false); // Add as Module, don't log yet
    }
    logger.info(`Initialized ${this.nodes.size} nodes from file scan.`);
    // --- End: Initialize all nodes first --- //
  }

  async build(): Promise<ProjectStructure> {
    logger.info('Starting project structure analysis...');

    // 1. Find and parse app.json - REMOVED (using constructor values)
    // const appJsonInfo = this.findAndParseAppJson();
    // if (!appJsonInfo) {
    //   // Error logged in findAndParseAppJson
    //   throw new Error(
    //     'Failed to initialize structure: Could not find or parse app.json/entry content.',
    //   );
    // }
    // // Destructure potentially null path and guaranteed content (or {})
    // const { appJsonPath, appJsonContent } = appJsonInfo;

    // Use values passed to constructor
    const appJsonPath = this.appJsonPath;
    const appJsonContent = this.appJsonContent;

    // 2. Create App node
    this.rootNodeId = 'app';
    this.addNode({
      id: this.rootNodeId,
      type: 'App',
      label: 'App',
      // Store path only if it exists
      properties: { path: appJsonPath ? appJsonPath : undefined },
    });

    // Add app.json itself as a module node linked to App, only if path exists
    if (appJsonPath) {
      const appJsonNode = this.addNodeForFile(appJsonPath, 'Module');
      if (appJsonNode) {
        this.addLink(this.rootNodeId, appJsonNode.id, 'Config');
      }
    }

    // 3. Process app.json content (pages, subpackages, etc.)
    // This uses appJsonContent which is guaranteed to be an object (even if empty)
    await this.processAppJsonContent(appJsonContent);

    // 4. Process implicit global files (app.js/ts/wxss)
    this.processImplicitGlobalFiles();

    // --- Start: Final pass to parse all remaining files --- //
    logger.info(`Starting final pass to parse dependencies for all ${this.nodes.size} nodes...`);
    const initialParsedCount = this.parsedModules.size;
    for (const node of this.nodes.values()) {
      // Only parse modules that haven't been touched yet by the recursive build
      if (
        node.type === 'Module' &&
        node.properties?.absolutePath &&
        !this.parsedModules.has(node.properties.absolutePath)
      ) {
        // Use node.properties.absolutePath which is the ID and the key for parsedModules
        await this.parseModuleDependencies(node);
      }
    }
    logger.info(
      `Final pass complete. Parsed an additional ${
        this.parsedModules.size - initialParsedCount
      } modules.`,
    );
    // --- End: Final pass to parse all remaining files --- //

    // Structure is built, return it
    const structure: ProjectStructure = {
      nodes: Array.from(this.nodes.values()),
      links: this.links,
      rootNodeId: this.rootNodeId,
      miniappRoot: this.miniappRoot,
    };

    logger.info(
      `Project structure analysis complete. Found ${structure.nodes.length} nodes and ${structure.links.length} links.`,
    );
    return structure;
  }

  private async processAppJsonContent(content: any): Promise<void> {
    // Process Pages
    if (content.pages && Array.isArray(content.pages)) {
      for (const pagePath of content.pages) {
        await this.processPage(this.rootNodeId!, pagePath, this.miniappRoot);
      }
    }

    // Process Subpackages
    const subpackages = content.subpackages || content.subPackages || [];
    if (Array.isArray(subpackages)) {
      for (const pkg of subpackages) {
        if (pkg.root && pkg.pages && Array.isArray(pkg.pages)) {
          const packageRoot = path.resolve(this.miniappRoot, pkg.root);
          const packageId = `pkg:${pkg.root}`;
          this.addNode({
            id: packageId,
            type: 'Package',
            label: pkg.root,
            properties: { root: packageRoot },
          });
          this.addLink(this.rootNodeId!, packageId, 'Structure');

          for (const pagePath of pkg.pages) {
            const fullPagePath = path.join(pkg.root, pagePath);
            await this.processPage(packageId, fullPagePath, this.miniappRoot);
          }
          // TODO: Process subpackage-specific app.js/ts?
        }
      }
    }

    // Process Global usingComponents
    if (content.usingComponents && typeof content.usingComponents === 'object') {
      for (const [_name, compPath] of Object.entries(content.usingComponents)) {
        if (typeof compPath === 'string' && !compPath.startsWith('plugin://')) {
          await this.processComponent(this.rootNodeId!, compPath as string, this.miniappRoot);
        }
      }
    }

    // TODO: Process TabBar, Theme, Workers etc. (similar to parseEntryContent)
    this.processTabBar(content);
    this.processTheme(content);
    this.processWorkers(content);
  }

  private async processPage(
    parentId: string,
    pageBasePath: string,
    currentRoot: string,
  ): Promise<void> {
    const pageId = `page:${pageBasePath}`;
    this.addNode({
      id: pageId,
      type: 'Page',
      label: pageBasePath,
      properties: { basePath: path.resolve(currentRoot, pageBasePath) },
    });
    this.addLink(parentId, pageId, 'Structure');

    // Process related files (json, js, wxml, wxss)
    await this.processRelatedFiles(pageId, pageBasePath, currentRoot);
  }

  private async processComponent(
    parentId: string,
    componentBasePath: string,
    currentRoot: string,
  ): Promise<GraphNode | null> {
    const componentId = `comp:${componentBasePath}`;
    const absoluteBasePath = path.resolve(currentRoot, componentBasePath);

    // Check if already processed to avoid cycles in structure definition
    if (this.nodes.has(componentId)) {
      // Add link from new parent if it doesn't exist
      this.addLink(parentId, componentId, 'Structure');
      return this.nodes.get(componentId)!;
    }

    const node = this.addNode({
      id: componentId,
      type: 'Component',
      label: componentBasePath,
      properties: { basePath: absoluteBasePath },
    });
    this.addLink(parentId, componentId, 'Structure');

    // Process related files (json, js, wxml, wxss)
    await this.processRelatedFiles(componentId, componentBasePath, currentRoot);
    return node;
  }

  // Processes the standard set of files (.json, .js, .ts, .wxml, .wxss) for a page or component
  private async processRelatedFiles(
    ownerId: string,
    basePath: string,
    currentRoot: string,
  ): Promise<void> {
    const absoluteBasePath = path.resolve(currentRoot, basePath);
    const extensions = ['.json', '.js', '.ts', '.wxml', '.wxss'];

    for (const ext of extensions) {
      const filePath = absoluteBasePath + ext;
      if (fs.existsSync(filePath)) {
        const moduleNode = this.addNodeForFile(filePath, 'Module');
        if (moduleNode) {
          const linkType = ext === '.json' ? 'Config' : 'Structure'; // Or refine link types
          this.addLink(ownerId, moduleNode.id, linkType);

          // If it's a JSON file, parse it for components
          if (ext === '.json') {
            await this.parseComponentJson(ownerId, filePath);
          }

          // Parse the file for its own dependencies (imports, etc.)
          await this.parseModuleDependencies(moduleNode);
        }
      }
    }
  }

  // Parses a component/page's JSON file for `usingComponents`
  private async parseComponentJson(ownerId: string, jsonPath: string): Promise<void> {
    if (this.processedJsonFiles.has(jsonPath)) {
      return; // Avoid redundant processing
    }
    this.processedJsonFiles.add(jsonPath);

    try {
      const content = fs.readFileSync(jsonPath, 'utf-8');
      const jsonContent = JSON.parse(content);

      if (jsonContent.usingComponents && typeof jsonContent.usingComponents === 'object') {
        logger.verbose(`Parsing components for: ${ownerId} from ${jsonPath}`);
        const componentDir = path.dirname(jsonPath);
        for (const [_name, compPath] of Object.entries(jsonContent.usingComponents)) {
          if (typeof compPath === 'string' && !compPath.startsWith('plugin://')) {
            // Resolve relative path from component's directory
            const absoluteCompPath = path.resolve(componentDir, compPath as string);
            // Convert back to relative path from miniapp root for consistency
            const relativeCompPath = path.relative(this.miniappRoot, absoluteCompPath);
            // Use miniappRoot as currentRoot for components found in JSON
            await this.processComponent(ownerId, relativeCompPath, this.miniappRoot);
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to read or parse component JSON: ${jsonPath}`, error);
    }
  }

  // Parses a module file (js, ts, wxml, wxss) for its dependencies
  private async parseModuleDependencies(moduleNode: GraphNode): Promise<void> {
    const filePath = moduleNode.properties?.absolutePath || moduleNode.id;
    if (!filePath || typeof filePath !== 'string') {
      logger.warn(`Cannot parse dependencies for node without path: ${moduleNode.id}`);
      return;
    }

    // --- Start: Check if already parsed --- //
    if (this.parsedModules.has(filePath)) {
      logger.trace(`Skipping already parsed module: ${filePath}`);
      return;
    }
    this.parsedModules.add(filePath); // Mark as parsed
    logger.debug(`Parsing dependencies for: ${filePath}`);
    // --- End: Check if already parsed --- //

    try {
      const dependencies = await this.fileParser.parseFile(filePath);
      logger.verbose(`Dependencies for ${filePath}:`, dependencies);
      for (const depPath of dependencies) {
        // Check if dependency exists and is not the file itself
        if (fs.existsSync(depPath) && depPath !== filePath) {
          const depNode = this.addNodeForFile(depPath, 'Module');
          if (depNode) {
            // Determine link type based on file extensions
            const sourceType = path.extname(filePath);
            const targetType = path.extname(depPath);
            let linkType: LinkType = 'Import'; // Default
            if (sourceType === '.wxml' && targetType === '.wxml') linkType = 'Template';
            else if (sourceType === '.wxss' && targetType === '.wxss') linkType = 'Style';
            else if (sourceType === '.wxml' && targetType === '.wxs') linkType = 'Import'; // WXS import

            this.addLink(moduleNode.id, depNode.id, linkType);

            // --- Start: Recurse into dependency --- //
            // Only recurse if it's a module type we typically parse (JS/TS/WXML/WXSS?)
            // Avoid recursing into JSON, images etc. unless necessary
            const depExt = path.extname(depPath).toLowerCase();
            if (['.js', '.ts', '.wxml', '.wxss', '.wxs'].includes(depExt)) {
              await this.parseModuleDependencies(depNode); // Await the recursive call
            }
            // --- End: Recurse into dependency --- //
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to parse dependencies for file ${filePath}:`, error);
    }
  }

  private processImplicitGlobalFiles(): void {
    const implicitFiles = ['app.js', 'app.ts', 'app.wxss', 'project.config.json', 'sitemap.json'];
    for (const fileName of implicitFiles) {
      const filePath = path.resolve(this.miniappRoot, fileName);
      if (fs.existsSync(filePath)) {
        const node = this.addNodeForFile(filePath, 'Module');
        if (node && this.rootNodeId) {
          this.addLink(this.rootNodeId, node.id, 'Structure');
          // Need to parse these too, in case app.js requires other modules
          this.parseModuleDependencies(node);
        }
      }
    }
  }

  // Helper to add a node, ensuring uniqueness by ID
  private addNode(node: GraphNode, log = true): GraphNode {
    if (!this.nodes.has(node.id)) {
      if (log) {
        logger.verbose(`Adding node (${node.type}): ${node.label} [${node.id}]`);
      }
      this.nodes.set(node.id, node);
    } else if (log) {
      // Optionally log if trying to add again, maybe update type?
      // logger.trace(`Node already exists: ${node.id}. Current type: ${this.nodes.get(node.id)?.type}, Attempted type: ${node.type}`);
    }
    return this.nodes.get(node.id)!;
  }

  // Helper to create/add a node specifically for a file path
  private addNodeForFile(absolutePath: string, type: NodeType, log = true): GraphNode | null {
    if (!fs.existsSync(absolutePath)) return null;
    const relativePath = path.relative(this.projectRoot, absolutePath);
    const nodeId = absolutePath; // Use absolute path as unique ID for file modules

    // Check if node exists, potentially update type if more specific?
    const existingNode = this.nodes.get(nodeId);
    if (existingNode) {
      // If we find a Page/Component later, should we update the type from 'Module'?
      // For now, let's just return the existing node.
      // Maybe update the label if it was just a placeholder?
      return existingNode;
    }

    return this.addNode(
      {
        id: nodeId,
        type: type,
        label: relativePath,
        properties: { absolutePath: absolutePath }, // Store absolute path
      },
      log,
    );
  }

  // Helper to add a link, preventing duplicates
  private addLink(sourceId: string, targetId: string, type: LinkType): void {
    // Ensure nodes exist
    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      logger.warn(`Attempted to add link between non-existent nodes: ${sourceId} -> ${targetId}`);
      return;
    }

    // Check for existing link (simple check)
    const exists = this.links.some(
      (l) => l.source === sourceId && l.target === targetId && l.type === type,
    );
    if (!exists) {
      logger.verbose(`Adding link (${type}): ${sourceId} -> ${targetId}`);
      this.links.push({ source: sourceId, target: targetId, type: type });
    }
  }

  // --- Start: Added processing functions for TabBar, Theme, Workers ---

  private processTabBar(content: any): void {
    if (content.tabBar && content.tabBar.list && Array.isArray(content.tabBar.list)) {
      logger.debug('Processing tabBar entries...');
      content.tabBar.list.forEach((item: any) => {
        // pagePath defines a page structure
        if (item.pagePath) {
          // Process page structure (json, js, wxml, wxss)
          // We don't know the parent context here (App or Package), link from App root?
          // This might re-process pages already found via 'pages' or 'subpackages',
          // but processPage/processRelatedFiles handles duplicates.
          this.processPage(this.rootNodeId!, item.pagePath, this.miniappRoot);
        }
        // Icons are single file dependencies
        if (item.iconPath) {
          this.addSingleFileLink(this.rootNodeId!, item.iconPath, 'Resource');
        }
        if (item.selectedIconPath) {
          this.addSingleFileLink(this.rootNodeId!, item.selectedIconPath, 'Resource');
        }
      });
    }
  }

  private processTheme(content: any): void {
    // Check for themeLocation first
    if (content.themeLocation && typeof content.themeLocation === 'string') {
      logger.debug(`Processing themeLocation: ${content.themeLocation}`);
      this.addSingleFileLink(this.rootNodeId!, content.themeLocation, 'Config');
    }
    // Always check for default theme.json
    logger.debug('Checking for default theme.json');
    this.addSingleFileLink(this.rootNodeId!, 'theme.json', 'Config');
  }

  private processWorkers(content: any): void {
    // Workers field defines entry points for worker threads
    if (content.workers && typeof content.workers === 'string') {
      logger.debug(`Processing workers entry: ${content.workers}`);
      // Treat the worker root directory/file itself as a structural link from App
      // We might need more sophisticated handling if it's a directory
      // For now, add link to the file/dir specified
      this.addSingleFileLink(this.rootNodeId!, content.workers, 'WorkerEntry');
      // TODO: Potentially need to parse files within the worker directory?
      // This depends on how workers load dependencies.
      // For now, just ensure the entry point is marked as used.
    }
  }

  // Helper to add a link for a single file path relative to miniappRoot
  private addSingleFileLink(sourceId: string, relativePath: string, linkType: LinkType): void {
    const absolutePath = path.resolve(this.miniappRoot, relativePath);
    if (fs.existsSync(absolutePath)) {
      const node = this.addNodeForFile(absolutePath, 'Module');
      if (node) {
        this.addLink(sourceId, node.id, linkType);
        // Parse dependencies of this file too?
        // For simple configs/resources, maybe not needed initially.
        // For workers entry .js, it would be needed.
        if (linkType === 'WorkerEntry') {
          this.parseModuleDependencies(node);
        }
      }
    } else {
      logger.warn(
        `Referenced file in app.json not found: ${relativePath} (Resolved: ${absolutePath})`,
      );
    }
  }
  // --- End: Added processing functions ---
}
