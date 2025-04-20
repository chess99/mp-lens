import chalk from 'chalk';
import * as fs from 'fs';
import { analyzeProject } from '../analyzer/analyzer';
import { CommandOptions } from '../types/command-options';
import { formatOutput } from '../utils/output-formatter';

/**
 * 用于list-unused命令的选项接口
 */
export interface ListUnusedOptions extends CommandOptions {
  types: string;
  exclude: string[];
  outputFormat: 'text' | 'json';
  output?: string;
  useAliases?: boolean; // 是否使用路径别名
}

/**
 * 列出未使用的文件
 */
export async function listUnused(options: ListUnusedOptions): Promise<void> {
  const { project, verbose, types, exclude, outputFormat, output } = options;
  
  // 添加额外的调试信息
  console.log('DEBUG - list-unused received options:', JSON.stringify(options, null, 2));
  console.log('DEBUG - Project path:', project);
  console.log('DEBUG - Verbose mode:', verbose);
  console.log('DEBUG - File types:', types);
  
  if (verbose) {
    console.log(chalk.blue('🔍 开始分析项目依赖关系...'));
    console.log(`项目路径: ${project}`);
    console.log(`分析的文件类型: ${types}`);
    
    if (exclude && exclude.length > 0) {
      console.log(`排除模式: ${exclude.join(', ')}`);
    }
  }

  try {
    // 分析项目获取未使用文件列表
    const fileTypes = types.split(',').map(t => t.trim());
    
    // 使用analyzer模块分析项目
    const { unusedFiles } = await analyzeProject(project, {
      fileTypes,
      excludePatterns: exclude || [],
      verbose
    });
    
    // 格式化输出
    const formattedOutput = formatOutput(unusedFiles, {
      format: outputFormat,
      projectRoot: project
    });
    
    // 判断是否需要输出到文件
    if (output) {
      fs.writeFileSync(output, formattedOutput);
      console.log(chalk.green(`✅ 未使用文件列表已保存到: ${output}`));
    } else {
      // 输出到控制台
      console.log(formattedOutput);
    }
    
    // 在verbose模式下输出统计信息
    if (verbose) {
      console.log(chalk.blue(`共发现 ${unusedFiles.length} 个未使用的文件`));
    }
  } catch (error) {
    console.error(chalk.red(`❌ 分析失败: ${(error as Error).message}`));
    throw error;
  }
} 