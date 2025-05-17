import execa from 'execa';
import { GlobalCliOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';

export interface CmdCpdOptions {
  minLines?: number;
  minTokens?: number;
  reporters?: string;
}

/**
 * mp-lens cpd 命令实现，自动调用 jscpd 检查重复代码
 */
export async function cpd(cliOptions: GlobalCliOptions, cmdOptions: CmdCpdOptions = {}) {
  // 1. 初始化上下文，获取 miniappRoot、fileTypes、exclude
  const context = await initializeCommandContext(cliOptions);
  const miniappRoot = context.miniappRoot;
  const fileTypes = context.fileTypes;
  const exclude = context.exclude;

  // 2. 组装 jscpd 参数
  const formats = ['markup', 'css', 'javascript', 'typescript'];
  const formatsExts = {
    markup: 'wxml,html',
    css: 'wxss,css',
    javascript: 'js,jsx,mjs,cjs,wxs',
    typescript: 'ts,tsx',
  };
  const ignore =
    exclude.length > 0
      ? exclude
      : [
          '**/node_modules/**',
          '**/dist/**',
          '**/build/**',
          '**/*.json',
          '**/*.md',
          '**/miniprogram_npm/**',
        ];
  const reporters = cmdOptions.reporters || 'html,console';
  const minLines = cmdOptions.minLines || 5;
  const minTokens = cmdOptions.minTokens || 50;

  // 3. 构造 jscpd 命令参数
  const args = [
    miniappRoot,
    '--formats',
    formats.join(','),
    '--formats-exts',
    Object.entries(formatsExts)
      .map(([k, v]) => `${k}:${v}`)
      .join(','),
    '--ignore',
    ignore.join(','),
    '--reporters',
    reporters,
    '--min-lines',
    String(minLines),
    '--min-tokens',
    String(minTokens),
  ];

  logger.info(`Running jscpd on ${miniappRoot} ...`);
  logger.debug(`jscpd args: ${args.join(' ')}`);

  try {
    const result = await execa('jscpd', args, { stdio: 'inherit' });
    if (result.exitCode !== 0) {
      logger.warn('jscpd 检查发现重复代码或有警告。');
    }
  } catch (err: any) {
    logger.error('jscpd 执行失败: ' + (err.shortMessage || err.message));
    process.exit(err.exitCode || 1);
  }
}
