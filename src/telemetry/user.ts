import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

const TELEMETRY_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || process.cwd(),
  '.mp-lens',
);
const USER_ID_FILE = path.join(TELEMETRY_DIR, 'telemetry_user_id');

/**
 * 获取或生成匿名 user_id
 */
export function getOrCreateUserId(): string {
  try {
    if (fs.existsSync(USER_ID_FILE)) {
      return fs.readFileSync(USER_ID_FILE, 'utf-8').trim();
    }
    if (!fs.existsSync(TELEMETRY_DIR)) {
      fs.mkdirSync(TELEMETRY_DIR, { recursive: true });
    }
    const userId = uuidv4();
    fs.writeFileSync(USER_ID_FILE, userId, 'utf-8');
    return userId;
  } catch (e) {
    // 失败时返回空字符串，不影响主流程
    return '';
  }
}
