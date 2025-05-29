// Node.js 14 兼容性 polyfill - 必须在所有其他导入之前
import './polyfills/node14-compat';

import chalk from 'chalk';
import { Command } from 'commander';
import { clean } from './commands/clean';
import { cpd } from './commands/cpd';
import { graph } from './commands/graph';
import { lint } from './commands/lint';
import { purgewxss } from './commands/purgewxss';
import { inferIssueType, shutdownTelemetry, telemetry } from './telemetry';
import { GlobalCliOptions } from './types/command-options';
import { logger, LogLevel } from './utils/debug-logger';
import { HandledError } from './utils/errors';
import { checkForUpdates } from './utils/version-check';
import { version } from './version';

const program = new Command();

// Check for updates before command execution
checkForUpdates();

// Helper to setup logger based on global options
function setupLogger(globalOptions: any) {
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

// Centralized error handler for commands
function commandErrorHandler(errorMessage: string, errorStack?: string) {
  logger.error(errorMessage);
  if (errorStack) {
    logger.debug(errorStack);
  }
  logger.warn(
    chalk.yellow(
      '💡 如果您需要帮助，或怀疑这是一个程序缺陷，请前往 https://github.com/chess99/mp-lens/issues 提交issue。',
    ),
  );
  // 不再直接调用 process.exit(1)，而是抛出异常，让主流程自然结束
  process.exitCode = 1;
}

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
  .option('--entry-file <path>', '指定入口文件路径（相对于小程序根目录，默认为app.json）')
  .option('--types <types>', '指定要分析的文件类型 (覆盖配置文件)')
  .option(
    '--exclude <pattern>',
    '排除某些文件/目录 (覆盖配置文件)',
    (value: string, previous: string[]) => previous.concat([value]),
    [],
  )
  .option('--essential-files <files>', '指定视为必要的文件，用逗号分隔 (覆盖配置文件)')
  .option('--include-assets', '在分析和清理中包含图片等资源文件 (默认不包含)', false);

function withTelemetryAction<T>(
  commandName: string,
  action: (cliOptions: GlobalCliOptions, ...args: any[]) => Promise<T>,
) {
  return async (...args: any[]) => {
    const commandArgs = process.argv.slice(2);
    telemetry.capture({
      event: 'command',
      command: commandName,
      version,
      args: commandArgs,
    } as Omit<import('./telemetry').CommandEvent, 'userId' | 'timestamp'>);
    const cliOptions = program.opts() as GlobalCliOptions;
    setupLogger(cliOptions);
    try {
      await action(cliOptions, ...args);
    } catch (error: any) {
      if (error instanceof HandledError) {
        // 上报用户遇到的预期问题
        telemetry.capture({
          event: 'user-issue',
          command: commandName,
          issueType: inferIssueType(error.message),
          issueMessage: error.message,
          version,
          args: commandArgs,
        } as Omit<import('./telemetry').UserIssueEvent, 'userId' | 'timestamp'>);
      } else {
        // 上报系统错误
        telemetry.capture({
          event: 'error',
          command: commandName,
          version,
          errorMessage: error.message,
          stack: error.stack,
          args: commandArgs,
        } as Omit<import('./telemetry').ErrorEvent, 'userId' | 'timestamp'>);
      }
      commandErrorHandler(`Command failed: ${error.message}`, error.stack);
    } finally {
      await shutdownTelemetry();
    }
  };
}

// graph command
program
  .command('graph')
  .description('生成依赖关系图的可视化文件')
  .option('-f, --format <format>', '输出格式 (html|json)', 'html')
  .option('-o, --output <file>', '保存图文件的路径')
  .action(withTelemetryAction('graph', graph));

// clean command
program
  .command('clean')
  .description('分析项目并删除未使用的文件。默认会先列出文件并提示确认。')
  .option('--write', '实际写入更改（删除文件）', false)
  .action(withTelemetryAction('clean', clean));

// lint command
program
  .command('lint [path]')
  .description('分析小程序项目中组件声明与使用的一致性')
  .option('--fix', '自动修复JSON文件中"声明但未使用"的问题')
  .action(withTelemetryAction('lint', lint));

program
  .command('purgewxss [wxss-file-path]')
  .description(
    '分析 WXML/WXSS 并使用 PurgeCSS 移除未使用的 CSS。未指定路径则处理项目中所有 .wxss 文件。',
  )
  .option('--write', '实际写入对 WXSS 文件的更改。')
  .action(withTelemetryAction('purgewxss', purgewxss));

program
  .command('cpd')
  .description('检测小程序项目中的重复代码（基于 jscpd，自动识别 miniappRoot）')
  .option('--minLines <number>', '最小重复行数', parseInt)
  .option('--minTokens <number>', '最小重复 token 数', parseInt)
  .option('--reporters <string>', '报告输出格式（如 html,console）')
  .action(withTelemetryAction('cpd', cpd));

// Parse arguments
program.parse(process.argv);
