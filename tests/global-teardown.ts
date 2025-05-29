/**
 * Jest 全局清理
 * 在所有测试结束后执行一次
 */
export default async function teardown(): Promise<void> {
  // 清理测试后的全局状态
  console.log('🧹 Jest 全局清理开始');

  // 这里可以添加清理逻辑，比如：
  // - 清理临时文件
  // - 关闭数据库连接
  // - 清理测试环境变量等

  console.log('✅ Jest 全局清理完成');
}
