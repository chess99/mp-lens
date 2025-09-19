/**
 * mp-lens 配置文件示例 (JavaScript 格式)
 * 使用 JavaScript 格式允许添加注释并进行更灵活的配置。
 */
module.exports = {
  /**
   * [可选] 小程序源代码所在的子目录（相对于此配置文件所在的目录）。
   * 如果省略，则假定项目根目录即为小程序根目录。
   */
  miniappRoot: 'src',

  /**
   * [可选] 指定分析的入口文件。
   * 默认会在项目里查找 "app.json"，可以手动指定，不要求在 miniappRoot 目录下。
   */
  appJsonPath: 'src/app.json',

  /**
   * [可选] 高级选项：直接提供入口文件的内容（通常是 app.json 的内容）。
   * 这在入口文件由构建工具动态生成时可能有用。
   * 如果提供此项，将忽略 appJsonPath 选项。
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
  // 说明：' .* ' 仅匹配项目根目录的隐藏文件/目录；.git/** 等已在默认排除中覆盖
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
   * [可选] 应始终被视为必需的文件路径列表（相对于项目根目录）。
   * 这些文件永远不会被报告为未使用或被清理，即使没有找到引用。
   * 对于某些通过特殊方式引用或全局使用的文件很有用。
   * 例: ["utils/init.js", "config/theme.json"]
   */
  essentialFiles: [
    'project.config.json', // 项目配置文件通常是必需的
    'sitemap.json', // 站点地图文件
  ],

  /**
   * [可选] 是否在清理和报告中包含图片等资源文件(.png, .jpg, .jpeg, .gif, .svg)。
   * 默认值: false - 资源文件不会被报告为未使用或被清理。
   * 设置为 true 表示显式包含这些资源文件在分析和清理范围内。
   */
  includeAssets: false,

  /**
   * [可选] 路径别名配置，用于解析模块导入。
   * 如果项目中有 tsconfig.json 或 jsconfig.json 包含 paths 配置，
   * 通常会自动加载，无需在此手动配置。
   * 如果需要覆盖或补充自动加载的配置，可以在此定义。
   * 例: {
   *   "@": "./src",
   *   "@components": "./src/components",
   *   "@utils/*": ["./src/utils/*"]
   * }
   */
  aliases: {
    // "@": "./src", // 示例，通常会自动从 tsconfig/jsconfig 加载
  },
};
