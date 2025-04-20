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
* **安全清理:**
  * 提供 `--dry-run` (试运行)模式，预览哪些文件*将*被删除，但并**不执行**实际删除操作。
  * 默认在删除文件前进行**交互式确认**。
  * 提供将未使用文件移动到**备份目录**的选项，而非直接永久删除。
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

* `-p, --project <路径>`: 指定小程序项目的根目录 (默认: 当前目录)。
* `-h, --help`: 显示帮助信息。
* `-v, --verbose`: 显示更详细的日志输出。
* `--config <路径>`: 指定配置文件的路径 (可选高级功能)。

**可用命令:**

### `list-unused`

分析项目并列出检测到的未使用文件，此操作**不会修改**任何文件。

```bash
# 列出当前目录下所有默认类型的未使用文件
mp-analyzer list-unused

# 在指定项目中仅列出未使用的 JS 和 WXML 文件
mp-analyzer -p ../我的小程序 list-unused --types js,wxml

# 排除 mock 数据文件，并将结果输出为 JSON 文件
mp-analyzer list-unused --exclude "**/mock/*" --output-format json -o unused.json
```

**选项:**

* `--types <类型1,类型2,...>`: 指定要检查的文件扩展名，用逗号分隔 (默认: js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs)。
* `--exclude <模式>`: 用于排除文件/目录的 Glob 模式。可多次使用。
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

分析项目并**删除**未使用的文件。**⚠️ 使用此命令务必谨慎！**

**🚨 安全第一：**

1. **务必使用版本控制 (如 Git)**，并在运行 `clean` 前提交所有更改。
2. **务必先运行 `mp-analyzer clean --dry-run`** 查看哪些文件将被删除。
3. 除非你完全确定后果，否则**避免使用 `--yes` 或 `--force` 选项**。

```bash
# 预览：显示哪些文件 *将* 被删除 (安全模式 - 不会实际删除)
mp-analyzer clean --dry-run

# 交互式删除未使用文件 (会列出文件并请求确认)
mp-analyzer clean

# 仅交互式删除未使用的图片文件
mp-analyzer clean --types png,jpg,gif

# 删除未使用文件，并将它们移动到备份目录，而不是永久删除
mp-analyzer clean --backup ./unused_backup

# 危险操作：不经确认直接删除未使用文件 (不推荐)
# mp-analyzer clean --yes
```

**选项:**

* `--types <类型1,类型2,...>`: 指定要删除的文件类型。
* `--exclude <模式>`: 排除某些文件/目录不被删除。
* `--dry-run`: **强烈推荐使用。** 模拟删除过程，不实际改动文件。
* `--backup <目录>`: 将删除的文件移动到此目录作为备份，而不是永久删除。
* `-y, --yes, --force`: **谨慎使用！** 跳过交互式确认环节。

## ⚙️ 配置文件

对于复杂的配置（例如，大量的排除规则、路径别名等），可以使用配置文件 `mp-analyzer.config.json` 放置于项目根目录，或通过全局选项 `--config` 指定路径。

配置文件示例:

```json
{
  "excludePatterns": [
    "**/mock/**",
    "**/tests/**"
  ],
  "aliases": {
    "@": "src",
    "@components": "src/components",
    "@utils": "src/utils",
    "@pages": "src/pages",
    "~": "."
  }
}
```

### 路径别名支持

`mp-analyzer` 支持两种方式的路径别名配置:

1. **从 tsconfig.json 自动读取**:
   如果你的项目使用 TypeScript 并在 `tsconfig.json` 中配置了 `paths`，工具会自动读取这些别名。

   ```json
   // tsconfig.json 示例
   {
     "compilerOptions": {
       "paths": {
         "@/*": ["src/*"],
         "@components/*": ["src/components/*"]
       }
     }
   }
   ```

2. **通过配置文件配置**:
   在 `mp-analyzer.config.json` 中配置 `aliases` 部分。

   ```json
   // mp-analyzer.config.json 示例
   {
     "aliases": {
       "@": "src",
       "@components": "src/components"
     }
   }
   ```

工具会自动检测项目中的别名配置并使用它们来分析项目依赖关系。这使得使用路径别名的导入也能被正确地识别为文件依赖。

## ⚠️ 免责声明

尽管 `mp-analyzer` 致力于准确分析，但代码中动态引用或复杂的条件逻辑在极少数情况下可能导致对未使用文件的错误判断。`clean` 命令会**永久删除文件**（除非使用了 `--backup` 选项）。**请务必在使用 `clean` 命令前利用版本控制进行备份，并优先使用 `--dry-run` 选项进行预览。** 作者不对因使用此工具造成的任何数据丢失负责。

## 🙌 贡献

欢迎各种形式的贡献！如果你发现任何问题或有改进建议，请随时提交 Issue 或 Pull Request。

*(如果你创建了 CONTRIBUTING.md，可以在此链接)*

## 📄 许可证

本项目采用 MIT 许可证。详情请参阅 [LICENSE](LICENSE) 文件。