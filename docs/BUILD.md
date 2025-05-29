# 构建指南

## 概述

项目已从简单的 TypeScript 编译（`tsc`）升级为使用 `esbuild` 的现代化构建流程，以解决 Node 14 兼容性问题。

## 背景

原项目使用简单的 `tsc` 编译，但某些依赖包（如 `commander@12.1.0`、`inquirer@12.6.0`、`uuid@11.1.0`）使用了较新的 JavaScript 语法，导致在 Node 14 环境下无法运行。

## 解决方案

### 新构建工具

- **esbuild**: 用于打包和转译代码
- **目标**: Node 14 兼容性
- **格式**: CommonJS
- **打包策略**: 将有问题的依赖打包进 bundle，保留其他依赖为 external

### 构建产物

1. **CLI 入口** (`dist/cli.js`)
   - 完整打包，包含所有必要依赖
   - 大小约 4.9MB
   - 可直接在 Node 14+ 环境运行

2. **库入口** (`dist/index.js`)
   - 保留更多外部依赖
   - 大小约 97KB
   - 供其他项目导入使用

3. **类型定义** (`dist/*.d.ts`)
   - 完整的 TypeScript 类型支持

### 构建脚本

```bash
# 构建所有产物
npm run build

# 仅构建 CLI
npm run build:cli

# 构建并测试 Node 14 兼容性
npm run build:test

# 测试 Node 14 兼容性
npm run test:node14
```

## 兼容性

### Node 版本支持

- **最低要求**: Node 14.0.0
- **推荐版本**: Node 16+
- **已测试版本**: Node 14, 16, 18, 20

### 依赖处理

#### 打包的依赖（已解决兼容性问题）

- `commander@12.1.0`
- `inquirer@12.6.0`
- `uuid@11.1.0`
- `chalk@4.1.2`
- `semver@7.7.2`
- `glob@10.4.1`
- `minimatch@9.0.4`

#### 保留为外部依赖

- `@antv/g6` (UI相关)
- `preact` (UI相关)
- `chart.js` (UI相关)
- `jscpd` (大型依赖)
- `purgecss` (大型依赖)
- `@babel/*` (大型依赖)

## 开发流程

### 修改代码后

1. 运行构建: `npm run build:cli`
2. 测试兼容性: `npm run test:node14`
3. 测试功能: `node dist/cli.js --help`

### 添加新依赖

1. 安装依赖: `npm install <package>`
2. 如果依赖使用了新语法，考虑将其从 `esbuild.config.js` 的 `external` 列表中移除
3. 重新构建测试

### 发布前检查

```bash
# 完整构建和测试
npm run build:test

# 验证 CLI 功能
node dist/cli.js graph --help
node dist/cli.js clean --help

# 验证库导入
node -e "console.log(Object.keys(require('./dist/index.js')))"
```

## 文件结构

```
dist/
├── cli.js              # CLI 入口 (4.9MB, 包含所有依赖)
├── cli.js.map          # CLI 源码映射
├── index.js            # 库入口 (97KB, 保留外部依赖)
├── index.js.map        # 库源码映射
├── *.d.ts              # TypeScript 类型定义
└── */                  # 子模块类型定义
```

## 故障排除

### 构建失败

1. 检查 Node 版本是否满足要求
2. 清理并重新安装依赖: `rm -rf node_modules package-lock.json && npm install`
3. 清理构建产物: `npm run clean`

### 兼容性问题

1. 运行兼容性测试: `npm run test:node14`
2. 检查新依赖是否需要加入打包列表
3. 验证 TypeScript 配置是否正确

### 性能优化

- CLI 文件较大但包含所有依赖，确保兼容性
- 库文件小巧，适合作为依赖使用
- 可根据需要调整 `esbuild.config.js` 中的 `external` 列表
