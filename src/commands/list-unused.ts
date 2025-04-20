import chalk from 'chalk';
import * as fs from 'fs';
import { analyzeProject } from '../analyzer/analyzer';
import { CommandOptions } from '../types/command-options';
import { formatOutput } from '../utils/output-formatter';

export interface ListUnusedOptions extends CommandOptions {
  types: string;
  exclude: string[];
  outputFormat: string;
  output?: string;
}

export async function listUnused(options: ListUnusedOptions) {
  const { project, verbose, types, exclude, outputFormat, output } = options;
  
  if (verbose) {
    console.log(chalk.blue('🔍 开始分析项目依赖关系...'));
    console.log(`项目路径: ${project}`);
    console.log(`分析文件类型: ${types}`);
    if (exclude.length > 0) {
      console.log(`排除模式: ${exclude.join(', ')}`);
    }
  }

  try {
    // 分析项目获取未使用文件列表
    const fileTypes = types.split(',').map(t => t.trim());
    const { unusedFiles } = await analyzeProject(project, {
      fileTypes,
      excludePatterns: exclude,
      verbose
    });

    if (unusedFiles.length === 0) {
      console.log(chalk.green('✅ 没有发现未使用的文件！项目文件结构很干净。'));
      return;
    }

    // 格式化输出
    const formattedOutput = formatOutput(unusedFiles, {
      format: outputFormat as 'text' | 'json',
      projectRoot: project
    });

    // 输出到文件或控制台
    if (output) {
      fs.writeFileSync(output, formattedOutput);
      console.log(chalk.green(`✅ 已将未使用文件列表保存到: ${output}`));
    } else {
      console.log(formattedOutput);
      console.log(chalk.yellow(`\n找到 ${unusedFiles.length} 个未使用的文件。使用 'mp-analyzer clean' 命令可以移除这些文件。`));
    }
  } catch (error) {
    console.error(chalk.red(`❌ 分析失败: ${(error as Error).message}`));
    if (verbose) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
} 