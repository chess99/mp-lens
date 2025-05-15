#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs'; // Import fs
import * as path from 'path';
import { CleanOptions, CommandOptions, GraphOptions } from './types/command-options'; // Import CommandOptions and GraphOptions

// --- Robust package.json finder ---
function findPackageJson(startDir: string): string {
  let currentDir = path.resolve(startDir);
  // Loop indefinitely, but break or throw inside
  for (;;) {
    const filePath = path.join(currentDir, 'package.json');
    if (fs.existsSync(filePath)) {
      return filePath; // Found it
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached root, not found
      throw new Error('Could not find package.json traversing up from ' + startDir);
    }
    currentDir = parentDir; // Move up for next iteration
  }
}
// --- End finder ---

// Use the finder function
const packageJsonPath = findPackageJson(__dirname);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require(packageJsonPath);

// Import command functions
import { clean } from './commands/clean';
import { graph } from './commands/graph';
import { lint } from './commands/lint';
import { registerPurgeWxssCommand } from './commands/purgewxss';
import { logger, LogLevel } from './utils/debug-logger';

// Remove the local mergeOptions function from cli.ts
/*
async function mergeOptions(cmdOptions: any, globalOptions: any) {
  // ... removed implementation ...
}
*/

// Helper to setup logger based on global options
function setupLogger(globalOptions: any) {
  // Remove unused variable
  // const projectPath = globalOptions.project || process.cwd();
  // const resolvedProjectPath = path.resolve(projectPath);

  // Configure logger verbosity
  if (globalOptions.trace) {
    logger.setLevel(LogLevel.TRACE);
  } else if (globalOptions.verboseLevel > 0) {
    // Ensure level is within bounds
    const level = Math.max(0, Math.min(3, globalOptions.verboseLevel));
    logger.setLevel(level as LogLevel);
  } else if (globalOptions.verbose) {
    logger.setLevel(LogLevel.NORMAL); // or DEBUG? Let's use NORMAL
  } else {
    logger.setLevel(LogLevel.ESSENTIAL);
  }
  // Setting project root will happen within command handlers now
  // logger.setProjectRoot(resolvedProjectPath);
  logger.debug(`Logger level set to: ${logger.getLevel()}`);
}

const program = new Command();

// Define the global options
program
  .version(version)
  .description('微信小程序依赖分析与清理工具')
  .option('-p, --project <path>', '指定项目的根目录', process.cwd())
  .option('-v, --verbose', '显示更详细的日志输出')
  .option(
    '--verbose-level <level>',
    '详细日志级别 (0=基本, 1=正常, 2=详细, 3=追踪)',
    (val: string) => parseInt(val, 10),
    0, // Default verboseLevel to 0
  )
  .option('--trace', '启用最详细的日志输出 (等同于 --verbose-level 3)')
  .option('--config <path>', '指定配置文件的路径')
  .option('--miniapp-root <path>', '指定小程序代码所在的子目录（相对于项目根目录）')
  .option('--entry-file <path>', '指定入口文件路径（相对于小程序根目录，默认为app.json）');

// Define interfaces for command-specific options (these are fine for local parsing)
interface GraphCommandArgs {
  format?: 'html' | 'dot' | 'json' | 'png' | 'svg';
  output?: string;
  depth?: number;
  focus?: string;
  npm?: boolean;
  tree?: boolean;
}

interface CleanCommandArgs {
  types?: string;
  exclude?: string[];
  essentialFiles?: string;
  list?: boolean;
  delete?: boolean;
  includeAssets?: boolean;
}

// graph command
program
  .command('graph')
  .description('生成依赖关系图的可视化文件')
  .option('-f, --format <format>', '输出格式 (html|dot|json|png|svg)')
  .option('-o, --output <file>', '保存图文件的路径')
  .option('--depth <number>', '限制依赖图的显示深度', parseInt)
  .option('--focus <file>', '高亮显示与特定文件相关的依赖')
  .option('--npm', 'Include node_modules / miniprogram_npm in graph', false)
  .option('--tree', '使用树状图可视化 (带节点展开/收起功能)', true)
  .option('--no-tree', '使用传统图形可视化 (D3力导向布局)')
  .action(async (cmdArgs: GraphCommandArgs) => {
    // Use local cmdArgs type
    const globalOptions = program.opts() as CommandOptions; // Cast globalOptions
    setupLogger(globalOptions);
    try {
      // Construct the full options object and cast it to GraphOptions
      await graph({ ...globalOptions, ...cmdArgs } as GraphOptions);
    } catch (error) {
      logger.error(`Command failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// clean command
program
  .command('clean')
  .description('分析项目并删除未使用的文件。默认会先列出文件并提示确认。')
  .option('--types <types>', '指定要分析的文件类型 (覆盖配置文件)')
  .option(
    '--exclude <pattern>',
    '排除某些文件/目录 (覆盖配置文件)',
    (value: string, previous: string[]) => previous.concat([value]), // value and previous are correctly typed by commander here
    [],
  )
  .option('--essential-files <files>', '指定视为必要的文件，用逗号分隔 (覆盖配置文件)')
  .option('--list', '只列出将被删除的文件，不执行任何操作', false)
  .option('--delete', '直接删除文件，不进行确认提示', false)
  .option('--includeAssets', '在分析和清理中包含图片等资源文件 (默认不包含)', false)
  .action(async (cmdArgs: CleanCommandArgs) => {
    // Use local cmdArgs type
    const globalOptions = program.opts() as CommandOptions; // Cast globalOptions
    setupLogger(globalOptions);
    try {
      // Construct the full options object and cast it to CleanOptions
      await clean({ ...globalOptions, ...cmdArgs } as CleanOptions);
    } catch (error) {
      logger.error(`Command failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// lint command
program
  .command('lint [path]')
  .description('分析小程序项目中组件声明与使用的一致性')
  .option('--fix', '自动修复JSON文件中"声明但未使用"的问题')
  .action(async (...actionArgs: any[]) => {
    const path: string | undefined = actionArgs[0] as string | undefined;
    const cmdOptions: { fix?: boolean } = actionArgs[1] || {};

    const globalOptions = program.opts();
    const rawOptions = {
      ...globalOptions,
      ...cmdOptions,
      path: path,
      fix: !!cmdOptions.fix,
    };

    setupLogger(globalOptions);
    try {
      await lint(rawOptions);
    } catch (error) {
      logger.error(`Command failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// purgewxss command (New command registration)
registerPurgeWxssCommand(program);

// Parse arguments
program.parse(process.argv);
