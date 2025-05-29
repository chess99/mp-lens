#!/usr/bin/env node
/**
 * Node.js 14 兼容性测试脚本
 * 测试构建后的 CLI 工具在 Node.js 14 环境下是否能正常工作
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🧪 Node.js 14 兼容性测试');
console.log('Node.js 版本:', process.version);
console.log('==========================================\n');

console.log('测试 1: CLI 工具基本功能');
try {
  // 测试 CLI 工具的 help 命令
  const helpOutput = execSync('node dist/cli.js --help', {
    encoding: 'utf8',
    cwd: path.join(__dirname, '..'),
    timeout: 10000,
  });

  if (helpOutput.includes('微信小程序依赖分析与清理工具')) {
    console.log('✅ CLI 工具可以正常启动');
    console.log('✅ 帮助信息显示正常');
  } else {
    console.log('❌ CLI 工具输出异常');
  }
} catch (error) {
  console.log('❌ CLI 工具测试失败:', error.message);
}

console.log('\n测试 2: PostHog 错误检查');
try {
  // 创建一个临时的测试项目目录
  const testDir = path.join(__dirname, '..', 'test-temp');
  const fs = require('fs');

  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
  }

  // 创建一个简单的 app.json
  fs.writeFileSync(
    path.join(testDir, 'app.json'),
    JSON.stringify(
      {
        pages: ['pages/index/index'],
        window: {
          navigationBarTitleText: 'Test',
        },
      },
      null,
      2,
    ),
  );

  // 创建页面目录
  const pageDir = path.join(testDir, 'pages', 'index');
  fs.mkdirSync(pageDir, { recursive: true });
  fs.writeFileSync(path.join(pageDir, 'index.js'), 'Page({})');
  fs.writeFileSync(path.join(pageDir, 'index.wxml'), '<view>test</view>');
  fs.writeFileSync(path.join(pageDir, 'index.wxss'), '.test {}');
  fs.writeFileSync(path.join(pageDir, 'index.json'), '{}');

  // 运行 clean 命令（dry run）
  const cleanOutput = execSync(`node ${path.join(__dirname, '..', 'dist', 'cli.js')} clean`, {
    encoding: 'utf8',
    cwd: testDir,
    timeout: 30000,
    env: { ...process.env, ANONYMIZED_TELEMETRY: 'false' },
  });

  if (
    !cleanOutput.includes('AbortController is not defined') &&
    !cleanOutput.includes('AbortSignal is not defined')
  ) {
    console.log('✅ 没有 AbortController 相关错误');
    console.log('✅ clean 命令可以正常运行');
  } else {
    console.log('❌ 仍然存在 AbortController 错误');
    console.log('错误输出:', cleanOutput);
  }

  // 清理测试目录
  fs.rmSync(testDir, { recursive: true, force: true });
} catch (error) {
  console.log('❌ PostHog 错误检查失败:', error.message);
  if (error.stdout) {
    console.log('标准输出:', error.stdout);
  }
  if (error.stderr) {
    console.log('错误输出:', error.stderr);
  }
}

console.log('\n==========================================');
console.log('🎉 Node.js 14 兼容性测试完成！');
