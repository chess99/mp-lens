import chalk from 'chalk';
import * as path from 'path';
import { OutputOptions } from '../types/command-options';

/**
 * 格式化未使用文件的输出
 */
export function formatOutput(
  unusedFiles: string[],
  options: OutputOptions
): string {
  const { format, projectRoot } = options;
  
  if (format === 'json') {
    return formatAsJson(unusedFiles, projectRoot);
  } else {
    return formatAsText(unusedFiles, projectRoot);
  }
}

/**
 * 格式化为JSON输出
 */
function formatAsJson(unusedFiles: string[], projectRoot: string): string {
  const result = {
    unusedFiles: unusedFiles.map(file => ({
      absolutePath: file,
      relativePath: path.relative(projectRoot, file),
      type: path.extname(file).replace('.', '')
    })),
    totalCount: unusedFiles.length,
    timestamp: new Date().toISOString()
  };
  
  return JSON.stringify(result, null, 2);
}

/**
 * 格式化为文本输出
 */
function formatAsText(unusedFiles: string[], projectRoot: string): string {
  if (unusedFiles.length === 0) {
    return chalk.green('未发现未使用的文件。');
  }
  
  // 按照文件类型分类
  const filesByType: Record<string, string[]> = {};
  
  for (const file of unusedFiles) {
    const ext = path.extname(file).replace('.', '') || 'unknown';
    
    if (!filesByType[ext]) {
      filesByType[ext] = [];
    }
    
    filesByType[ext].push(file);
  }
  
  // 构建输出文本
  let output = chalk.yellow(`找到 ${unusedFiles.length} 个未使用的文件:\n`);
  
  // 按照文件类型输出
  for (const [type, files] of Object.entries(filesByType)) {
    output += chalk.cyan(`${type.toUpperCase()} 文件 (${files.length}):\n`);
    
    for (const file of files) {
      // 显示相对路径而非绝对路径
      const relativePath = path.relative(projectRoot, file);
      output += `  ${chalk.white(relativePath)}\n`;
    }
  }
  
  return output;
} 