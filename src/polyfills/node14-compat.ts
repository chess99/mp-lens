/**
 * Node.js 14 兼容性 polyfill
 * 添加 AbortController 和 AbortSignal 支持
 */

// 检查是否需要 polyfill AbortController
if (typeof globalThis.AbortController === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AbortController } = require('node-abort-controller');
  globalThis.AbortController = AbortController;
}

// 检查是否需要 polyfill AbortSignal
if (typeof globalThis.AbortSignal === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AbortSignal } = require('node-abort-controller');
  globalThis.AbortSignal = AbortSignal;
}

// 检查是否需要 polyfill stripVTControlCharacters
// 这个函数在 Node.js 16.9.0+ 才引入，inquirer 库会使用到
// eslint-disable-next-line @typescript-eslint/no-var-requires
const util = require('util');
if (typeof util.stripVTControlCharacters === 'undefined') {
  // 简单的 stripVTControlCharacters polyfill
  // 移除 ANSI 转义序列和控制字符
  util.stripVTControlCharacters = function stripVTControlCharacters(str: string): string {
    if (typeof str !== 'string') {
      return str;
    }
    // 简单实现：移除 ANSI 转义序列
    // 使用字符串拼接构建正则表达式避免 linter 错误
    const escapeChar = String.fromCharCode(27); // ESC character (0x1B)
    const ansiRegex = new RegExp(escapeChar + '\\[[0-?]*[ -/]*[@-~]', 'g');
    return str.replace(ansiRegex, '');
  };
}

// 导出一个函数以确保 polyfill 被正确初始化
export function ensureNode14Compatibility(): void {
  // polyfill 已经在模块加载时完成
  // 这个函数主要是为了确保模块被导入
}
