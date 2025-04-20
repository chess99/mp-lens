export interface CommandOptions {
  project: string;
  verbose?: boolean;
  config?: string;
}

export interface AnalyzerOptions {
  fileTypes: string[];
  excludePatterns?: string[];
  verbose?: boolean;
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
}

export interface CleanOptions extends CommandOptions {
  types: string;
  exclude: string[];
  dryRun: boolean;
  backup?: string;
  yes: boolean;
}

export interface ListUnusedOptions extends CommandOptions {
  types: string;
  exclude: string[];
  outputFormat: 'text' | 'json';
  output?: string;
}

export interface ConfigFileOptions {
  excludePatterns?: string[];
  aliases?: {
    [key: string]: string | string[];
  };
} 