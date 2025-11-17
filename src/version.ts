import { readFileSync } from 'fs';
import path, { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
