# MP-Lens 集成测试套件

这个目录包含了 MP-Lens 的集成测试，用于验证命令行工具的完整功能。

## 测试结构

```
tests/
├── commands/           # 命令集成测试
│   ├── graph.test.ts   # graph 命令测试
│   ├── lint.test.ts    # lint 命令测试
│   ├── purgewxss.test.ts # purgewxss 命令测试
│   └── index.test.ts   # 测试套件入口
├── telemetry/          # 遥测功能测试
│   └── telemetry.test.ts
├── fixtures/           # 测试数据
├── temp/              # 临时文件（测试时创建）
├── setup.ts           # Jest 设置文件
├── global-setup.ts    # 全局设置
├── global-teardown.ts # 全局清理
└── README.md          # 本文件
```

## 运行测试

### 运行所有集成测试

```bash
npm run test:integration
```

### 监视模式运行测试

```bash
npm run test:integration:watch
```

### 运行测试并生成覆盖率报告

```bash
npm run test:integration:coverage
```

### 运行所有测试（单元测试 + 集成测试）

```bash
npm run test:all
```

## 测试覆盖的场景

### Graph 命令测试

- ✅ HTML 格式输出
- ✅ JSON 格式输出
- ✅ 错误格式处理（HandledError）
- ✅ 文件路径解析
- ✅ 配置选项处理

### Lint 命令测试

- ✅ 整个项目分析
- ✅ 特定文件分析（WXML/JSON）
- ✅ 目录分析
- ✅ 错误处理（文件不存在、不支持的文件类型）
- ✅ 位置参数处理
- ✅ 自动修复功能

### PurgeWXSS 命令测试

- ✅ 特定文件处理
- ✅ 整个项目处理
- ✅ --write 选项
- ✅ 错误处理（文件不存在、非 WXSS 文件）
- ✅ 位置参数处理
- ✅ 文件路径解析

### 遥测功能测试

- ✅ 命令事件上报
- ✅ 用户问题事件上报（HandledError）
- ✅ 系统错误事件上报
- ✅ 问题类型推断
- ✅ 事件属性验证
- ✅ 遥测禁用状态

## 测试原则

1. **真实场景模拟**：测试使用真实的文件系统操作和命令执行
2. **错误场景覆盖**：确保所有 HandledError 都被正确捕获和上报
3. **清理机制**：每个测试后自动清理临时文件
4. **隔离性**：测试之间相互独立，不会互相影响
5. **可重复性**：测试结果稳定，可重复执行

## 添加新测试

### 1. 命令测试

在 `tests/commands/` 目录下创建新的测试文件：

```typescript
import { yourCommand } from '../../src/commands/your-command';
import { GlobalCliOptions } from '../../src/types/command-options';
import { HandledError } from '../../src/utils/errors';

describe('Your Command Integration Tests', () => {
  // 测试实现
});
```

### 2. 遥测测试

在 `tests/telemetry/` 目录下添加相关测试。

### 3. 测试数据

将测试需要的固定数据放在 `tests/fixtures/` 目录下。

## 注意事项

1. **环境变量**：测试运行时会自动设置 `MP_LENS_TELEMETRY_DISABLED=true`
2. **超时时间**：集成测试的超时时间设置为 30 秒
3. **临时文件**：测试会在 `tests/temp/` 目录创建临时文件，测试结束后自动清理
4. **控制台输出**：某些测试会捕获控制台输出进行验证

## 故障排除

### 测试失败

1. 检查是否有临时文件没有被清理
2. 确认测试环境变量设置正确
3. 查看详细的错误信息和堆栈跟踪

### 性能问题

1. 检查是否有文件监听器没有被正确关闭
2. 确认临时文件被及时清理
3. 考虑增加测试超时时间

### 权限问题

1. 确保测试目录有读写权限
2. 检查临时目录的创建和删除权限
