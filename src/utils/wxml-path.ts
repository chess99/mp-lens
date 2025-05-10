/**
 * 标准化 WXML import/include 路径
 * - 以 /、./、../ 开头的保持不变
 * - 其它加上 ./
 * - 绝对 URL/data/template 变量不处理
 */
export function normalizeWxmlImportPath(raw: string): string {
  if (
    !raw ||
    raw.startsWith('/') ||
    raw.startsWith('./') ||
    raw.startsWith('../') ||
    /^(http|https|data):/.test(raw) ||
    /{{.*?}}/.test(raw)
  ) {
    return raw;
  }
  return './' + raw;
}
