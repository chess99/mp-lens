import * as path from 'path';
import { logger } from '../utils/debug-logger';

export type JsonDependencyType =
  | 'page' // 页面基路径（如 /pages/index/index 或 /pkg/pages/detail）
  | 'component' // 组件基路径（可能为相对或以 / 开头）
  | 'asset' // 资源（icon 等）
  | 'theme' // 主题文件（theme.json 或 themeLocation）
  | 'worker' // workers 入口或目录
  | 'config'; // 其他配置文件（目前用于与 theme 类似的语义保持扩展性）

export interface JsonDependency {
  type: JsonDependencyType;
  path: string; // 未解析的原始路径（可能是相对或根相对）
}

export class JSONParser {
  constructor() {
    // 纯文本分析，无需依赖注入
  }

  // 兼容旧签名：返回字符串路径数组，用于通用解析器流程（knip等）
  async parse(content: string, filePath: string): Promise<string[]> {
    try {
      const json = JSON.parse(content);
      const deps = this.parseObject(json, filePath);
      // 为保持旧行为（用于通用解析流程与现有测试），仅返回页面/组件/资源三类路径
      const legacy = deps
        .filter((d) => d.type === 'page' || d.type === 'component' || d.type === 'asset')
        .map((d) => d.path);
      return legacy;
    } catch (e: any) {
      if (e instanceof SyntaxError) {
        logger.error(`Error parsing JSON file ${filePath}: ${e.message}`);
      } else {
        logger.warn(`Error processing JSON file ${filePath}: ${e.message}`);
      }
      return [];
    }
  }

  // 新接口：直接基于已解析对象产出带语义的依赖
  parseObject(content: any, filePath: string): JsonDependency[] {
    try {
      const result: JsonDependency[] = [];

      // app.json 相关
      this.collectPages(content, result);
      this.collectSubPackages(content, result);
      this.collectTabBar(content, result);
      this.collectTheme(content, result);
      this.collectWorkers(content, result);

      // 组件/页面 json 相关
      this.collectUsingComponents(content, result);
      this.collectComponentGenerics(content, result);

      return result;
    } catch (e: any) {
      logger.warn(`Error processing JSON object from ${filePath}: ${e.message}`);
      return [];
    }
  }

  private collectPages(content: any, out: JsonDependency[]): void {
    if (content.pages && Array.isArray(content.pages)) {
      for (const pagePath of content.pages) {
        if (typeof pagePath === 'string') {
          out.push({ type: 'page', path: '/' + pagePath });
        }
      }
    }
  }

  private collectSubPackages(content: any, out: JsonDependency[]): void {
    const subpackages = content.subPackages || content.subpackages;
    if (subpackages && Array.isArray(subpackages)) {
      for (const subpackage of subpackages) {
        const root = subpackage?.root;
        const subPages = subpackage?.pages;
        if (typeof root === 'string' && Array.isArray(subPages)) {
          for (const pagePath of subPages) {
            if (typeof pagePath === 'string') {
              const fullPagePath = '/' + path.posix.join(root, pagePath);
              out.push({ type: 'page', path: fullPagePath });
            }
          }
        }
      }
    }
  }

  private collectTabBar(content: any, out: JsonDependency[]): void {
    if (content.tabBar?.list && Array.isArray(content.tabBar.list)) {
      for (const item of content.tabBar.list) {
        if (item && typeof item.iconPath === 'string') {
          out.push({ type: 'asset', path: item.iconPath });
        }
        if (item && typeof item.selectedIconPath === 'string') {
          out.push({ type: 'asset', path: item.selectedIconPath });
        }
      }
    }
  }

  private collectUsingComponents(content: any, out: JsonDependency[]): void {
    if (content.usingComponents && typeof content.usingComponents === 'object') {
      for (const [_name, componentPath] of Object.entries(content.usingComponents)) {
        if (typeof componentPath === 'string' && !componentPath.startsWith('plugin://')) {
          out.push({ type: 'component', path: componentPath });
        }
      }
    }
  }

  private collectComponentGenerics(content: any, out: JsonDependency[]): void {
    if (content.componentGenerics && typeof content.componentGenerics === 'object') {
      for (const genericName in content.componentGenerics) {
        const genericInfo = content.componentGenerics[genericName];
        if (typeof genericInfo === 'object' && genericInfo?.default) {
          if (typeof genericInfo.default === 'string') {
            out.push({ type: 'component', path: genericInfo.default });
          }
        }
      }
    }
  }

  private collectTheme(content: any, out: JsonDependency[]): void {
    // themeLocation 明确指定
    if (content.themeLocation && typeof content.themeLocation === 'string') {
      out.push({ type: 'theme', path: content.themeLocation });
    }
    // 默认 theme.json 始终尝试
    out.push({ type: 'theme', path: 'theme.json' });
  }

  private collectWorkers(content: any, out: JsonDependency[]): void {
    if (content.workers && typeof content.workers === 'string') {
      out.push({ type: 'worker', path: content.workers });
    }
  }
}
