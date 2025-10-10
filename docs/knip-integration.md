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
npm install --save-dev mp-lens 

# 或使用yarn
yarn add --dev mp-lens 
```

### 2. 使用示例配置

- 将 `docs/examples/knip.js` 复制到项目根目录并命名为 `knip.js`。
- 按需调整源码目录、忽略规则等；该示例已集成 mp-lens 的动态入口发现与小程序文件解析器。

### 3. 添加 npm script

在你的`package.json`中添加 Knip 命令（支持自动修复并允许移除未使用文件）：

```json
"scripts": {
  "knip:fix": "npx --yes knip --fix --allow-remove-files"
}
```

如需固定 Knip 版本，可使用：

```json
"scripts": {
  "knip:fix": "npx --yes knip@5.40.0 --fix --allow-remove-files"
}
```

### 4. 运行分析

现在你可以运行以下命令来分析并尝试自动修复：

```bash
npm run knip:fix
```

## 配置详解

### 动态入口点发现

`findMiniProgramEntryPoints` 基于 mp-lens 的依赖图可达性生成入口文件列表：

- 返回的入口文件均为相对 `projectRoot` 的模块文件路径（节点类型为 `Module`）
- 默认不包含静态资源文件（如图片等），以降低噪音
- 支持通过别名（alias）解析的组件与模块路径，行为与核心分析一致

它会自动覆盖你的小程序项目中的关键入口点，包括：

- 全局应用文件 (app.js/ts, app.wxss, app.json)
- 主包页面及其关联文件
- 分包页面及其关联文件
- 全局和页面级别注册的组件
- 递归发现所有组件依赖（通过 `analyzeProject` 的图构建与可达性分析实现）

### 自定义编译器

mp-lens 提供了以下主要的小程序文件解析器：

- `parseWxml`: 解析WXML文件中的依赖关系（image src、template import、include、wxs模块）
- `parseWxss`: 解析WXSS文件中的样式导入（@import语句）
- `parseWxs`: 解析WXS文件中的模块导入（require语句）
- `parseJson`: 解析JSON文件中的依赖关系，例如 `app.json` 中的页面和分包路径，页面或组件 `*.json` 文件中的 `usingComponents` 等。

这些解析器帮助 Knip 正确理解小程序特有的文件类型并跟踪它们的依赖关系。

### 上下文与忽略规则

- 通过 `initializeCommandContext` 加载项目上下文（包含 `miniappRoot`、`aliases`、`exclude` 等）
- 可复用 `context.excludePatterns` 作为 Knip 的 `ignore` 列表（已合并 `.gitignore` 与配置项）

## 安全删除导出：配置 ESLint 校验机制

### 为什么需要额外的校验机制？

虽然 Knip 能够有效识别未使用的导出，但在删除这些导出时仍需要谨慎。JavaScript/TypeScript 的模块系统允许从存在的文件中导入不存在的导出，此时导入的变量会是 `undefined`，这可能导致运行时错误而不是编译时错误。

例如：

```typescript
// 文件 A：删除了某个导出
const SOME_CONSTANT = 'value';
// export { SOME_CONSTANT }; // 被删除了

// 文件 B：仍在尝试导入（ESLint 可能不会报错）
import { SOME_CONSTANT } from './A'; // SOME_CONSTANT 会是 undefined
```

### 推荐的 ESLint 配置

为了确保删除导出的安全性，建议在项目中配置以下 ESLint 规则：

```javascript
// .eslintrc.js
module.exports = {
  // ... 其他配置
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint', 'import'],
  settings: {
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
    },
  },
  rules: {
    // 🔥 关键规则：检查命名导入是否真实存在
    'import/named': 'error',

    // 🔥 关键规则：检查导出声明的有效性
    'import/export': 'error',

    // 🔥 关键规则：检查模块是否能解析
    'import/no-unresolved': 'error',

    // 辅助规则：避免其他导入问题
    'import/no-duplicates': 'error',
    'import/no-self-import': 'error',
    'import/no-cycle': ['error', { maxDepth: 10 }],
    'import/no-absolute-path': 'error',

    // TypeScript 相关
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: true,
        varsIgnorePattern: '^_',
        argsIgnorePattern: '^_',
      },
    ],
  },
};
```

### 安全删除工作流程

推荐按照以下步骤安全地删除未使用的导出：

#### 1. 运行 Knip 分析

```bash
npm run knip:fix
```

#### 2. 删除 Knip 标识的未使用导出

根据 Knip 的报告，删除确实未使用的导出。

#### 3. 运行 ESLint 检查

```bash
# 检查所有文件的导入问题
npm run lint

# 或者只检查特定文件
npx eslint src/**/*.{js,ts} --rule '{"import/named": "error", "import/export": "error"}'
```

#### 4. 修复检测到的问题

如果 ESLint 检测到 `import/named` 或 `import/export` 错误，说明有地方仍在尝试导入已删除的导出，需要：

- 删除无效的导入语句
- 或者恢复被误删的导出

#### 5. 运行类型检查（TypeScript 项目）

```bash
npx tsc --noEmit
```

#### 6. 运行测试确认

```bash
npm test
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
