/**
 * mp-lens 与 Knip 集成示例配置
 *
 * 本文件展示了如何将 mp-lens 与 Knip 集成，以检测微信小程序项目中未使用的文件和代码
 *
 * 使用方法:
 * 1. 将此文件复制到你的项目根目录，命名为 knip.js
 * 2. 运行 npx knip 或设置 npm script
 *
 * 更多信息请参考:
 * - Knip 文档: https://knip.dev
 * - mp-lens 文档: https://github.com/chess99/mp-lens
 */

const {
  findMiniProgramEntryPoints,
  initializeCommandContext,
  parseWxml,
  parseWxs,
  parseWxss,
  parseJson,
} = require('mp-lens');
const path = require('path');

// 配置小程序源码目录路径
const projectRoot = process.cwd();
const SRC = path.resolve(projectRoot, 'src');

/** @type {() => Promise<import('knip').KnipConfig>} */
const config = async () => {
  // 通过 mp-lens 的初始化流程加载上下文（含 miniappRoot、exclude、aliases 等）
  const context = await initializeCommandContext({ project: projectRoot });

  // 调用 mp-lens 函数获取动态入口点
  const mpEntryPoints = await findMiniProgramEntryPoints(projectRoot);

  // 自定义静态入口点（例如构建脚本、其他配置）
  const staticEntries = [
    // 如果需要添加非小程序的入口点，请在此处添加
    // 'scripts/**/*.js',
  ];

  return {
    // 组合静态和动态入口
    entry: [...staticEntries, ...mpEntryPoints],

    // 定义 knip 应分析的项目文件
    project: [`${SRC}/**/*.{js,ts,wxml,wxss,json}`],

    // 自定义编译器支持小程序特有文件类型
    compilers: {
      wxml: parseWxml, // 解析WXML文件中的依赖关系
      wxss: parseWxss, // 解析WXSS文件中的样式导入
      wxs: parseWxs, // 解析WXS文件中的模块导入
      json: parseJson, // 将JSON文件纳入Knip分析范围，mp-lens在项目整体分析时处理其内部依赖。
    },

    // 添加项目特有的忽略项, node_modules 等 .gitignore 包含的文件不需要单独配置 ignore
    ignore: [
      // 使用 mp-lens 上下文生成的排除规则（已合并 .gitignore 与配置项）
      ...context.excludePatterns,
      // 如需另外忽略特定导出/依赖，可继续在下方追加
      // eg: 'src/custom-tab-bar/**'
      // 如果需要，忽略特定导出
      // eg: 'src/someFile.js#someExport'
    ],

    // 忽略项目中已知的误报依赖
    ignoreDependencies: [],

    // Helps with types/interfaces used only within the same file
    // ignoreExportsUsedInFile: true,
  };
};

module.exports = config; // 对于 .js 使用 module.exports
