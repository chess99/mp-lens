import * as path from 'path';

type JsonObject = Record<string, unknown>;

export function extractJsonDependencies(jsonContent: JsonObject): string[] {
  const dependencies: string[] = [];

  if (jsonContent.pages && Array.isArray(jsonContent.pages)) {
    for (const pagePath of jsonContent.pages) {
      if (typeof pagePath === 'string') {
        dependencies.push('/' + pagePath);
      }
    }
  }

  const subpackages = jsonContent.subPackages || jsonContent.subpackages;
  if (subpackages && Array.isArray(subpackages)) {
    for (const subpackage of subpackages) {
      if (!subpackage || typeof subpackage !== 'object') {
        continue;
      }
      const root = (subpackage as JsonObject).root;
      const subPages = (subpackage as JsonObject).pages;
      if (typeof root === 'string' && Array.isArray(subPages)) {
        for (const pagePath of subPages) {
          if (typeof pagePath === 'string') {
            dependencies.push('/' + path.posix.join(root, pagePath));
          }
        }
      }
    }
  }

  const tabBar = jsonContent.tabBar;
  const tabBarList = tabBar && typeof tabBar === 'object' ? (tabBar as JsonObject).list : undefined;
  if (Array.isArray(tabBarList)) {
    for (const item of tabBarList) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const tabBarItem = item as JsonObject;
      if (typeof tabBarItem.iconPath === 'string') {
        dependencies.push(tabBarItem.iconPath);
      }
      if (typeof tabBarItem.selectedIconPath === 'string') {
        dependencies.push(tabBarItem.selectedIconPath);
      }
    }
  }

  dependencies.push(...extractJsonComponentReferences(jsonContent));

  return dependencies;
}

export function extractJsonComponentReferences(jsonContent: JsonObject): string[] {
  const componentPaths = new Set<string>();

  if (jsonContent.usingComponents && typeof jsonContent.usingComponents === 'object') {
    for (const [_componentName, componentPath] of Object.entries(jsonContent.usingComponents)) {
      if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
        componentPaths.add(componentPath);
      }
    }
  }

  if (jsonContent.componentGenerics && typeof jsonContent.componentGenerics === 'object') {
    for (const genericInfo of Object.values(jsonContent.componentGenerics)) {
      if (
        genericInfo &&
        typeof genericInfo === 'object' &&
        typeof (genericInfo as { default?: unknown }).default === 'string'
      ) {
        const defaultComponentPath = (genericInfo as { default: string }).default;
        if (!defaultComponentPath.startsWith('plugin://')) {
          componentPaths.add(defaultComponentPath);
        }
      }
    }
  }

  return Array.from(componentPaths);
}
