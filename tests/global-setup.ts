/**
 * Jest 全局设置文件
 * 在所有测试开始前运行一次
 */

export default async function setup(): Promise<void> {
  console.log('🚀 开始运行集成测试...');

  // 设置测试环境变量
  process.env.NODE_ENV = 'test';
  process.env.MP_LENS_TELEMETRY_DISABLED = 'true';

  // 可以在这里添加全局设置，比如：
  // - 启动测试数据库
  // - 创建测试文件夹
  // - 设置测试配置

  console.log('✅ 全局设置完成');
}
