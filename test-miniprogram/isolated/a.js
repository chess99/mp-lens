// 这个文件引用了b.js，但它自己没有被任何文件引用
// 测试算法是否能检测到这种"孤岛"情况

const b = require('./b');

function unusedFunction() {
  console.log('This function uses module B:', b.hello());
}

module.exports = {
  test: function() {
    return 'This is module A';
  }
}; 