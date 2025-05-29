import * as path from 'path';
import { logger } from '../utils/debug-logger';

export class JSONParser {
  constructor() {
    // No dependencies needed for pure text analysis
  }

  async parse(content: string, filePath: string): Promise<string[]> {
    try {
      const jsonContent = JSON.parse(content);
      const dependencies = new Set<string>();

      // --- Process app.json specific fields ---
      this.processPages(jsonContent, dependencies);
      this.processSubPackages(jsonContent, dependencies);
      this.processTabBar(jsonContent, dependencies);

      // --- Process component.json specific fields ---
      this.processUsingComponents(jsonContent, dependencies);
      this.processComponentGenerics(jsonContent, dependencies);

      return Array.from(dependencies);
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        logger.error(`Error parsing JSON file ${filePath}: ${e.message}`);
      } else {
        logger.warn(`Error processing JSON file ${filePath}: ${e.message}`);
      }
      // Don't re-throw parsing errors, just return empty
      return [];
    }
  }

  private processPages(content: any, dependencies: Set<string>): void {
    if (content.pages && Array.isArray(content.pages)) {
      for (const pagePath of content.pages) {
        if (typeof pagePath === 'string') {
          // Add the page path as root-relative
          dependencies.add('/' + pagePath);
        }
      }
    }
  }

  private processSubPackages(content: any, dependencies: Set<string>): void {
    const subpackages = content.subPackages || content.subpackages;
    if (subpackages && Array.isArray(subpackages)) {
      for (const subpackage of subpackages) {
        const root = subpackage.root;
        const subPages = subpackage.pages;
        if (typeof root === 'string' && Array.isArray(subPages)) {
          for (const pagePath of subPages) {
            if (typeof pagePath === 'string') {
              const fullPagePath = '/' + path.posix.join(root, pagePath);
              dependencies.add(fullPagePath);
            }
          }
        }
      }
    }
  }

  private processTabBar(content: any, dependencies: Set<string>): void {
    if (content.tabBar?.list && Array.isArray(content.tabBar.list)) {
      for (const item of content.tabBar.list) {
        if (item && typeof item.iconPath === 'string') {
          dependencies.add(item.iconPath);
        }
        if (item && typeof item.selectedIconPath === 'string') {
          dependencies.add(item.selectedIconPath);
        }
      }
    }
  }

  private processUsingComponents(content: any, dependencies: Set<string>): void {
    if (content.usingComponents && typeof content.usingComponents === 'object') {
      for (const [_componentName, componentPath] of Object.entries(content.usingComponents)) {
        if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
          dependencies.add(componentPath);
        }
      }
    }
  }

  private processComponentGenerics(content: any, dependencies: Set<string>): void {
    if (content.componentGenerics && typeof content.componentGenerics === 'object') {
      for (const genericName in content.componentGenerics) {
        const genericInfo = content.componentGenerics[genericName];
        if (typeof genericInfo === 'object' && genericInfo.default) {
          if (typeof genericInfo.default === 'string') {
            dependencies.add(genericInfo.default);
          }
        }
      }
    }
  }
}
