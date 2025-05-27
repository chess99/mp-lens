/**
 * Jest 全局清理文件
 * 在所有测试结束后运行一次
 */

export default async function globalTeardown() {
  console.log('🧹 开始清理测试环境...');

  // 可以在这里添加全局清理，比如：
  // - 关闭测试数据库
  // - 删除测试文件夹
  // - 清理测试配置

  console.log('✅ 全局清理完成');
}
