/**
 * Jest 测试设置文件
 * 在每个测试文件运行前执行的全局设置
 */

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.MP_LENS_TELEMETRY_DISABLED = 'true'; // 默认禁用遥测

// 增加测试超时时间
jest.setTimeout(30000);

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// 清理控制台输出（可选）
const _originalConsoleError = console.error;
const _originalConsoleWarn = console.warn;

beforeEach(() => {
  // 可以在这里添加每个测试前的设置
});

afterEach(() => {
  // 可以在这里添加每个测试后的清理
});

export {};
