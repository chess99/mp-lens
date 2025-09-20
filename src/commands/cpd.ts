import execa from 'execa';
import * as fs from 'fs';
import path from 'path';
import { CmdCpdOptions, GlobalCliOptions } from '../types/command-options';
import { initializeCommandContext } from '../utils/command-init';
import { logger } from '../utils/debug-logger';
import { HandledError } from '../utils/errors';

/**
 * mp-lens cpd 命令实现，自动调用 jscpd 检查重复代码（通过 execa 调用 CLI）
 */
export async function cpd(cliOptions: GlobalCliOptions, cmdOptions: CmdCpdOptions = {}) {
  // 1. 初始化上下文，获取 miniappRoot、exclude
  const context = await initializeCommandContext(cliOptions);
  const miniappRoot = context.miniappRoot;
  const excludePatterns = context.excludePatterns;

  // 2. 组装 jscpd 参数
  const formats = ['markup', 'css', 'javascript', 'typescript'];
  const formatsExts = {
    markup: ['wxml', 'html'],
    css: ['wxss', 'css'],
    javascript: ['js', 'jsx', 'mjs', 'cjs', 'wxs'],
    typescript: ['ts', 'tsx'],
  };
  const ignore =
    excludePatterns.length > 0
      ? excludePatterns
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
  const isLocalJscpd = fs.existsSync(jscpdBin);
  const commandToRun = isLocalJscpd ? jscpdBin : 'jscpd';

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
    const result = await execa(commandToRun, args, { reject: false, stdio: 'inherit' });

    if (result.failed) {
      if (
        !isLocalJscpd &&
        (result.exitCode === 127 || (result.stderr && /not found|ENOENT/i.test(result.stderr)))
      ) {
        throw new HandledError(
          `jscpd command ('${commandToRun}') not found. 请确保 jscpd 已全局安装或作为项目依赖安装。`,
        );
      }
      const errorMessage = result.stderr || `Process failed with exit code ${result.exitCode}`;
      throw new Error(`jscpd 执行失败 (command: ${commandToRun}): ${errorMessage}`);
    }
  } catch (error) {
    if (error instanceof HandledError || error instanceof Error) {
      throw error;
    }
    throw new Error(`运行 jscpd 时发生未知错误: ${error}`);
  }
}
