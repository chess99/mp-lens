module.exports = {
  // TypeScript 和 JavaScript 文件
  '*.{ts,js}': ['eslint --fix', 'prettier --write'],

  // JSON 和 Markdown 文件
  '*.{json,md}': ['prettier --write'],

  // 测试文件额外检查
  'tests/**/*.{ts,js}': ['eslint --fix', 'prettier --write'],

  // 源代码文件额外检查
  'src/**/*.{ts,js}': ['eslint --fix', 'prettier --write'],
};
