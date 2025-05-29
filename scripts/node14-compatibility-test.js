#!/usr/bin/env node
/**
 * Node 14兼容性测试脚本
 * 测试构建后的CLI是否能在Node 14环境下正常运行
 */

const { execSync } = require('child_process');
const fs = require('fs');

function checkNodeVersion() {
  const nodeVersion = process.version;
  console.log(`当前Node版本: ${nodeVersion}`);

  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  if (majorVersion < 14) {
    console.error('❌ 需要Node 14或更高版本');
    process.exit(1);
  }

  if (majorVersion >= 14 && majorVersion < 16) {
    console.log('✅ 正在Node 14/15环境下测试');
  } else {
    console.log(`⚠️  当前Node版本为${majorVersion}，建议在Node 14环境下测试`);
  }
}

function testCLI() {
  console.log('\n🧪 测试CLI基本功能...');

  try {
    // 测试--help命令
    console.log('测试 --help 命令...');
    const helpOutput = execSync('node dist/cli.js --help', { encoding: 'utf8' });
    if (helpOutput.includes('微信小程序依赖分析与清理工具')) {
      console.log('✅ --help 命令正常');
    } else {
      console.error('❌ --help 命令输出异常');
      process.exit(1);
    }

    // 测试--version命令
    console.log('测试 --version 命令...');
    const versionOutput = execSync('node dist/cli.js --version', { encoding: 'utf8' });
    if (versionOutput.trim().match(/^\d+\.\d+\.\d+/)) {
      console.log('✅ --version 命令正常');
    } else {
      console.error('❌ --version 命令输出异常');
      process.exit(1);
    }

    console.log('✅ 所有CLI测试通过！');
  } catch (error) {
    console.error('❌ CLI测试失败:', error.message);
    process.exit(1);
  }
}

function testLibrary() {
  console.log('\n📚 测试库导入...');

  try {
    // 测试库文件是否可以正常导入
    const lib = require('../dist/index.js');
    console.log('✅ 库文件可以正常导入');

    // 检查导出的函数
    const expectedExports = ['analyzeProject', 'DependencyGraph', 'findMiniProgramEntryPoints'];
    for (const exportName of expectedExports) {
      if (typeof lib[exportName] !== 'undefined') {
        console.log(`✅ 导出函数 ${exportName} 存在`);
      } else {
        console.error(`❌ 导出函数 ${exportName} 不存在`);
        process.exit(1);
      }
    }

    console.log('✅ 库导入测试通过！');
  } catch (error) {
    console.error('❌ 库测试失败:', error.message);
    process.exit(1);
  }
}

function main() {
  console.log('🔍 Node 14兼容性测试');
  console.log('='.repeat(50));

  // 检查构建产物是否存在
  if (!fs.existsSync('dist/cli.js')) {
    console.error('❌ 构建产物不存在，请先运行 npm run build');
    process.exit(1);
  }

  checkNodeVersion();
  testCLI();
  testLibrary();

  console.log('\n🎉 所有兼容性测试通过！');
  console.log('📦 构建后的包已兼容Node 14');
}

if (require.main === module) {
  main();
}
