#!/usr/bin/env node
import chalk from 'chalk';
import { Command } from 'commander';
import { version } from '../package.json';
import { cleanUnused } from './commands/clean';
import { generateGraph } from './commands/graph';
import { listUnused } from './commands/list-unused';

const program = new Command();

program
  .version(version)
  .description('微信小程序依赖分析与清理工具')
  .option('-p, --project <path>', '指定小程序项目的根目录', process.cwd())
  .option('-v, --verbose', '显示更详细的日志输出')
  .option('--config <path>', '指定配置文件的路径');

// list-unused command
program
  .command('list-unused')
  .description('分析项目并列出检测到的未使用文件')
  .option('--types <types>', '指定要检查的文件扩展名，用逗号分隔', 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs')
  .option('--exclude <pattern>', '用于排除文件/目录的 Glob 模式', (value: string, previous: string[]) => previous.concat([value]), [] as string[])
  .option('--output-format <format>', '输出格式 (text|json)', 'text')
  .option('-o, --output <file>', '将列表保存到文件，而非打印到控制台')
  .action(listUnused);

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
  .action(generateGraph);

// clean command
program
  .command('clean')
  .description('分析项目并删除未使用的文件 (⚠️ 使用此命令务必谨慎！)')
  .option('--types <types>', '指定要删除的文件类型', 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs')
  .option('--exclude <pattern>', '排除某些文件/目录不被删除', (value: string, previous: string[]) => previous.concat([value]), [] as string[])
  .option('--dry-run', '模拟删除过程，不实际改动文件', false)
  .option('--backup <dir>', '将删除的文件移动到此目录作为备份，而不是永久删除')
  .option('-y, --yes, --force', '跳过交互式确认环节', false)
  .action(cleanUnused);

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

// If no arguments provided, show help
if (process.argv.length === 2) {
  program.help();
}

program.parse(process.argv); 