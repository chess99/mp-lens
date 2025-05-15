export interface CommandOptions {
  project: string;
  verbose?: boolean;
  verboseLevel?: number;
  config?: string;
  list?: boolean;
  delete?: boolean;
  miniappRoot?: string;
  entryFile?: string;
  trace?: boolean;
}

export interface AnalyzerOptions {
  fileTypes?: string[];
  excludePatterns?: string[];
  verbose?: boolean;
  verboseLevel?: number;
  essentialFiles?: string[];
  miniappRoot?: string;
  entryFile?: string;
  entryContent?: any;
  includeAssets?: boolean;
}

export interface OutputOptions {
  format: 'text' | 'json';
  projectRoot: string;
  miniappRoot?: string;
}

export interface GraphOptions extends CommandOptions {
  format?: 'html' | 'json';
  output?: string;
}

export interface CleanOptions extends CommandOptions {
  types: string;
  exclude: string[];
  essentialFiles?: string;
  miniappRoot?: string;
  entryFile?: string;
}

export interface ListUnusedOptions extends CommandOptions {
  types: string;
  exclude: string[];
  essentialFiles?: string;
  outputFormat: 'text' | 'json';
  output?: string;
  miniappRoot?: string;
  entryFile?: string;
}

/**
 * 配置文件中可用的选项
 * 包含从配置文件加载的所有可能选项
 */
export interface ConfigFileOptions {
  // 基本选项
  miniappRoot?: string; // 小程序代码子目录
  entryFile?: string; // 入口文件路径

  // 文件分析相关
  types?: string; // 要检查的文件类型
  exclude?: string[]; // 要排除的文件/目录
  excludePatterns?: string[]; // 要排除的文件/目录（兼容旧的API）
  essentialFiles?: string[] | string; // 必要文件列表
  includeAssets?: boolean; // 是否包含资源文件(png,jpg等)在清理范围

  // 别名相关
  aliases?: {
    // 别名配置
    [key: string]: string | string[];
  };
  aliasMap?: Record<string, string>; // 别名映射（简化版）

  // 输出相关
  outputFormat?: 'text' | 'json'; // list-unused命令输出格式

  // 图表生成相关
  format?: 'html' | 'json'; // graph命令输出格式

  // 高级选项
  entryContent?: any; // 自定义入口内容

  // 输出路径
  output?: string; // 输出文件路径
}
