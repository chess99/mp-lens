export interface CommandOptions {
  project: string;
  verbose?: boolean;
  verboseLevel?: number;
  config?: string;
}

export interface AnalyzerOptions {
  fileTypes: string[];
  excludePatterns?: string[];
  verbose?: boolean;
  verboseLevel?: number;
  essentialFiles?: string[];
  miniappRoot?: string;
  entryFile?: string;
  entryContent?: any;
  keepAssets?: string[];
}

export interface OutputOptions {
  format: 'text' | 'json';
  projectRoot: string;
  miniappRoot?: string;
}

export interface GraphOptions extends CommandOptions {
  format: 'html' | 'dot' | 'json' | 'png' | 'svg';
  output?: string;
  depth?: number;
  focus?: string;
  npm?: boolean;
  miniappRoot?: string;
  entryFile?: string;
}

export interface CleanOptions extends CommandOptions {
  types: string;
  exclude: string[];
  essentialFiles?: string;
  dryRun: boolean;
  backup?: string;
  yes: boolean;
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
  keepAssets?: string[]; // Patterns for assets to always keep

  // 别名相关
  aliases?: {
    // 别名配置
    [key: string]: string | string[];
  };
  aliasMap?: Record<string, string>; // 别名映射（简化版）

  // 输出相关
  outputFormat?: 'text' | 'json'; // list-unused命令输出格式

  // 图表生成相关
  format?: 'html' | 'dot' | 'json' | 'png' | 'svg'; // graph命令输出格式
  graphFormat?: 'html' | 'dot' | 'json' | 'png' | 'svg'; // graph命令输出格式（替代名称）
  depth?: number; // 图表依赖深度限制
  graphDepth?: number; // 图表依赖深度限制（替代名称）
  includeNpm?: boolean; // 是否包含npm依赖
  npm?: boolean; // 是否包含npm依赖（替代名称）
  focus?: string; // 要关注的特定文件

  // 清理相关
  dryRun?: boolean; // 是否仅模拟删除
  backup?: string; // 备份目录路径
  backupDir?: string; // 备份目录路径（替代名称）
  yes?: boolean; // 是否跳过确认

  // 高级选项
  entryContent?: any; // 自定义入口内容

  // 输出路径
  output?: string; // 输出文件路径
}
