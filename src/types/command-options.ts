export interface CommandOptions {
  project: string;
  verbose?: boolean;
  config?: string;
}

export interface AnalyzerOptions {
  fileTypes: string[];
  excludePatterns?: string[];
  verbose?: boolean;
  essentialFiles?: string[];
  miniappRoot?: string;
  entryFile?: string;
  entryContent?: any;
}

export interface OutputOptions {
  format: 'text' | 'json';
  projectRoot: string;
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

export interface ConfigFileOptions {
  excludePatterns?: string[];
  aliases?: {
    [key: string]: string | string[];
  };
  essentialFiles?: string[];
  miniappRoot?: string;
  entryFile?: string;
  entryContent?: any;
} 