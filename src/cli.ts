#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs'; // Import fs
import * as path from 'path';

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
  logger.info(`Logger level set to: ${logger.getLevel()}`);
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
    (val) => parseInt(val, 10),
    0, // Default verboseLevel to 0
  )
  .option('--trace', '启用最详细的日志输出 (等同于 --verbose-level 3)')
  .option('--config <path>', '指定配置文件的路径')
  .option('--miniapp-root <path>', '指定小程序代码所在的子目录（相对于项目根目录）')
  .option('--entry-file <path>', '指定入口文件路径（相对于小程序根目录，默认为app.json）');

// graph command
program
  .command('graph')
  .description('生成依赖关系图的可视化文件')
  .option('-f, --format <format>', '输出格式 (html|dot|json|png|svg)')
  .option('-o, --output <file>', '保存图文件的路径')
  .option('--depth <number>', '限制依赖图的显示深度', parseInt)
  .option('--focus <file>', '高亮显示与特定文件相关的依赖')
  .option('--npm', 'Include node_modules / miniprogram_npm in graph', false) // Default to false if flag exists
  .option('--tree', '使用树状图可视化 (带节点展开/收起功能)', true) // Default to true
  .option('--no-tree', '使用传统图形可视化 (D3力导向布局)')
  // Remove --no-npm, use --npm presence (default false)
  .action(async (cmdOptions) => {
    const globalOptions = program.opts();
    setupLogger(globalOptions);
    try {
      // Pass both command and global options to the handler
      await graph({ ...globalOptions, ...cmdOptions });
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
    (value: string, previous: string[]) => previous.concat([value]),
    [],
  )
  .option('--essential-files <files>', '指定视为必要的文件，用逗号分隔 (覆盖配置文件)')
  .option('--list', '只列出将被删除的文件，不执行任何操作', false)
  .option('--delete', '直接删除文件，不进行确认提示', false)
  .option('--includeAssets', '在分析和清理中包含图片等资源文件 (默认不包含)', false)
  .action(async (cmdOptions) => {
    const globalOptions = program.opts();
    setupLogger(globalOptions);
    try {
      // Pass both command and global options to the handler
      await clean({ ...globalOptions, ...cmdOptions });
    } catch (error) {
      logger.error(`Command failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// lint command
program
  .command('lint')
  .description('分析小程序项目中组件声明与使用的一致性')
  .argument('[path]', '可选，指定要分析的文件或目录路径')
  .action(async (path, cmdOptions) => {
    const globalOptions = program.opts();
    setupLogger(globalOptions);
    try {
      await lint({ ...globalOptions, ...cmdOptions, path });
    } catch (error) {
      logger.error(`Command failed: ${(error as Error).message}`);
      process.exit(1);
    }
  });

// Parse arguments
program.parse(process.argv);
