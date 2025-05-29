# Node.js 14 兼容性指南

## 概述

`mp-lens` 从 v0.1.19 开始完全支持 Node.js 14.0.0+。我们通过以下技术手段确保了向后兼容性：

## 技术实现

### 1. AbortController Polyfill

Node.js 14 中缺少 `AbortController` 和 `AbortSignal` 全局对象，这些是 `posthog-node` 等现代库所需要的。我们的解决方案：

```typescript
// src/polyfills/node14-compat.ts
if (typeof globalThis.AbortController === 'undefined') {
  const { AbortController } = require('node-abort-controller');
  globalThis.AbortController = AbortController;
}

if (typeof globalThis.AbortSignal === 'undefined') {
  const { AbortSignal } = require('node-abort-controller');
  globalThis.AbortSignal = AbortSignal;
}
```

### 2. stripVTControlCharacters Polyfill

Node.js 14 中缺少 `util.stripVTControlCharacters` 函数（此函数在 Node.js 16.9.0+ 才引入），而 `inquirer` 库需要此函数来处理控制台交互。我们的解决方案：

```typescript
// src/polyfills/node14-compat.ts
const util = require('util');
if (typeof util.stripVTControlCharacters === 'undefined') {
  util.stripVTControlCharacters = function stripVTControlCharacters(str) {
    if (typeof str !== 'string') {
      return str;
    }
    // 移除 ANSI 转义序列
    const escapeChar = String.fromCharCode(27); // ESC character (0x1B)
    const ansiRegex = new RegExp(escapeChar + '\\[[0-?]*[ -/]*[@-~]', 'g');
    return str.replace(ansiRegex, '');
  };
}
```

### 3. 自动加载机制

polyfill 在 CLI 入口文件的最开始就被加载：

```typescript
// src/cli.ts
// Node.js 14 兼容性 polyfill - 必须在所有其他导入之前
import './polyfills/node14-compat';
```

### 4. esbuild 配置优化

我们的 esbuild 配置确保：

- 目标平台设置为 `node14`
- `node-abort-controller` 依赖被正确打包
- 生成的代码与 Node.js 14 完全兼容

## 使用方法

### 在 Node.js 14 环境下安装

```bash
# 检查 Node.js 版本
node --version  # 应该显示 v14.x.x

# 安装 mp-lens
npm install -g mp-lens

# 或者本地安装
npm install --save-dev mp-lens
```

### 验证兼容性

运行内置的兼容性测试：

```bash
# 如果是全局安装
mp-lens --help

# 如果是本地安装
npx mp-lens --help
```

如果看到帮助信息而没有 `AbortController is not defined` 或 `stripVTControlCharacters is not a function` 错误，说明兼容性正常。

### 常见问题排查

#### 问题：仍然出现 AbortController 错误

**可能原因：**

1. 使用了旧版本的 mp-lens
2. 环境中有其他冲突的全局变量

**解决方案：**

```bash
# 更新到最新版本
npm update -g mp-lens

# 或者重新安装
npm uninstall -g mp-lens
npm install -g mp-lens
```

#### 问题：出现 stripVTControlCharacters 错误

**可能原因：**

1. 使用了旧版本的 mp-lens（< v0.1.19）
2. polyfill 未正确加载

**解决方案：**

确保使用 v0.1.19+ 版本：

```bash
# 检查版本
mp-lens --version

# 重新安装最新版本
npm install -g mp-lens@latest
```

#### 问题：性能较慢

Node.js 14 的性能相比新版本有所差异，这是正常现象。如果可能，建议升级到 Node.js 16+ 以获得更好的性能。

## 开发者信息

### 测试兼容性

项目包含专门的 Node.js 14 兼容性测试：

```bash
# 运行兼容性测试
npm run test:node14

# 完整的构建和测试
npm run build:test
```

### 依赖说明

关键依赖及其 Node.js 14 兼容性：

- `node-abort-controller@^3.1.1`: 提供 AbortController polyfill
- `posthog-node@^4.17.1`: 需要 AbortController 支持
- `inquirer@^12.6.0`: 需要 stripVTControlCharacters 支持
- 其他依赖均与 Node.js 14 兼容

## 反馈

如果您在 Node.js 14 环境下遇到任何问题，请：

1. 确认 Node.js 版本：`node --version`
2. 确认 mp-lens 版本：`mp-lens --version`
3. [提交 issue](https://github.com/chess99/mp-lens/issues) 并包含以上信息
