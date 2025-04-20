// 这个文件与a.js和b.js形成循环引用
// 测试算法是否能正确处理循环依赖

const a = require('./a');
const b = require('./b');

function cyclicDependency() {
  return a.test() + ' ' + b.hello();
}

module.exports = {
  cycle: cyclicDependency
}; 