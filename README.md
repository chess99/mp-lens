# mp-lens (小程序分析工具)

[![npm](https://img.shields.io/npm/v/mp-lens.svg?style=flat)](https://www.npmjs.org/package/mp-lens)
[![License](https://img.shields.io/npm/l/mp-lens.svg?style=flat)](https://github.com/chess99/mp-lens/blob/master/LICENSE)
[![downloads](https://img.shields.io/npm/dm/mp-lens.svg?style=flat)](https://www.npmjs.org/package/mp-lens)

**`mp-lens` 是一款专为微信小程序开发者设计的命令行工具，旨在解决项目维护中的常见痛点：**

- **项目结构理解**：快速掌握项目全貌，可视化页面、组件、脚本间的复杂依赖。
- **包体积优化**：精准识别并安全移除未使用的文件（组件、页面、图片、脚本等），有效减小项目体积。
- **代码质量提升**：辅助检查组件声明与使用的一致性，清理冗余 CSS 规则。

厌倦了手动排查臃肿的项目和那些难以追踪的孤立文件吗？`mp-lens` 通过深度扫描项目，构建依赖图，并智能分析，让您轻松、安全地优化小程序项目。

## ✨ 功能特性

- **全面的依赖分析:** 扫描多种文件类型（`.js`, `.ts`, `.wxml`, `.wxss`, `.json`, `.wxs`, 及常见图片格式），构建项目依赖图。
- **依赖图可视化:** 生成交互式 HTML 或 JSON 格式的依赖图，清晰展现页面、组件、脚本间的相互联系。
- **精准的未使用文件检测:** 基于依赖分析，准确识别项目中未被任何地方引用的孤立文件（包括页面、组件、脚本、样式、图片、WXS模块等）。
- **灵活的路径别名支持:** 智能解析 TypeScript 路径别名 (Path Aliases) 和自定义别名配置，确保依赖分析的准确性。
- **广泛的项目结构兼容:** 支持自定义小程序项目根目录、`miniappRoot` 和入口文件路径，适配各种项目结构。可自动检测 `app.json`。
- **安全至上的清理机制:**
  - 默认在删除文件前进行**交互式确认**，防止误操作。
  - 支持 Glob 模式，可在分析和清理时**排除**特定文件或目录。
- **高度可配置:** 支持命令行选项快速执行，也支持通过配置文件进行更细致的设置。
- **TypeScript 构建:** 类型安全，代码健壮，易于维护和扩展。

## 🚀 安装

您可以全局安装 `mp-lens`，或将其作为项目的开发依赖项。

**全局安装:**

```bash
npm install -g mp-lens
# 或者
yarn global add mp-lens
```

**本地安装 (推荐):**

```bash
npm install --save-dev mp-lens
# 或者
yarn add --dev mp-lens
```

若本地安装，建议通过 `npx` 运行 (`npx mp-lens <命令>`) 或将其添加到 `package.json` 的 `scripts` 中。

## 💡 使用方法

基本命令结构：

```bash
mp-lens [全局选项] <命令> [命令特定选项]
```

### 全局选项

这些选项适用于所有命令：

- `-p, --project <路径>`: 指定项目的根目录 (默认: 当前执行命令的目录)。
- `--miniapp-root <路径>`: 指定小程序代码所在的子目录（相对于项目根目录）。如果未指定，工具会尝试自动检测（如 `src`, `miniprogram`）。
- `--entry-file <路径>`: 指定入口文件路径（相对于 `miniappRoot`，默认为 `app.json`）。工具会尝试自动检测。
- `--config <路径>`: 指定配置文件的路径 (用于更复杂的设置，详见 [配置文件](#-配置文件) 部分)。
- `--types <类型1,类型2,...>`: 指定要分析的文件类型扩展名，用逗号分隔 (默认: `js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs`)。
- `--exclude <Glob模式>`: 用于排除文件/目录的 Glob 模式。可多次使用此选项以添加多个排除规则。
- `--essential-files <文件1,文件2,...>`: 指定应被视为"必要"的文件路径（相对于 `miniappRoot`），这些文件将永远不会被报告为未使用或被清理。
- `--include-assets`: 在分析和清理中包含图片等资源文件 (默认不包含)。
- `-v, --verbose`: 显示更详细的日志输出，有助于调试。
- `-h, --help`: 显示帮助信息。

### 可用命令

#### 1. `graph` - 生成依赖关系图

可视化项目依赖，帮助理解项目结构。

```bash
# 在当前目录生成交互式 HTML 依赖图
mp-lens graph

# 为指定项目生成 HTML 格式的依赖图
mp-lens -p ../我的小程序 graph -o output/dependency-graph.html

# 生成 JSON 格式的依赖图数据
mp-lens graph -f json -o dependency-data.json
```

**选项:**

- `-f, --format <format>`: 输出格式 (html|json)。默认为 `html`。
- `-o, --output <file>`: 保存图文件的路径。如果未指定，HTML 将保存到 `mp-lens-graph.html`，JSON 将保存到 `mp-lens-graph.json`。

#### `format` (graph)

输出依赖图的格式。支持以下几种格式：

- `html` (默认): 生成一个交互式的 HTML 文件，可在浏览器中查看。
- `json`: 以 JSON 格式输出图的节点和边数据。

![依赖关系图示例](docs/images/dependency-graph-example.png)

#### 2. `clean` - 分析并移除未使用的文件

**⚠️ 警告：此命令会修改或删除您的文件，请务必谨慎操作！**

**强烈建议:**

1. **使用版本控制 (如 Git)**，并在运行 `clean` 前**提交所有更改**。
2. 首次使用时，默认会先预览文件列表并交互式确认。

**默认行为:**

1. 分析项目，找出未使用的文件。
2. 列出将被删除的文件。
3. **提示用户进行交互式确认**后才执行删除。

**用法示例:**

```bash
# 默认模式: 分析并列出未使用文件，然后提示确认删除
mp-lens clean

# 直接写入模式: 实际写入更改（删除文件）
mp-lens clean --write

# 清理特定类型的未使用文件 (例如仅图片，仍会提示确认)
mp-lens --types png,jpg,gif clean

# 清理时排除特定目录 (仍会提示确认)
mp-lens --exclude "**/legacy/**" --exclude "src/archive/**" clean

# 删除未使用的 JS 和 WXML 文件
mp-lens --types js,wxml clean --write
```

**选项:**

- `--write`: 实际写入更改（删除文件），不进行确认提示。**使用此选项前请务必谨慎，建议先在没有此选项的情况下运行以预览要删除的文件。**

#### 3. `lint` - 检查组件声明与使用的一致性

分析小程序项目中自定义组件的 `.json` 声明与 `.wxml` 中的实际使用情况是否匹配。

**主要解决问题:**

- 组件在 `.json` 中声明，但在对应 `.wxml` 中并未使用 ("声明但未使用")。
- 标签在 `.wxml` 中被使用（形似自定义组件），但未在对应 `.json` 中声明 ("使用但未声明")。

```bash
# 分析整个小程序项目的组件使用情况
mp-lens lint

# 分析指定页面或组件的组件使用情况 (路径相对于 miniappRoot)
mp-lens lint src/pages/my-page/index

# 分析并尝试自动修复 JSON 文件中"声明但未使用"的组件 (会修改源文件，请谨慎!)
mp-lens lint --fix
```

**选项:**

- `[path]` (可选参数): 指定要分析的具体文件（`.wxml` 或 `.json`）或目录路径（相对于 `miniappRoot`）。
  - 如果指定文件，其对应的 `.wxml` 或 `.json` 会被自动关联分析。
  - 如果省略，则分析 `miniappRoot` 下的整个小程序项目。
- `--fix`: 自动从 `.json` 文件中移除"声明但未使用"的组件条目。
  - **注意:** 此选项会修改您的源文件，请务必在版本控制下操作，并仔细检查更改。它**不会**修改 WXML 文件。

#### 4. `purgewxss` - 清理 WXSS 文件中未使用的 CSS 规则

分析 WXML 文件中的类名使用情况，并尝试从对应的 WXSS 文件中移除未被引用的 CSS 规则。

**⚠️ 警告：此命令可能移除有用的 CSS，特别是在涉及复杂动态类名或 JavaScript 操作样式时。请务必谨慎！**

**强烈建议:**

1. **使用版本控制 (如 Git)**，并在运行前**提交所有更改**。
2. 先不带 `--write` 选项运行，**仔细检查预览结果和日志**。
3. 使用 `--write` 后，**务必手动测试和审查更改**，确保应用样式无误。

**用法示例:**

```bash
# 分析项目中所有 WXSS 文件，并预览将移除的 CSS (不实际写入文件)
mp-lens purgewxss

# 分析指定的 WXSS 文件，并实际写入更改 (谨慎使用!)
mp-lens purgewxss src/pages/home/index.wxss --write

# 分析所有 WXSS 文件，并实际写入更改 (谨慎使用!)
mp-lens purgewxss --write
```

**选项:**

- `[wxss-file-path]` (可选参数): 指定要分析的具体 WXSS 文件路径（相对于 `miniappRoot`）。
  - 如果省略，则分析 `miniappRoot` 下所有 `.wxss` 文件 (遵循全局的 `exclude` 配置)。
- `--write`: **(高风险)** 实际将优化后的 CSS 写入 `.wxss` 文件。若无此参数，仅显示分析结果和潜在优化，**不会修改任何文件**。

**重要限制与注意事项:**

- **依赖 WXML 分析:** `purgewxss` 通过分析关联的 WXML 文件（包括其导入的 WXML）来确定 CSS 类名的使用状态。其准确性高度依赖于 WXML 分析的覆盖度和正确性。
- **动态类名处理:**
  - 对于简单的动态类名 (如 `class="{{ someVar }}"` 或 `class="{{ cond ? 'classA' : 'classB' }}"`)，工具会尝试将这些类名（`someVar` 对应的变量值无法静态确定，但 `classA`, `classB` 会被视为安全）标记为使用中。
  - **风险与跳过:** 若 WXML 中包含复杂或难以静态分析的动态类名构造 (如 `class="{{ 'prefix-' + variable }}"`)，`mp-lens` 会将此 WXML 标记为包含风险用法。为安全起见，**对应的 WXSS 文件将不会被处理 (PurgeCSS 操作会被跳过)**，并会输出警告。这是为了防止因无法准确静态解析类名而错误移除 CSS。
- **`externalClasses`:** 微信小程序的 `externalClasses` 机制允许父组件向子组件传递类名。本工具主要分析 WXML 元素 `class` 属性中的类名，**不会**深度追踪通过 `externalClasses` 传入的类名字符串本身是否存在风险拼接（例如父组件 `<child-comp my-ext-class="{{ '''prefix-''' + variable }}" />`）。

#### 5. `diff` - 对比不同版本间的包体差异

分析并对比两个 Git 提交（分支或标签）之间的小程序包体构成和大小差异。

**主要解决问题:**

- 追踪版本迭代中包体积的变化情况。
- 定位导致包体积显著增大或减小的具体文件和变更。

**用法示例:**

```bash
# 对比当前分支与 master 分支的包体差异
mp-lens diff --base master --target HEAD

# 对比两个指定提交之间的差异
mp-lens diff --base <commit-hash-1> --target <commit-hash-2>

# 对比某个特性分支与其合并基准点的差异 (假设特性分支从 develop 切出)
mp-lens diff --base develop --target my-feature-branch
```

**选项:**

- `--base <分支/提交>`: 指定对比的基准版本 (例如 `master`, `develop`, 或某个 commit hash)。默认为 `master`。
- `--target <分支/提交>`: 指定对比的目标版本 (例如 `HEAD`, `my-feature-branch`, 或某个 commit hash)。默认为 `HEAD`。

#### 6. `cpd` - 代码重复检测 (Copy-Paste Detection)

检测项目中的重复或高度相似的代码片段，帮助识别潜在的可复用逻辑。

**主要解决问题:**

- 发现并减少代码冗余。
- 提升代码库的可维护性和一致性。

**用法示例:**

```bash
# 在整个项目中执行代码重复检测
mp-lens cpd

# 指定最小重复 token 数量 (示例，具体选项请参考命令帮助)
mp-lens cpd --min-tokens 100
```

## 🤝 与 Knip 集成 (可选)

`mp-lens` 可与 [Knip](https://knip.dev) 集成，以实现更深层次的代码分析，检测小程序项目中未使用的文件、组件、导出 (exports)、函数和变量等死代码。

- **mp-lens 优势**: 专注于小程序特有的文件类型和依赖关系（如 `.wxml`, `.wxss`, `app.json` 中的页面/组件引用）。
- **Knip 优势**: 更侧重于 JavaScript/TypeScript 模块内部的未使用导出、类型等。

两者结合能提供更全面的项目清理方案。

```bash
# 安装依赖
npm install --save-dev mp-lens knip
```

详细的集成指南和配置示例请查看 [mp-lens与Knip集成文档](docs/knip-integration.md)。

## ⚙️ 配置文件

对于复杂或固定的配置（如大量排除规则、路径别名等），建议在项目根目录创建 `mp-lens.config.js` (推荐，更灵活) 或 `mp-lens.config.json` 文件。也可以通过全局选项 `--config <路径>` 指定配置文件位置。

**配置文件示例 (`mp-lens.config.js`):**

```javascript
// mp-lens.config.js
module.exports = {
  miniappRoot: 'src', // 小程序代码主目录 (相对于项目根目录)
  appJsonPath: 'app.json', // 入口文件 (相对于 miniappRoot)
  // 分析的文件类型 (clean 命令的默认值)
  types: 'js,ts,wxml,wxss,json,wxs',
  exclude: [
    // 等同于命令行中的 --exclude (Glob 模式)
    '**/node_modules/**',
    '**/miniprogram_npm/**',
    '**/*.mock.js',
    'assets/images/ignore_this_folder/**',
  ],
  essentialFiles: [
    // 这些文件永远不会被视为未使用 (相对于 miniappRoot)
    'utils/init.js',
    'config/theme.json',
  ],
  // clean 命令是否默认包含图片等资源文件进行分析和清理
  // true: 包含资源文件，可能会被识别为未使用并清理
  // false: 不包含资源文件，资源文件不会被清理 (默认行为)
  includeAssets: false,
  aliases: {
    // 路径别名配置 (通常会自动从 tsconfig.json 或 jsconfig.json 读取)
    '@/*': ['src/*'],
    '@components/*': ['src/components/*'],
  },
};
```

**常用配置项说明:**

- `miniappRoot` (string): 小程序源代码所在的子目录（相对于项目根目录）。
- `appJsonPath` (string): 入口文件的路径（相对于 `miniappRoot`）。默认为 `app.json`。
- `types` (string): `clean` 命令默认分析的文件扩展名列表，逗号分隔。
- `exclude` (string[]): 要排除的文件/目录的 Glob 模式列表。
- `essentialFiles` (string[]): 应始终被视为必需的文件路径列表（相对于 `miniappRoot`）。
- `includeAssets` (boolean): 控制 `clean` 命令是否分析和清理图片等资源文件 (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`)。
  - `true`: 资源文件会被纳入分析范围，可能被清理。
  - `false` (默认): 资源文件不会被视为"未使用"，也不会被清理。
- `aliases` (object): 路径别名配置。工具会尝试自动从 `tsconfig.json` (compilerOptions.paths) 或 `jsconfig.json` 加载。此处配置可覆盖自动加载的或补充。

## 🤝 贡献

我们非常欢迎各种形式的贡献！如果您发现任何问题、有功能建议或希望改进代码，请随时：

- 提交 [Issue](https://github.com/chess99/mp-lens/issues)
- 创建 [Pull Request](https://github.com/chess99/mp-lens/pulls)

## 📄 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。
