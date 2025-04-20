/**
 * mp-analyzer配置文件 - JavaScript版本
 * 支持动态生成配置和引用外部模块
 */

// 这个函数将被执行以动态生成配置内容
module.exports = function() {
  // 你可以在这里放置任何JavaScript代码
  // 例如读取其他文件、执行外部命令等
  
  console.log('正在动态生成mp-analyzer配置...');
  
  // 动态生成app.json内容示例
  const pagesConfig = {
    pages: [
      'pages/index/index',
      'pages/logs/logs'
    ],
    subpackages: [
      {
        root: 'packageA',
        pages: [
          'pages/feature1/index',
          'pages/feature2/index'
        ]
      }
    ]
  };
  
  // 返回配置对象
  return {
    // 基本配置
    miniappRoot: '.',  // 小程序根目录
    entryFile: 'app.json',  // 入口文件
    
    // 文件分析配置
    types: 'js,ts,wxml,wxss,json',  // 要分析的文件类型
    exclude: ['**/dist/**', '**/node_modules/**'],  // 要排除的文件夹
    
    // 传入动态生成的app.json内容
    entryContent: pagesConfig
  };
}; 