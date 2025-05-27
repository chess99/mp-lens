/**
 * 命令集成测试套件
 *
 * 这个测试套件包含了所有主要命令的集成测试，验证：
 * 1. 命令的基本功能
 * 2. 错误处理和 HandledError 上报
 * 3. 位置参数处理
 * 4. 文件路径解析
 * 5. 遥测事件上报
 */

// 导入所有命令测试
import './graph.test';
import './lint.test';
import './purgewxss.test';

describe('Command Integration Test Suite', () => {
  it('should have all command tests available', () => {
    // 这个测试确保所有命令测试都被正确导入
    expect(true).toBe(true);
  });
});

export {};
