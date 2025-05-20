import * as fs from 'fs';
import * as path from 'path';
import { logger } from './debug-logger';

/**
 * 资源解析器
 * 用于定位UI资源文件
 */
export class AssetResolver {
  /**
   * 获取UI资源文件路径
   * @param relativePath 资源文件的相对路径
   * @returns 完整的文件路径
   */
  static getAssetPath(relativePath: string): string {
    // 编译后的结构 (当 outDir is './dist'):
    // - TypeScript 编译到: dist/
    // - UI 资源输出到: dist/ui-assets/
    // 因此 __dirname 在编译后会是 dist/utils

    // 首先检查相对于当前目录的路径 (支持从编译后的dist/utils目录访问)
    const compiledPath = path.resolve(__dirname, '../ui-assets', relativePath);
    if (fs.existsSync(compiledPath)) {
      logger.debug(`在编译输出 dist/ui-assets 目录找到资源: ${compiledPath}`);
      return compiledPath;
    }

    // 检查资源是否在本地开发环境 (ts-node运行时，__dirname为src/utils)
    // 这个路径应该仍然有效，因为它尝试从 src/utils 访问 项目根目录/ui-assets 或 项目根目录/dist/ui-assets
    const srcPath = path.resolve(__dirname, '../../../ui-assets', relativePath); // Should we adjust this for dev?
    if (fs.existsSync(srcPath)) {
      logger.debug(`在项目根目录 ui-assets 找到资源 (开发模式): ${srcPath}`);
      return srcPath;
    }

    // 尝试相对于项目根目录的路径
    const projectPath = path.resolve(process.cwd(), 'dist/ui-assets', relativePath);
    if (fs.existsSync(projectPath)) {
      logger.debug(`在当前工作目录的dist/ui-assets找到资源: ${projectPath}`);
      return projectPath;
    }

    // 尝试从当前源码位置直接访问已构建的dist/ui-assets (针对开发模式)
    const directDistPath = path.resolve(__dirname, '../../dist/ui-assets', relativePath);
    if (fs.existsSync(directDistPath)) {
      logger.debug(`在源码相对路径的dist/ui-assets找到资源: ${directDistPath}`);
      return directDistPath;
    }

    // 如果所有位置都找不到，记录警告并返回最可能的路径
    logger.warn(`未找到资源文件: ${relativePath}`);
    logger.debug(`尝试过以下路径:
      - ${compiledPath} (基于编译后的位置)
      - ${srcPath} (基于源码位置)
      - ${projectPath} (基于当前工作目录)
      - ${directDistPath} (直接从源码访问dist)`);

    return compiledPath; // 返回第一个路径用于错误报告
  }

  /**
   * 读取资源文件内容
   * @param relativePath 相对路径
   * @returns 文件内容，如果找不到则返回空字符串
   */
  static getAssetContent(relativePath: string): string {
    const filePath = this.getAssetPath(relativePath);
    try {
      return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
    } catch (error) {
      logger.error(`读取资源文件失败: ${filePath}`, error);
      return '';
    }
  }

  /**
   * 获取JS资源
   * @param relativePath JS文件的相对路径
   * @returns JS内容
   */
  static getJsAsset(relativePath: string): string {
    return this.getAssetContent(relativePath);
  }

  /**
   * 获取CSS资源
   * @param relativePath CSS文件的相对路径
   * @returns CSS内容
   */
  static getCssAsset(relativePath: string): string {
    return this.getAssetContent(relativePath);
  }
}
