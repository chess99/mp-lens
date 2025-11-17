import chalk from 'chalk';
import execa from 'execa';
import semver from 'semver';
import { version } from '../version';

const PACKAGE_NAME = 'mp-lens';
const CHECK_TIMEOUT_MS = 4000;

export async function checkForUpdates(): Promise<string | null> {
  try {
    if (version === 'unknown') {
      console.debug('当前版本未知，跳过版本检查');
      return null;
    }

    const { stdout } = await execa('npm', ['view', PACKAGE_NAME, 'version'], {
      timeout: CHECK_TIMEOUT_MS,
    });
    const latestVersion = stdout.trim();

    if (semver.valid(latestVersion) && semver.gt(latestVersion, version)) {
      const hint = await buildInstallHint();
      return [
        '',
        chalk.blue(`发现新版本：${chalk.gray(version)} → ${chalk.green(latestVersion)}`),
        hint,
        '',
      ].join('\n');
    }
  } catch (error) {
    console.debug('版本检查失败：', error);
    return null;
  }
  return null;
}

async function buildInstallHint(): Promise<string> {
  const userAgent = process.env.npm_config_user_agent ?? '';
  if (userAgent.includes('npx')) {
    return chalk.blue('立即升级: npx mp-lens@latest <命令>');
  }

  const importIsInstalledGlobally = new Function(
    'return import("is-installed-globally");',
  ) as () => Promise<typeof import('is-installed-globally')>;

  const { default: isInstalledGlobally } = await importIsInstalledGlobally();

  if (isInstalledGlobally) {
    return chalk.blue('立即升级: npm install -g mp-lens@latest');
  }

  return chalk.blue('立即升级: npm install --save-dev mp-lens@latest');
}
