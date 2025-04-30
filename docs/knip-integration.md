# mp-lens 与 Knip 集成指南

[Knip](https://knip.dev) 是一个强大的未使用文件、依赖项和导出检测工具，可以帮助你清理项目中的无用代码。mp-lens 提供了专门的解析器和分析工具，使 Knip 能够正确理解小程序项目的文件依赖关系。

## 为什么要集成 mp-lens 和 Knip？

mp-lens 工具专注于分析小程序项目的文件级别依赖，但它自身不能检测模块内部未使用的导出（exports）。而 Knip 在这方面表现出色，它可以精确识别：

- **未使用的导出函数和变量**：找出模块中声明但未被任何地方引用的导出
- **未使用的依赖项**：检测 package.json 中声明但未使用的依赖
- **死代码**：标识可能永远不会执行的代码路径

微信小程序项目有许多特有的文件类型和依赖关系模式，标准的JavaScript/TypeScript工具难以正确识别：

1. **特有文件格式**：WXML、WXSS、WXS文件的依赖关系需要特殊解析
2. **嵌套组件结构**：通过`usingComponents`定义的组件依赖非常常见
3. **分包加载**：小程序特有的分包结构
4. **模板引用**：`<include>`和`<import>`标签创建的模板依赖

mp-lens 提供了专门的解析器和分析工具，使 Knip 能够正确理解这些关系，帮助你:

- 找出未使用的组件和页面
- 识别死代码和未使用的资源
- 识别模块中未使用的导出函数和变量
- 优化小程序包大小
- 提高代码质量和可维护性

## 如何集成

### 1. 安装依赖

首先安装必要的依赖:

```bash
# 使用npm
npm install --save-dev mp-lens knip

# 或使用yarn
yarn add --dev mp-lens knip
```

### 2. 创建 Knip 配置文件

在你的项目根目录创建`knip.js`文件（也可以选择使用`knip.ts`或JSON格式）:

```javascript
// 参考示例位于 docs/examples/knip.js
const { findMiniProgramEntryPoints, parseWxml, parseWxs, parseWxss } = require('mp-lens');
const path = require('path');

// 配置小程序源码目录
const projectRoot = process.cwd();
const miniappRootRelative = 'src'; // 修改为你的小程序源码目录
const miniappRootAbsolute = path.resolve(projectRoot, miniappRootRelative);

/** @type {() => Promise<import('knip').KnipConfig>} */
const config = async () => {
  console.log(`[Knip Config] 动态分析 ${miniappRootRelative} 结构...`);

  // 使用mp-lens函数动态发现入口点
  const mpEntryPoints = await findMiniProgramEntryPoints(projectRoot, miniappRootAbsolute);
  console.log(`[Knip Config] 找到 ${mpEntryPoints.length} 个潜在的小程序入口点.`);

  return {
    // 组合入口点
    entry: [
      ...mpEntryPoints,
      `${miniappRootRelative}/app.json`,
      `${miniappRootRelative}/project.config.json`,
    ],
    // 定义项目文件
    project: [
      `${miniappRootRelative}/**/*.{js,ts,wxml,wxss,json}`,
    ],
    // 自定义编译器支持小程序特有文件
    compilers: {
      wxml: parseWxml,
      wxss: parseWxss,
      wxs: parseWxs,
    },
    // 忽略输出和依赖目录
    ignore: [
      'dist/**',
      'node_modules/**',
    ],
  };
};

module.exports = config;
```

### 3. 添加 npm script

在你的`package.json`中添加 Knip 命令：

```json
"scripts": {
  "knip": "knip",
  "find-unused": "knip"
}
```

### 4. 运行分析

现在你可以运行以下命令来分析你的小程序项目：

```bash
npm run find-unused
```

## 配置详解

### 动态入口点发现

`findMiniProgramEntryPoints` 函数会自动发现你的小程序项目中的所有入口点，包括：

- 全局应用文件 (app.js/ts, app.wxss, app.json)
- 主包页面及其关联文件
- 分包页面及其关联文件
- 全局和页面级别注册的组件
- 递归发现所有组件依赖

### 自定义编译器

mp-lens 提供了三个主要的小程序文件解析器：

- `parseWxml`: 解析WXML文件中的依赖关系（image src、template import、include、wxs模块）
- `parseWxss`: 解析WXSS文件中的样式导入（@import语句）
- `parseWxs`: 解析WXS文件中的模块导入（require语句）

这些解析器帮助 Knip 正确理解小程序特有的文件类型并跟踪它们的依赖关系。

## 高级技巧

### 忽略特定文件

如果有些组件是按需动态加载的，你可能希望排除它们：

```javascript
ignoreDependencies: [
  // 添加 Knip 误报为未使用的依赖
],
ignoreExportsUsedInFile: true, // 忽略在同一文件中使用的导出
```

### 调整日志详细程度

如果你想查看更详细的分析过程：

```bash
# 使用环境变量控制mp-lens的日志级别
MP_LENS_LOG_LEVEL=debug npm run find-unused
```

## 故障排除

如果遇到问题，请尝试：

1. 确保你的`miniappRootRelative`配置正确指向小程序源码目录
2. 检查是否缺少关键的入口文件（特别是app.json）
3. 尝试启用调试日志以获取更多信息
4. 参考 [Knip官方文档](https://knip.dev) 获取更多配置选项

## 资源链接

- [Knip官方文档](https://knip.dev)
- [Knip GitHub仓库](https://github.com/webpro/knip)
- [mp-lens GitHub仓库](https://github.com/chess99/mp-lens)
