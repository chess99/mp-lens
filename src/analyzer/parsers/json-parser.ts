import * as fs from 'fs';
import * as path from 'path';
import { AnalyzerOptions } from '../../types/command-options';
import { logger } from '../../utils/debug-logger';
import { PathResolver } from '../utils/path-resolver';

export class JSONParser {
  private pathResolver: PathResolver;
  private projectRoot: string;
  private options: AnalyzerOptions;

  // Define standard extensions for different contexts
  private readonly componentExtensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
  private readonly pageAllExtensions = ['.js', '.ts', '.wxml', '.wxss', '.json'];
  private readonly imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'];

  constructor(pathResolver: PathResolver, projectRoot: string, options: AnalyzerOptions) {
    this.pathResolver = pathResolver;
    this.projectRoot = projectRoot;
    this.options = options;
  }

  // Helper function to add all existing related files for a given logical path
  private addAllRelatedFiles(
    logicalPath: string, // Original path string from the JSON (e.g., 'pages/index/index', '../../comp/card')
    containingFile: string, // Absolute path of the JSON file being parsed
    extensions: string[], // Allowed extensions for this type (page or component)
    dependencies: Set<string>,
  ): boolean {
    let fileAdded = false;

    // First, resolve the logical path to *one* concrete, absolute file path
    // This handles aliases, relative paths, root paths, and finds the first valid extension
    const oneResolvedPath = this.pathResolver.resolveAnyPath(
      logicalPath,
      containingFile,
      extensions,
    );

    if (!oneResolvedPath) {
      // If resolveAnyPath can't find any file, the reference is likely broken
      if (this.options.verbose) {
        logger.warn(`Could not resolve any file for path: ${logicalPath} from ${containingFile}`);
      }
      return false;
    }

    // If we found one, derive the absolute base path (without extension)
    const resolvedBasePathWithoutExt = oneResolvedPath.replace(/\.[^./]+$/, '');

    // Now check for all required extensions based on the absolute base path
    for (const ext of extensions) {
      const potentialFilePath = resolvedBasePathWithoutExt + ext;
      // Use fs.existsSync now that we have a full absolute path
      if (fs.existsSync(potentialFilePath)) {
        // Ensure we are adding absolute paths
        dependencies.add(potentialFilePath);
        fileAdded = true;
        logger.trace(`Added related file: ${potentialFilePath}`);
      }
    }

    if (!fileAdded && this.options.verbose) {
      // This case should be rare if oneResolvedPath was found, but log just in case
      logger.warn(
        `Found initial file ${oneResolvedPath}, but no files matched extensions [${extensions.join(
          ', ',
        )}] for base ${resolvedBasePathWithoutExt}`,
      );
    }
    return fileAdded;
  }

  async parse(filePath: string): Promise<string[]> {
    try {
      const contentStr = fs.readFileSync(filePath, 'utf-8');
      const content = JSON.parse(contentStr);
      const dependencies = new Set<string>();

      // --- Process app.json specific fields ---
      this.processPages(content, filePath, dependencies);
      this.processSubPackages(content, filePath, dependencies);
      this.processTabBar(content, filePath, dependencies);

      // --- Process component.json specific fields ---
      this.processUsingComponents(content, filePath, dependencies);
      this.processComponentGenerics(content, filePath, dependencies);

      return Array.from(dependencies);
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        logger.error(`Error parsing JSON file ${filePath}: ${e.message}`);
      } else if (this.options.verbose) {
        logger.warn(`Error processing JSON file ${filePath}: ${e.message}`);
      }
      // Don't re-throw parsing errors, just return empty
      return [];
    }
  }

  private processPages(content: any, filePath: string, dependencies: Set<string>): void {
    if (content.pages && Array.isArray(content.pages)) {
      for (const pagePath of content.pages) {
        if (typeof pagePath === 'string') {
          // Use the helper to find all related files
          const added = this.addAllRelatedFiles(
            '/' + pagePath, // Treat as root-relative
            filePath,
            this.pageAllExtensions,
            dependencies,
          );
          if (!added && this.options.verbose) {
            logger.warn(`Could not resolve any files for page path from app.json: /${pagePath}`);
          }
        }
      }
    }
  }

  private processSubPackages(content: any, filePath: string, dependencies: Set<string>): void {
    const subpackages = content.subPackages || content.subpackages;
    if (subpackages && Array.isArray(subpackages)) {
      for (const subpackage of subpackages) {
        const root = subpackage.root;
        const subPages = subpackage.pages;
        if (typeof root === 'string' && Array.isArray(subPages)) {
          for (const pagePath of subPages) {
            if (typeof pagePath === 'string') {
              const fullPagePath = '/' + path.join(root, pagePath);
              // Use the helper to find all related files
              const added = this.addAllRelatedFiles(
                fullPagePath,
                filePath,
                this.pageAllExtensions,
                dependencies,
              );
              if (!added && this.options.verbose) {
                logger.warn(
                  `Could not resolve any files for subpackage page path from app.json: ${fullPagePath}`,
                );
              }
            }
          }
        }
      }
    }
  }

  private processTabBar(content: any, filePath: string, dependencies: Set<string>): void {
    if (content.tabBar?.list && Array.isArray(content.tabBar.list)) {
      for (const item of content.tabBar.list) {
        if (item && typeof item.iconPath === 'string') {
          const resolvedIconPath = this.pathResolver.resolveAnyPath(
            item.iconPath,
            filePath,
            this.imageExtensions,
          );
          if (resolvedIconPath) dependencies.add(resolvedIconPath);
        }
        if (item && typeof item.selectedIconPath === 'string') {
          const resolvedSelectedIconPath = this.pathResolver.resolveAnyPath(
            item.selectedIconPath,
            filePath,
            this.imageExtensions,
          );
          if (resolvedSelectedIconPath) dependencies.add(resolvedSelectedIconPath);
        }
      }
    }
  }

  private processUsingComponents(content: any, filePath: string, dependencies: Set<string>): void {
    if (content.usingComponents && typeof content.usingComponents === 'object') {
      for (const [_componentName, componentPath] of Object.entries(content.usingComponents)) {
        if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
          // Use the helper to find all related files
          const added = this.addAllRelatedFiles(
            componentPath,
            filePath,
            this.componentExtensions,
            dependencies,
          );
          if (!added && this.options.verbose) {
            logger.warn(
              `Could not resolve any files for component path: ${componentPath} in ${filePath}`,
            );
          }
        }
      }
    }
  }

  private processComponentGenerics(
    content: any,
    filePath: string,
    dependencies: Set<string>,
  ): void {
    if (content.componentGenerics && typeof content.componentGenerics === 'object') {
      for (const genericName in content.componentGenerics) {
        const genericInfo = content.componentGenerics[genericName];
        if (genericInfo && typeof genericInfo.default === 'string') {
          const defaultComponentPath = genericInfo.default;
          if (!defaultComponentPath.startsWith('plugin://')) {
            // Use the helper to find all related files for the default component
            const added = this.addAllRelatedFiles(
              defaultComponentPath,
              filePath,
              this.componentExtensions,
              dependencies,
            );
            if (!added && this.options.verbose) {
              logger.warn(
                `Could not resolve any files for default component generic path: ${defaultComponentPath} in ${filePath}`,
              );
            }
          }
        }
      }
    }
  }
}
