import chalk from 'chalk';
import * as fs from 'fs';
import * as inquirer from 'inquirer';
import * as path from 'path';
import { analyzeProject } from '../analyzer/analyzer';
import { CleanOptions } from '../types/command-options';

export async function cleanUnused(options: CleanOptions) {
  const { project, verbose, types, exclude, dryRun, backup, yes, essentialFiles } = options;
  
  if (verbose) {
    console.log(chalk.blue('🔍 开始分析项目依赖关系...'));
    console.log(`项目路径: ${project}`);
    console.log(`要删除的文件类型: ${types}`);
    
    if (exclude.length > 0) {
      console.log(`排除模式: ${exclude.join(', ')}`);
    }
    
    if (essentialFiles) {
      console.log(`必要文件: ${essentialFiles}`);
    }
    
    if (dryRun) {
      console.log(chalk.yellow('⚠️ 干运行模式：只会显示将被删除的文件，不会实际删除'));
    }
    
    if (backup) {
      console.log(`备份目录: ${backup}`);
    }
  }

  try {
    // 安全检查
    if (!dryRun && !backup && !yes) {
      console.log(chalk.yellow('⚠️ 警告：此操作将永久删除文件。请确保您有适当的备份或版本控制。'));
      console.log(chalk.yellow('提示：使用 --dry-run 选项可以预览将被删除的文件而不实际删除它们。'));
      console.log(chalk.yellow('      使用 --backup <dir> 选项可以将文件移动到备份目录而不是删除它们。'));
      
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: '确定要继续吗？',
          default: false
        }
      ]);
      
      if (!answer.proceed) {
        console.log(chalk.blue('操作已取消。'));
        return;
      }
    }
    
    // 分析项目获取未使用文件列表
    const fileTypes = types.split(',').map(t => t.trim());
    
    // 处理必要文件选项
    const essentialFilesList = essentialFiles ? essentialFiles.split(',').map(f => f.trim()) : [];
    
    const { unusedFiles } = await analyzeProject(project, {
      fileTypes,
      excludePatterns: exclude,
      essentialFiles: essentialFilesList,
      verbose
    });
    
    if (unusedFiles.length === 0) {
      console.log(chalk.green('✅ 没有发现未使用的文件！项目文件结构很干净。'));
      return;
    }
    
    // 按照类型对文件进行分组
    const filesByType: Record<string, string[]> = {};
    
    for (const file of unusedFiles) {
      const ext = path.extname(file).replace('.', '') || 'unknown';
      
      if (!filesByType[ext]) {
        filesByType[ext] = [];
      }
      
      filesByType[ext].push(file);
    }
    
    // 显示将被删除的文件
    console.log(chalk.yellow(`找到 ${unusedFiles.length} 个未使用的文件:\n`));
    
    for (const [type, files] of Object.entries(filesByType)) {
      console.log(chalk.cyan(`${type.toUpperCase()} 文件 (${files.length}):`));
      
      for (const file of files) {
        const relativePath = path.relative(project, file);
        console.log(`  ${dryRun ? '' : backup ? '📦 ' : '❌ '}${chalk.white(relativePath)}`);
      }
      
      console.log();
    }
    
    // 如果是试运行模式，不实际删除文件
    if (dryRun) {
      console.log(chalk.blue('试运行模式: 上述文件不会被实际删除。'));
      console.log(chalk.blue('如果要实际删除这些文件，请移除 --dry-run 选项并重新运行命令。'));
      return;
    }
    
    // 如果需要备份，确保备份目录存在
    if (backup) {
      if (!fs.existsSync(backup)) {
        fs.mkdirSync(backup, { recursive: true });
      }
    } else if (!yes) {
      // 二次确认
      const confirmation = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'proceed',
          message: '确定要删除这些文件吗？这个操作不可撤销！',
          default: false
        }
      ]);
      
      if (!confirmation.proceed) {
        console.log(chalk.blue('操作已取消。'));
        return;
      }
    }
    
    // 处理文件
    let processedCount = 0;
    let errorCount = 0;
    
    for (const file of unusedFiles) {
      try {
        if (backup) {
          // 移动到备份目录
          const relativePath = path.relative(project, file);
          const backupPath = path.join(backup, relativePath);
          
          // 确保目标目录存在
          const backupDir = path.dirname(backupPath);
          if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
          }
          
          // 移动文件
          fs.renameSync(file, backupPath);
          
          if (verbose) {
            console.log(`已移动: ${relativePath} -> ${backupPath}`);
          }
        } else {
          // 直接删除
          fs.unlinkSync(file);
          
          if (verbose) {
            console.log(`已删除: ${path.relative(project, file)}`);
          }
        }
        
        processedCount++;
      } catch (error) {
        console.error(chalk.red(`无法处理文件 ${file}: ${(error as Error).message}`));
        errorCount++;
      }
    }
    
    // 显示处理结果
    if (backup) {
      console.log(chalk.green(`✅ 已将 ${processedCount} 个未使用的文件移动到备份目录: ${backup}`));
    } else {
      console.log(chalk.green(`✅ 已删除 ${processedCount} 个未使用的文件`));
    }
    
    if (errorCount > 0) {
      console.log(chalk.yellow(`⚠️ ${errorCount} 个文件处理失败。`));
    }
  } catch (error) {
    console.error(chalk.red(`❌ 分析失败: ${(error as Error).message}`));
    throw error;
  }
}

/**
 * 查找空目录
 */
async function findEmptyDirectories(
  rootDir: string,
  excludePatterns: string[]
): Promise<string[]> {
  const emptyDirs: string[] = [];
  
  // 判断一个目录是否应该被排除
  function shouldExclude(dirPath: string): boolean {
    for (const pattern of excludePatterns) {
      if (path.relative(rootDir, dirPath).match(pattern)) {
        return true;
      }
    }
    return false;
  }
  
  // 判断一个目录是否为空
  function isDirEmpty(dirPath: string): boolean {
    const files = fs.readdirSync(dirPath);
    return files.length === 0;
  }
  
  // 递归检查目录
  function checkDir(dirPath: string) {
    if (shouldExclude(dirPath)) {
      return;
    }
    
    if (isDirEmpty(dirPath)) {
      emptyDirs.push(dirPath);
      return;
    }
    
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(dirPath, entry.name);
        checkDir(subDir);
      }
    }
  }
  
  // 从根目录开始检查
  checkDir(rootDir);
  
  return emptyDirs;
}