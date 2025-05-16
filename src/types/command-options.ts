export interface GlobalCliOptions {
  config?: string;
  project: string;
  miniappRoot?: string;
  appJsonPath?: string;
  types?: string;
  exclude?: string[];
  essentialFiles?: string;
  includeAssets?: boolean; // 分析项目结构的时候是否包含资源文件
  verboseLevel?: number;
  verbose?: boolean;
  trace?: boolean;
}

export interface CmdGraphOptions {
  format?: 'html' | 'json';
  output?: string;
}

export interface CmdCleanOptions {
  list?: boolean;
  delete?: boolean;
}

export interface CmdLintOptions {
  fix?: boolean;
  path?: string;
}

export interface CmdPurgeWxssOptions {
  write?: boolean;
  wxssFilePathInput?: string;
}

/**
 * 配置文件中可用的选项
 * 包含从配置文件加载的所有可能选项
 */
export interface ConfigFileOptions {
  // 基本选项
  miniappRoot?: string; // 小程序代码子目录

  // 入口文件(app.json), 如未提供会自动尝试在 miniappRoot 内查找
  appJsonPath?: string; // 入口文件路径
  appJsonContent?: any; // 或者直接提供入口文件内容

  // 文件分析相关
  types?: string; // 要检查的文件类型
  exclude?: string[]; // 要排除的文件/目录
  essentialFiles?: string[]; // 必要文件列表
  includeAssets?: boolean; // 是否包含资源文件(png,jpg等)在清理范围

  // 别名相关
  aliases?: {
    // 别名配置
    [key: string]: string | string[];
  };
}

export interface AnalyzerOptions {
  miniappRoot: string;
  fileTypes?: string[];
  excludePatterns?: string[];
  verbose?: boolean;
  verboseLevel?: number;
  essentialFiles?: string[];
  appJsonPath: string;
  appJsonContent?: any;
  includeAssets?: boolean;
}
