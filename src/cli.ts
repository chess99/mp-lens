#!/usr/bin/env node
import { Command } from 'commander';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { version } = require('../package.json');

// Import command functions
import { clean } from './commands/clean';
import { graph } from './commands/graph';
import { listUnused } from './commands/list-unused';
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

// list-unused command
program
  .command('list-unused')
  .description('分析项目并列出检测到的未使用文件')
  .option('--types <types>', '指定要检查的文件扩展名，用逗号分隔') // No default here, let command handle it
  .option(
    '--exclude <pattern>',
    '用于排除文件/目录的 Glob 模式',
    (value: string, previous: string[]) => previous.concat([value]),
    [],
  )
  .option('--essential-files <files>', '指定视为必要的文件，用逗号分隔')
  .option('--output-format <format>', '输出格式 (text|json)')
  .option('-o, --output <file>', '将列表保存到文件')
  // .option('--use-aliases', '启用路径别名解析') // Alias handled automatically by loader
  .action(async (cmdOptions) => {
    const globalOptions = program.opts();
    setupLogger(globalOptions);
    try {
      // Pass both command and global options to the handler
      await listUnused({ ...globalOptions, ...cmdOptions });
    } catch (error) {
      logger.error(`Command failed: ${(error as Error).message}`);
      // Stack trace logged within command handlers now
      process.exit(1);
    }
  });

// graph command
program
  .command('graph')
  .alias('visualize')
  .description('生成依赖关系图的可视化文件')
  .option('-f, --format <format>', '输出格式 (html|dot|json|png|svg)')
  .option('-o, --output <file>', '保存图文件的路径')
  .option('--depth <number>', '限制依赖图的显示深度', parseInt)
  .option('--focus <file>', '高亮显示与特定文件相关的依赖')
  .option('--npm', 'Include node_modules / miniprogram_npm in graph', false) // Default to false if flag exists
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
  .description('分析项目并删除未使用的文件 (⚠️ 使用此命令务必谨慎！)')
  .option('--types <types>', '指定要删除的文件类型')
  .option(
    '--exclude <pattern>',
    '排除某些文件/目录不被删除',
    (value: string, previous: string[]) => previous.concat([value]),
    [],
  )
  .option('--essential-files <files>', '指定视为必要的文件，用逗号分隔')
  .option('--dry-run', '只显示会被删除的文件，不实际执行', false)
  .option('--yes', '跳过删除确认提示', false)
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

// Parse arguments
program.parse(process.argv);
