# 在 `uni-app` 项目中使用 Knip

`mp-lens` 专注于原生微信小程序的产物分析与清理。对于基于 Vue 的 `uni-app` 项目，我们推荐直接在源码层进行清理，而 **`Knip` 是完成此任务的最佳工具**。

本指南旨在为 `uni-app` 开发者提供 `Knip` 的最佳实践配置。通过动态读取 `pages.json`，它可以精确地识别出项目中未被使用的页面、组件和代码，帮助你安全地优化项目。

- Vue 插件参考：[Knip Vue 插件](https://knip.dev/reference/plugins/vue)
- 全量配置参考：[Knip 配置文档](https://knip.dev/overview/configuration)

---

## 快速开始

1. 在 `uni-app` 项目根目录创建 `knip.config.js` 文件，并填入以下内容。

提示：此配置基于 `uni-app` 官方推荐的[标准目录结构](https://uniapp.dcloud.net.cn/tutorial/project.html)。如果你的源码位于 `src` 目录下，请相应地修改 `pagesJsonPath` 并为 `entry` 和 `project` 中的路径添加 `src/` 前缀。

```javascript
// knip.config.js
const fs = require('fs');
const path = require('path');

/** @type {() => Promise<import('knip').KnipConfig>} */
module.exports = async () => {
  const pagesJsonPath = path.join(__dirname, 'pages.json');
  const pagesJson = JSON.parse(fs.readFileSync(pagesJsonPath, 'utf8'));
  const pageEntries = [];

  /**
   * @param {{ path: string }} p
   * @param {string} [packageRoot='']
   */
  const addPageEntry = (p, packageRoot = '') => {
    if (!p || !p.path) return;
    const pagePath = (packageRoot ? path.join(packageRoot, p.path) : p.path).replace(/\\/g, '/');
    // 同时匹配 .vue 与 .nvue（存在则匹配，不存在则忽略）
    pageEntries.push(`${pagePath}.{vue,nvue}`);
  };

  (pagesJson.pages || []).forEach((page) => addPageEntry(page));
  (pagesJson.subPackages || pagesJson.subpackages || []).forEach((subPackage) => {
    const root = subPackage.root || '';
    (subPackage.pages || []).forEach((page) => addPageEntry(page, root));
  });

  return {
    // 入口：主入口 + App + 所有 pages.json 声明的页面（含 .nvue）
    entry: ['main.{ts,js}', 'App.{vue,nvue}', ...pageEntries],
    // 项目扫描范围：排除第三方/生成目录，避免误报
    project: ['*.{js,ts,vue,nvue}', '{pages,components}/**/*.{ts,js,vue,nvue}'],
    ignore: [
      'unpackage/**',
      'dist/**',
      'node_modules/**',
      'uni_modules/**', // 第三方 uni_modules 挂载于运行时，静态分析常误报
      'wxcomponents/**', // 小程序原生组件目录，静态分析常误报
      '**/*.test.{js,ts}', // 示例/演示用测试文件
      '**/uni-app-polyfill.js',
    ],
    // 这些依赖通常由 HBuilderX/uni 工具链提供，不一定显式写在 package.json
    ignoreDependencies: ['vue', 'pinia', 'vuex'],
  };
};
```

1. 运行 Knip 进行分析或修复：

```bash
# 仅分析并显示报告
npx --yes knip

# 自动修复（删除未使用的导出/文件，谨慎使用）
npx --yes knip --fix --allow-remove-files
```

3. (可选) 在 `package.json` 中添加脚本以便于团队协作：

```json
"scripts": {
  "knip": "knip",
  "knip:fix": "knip --fix --allow-remove-files"
}
```

---

## 常见注意事项

- **动态用法**：模板内的动态组件名（如 `<component :is="var">`）、运行时拼接的资源路径等，静态分析无法覆盖，可能导致误报。这类情况需要手动验证或在 `ignore` 配置中排除。
- **路径别名**：Knip 会自动读取并解析 `tsconfig.json` 或 `jsconfig.json` 中的路径别名（`compilerOptions.paths`）。
- **风险提示**：执行 `--fix` 前，请务必确保代码已提交至版本控制，以便于恢复误删的内容。
