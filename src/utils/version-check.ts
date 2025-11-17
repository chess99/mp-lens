import chalk from 'chalk';
import semver from 'semver';
import { version } from '../version';

const PACKAGE_NAME = 'mp-lens';

export async function checkForUpdates(): Promise<void> {
  try {
    if (version === 'unknown') {
      console.debug('当前版本未知，跳过版本检查');
      return;
    }

    // 动态导入 ESM 模块
    const updateNotifier = (await import('update-notifier')).default;
    const notifier = updateNotifier({
      pkg: { name: PACKAGE_NAME, version },
      updateCheckInterval: 0,
      shouldNotifyInNpmScript: true,
    });

    const updateInfo = await notifier.fetchInfo();
    const currentVersion = updateInfo.current ?? version;
    const latestVersion = updateInfo.latest;

    if (latestVersion && semver.gt(latestVersion, currentVersion)) {
      console.log('\n' + chalk.yellow('⚠️  发现新版本！'));
      console.log(chalk.gray(`当前版本：${currentVersion}`));
      console.log(chalk.green(`最新版本：${latestVersion}`));
      console.log(chalk.blue('\n升级示例：'));
      console.log(chalk.cyan('  npm install -g mp-lens@latest'));
      console.log(chalk.cyan('  npx mp-lens@latest <命令>'));
      console.log(chalk.cyan('  npm install --save-dev mp-lens@latest'));
      console.log();
    }
  } catch (error) {
    console.debug('版本检查失败：', error);
  }
}
