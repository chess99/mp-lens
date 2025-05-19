import execa from 'execa';
import * as fs from 'fs';
import path from 'path';
import { GlobalCliOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';

export interface CmdCpdOptions {
  minLines?: number;
  minTokens?: number;
  reporters?: string;
}

/**
 * mp-lens cpd 命令实现，自动调用 jscpd 检查重复代码（通过 execa 调用 CLI）
 */
export async function cpd(cliOptions: GlobalCliOptions, cmdOptions: CmdCpdOptions = {}) {
  // 1. 初始化上下文，获取 miniappRoot、exclude
  const context = await initializeCommandContext(cliOptions);
  const miniappRoot = context.miniappRoot;
  const exclude = context.exclude;

  // 2. 组装 jscpd 参数
  const formats = ['markup', 'css', 'javascript', 'typescript'];
  const formatsExts = {
    markup: ['wxml', 'html'],
    css: ['wxss', 'css'],
    javascript: ['js', 'jsx', 'mjs', 'cjs', 'wxs'],
    typescript: ['ts', 'tsx'],
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
  const reporters = (cmdOptions.reporters || 'html,console').split(',').map((r) => r.trim());
  const minLines = cmdOptions.minLines || 5;
  const minTokens = cmdOptions.minTokens || 50;

  logger.info(`Running jscpd (CLI) on ${miniappRoot} ...`);

  // 优先用本地 node_modules/.bin/jscpd
  const jscpdBin = path.resolve(
    process.cwd(),
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'jscpd.cmd' : 'jscpd',
  );
  const jscpdCmd = fs.existsSync(jscpdBin) ? jscpdBin : 'jscpd';

  const args = [
    miniappRoot,
    '--format',
    formats.join(','),
    '--formats-exts',
    Object.entries(formatsExts)
      .map(([k, v]) => `${k}:${v.join(',')}`)
      .join(';'),
    '--ignore',
    ignore.join(','),
    '--reporters',
    reporters.join(','),
    '--min-lines',
    String(minLines),
    '--min-tokens',
    String(minTokens),
  ];

  try {
    const result = await execa(jscpdCmd, args, { stdio: 'inherit' });
    if (reporters.includes('html')) {
      logger.info('HTML 报告已生成，默认在 report/html/index.html');
    }
    if (result.exitCode === 0) {
      logger.info('jscpd 检查完成。');
    } else {
      logger.warn('jscpd 检查发现重复代码或有警告。');
    }
  } catch (err: any) {
    logger.error('jscpd 执行失败: ' + (err.shortMessage || err.message));
    process.exit(err.exitCode || 1);
  }
}
