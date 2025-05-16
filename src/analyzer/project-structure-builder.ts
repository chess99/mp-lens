import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerOptions } from '../types/command-options';
import { MiniProgramAppJson } from '../types/miniprogram';
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
  private appJsonPath: string | undefined;
  private appJsonContent: MiniProgramAppJson;
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
    appJsonPath: string | undefined,
    appJsonContent: MiniProgramAppJson,
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

    // --- Start: Initialize all nodes first --- //
    logger.debug(`Initializing nodes for ${this.allFiles.length} found files.`);
    for (const filePath of this.allFiles) {
      this.addNodeForFile(filePath, 'Module', false); // Add as Module, don't log yet
    }
    logger.debug(`Initialized ${this.nodes.size} nodes from file scan.`);
    // --- End: Initialize all nodes first --- //
  }

  async build(): Promise<ProjectStructure> {
    logger.info('开始项目结构分析...');

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
    logger.debug(`Starting final pass to parse dependencies for all ${this.nodes.size} nodes...`);
    const initialParsedCount = this.parsedModules.size;
    for (const node of this.nodes.values()) {
      // Only parse modules that haven't been touched yet AND are not JSON files
      const filePath = node.properties?.absolutePath;
      const fileExt = filePath ? path.extname(filePath).toLowerCase() : '';
      if (
        node.type === 'Module' &&
        filePath &&
        !this.parsedModules.has(filePath) &&
        ['.js', '.ts', '.wxml', '.wxss'].includes(fileExt) // Check file extension
      ) {
        // Use node.properties.absolutePath which is the ID and the key for parsedModules
        await this.parseModuleDependencies(node);
      }
    }
    logger.debug(
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
      `项目结构分析完成。发现 ${structure.nodes.length} 个节点和 ${structure.links.length} 条链接。`,
    );
    return structure;
  }

  private async processAppJsonContent(content: MiniProgramAppJson): Promise<void> {
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
    componentBasePath: string, // Path from usingComponents (e.g., '/components/comp', '../../comp')
    currentRoot: string, // Directory of the JSON file that declared the component
  ): Promise<GraphNode | null> {
    let absoluteBasePath: string;
    // Handle absolute paths (relative to miniapp root) vs relative paths
    if (componentBasePath.startsWith('/')) {
      // Resolve from miniapp root, remove leading '/' for path.join/resolve
      absoluteBasePath = path.resolve(this.miniappRoot, componentBasePath.substring(1));
      logger.trace(
        `[processComponent] Resolved absolute component path '${componentBasePath}' -> '${absoluteBasePath}'`,
      );
    } else {
      // Resolve relative to the current JSON file's directory
      absoluteBasePath = path.resolve(currentRoot, componentBasePath);
      logger.trace(
        `[processComponent] Resolved relative component path '${componentBasePath}' in '${currentRoot}' -> '${absoluteBasePath}'`,
      );
    }

    // Create a canonical ID relative to the miniapp root
    const canonicalRelativePath = path.relative(this.miniappRoot, absoluteBasePath);
    // Ensure canonical path doesn't start with '../' if resolution somehow failed
    if (canonicalRelativePath.startsWith('..')) {
      logger.warn(
        `[processComponent] Calculated canonical path '${canonicalRelativePath}' seems incorrect for absolute path '${absoluteBasePath}' relative to miniapp root '${this.miniappRoot}'. Skipping component.`,
      );
      return null; // Or handle error differently
    }

    const canonicalComponentId = `comp:${canonicalRelativePath}`;
    const componentLabel = canonicalRelativePath; // Use the normalized path for label

    // Check if the canonical node already exists
    if (this.nodes.has(canonicalComponentId)) {
      // Node exists, just add the link from the current parent
      this.addLink(parentId, canonicalComponentId, 'Structure');
      logger.trace(
        `[processComponent] Linking existing component ${canonicalComponentId} to parent ${parentId}`,
      );
      return this.nodes.get(canonicalComponentId)!;
    }

    logger.trace(
      `[processComponent] Creating new component node ${canonicalComponentId} with label ${componentLabel}`,
    );
    // Create the node using the canonical ID and label
    const node = this.addNode({
      id: canonicalComponentId,
      type: 'Component',
      label: componentLabel,
      properties: { basePath: absoluteBasePath }, // Store absolute path for reference
    });
    this.addLink(parentId, canonicalComponentId, 'Structure');

    // Process related files using the canonical ID as the owner
    // Call processRelatedFiles with the *original* basePath and the context it came from (currentRoot)
    // processRelatedFiles will re-resolve the absolute path correctly based on its context.
    await this.processRelatedFiles(canonicalComponentId, componentBasePath, currentRoot);

    return node;
  }

  // Processes the standard set of files (.json, .js, .ts, .wxml, .wxss) for a page or component
  private async processRelatedFiles(
    ownerId: string, // Canonical ID of the Page or Component
    basePath: string, // Original base path (relative or absolute depending on caller)
    currentRoot: string, // Context directory for resolving basePath
  ): Promise<void> {
    // Resolve absolute path based on the context provided by the caller
    // Needs the same logic as processComponent to handle '/' prefix
    let absoluteBasePath: string;
    if (basePath.startsWith('/')) {
      absoluteBasePath = path.resolve(this.miniappRoot, basePath.substring(1));
    } else {
      absoluteBasePath = path.resolve(currentRoot, basePath);
    }

    const extensions = ['.json', '.js', '.ts', '.wxml', '.wxss'];

    for (const ext of extensions) {
      // Check both patterns: basePath.ext and basePath/index.ext
      const filePathDirect = absoluteBasePath + ext;
      const filePathIndex = path.join(absoluteBasePath, 'index' + ext);

      let foundFilePath: string | null = null;

      if (fs.existsSync(filePathDirect)) {
        foundFilePath = filePathDirect;
      } else if (fs.existsSync(filePathIndex)) {
        foundFilePath = filePathIndex;
      }

      // If either path was found, process it
      if (foundFilePath) {
        const moduleNode = this.addNodeForFile(foundFilePath, 'Module');
        if (moduleNode) {
          // Assign structural parent ID (using the canonical ownerId)
          if (!moduleNode.properties) moduleNode.properties = {};
          moduleNode.properties.structuralParentId = ownerId;

          // Link owner (Component/Page) -> Module
          this.addLink(ownerId, moduleNode.id, 'Structure');

          // If it's a JSON file, parse it for components
          if (ext === '.json') {
            // Pass the canonical ownerId and the absolute path to the JSON
            await this.parseComponentJson(ownerId, foundFilePath);
          }
          // If it's a script or template, parse dependencies
          else if ('.js,.ts,.wxml,.wxss'.includes(ext)) {
            await this.parseModuleDependencies(moduleNode);
          }
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
            // Resolve component path relative to the JSON file's directory
            // const absoluteCompPath = path.resolve(componentDir, compPath as string);
            // processComponent now resolves absolute path and calculates canonical ID internally
            // We need to provide the correct context (componentDir) for resolving the relative compPath
            await this.processComponent(ownerId, compPath as string, componentDir); // Use componentDir as currentRoot
          }
        }
      }
    } catch (error) {
      logger.warn(`Failed to read or parse component JSON: ${jsonPath}`, error);
    }
  }

  // Parses a module file (js, ts, wxml, wxss) for its dependencies
  private async parseModuleDependencies(moduleNode: GraphNode): Promise<void> {
    const filePath = moduleNode.properties?.absolutePath;
    if (!filePath || this.parsedModules.has(filePath)) {
      return; // Skip if no path or already parsed
    }
    this.parsedModules.add(filePath);

    const relativePath = path.relative(this.projectRoot, filePath);
    logger.debug(`Parsing dependencies for: ${relativePath}`);
    try {
      // Assuming parseFile gives a list of absolute paths of dependencies
      const dependencies = await this.fileParser.parseFile(filePath);

      for (const depAbsolutePath of dependencies) {
        const targetNode = this.addNodeForFile(depAbsolutePath, 'Module');
        if (targetNode) {
          // Use 'Import' as the default dependency link type
          this.addLink(moduleNode.id, targetNode.id, 'Import');

          // --- Populate referredBy ---
          if (!targetNode.properties) targetNode.properties = {};
          if (!targetNode.properties.referredBy) targetNode.properties.referredBy = [];
          // Ensure referredBy stores strings and check for existence
          if (!targetNode.properties.referredBy.includes(moduleNode.id)) {
            targetNode.properties.referredBy.push(moduleNode.id);
          }
          // --- End Populate referredBy ---

          // Recursively parse the dependency if it hasn't been parsed yet
          const depExt = path.extname(depAbsolutePath).toLowerCase();
          if (
            !'.json'.includes(depExt) && // Avoid parsing JSON again here
            !this.parsedModules.has(depAbsolutePath)
          ) {
            await this.parseModuleDependencies(targetNode);
          }
        }
      }
    } catch (error: any) {
      logger.warn(`Error parsing dependencies for ${relativePath}: ${error.message}`);
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

    // 获取文件信息统计
    const fileExt = path.extname(absolutePath).toLowerCase().substring(1) || 'unknown';
    let fileSize = 0;
    try {
      // 获取文件大小
      const stats = fs.statSync(absolutePath);
      fileSize = stats.size;
    } catch (error) {
      logger.warn(`Failed to get file size for ${absolutePath}:`, error);
    }

    return this.addNode(
      {
        id: nodeId,
        type: type,
        label: relativePath,
        properties: {
          absolutePath: absolutePath,
          fileSize,
          fileExt,
        },
      },
      log,
    );
  }

  // Helper to add a link, preventing duplicates
  private addLink(
    sourceId: string,
    targetId: string,
    type: LinkType,
    dependencyType?: string,
  ): void {
    // Avoid self-loops
    if (sourceId === targetId) {
      return;
    }

    const link: GraphLink = { source: sourceId, target: targetId, type };
    if (dependencyType) {
      link.dependencyType = dependencyType;
    }

    // Optional: Check for duplicates if needed
    // const exists = this.links.some(l => l.source === sourceId && l.target === targetId && l.type === type);
    // if (exists) return;

    this.links.push(link);
  }

  // --- Start: Added processing functions for TabBar, Theme, Workers ---

  private processTabBar(content: MiniProgramAppJson): void {
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

  private processTheme(content: MiniProgramAppJson): void {
    // Check for themeLocation first
    if (content.themeLocation && typeof content.themeLocation === 'string') {
      logger.debug(`Processing themeLocation: ${content.themeLocation}`);
      this.addSingleFileLink(this.rootNodeId!, content.themeLocation, 'Config');
    }
    // Always check for default theme.json
    logger.debug('Checking for default theme.json');
    this.addSingleFileLink(this.rootNodeId!, 'theme.json', 'Config');
  }

  private processWorkers(content: MiniProgramAppJson): void {
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
      logger.warn(`app.json 中引用的文件未找到: ${relativePath} (解析路径: ${absolutePath})`);
    }
  }
  // --- End: Added processing functions ---
}
