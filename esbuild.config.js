const { build } = require('esbuild');
const fs = require('fs');
const { execSync } = require('child_process');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// 共享配置
const sharedConfig = {
  platform: 'node',
  target: 'node14',
  format: 'cjs',
  bundle: true,
  sourcemap: true,
  external: [
    // 保留一些不需要打包的包
    'fsevents', // macOS文件系统监控，平台特定
    // UI相关依赖，这些在CLI中不需要
    '@antv/g6',
    'preact',
    'chart.js',
    // 较大的依赖，可能与Node 14兼容性更好作为external
    'jscpd',
    'purgecss',
    '@babel/parser',
    '@babel/traverse',
    '@babel/types',
    // 开发时依赖，不应该打包进生产版本
    'ts-node',
    'typescript',
    'esbuild',
  ],
  logLevel: 'info',
  tsconfig: './tsconfig.json',
  // 确保Node.js兼容性
  define: {
    'process.env.npm_package_version': `"${packageJson.version}"`,
  },
  // 减少警告和优化
  metafile: false,
  treeShaking: true,
};

async function buildAll() {
  try {
    console.log('🔨 开始构建...');

    // 这里不需要清理dist目录, 外层统一清理
    // if (fs.existsSync('dist')) {
    //   fs.rmSync('dist', { recursive: true, force: true });
    // }
    fs.mkdirSync('dist', { recursive: true });

    // 构建CLI入口
    console.log('📦 构建CLI入口...');
    await build({
      ...sharedConfig,
      entryPoints: ['src/cli.ts'],
      outfile: 'dist/cli.js',
      banner: {
        js: '#!/usr/bin/env node',
      },
      // CLI需要更完整的打包，减少运行时依赖
      external: [
        'fsevents',
        // UI相关依赖在CLI中用不到
        '@antv/g6',
        'preact',
        'chart.js',
        // 开发依赖
        'ts-node',
        'typescript',
        'esbuild',
      ],
    });

    // 构建库入口
    console.log('📦 构建库入口...');
    await build({
      ...sharedConfig,
      entryPoints: ['src/index.ts'],
      outfile: 'dist/index.js',
      // 库模式下保留更多外部依赖
      external: [
        ...sharedConfig.external,
        // 库使用者自己提供这些依赖
        'modern-ahocorasick',
        'glob',
        'chalk',
        'commander',
        'inquirer',
        'uuid',
        'semver',
        'posthog-node',
        '@wxml/parser',
      ],
    });

    // 设置CLI文件可执行权限
    try {
      fs.chmodSync('dist/cli.js', 0o755);
      console.log('🔧 设置CLI文件执行权限完成');
    } catch (err) {
      console.warn('⚠️  无法设置CLI文件权限:', err.message);
    }

    // 生成TypeScript类型定义
    console.log('📝 生成TypeScript类型定义...');
    try {
      execSync('npx tsc --project tsconfig.build.json', { stdio: 'inherit' });
      console.log('📝 类型定义生成完成');
    } catch (err) {
      console.error('❌ 类型定义生成失败:', err.message);
      throw err;
    }

    console.log('✅ 构建完成！');
    console.log('📁 输出文件:');
    console.log('  - dist/cli.js (CLI入口)');
    console.log('  - dist/index.js (库入口)');
    console.log('  - dist/*.d.ts (类型定义)');

    // 显示文件大小
    const cliStats = fs.statSync('dist/cli.js');
    const libStats = fs.statSync('dist/index.js');
    console.log(`📊 文件大小:`);
    console.log(`  - CLI: ${(cliStats.size / 1024 / 1024).toFixed(2)}MB`);
    console.log(`  - 库: ${(libStats.size / 1024 / 1024).toFixed(2)}MB`);
  } catch (error) {
    console.error('❌ 构建失败:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  buildAll();
}

module.exports = { buildAll, sharedConfig };
