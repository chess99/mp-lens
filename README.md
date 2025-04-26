# mp-analyzer (小程序依赖分析与清理工具)

[![NPM 版本](https://img.shields.io/npm/v/mp-analyzer.svg?style=flat)](https://www.npmjs.com/package/mp-analyzer) <!-- 如果项目名称不同，请替换 'mp-analyzer' -->
[![许可证](https://img.shields.io/npm/l/mp-analyzer.svg?style=flat)](LICENSE) <!-- 链接到你的 LICENSE 文件 -->
[![构建状态](https://img.shields.io/travis/com/your-username/mp-analyzer.svg?style=flat)](https://travis-ci.com/your-username/mp-analyzer) <!-- CI/CD占位符 -->

**mp-analyzer** 是一个命令行工具，旨在帮助微信小程序开发者理解项目结构、可视化依赖关系，并安全地移除未使用的文件。

是否厌倦了臃肿的项目体积，以及手动寻找未使用的组件、页面、图片或工具函数的繁琐过程？ `mp-analyzer` 会扫描你的项目，构建依赖图，并找出可以安全移除的孤立文件。

## ✨ 功能特性

* **全面的依赖分析:** 扫描多种文件类型（`.js`, `.ts`, `.wxml`, `.wxss`, `.json`, `.wxs`, 以及常见的图片格式），构建项目依赖图。
* **依赖图可视化:** 生成交互式 HTML 或静态图文件（如 DOT 语言、SVG、PNG），助你清晰理解页面、组件、脚本之间的相互联系。
* **未使用的文件检测:** 根据分析结果，识别出项目中未被任何地方引用的文件（包括页面、组件、脚本、样式、图片、WXS模块等）。
* **路径别名支持:** 支持解析 TypeScript 路径别名 (Path Aliases) 和自定义别名配置，正确分析使用别名导入的模块依赖关系。
* **灵活的项目结构支持:** 支持自定义小程序项目路径和入口文件路径，适用于不同目录结构的项目。
* **安全清理:**
  * 提供 `--dry-run` (试运行)模式，预览哪些文件*将*被删除，但并**不执行**实际删除操作。
  * 默认在删除文件前进行**交互式确认**。
  * 支持 Glob 模式，可在分析和清理时**排除**特定的文件或目录。
* **可配置:** 可通过命令行选项快速执行任务，也支持通过配置文件进行更复杂的设置。
* **使用 TypeScript 构建:** 类型安全，易于维护。

## 🚀 安装

你可以全局安装 `mp-analyzer`，或将其作为项目的开发依赖项。

**全局安装:**

```bash
npm install -g mp-analyzer
# 或者
yarn global add mp-analyzer
```

**本地安装 (推荐用于项目):**

```bash
npm install --save-dev mp-analyzer
# 或者
yarn add --dev mp-analyzer
```

如果本地安装，通常通过 `npx` 运行：`npx mp-analyzer <命令>`，或者将其添加到 `package.json` 的 `scripts` 中。

## 💡 使用方法

基本命令结构如下：

```bash
mp-analyzer [全局选项] <命令> [命令选项]
```

如果本地安装且未使用 `npx`，请使用相对路径运行，例如：`./node_modules/.bin/mp-analyzer`。

**全局选项:**

* `-p, --project <路径>`: 指定项目的根目录 (默认: 当前目录)。
* `-h, --help`: 显示帮助信息。
* `-v, --verbose`: 显示更详细的日志输出。
* `--config <路径>`: 指定配置文件的路径 (可选高级功能)。
* `--miniapp-root <路径>`: 指定小程序代码所在的子目录（相对于项目根目录）。
* `--entry-file <路径>`: 指定入口文件路径（相对于小程序根目录，默认为app.json）。

**可用命令:**

### `list-unused`

分析项目并列出检测到的未使用文件，此操作**不会修改**任何文件。

```bash
# 列出当前目录下所有默认类型的未使用文件
mp-analyzer list-unused

# 在指定项目中仅列出未使用的 JS 和 WXML 文件
mp-analyzer -p ../我的项目 list-unused --types js,wxml

# 排除 mock 数据文件，并将结果输出为 JSON 文件
mp-analyzer list-unused --exclude "**/mock/*" --output-format json -o unused.json

# 分析嵌套目录中的小程序项目
mp-analyzer list-unused --miniapp-root client/app

# 使用自定义入口文件
mp-analyzer list-unused --entry-file src/app.json
```

**选项:**

* `--types <类型1,类型2,...>`: 指定要检查的文件扩展名，用逗号分隔 (默认: js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs)。
* `--exclude <模式>`: 用于排除文件/目录的 Glob 模式。可多次使用。
* `--essential-files <文件1,文件2,...>`: 指定应被视为必要的文件（这些文件永远不会被标记为未使用），用逗号分隔。
* `--output-format <text|json>`: 输出格式 (默认: text)。
* `-o, --output <文件>`: 将列表保存到文件，而非打印到控制台。

### `graph` (或 `visualize`)

生成依赖关系图的可视化文件。

```bash
# 在当前目录生成一个交互式的 HTML 依赖图
mp-analyzer graph

# 为指定项目生成 SVG 格式的依赖图并保存
mp-analyzer -p ../我的小程序 graph -f svg -o dependency-graph.svg

# 生成聚焦于特定页面的依赖图
mp-analyzer graph --focus src/pages/home/index.js -o home-deps.html
```

**选项:**

* `-f, --format <html|dot|json|png|svg>`: 输出格式 (默认: html)。生成 PNG/SVG 可能需要系统安装 Graphviz。
* `-o, --output <文件>`: 保存图文件的路径。
* `--depth <数字>`: 限制依赖图的显示深度。
* `--focus <文件路径>`: 高亮显示与特定文件相关的依赖。
* `--no-npm`: 在图中排除 `node_modules` 或 `miniprogram_npm` 中的依赖。

### `clean`

Analyzes the project and **deletes** unused files. **⚠️ Use this command with extreme caution!**

**🚨 Safety First:**

1. **Be sure to use version control (e.g., Git)** and commit all changes before running `clean`.
2. **Be sure to run `mp-analyzer clean --dry-run` first** to see which files will be deleted.
3. Unless you are absolutely sure of the consequences, **avoid using the `--yes` or `--force` options**.

```bash
# Preview: Show which files *will* be deleted (Safe mode - will not actually delete)
mp-analyzer clean --dry-run

# Delete unused files interactively (lists files and asks for confirmation)
mp-analyzer clean --delete

# Interactively delete only unused image files
mp-analyzer clean --delete --types png,jpg,gif

# Dangerous operation: Delete unused files directly without confirmation (Not recommended)
# mp-analyzer clean --delete --yes
```

**Options:**

* `--types <type1,type2,...>`: Specify the file types to delete.
* `--exclude <pattern>`: Exclude certain files/directories from being deleted.
* `--essential-files <file1,file2,...>`: Specify files that should be considered essential (these files will never be deleted), separated by commas.
* `--dry-run`: **Strongly recommended.** Simulate the deletion process without actually modifying files.
* `-y, --yes, --force`: **Use with caution!** Skip the interactive confirmation step.

## ⚙️ Configuration File

对于复杂的配置（例如，大量的排除规则、路径别名等），可以使用配置文件 `mp-analyzer.config.json` 或 `mp-analyzer.config.js` 放置于项目根目录，或通过全局选项 `--config` 指定路径。

配置文件示例 (`mp-analyzer.config.json`):

```json
{
  "miniappRoot": "src",
  "entryFile": "app.json",
  "types": "js,ts,wxml,wxss,json,png,jpg",
  "excludePatterns": [
    "**/node_modules/**",
    "**/mock/**",
    "dist/**",
    "**/*.spec.ts"
  ],
  "essentialFiles": [
    "utils/init.js", // 这个文件总是被认为是必需的
    "config/theme.json"
  ],
  "keepAssets": [
    "images/dynamic-icons/*", // 保留所有动态加载的图标
    "assets/vendor/**/*.png"  // 保留特定 vendor 目录下的所有 PNG
  ]
}
```

**常用配置项说明:**

* `miniappRoot`: (字符串) 小程序源代码所在的子目录（相对于项目根目录）。
* `entryFile`: (字符串) 入口文件的路径（相对于 `miniappRoot`）。默认为 `app.json`。
* `types`: (字符串) 要分析的文件扩展名列表，用逗号分隔。
* `excludePatterns` 或 `exclude`: (字符串数组) 要排除的文件/目录的 Glob 模式列表。
* `essentialFiles`: (字符串数组) 应始终被视为必需的文件路径列表（相对于 `miniappRoot`），这些文件永远不会被报告为未使用或被清理。
* `keepAssets`: (字符串数组, 新增) Glob 模式列表，用于匹配那些**不应**被报告为未使用或被清理的文件。这对于静态分析可能无法检测到的动态加载资源（例如，来自后端 API 的图片路径）或特殊处理的文件非常有用。即使分析器没有找到这些文件的直接引用，它们也会被保留。
* `aliases`: (对象) 路径别名配置，用于解析模块导入（通常从 `tsconfig.json` 或 `jsconfig.json` 自动加载）。

## 🤝 贡献

欢迎各种形式的贡献！如果你发现任何问题或有改进建议，请随时提交 Issue 或 Pull Request。

*(如果你创建了 CONTRIBUTING.md，可以在此链接)*

## 📄 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。
