import { readFileSync } from 'fs';
import { resolve } from 'path';

// 从环境变量中获取版本信息，由构建工具注入
// 如果是开发环境（process.env.npm_package_version 不存在），则从 package.json 读取
let version: string;

try {
  version =
    process.env.npm_package_version ||
    (() => {
      const packageJsonPath = resolve(__dirname, '../package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      return packageJson.version;
    })();
} catch (error) {
  // 如果都失败了，使用 unknown
  version = 'unknown';
}

export { version };
