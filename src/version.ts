import { readFileSync } from 'fs';
import { resolve } from 'path';

let version = 'unknown';

try {
  const packageJsonPath = resolve(__dirname, '../package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  if (typeof packageJson.version === 'string' && packageJson.version.trim()) {
    version = packageJson.version;
  }
} catch (error) {
  console.debug('读取 mp-lens 版本失败：', error);
}

export { version };
