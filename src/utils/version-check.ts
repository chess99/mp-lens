import chalk from 'chalk';
import { execSync } from 'child_process';
import semver from 'semver';
import { version } from '../../package.json';

export async function checkForUpdates(): Promise<void> {
  try {
    // 获取最新版本
    const latestVersion = execSync('npm view mp-lens version').toString().trim();

    // 比较版本
    if (semver.gt(latestVersion, version)) {
      console.log('\n' + chalk.yellow('⚠️  发现新版本！'));
      console.log(chalk.gray(`当前版本：${version}`));
      console.log(chalk.green(`最新版本：${latestVersion}`));
      console.log(chalk.blue('\n要更新到最新版本，请运行：'));

      // 检测是否通过 npx 运行
      const isNpx = process.env.npm_config_user_agent?.includes('npx');
      if (isNpx) {
        console.log(chalk.cyan('  npx mp-lens@latest <命令>'));
        console.log(chalk.gray('  或者安装到本地项目：'));
        console.log(chalk.cyan('  npm install --save-dev mp-lens@latest'));
      } else {
        console.log(chalk.cyan('  npm install -g mp-lens@latest'));
      }
      console.log(); // 添加空行
    }
  } catch (error) {
    // 静默处理错误，不影响主程序运行
    console.debug('版本检查失败：', error);
  }
}
