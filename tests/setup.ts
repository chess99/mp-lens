/**
 * Jest 测试设置文件
 * 在每个测试文件运行前执行的全局设置
 */

import { logger } from '../src/utils/debug-logger.js';
import { silenceLogger } from './helpers/logger.js';

// 设置测试环境变量
process.env.NODE_ENV = 'test';
process.env.MP_LENS_TELEMETRY_DISABLED = 'true'; // 默认禁用遥测

// 增加测试超时时间
jest.setTimeout(30000);

// 全局错误处理
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const loggerSpies = silenceLogger(logger);

beforeEach(() => {
  Object.values(loggerSpies).forEach((spy) => spy.mockClear());
});

afterEach(() => {
  // 可以在这里添加每个测试后的清理
});

export {};
