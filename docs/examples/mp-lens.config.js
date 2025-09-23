module.exports = {
  /**
   * [可选] 小程序源代码根目录。
   * miniappRoot 的作用：
   * - 作为 app.json 的默认查找位置（resolveAppJson）。
   * - 作为页面/组件解析的根：基于此解析 pages、subpackages、usingComponents 以及相关文件
   *   （ProjectStructureBuilder.processAppJsonContent / processRelatedFiles / processComponent）。
   * - 自动纳入隐式全局文件：app.js、app.ts、app.wxss、project.config.json、sitemap.json。
   * - 作为导入解析基准：'/' 开头或非相对导入按该目录解析；别名解析回落也以此为基准（PathResolver）。
   * - 资源扫描与差异分析：在该目录下进行图片等资源的 glob 扫描（diffBundle、asset-usage-analyzer）。
   * - 组件使用检查与重复代码检测：以该目录作为主要工作目录（lint、cpd）。
   * - 必需文件集合中的小程序级文件（如 app.json、theme.json 等）按该目录解析（resolveEssentialFiles）。
   * 未设置时等同于项目根目录；当小程序位于 monorepo 子目录时应显式设置。
   */
  miniappRoot: 'src',

  /**
   * [可选] 入口文件路径（app.json）。
   * 解析规则：
   * - 绝对路径：直接使用。
   * - 相对路径：相对于 projectRoot 解析（初始化阶段会标准化为绝对路径）。
   * 默认行为：
   * - 若未提供 appJsonPath 与 appJsonContent：从 projectRoot 自动探测 app.json，并据此推断 miniappRoot 与 appJsonPath。
   * - 若已提供 miniappRoot 且未提供 appJsonPath：默认使用 miniappRoot/app.json。
   */
  appJsonPath: 'src/app.json',

  /**
   * [可选] 高级选项：直接提供入口文件内容（app.json 的内容）。
   * 适用于入口文件由构建工具动态生成的场景。
   * 提供此项时，会忽略 appJsonPath。
   * 例: {
   *   "pages": ["pages/index/index"],
   *   "subPackages": []
   * }
   */
  appJsonContent: undefined,

  /**
   * [可选] 要分析的文件类型扩展名列表，用逗号分隔。
   * 默认值: 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs'
   */
  types: 'js,ts,wxml,wxss,json,png,jpg,jpeg,gif,svg,wxs',

  /**
   * [可选] 要排除的文件/目录的 Glob 模式列表。
   * 这些文件不会被分析，也不会被列为未使用或被清理。
   * 支持使用 minimatch 语法 (https://github.com/isaacs/minimatch)
   */
  // eg: 排除根目录的 script / bin 目录，以及根目录下以点开头的文件
  // 说明: '.*' 仅匹配项目根目录的隐藏文件/目录；.git/** 等已在默认排除中覆盖
  exclude: [
    '.*',
    '.*/**',
    'script/**',
    'bin/**',
    // 任意位置包含 mock / demo 的文件或目录
    '**/*mock*',
    '**/*mock*/**',
    '**/*demo*',
    '**/*demo*/**',
  ],

  /**
   * [可选] 需要强制保留的文件路径列表（相对于项目根目录）。
   * 这些文件即使未被静态引用，也不会被标记为未使用或被清理。
   * 用于声明通过特殊方式引用或以全局方式使用的文件。
   * 例: ["utils/init.js", "config/theme.json"]
   */
  essentialFiles: [
    'project.config.json', // 项目配置文件通常是必需的
    'sitemap.json', // 站点地图文件
  ],

  /**
   * [可选] 是否在清理与报告中包含图片等资源文件（.png, .jpg, .jpeg, .gif, .svg）。
   * 默认值：false。为 true 时将资源文件纳入分析与清理范围。
   */
  includeAssets: false,

  /**
   * [可选] 路径别名配置，用于解析模块导入。
   * 如检测到 tsconfig.json 或 jsconfig.json 的 paths 配置，将自动加载。
   * 此处与自动加载的配置进行合并；如发生同名键冲突，以本配置覆盖 tsconfig/jsconfig。
   * 建议避免将单个 "@" 作为别名，以免与 npm 作用域包（@scope/pkg）混淆。
   * 例: {
   *   "@app/*": ["./src/*"],
   *   "@components/*": ["./src/components/*"],
   *   "@utils/*": ["./src/utils/*"]
   * }
   */
  aliases: {
    // "@app/*": ["./src/*"],
    // "@components/*": ["./src/components/*"]
  },
};
