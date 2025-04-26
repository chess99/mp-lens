// 导出公共API
import { analyzeProject } from './analyzer/analyzer';
import { DependencyGraph } from './analyzer/dependency-graph';
import { DotGenerator } from './visualizer/dot-generator';
import { HtmlGenerator } from './visualizer/html-generator';

export { analyzeProject, DependencyGraph, DotGenerator, HtmlGenerator };

// 在直接引入包时提供用法说明
if (require.main === module) {
  console.log('mp-lens 是一个命令行工具，请使用以下方式运行:');
  console.log('  npx mp-lens <命令> [选项]');
  console.log('');
  console.log('示例:');
  console.log('  npx mp-lens list-unused');
  console.log('  npx mp-lens graph');
  console.log('  npx mp-lens clean --dry-run');
  console.log('');
  console.log('使用 --help 查看帮助信息:');
  console.log('  npx mp-lens --help');
}
