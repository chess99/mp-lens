#!/usr/bin/env node
import chalk from 'chalk';
import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';

// Import package.json using require instead of ES6 import
const { version } = require('../package.json');

import { cleanUnused } from './commands/clean';
import { generateGraph } from './commands/graph';
import { listUnused } from './commands/list-unused';
import { ConfigFileOptions } from './types/command-options';
import { ConfigLoader } from './utils/config-loader';

// Define a simpler options merging function
async function mergeOptions(cmdOptions: any, globalOptions: any) {
  // Resolve project path to absolute path
  const projectPath = globalOptions.project || process.cwd();
  const resolvedProjectPath = path.resolve(projectPath);
  
  console.log('Original project path:', projectPath);
  console.log('Resolved project path:', resolvedProjectPath);
  console.log('Path exists?', fs.existsSync(resolvedProjectPath) ? 'Yes' : 'No');
  
  // 处理小程序根目录选项
  let miniappRoot = globalOptions.miniappRoot || '';
  let resolvedMiniappRoot = resolvedProjectPath;
  
  if (miniappRoot) {
    resolvedMiniappRoot = path.resolve(resolvedProjectPath, miniappRoot);
    console.log('Miniapp root path:', resolvedMiniappRoot);
    console.log('Miniapp root exists?', fs.existsSync(resolvedMiniappRoot) ? 'Yes' : 'No');
  }
  
  // 加载配置文件
  let configOptions: ConfigFileOptions = {};
  if (globalOptions.config || globalOptions.verbose) {
    try {
      const configResult = await ConfigLoader.loadConfig(globalOptions.config, resolvedProjectPath);
      if (configResult) {
        configOptions = configResult;
        
        if (globalOptions.verbose) {
          console.log('Loaded configuration:', JSON.stringify(configOptions, null, 2));
        }
      }
    } catch (error) {
      console.error(chalk.yellow(`警告: 加载配置文件失败: ${(error as Error).message}`));
    }
  }
  
  // Create merged options with all properties
  const mergedOptions = {
    ...configOptions,  // 配置文件中的选项（最低优先级）
    ...cmdOptions,     // 命令行命令特定选项
    project: resolvedProjectPath,
    miniappRoot: resolvedMiniappRoot !== resolvedProjectPath ? resolvedMiniappRoot : undefined,
    verbose: globalOptions.verbose || false,
    config: globalOptions.config,
    entryFile: globalOptions.entryFile || configOptions.entryFile
  };
  
  // Make sure project field is set
  console.log('Merged options project path:', mergedOptions.project);
  if (mergedOptions.miniappRoot) {
    console.log('Merged options miniapp root:', mergedOptions.miniappRoot);
  }
  if (mergedOptions.entryFile) {
    console.log('Merged options entry file:', mergedOptions.entryFile);
  }
  
  return mergedOptions;
}

const program = new Command();

// Define the global options
program
  .version(version)
  .description('微信小程序依赖分析与清理工具')
  .option('-p, --project <path>', '指定项目的根目录', process.cwd())
  .option('-v, --verbose', '显示更详细的日志输出')
  .option('--config <path>', '指定配置文件的路径')
  .option('--miniapp-root <path>', '指定小程序代码所在的子目录（相对于项目根目录）')
  .option('--entry-file <path>', '指定入口文件路径（相对于小程序根目录，默认为app.json）');

// list-unused command
program
  .command('list-unused')
  .description('分析项目并列出检测到的未使用文件')
  .option('--types <types>', '指定要检查的文件扩展名，用逗号分隔', 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs')
  .option('--exclude <pattern>', '用于排除文件/目录的 Glob 模式', (value: string, previous: string[]) => previous.concat([value]), ['**/output/dependency-graph.*', '**/output/unused-files.*', 'dependency-graph.*', 'unused-files.*', '**/dist/**'] as string[])
  .option('--essential-files <files>', '指定视为必要的文件（永远不会被标记为未使用），用逗号分隔', '')
  .option('--output-format <format>', '输出格式 (text|json)', 'text')
  .option('-o, --output <file>', '将列表保存到文件，而非打印到控制台')
  .option('--use-aliases', '启用路径别名（tsconfig.json中paths）解析')
  .action(async (cmdOptions) => {
    try {
      // Get global options explicitly
      const globalOptions = program.opts();
      console.log('Global options:', JSON.stringify(globalOptions, null, 2));
      console.log('Command options:', JSON.stringify(cmdOptions, null, 2));
      
      // Merge with command options
      const options = await mergeOptions(cmdOptions, globalOptions);
      console.log('Final merged options:', JSON.stringify(options, null, 2));
      
      // Debug output
      if (options.verbose) {
        console.log('项目路径:', options.project);
        console.log('详细模式:', options.verbose);
      }
      
      // Execute the command
      await listUnused(options);
    } catch (error) {
      console.error(chalk.red(`❌ 命令执行失败: ${(error as Error).message}`));
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

// graph command
program
  .command('graph')
  .alias('visualize')
  .description('生成依赖关系图的可视化文件')
  .option('-f, --format <format>', '输出格式 (html|dot|json|png|svg)', 'html')
  .option('-o, --output <file>', '保存图文件的路径')
  .option('--depth <number>', '限制依赖图的显示深度', parseInt)
  .option('--focus <file>', '高亮显示与特定文件相关的依赖')
  .option('--no-npm', '在图中排除 node_modules 或 miniprogram_npm 中的依赖')
  .option('--miniapp-root <path>', '指定小程序代码所在的子目录')
  .option('--entry-file <path>', '指定入口文件路径')
  .action(async (cmdOptions) => {
    try {
      // Get global options explicitly
      const globalOptions = program.opts();
      
      // Merge with command options
      const options = await mergeOptions(cmdOptions, globalOptions);
      
      // Execute the command
      await generateGraph(options);
    } catch (error) {
      console.error(chalk.red(`❌ 命令执行失败: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// clean command
program
  .command('clean')
  .description('分析项目并删除未使用的文件 (⚠️ 使用此命令务必谨慎！)')
  .option('--types <types>', '指定要删除的文件类型', 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs')
  .option('--exclude <pattern>', '排除某些文件/目录不被删除', (value: string, previous: string[]) => previous.concat([value]), ['**/output/dependency-graph.*', '**/output/unused-files.*', 'dependency-graph.*', 'unused-files.*', '**/dist/**'] as string[])
  .option('--essential-files <files>', '指定视为必要的文件（永远不会被删除），用逗号分隔', '')
  .option('--dry-run', '模拟删除过程，不实际改动文件', false)
  .option('--backup <dir>', '将删除的文件移动到备份目录，而不是永久删除')
  .option('-y, --yes, --force', '跳过交互式确认环节', false)
  .action(async (cmdOptions) => {
    try {
      // Get global options explicitly
      const globalOptions = program.opts();
      
      // Merge with command options
      const options = await mergeOptions(cmdOptions, globalOptions);
      
      // Execute the command
      await cleanUnused(options);
    } catch (error) {
      console.error(chalk.red(`❌ 命令执行失败: ${(error as Error).message}`));
      process.exit(1);
    }
  });

// Handle invalid commands
program.on('command:*', () => {
  console.error(
    chalk.red('❌ 无效的命令: %s'),
    program.args.join(' ')
  );
  console.log(
    `使用 ${chalk.cyan('--help')} 查看可用命令列表.`
  );
  process.exit(1);
});

program.parse(process.argv);