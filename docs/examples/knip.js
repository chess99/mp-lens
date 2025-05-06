/**
 * mp-lens 与 Knip 集成示例配置
 *
 * 本文件展示了如何将 mp-lens 与 Knip 集成，以检测微信小程序项目中未使用的文件和代码
 *
 * 使用方法:
 * 1. 将此文件复制到你的项目根目录，命名为 knip.js
 * 2. 根据你的项目结构修改 miniappRootRelative 变量
 * 3. 运行 npx knip 或设置 npm script
 *
 * 更多信息请参考:
 * - Knip 文档: https://knip.dev
 * - mp-lens 文档: https://github.com/chess99/mp-lens
 */

const {
  findMiniProgramEntryPoints,
  parseWxml,
  parseWxs,
  parseWxss,
  parseJson,
} = require('mp-lens');
const path = require('path');

// 配置小程序源码目录路径
const projectRoot = process.cwd();
const miniappRootRelative = 'src'; // 修改为你的小程序源码所在目录
const miniappRootAbsolute = path.resolve(projectRoot, miniappRootRelative);

/** @type {() => Promise<import('knip').KnipConfig>} */
const config = async () => {
  console.log(`[Knip Config] 动态分析 ${miniappRootRelative} 结构...`);

  // 调用 mp-lens 函数获取动态入口点
  const mpEntryPoints = await findMiniProgramEntryPoints(projectRoot, miniappRootAbsolute);
  console.log(`[Knip Config] 找到 ${mpEntryPoints.length} 个潜在的小程序入口点.`);

  // 自定义静态入口点（例如构建脚本、其他配置）
  const staticEntries = [
    // 如果需要添加非小程序的入口点，请在此处添加
    // 'scripts/**/*.js',
  ];

  return {
    // 组合静态和动态入口
    entry: [
      ...staticEntries,
      ...mpEntryPoints,
      // 添加其他重要的配置文件
      `${miniappRootRelative}/project.config.json`,
      // 再次添加 app.json，以防 findMiniProgramEntryPoints 漏掉它
      `${miniappRootRelative}/app.json`,
    ],
    // 定义 knip 应分析的项目文件
    project: [
      `${miniappRootRelative}/**/*.{js,ts,wxml,wxss,json}`, // 根据需要调整扩展名
      // 如果需要，添加其他源代码位置
    ],
    // 自定义编译器支持小程序特有文件类型
    compilers: {
      wxml: parseWxml, // 解析WXML文件中的依赖关系
      wxss: parseWxss, // 解析WXSS文件中的样式导入
      wxs: parseWxs, // 解析WXS文件中的模块导入
      json: parseJson, // 将JSON文件纳入Knip分析范围，mp-lens在项目整体分析时处理其内部依赖。
    },
    // 忽略构建输出、node_modules 等
    ignore: [
      'dist/**', // 根据需要调整构建输出目录
      'node_modules/**',
      // 添加项目特有的忽略项
      // 例如, 'src/custom-tab-bar/**'
    ],
    // 忽略项目中已知的误报依赖
    ignoreDependencies: [
      // 添加 knip 错误报告为未使用的依赖项
    ],
    // ignoreExportsUsedInFile: true, // 如果有用，请保留
    // 如果需要，忽略特定导出
    // ignore: [
    //   'src/someFile.js#someExport'
    // ],
  };
};

module.exports = config; // 对于 .js 使用 module.exports
