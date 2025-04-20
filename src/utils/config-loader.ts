import * as fs from 'fs';
import * as path from 'path';
import { ConfigFileOptions } from '../types/command-options';

/**
 * 配置文件加载器，支持多种格式的配置文件
 */
export class ConfigLoader {
  /**
   * 从指定路径加载配置文件
   * @param configPath 配置文件路径，如果未提供，将自动搜索
   * @param projectRoot 项目根目录
   * @returns 配置对象或null（未找到配置文件）
   */
  static async loadConfig(configPath?: string, projectRoot: string = process.cwd()): Promise<ConfigFileOptions | null> {
    // 如果提供了具体的配置文件路径，直接尝试加载
    if (configPath) {
      return this.loadConfigFile(path.resolve(projectRoot, configPath));
    }

    // 默认配置文件名称（支持多种格式）
    const possibleConfigs = [
      'mp-analyzer.config.js',
      'mp-analyzer.config.ts',
      'mp-analyzer.config.json'
    ];

    // 从项目根目录查找配置文件
    for (const configName of possibleConfigs) {
      const fullPath = path.join(projectRoot, configName);
      if (fs.existsSync(fullPath)) {
        console.log(`找到配置文件: ${fullPath}`);
        return this.loadConfigFile(fullPath);
      }
    }

    console.log(`未找到配置文件，将使用默认配置`);
    return null;
  }

  /**
   * 根据文件类型加载配置文件
   * @param filePath 配置文件路径
   * @returns 配置对象
   */
  private static async loadConfigFile(filePath: string): Promise<ConfigFileOptions | null> {
    try {
      const ext = path.extname(filePath).toLowerCase();

      // 处理不同类型的配置文件
      switch (ext) {
        case '.js':
          return this.loadJavaScriptConfig(filePath);
        case '.ts':
          return this.loadTypeScriptConfig(filePath);
        case '.json':
          return this.loadJsonConfig(filePath);
        default:
          console.warn(`不支持的配置文件格式: ${ext}`);
          return null;
      }
    } catch (error) {
      console.error(`加载配置文件失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 加载JSON格式的配置文件
   */
  private static loadJsonConfig(filePath: string): ConfigFileOptions | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`解析JSON配置文件失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 加载JavaScript格式的配置文件
   */
  private static async loadJavaScriptConfig(filePath: string): Promise<ConfigFileOptions | null> {
    try {
      // 删除可能的缓存，以确保获取最新的配置
      const absolutePath = path.resolve(filePath);
      delete require.cache[absolutePath];

      // 动态导入JavaScript配置文件
      const config = require(absolutePath);
      
      // 如果配置导出为函数，则执行它
      if (typeof config === 'function') {
        return await config();
      }
      
      // 处理ES模块导出（有default属性）
      if (config && config.default) {
        if (typeof config.default === 'function') {
          return await config.default();
        }
        return config.default;
      }
      
      return config;
    } catch (error) {
      console.error(`加载JavaScript配置文件失败: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * 加载TypeScript格式的配置文件
   * 注意：需要项目中安装ts-node才能直接执行TypeScript文件
   */
  private static async loadTypeScriptConfig(filePath: string): Promise<ConfigFileOptions | null> {
    try {
      // 尝试注册ts-node
      try {
        // 直接引用ts-node模块
        const tsNode = require('ts-node');
        
        tsNode.register({
          transpileOnly: true,
          compilerOptions: {
            module: 'commonjs'
          }
        });
      } catch (e) {
        const tsNodeError = e as Error;
        console.error(`加载TypeScript配置需要安装ts-node: ${tsNodeError.message}`);
        return null;
      }
      
      // 使用与JavaScript相同的加载逻辑
      return this.loadJavaScriptConfig(filePath);
    } catch (error) {
      console.error(`加载TypeScript配置文件失败: ${(error as Error).message}`);
      return null;
    }
  }
} 