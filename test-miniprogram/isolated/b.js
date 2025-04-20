// 这个文件被a.js引用，但a.js自己没有被任何文件引用
// 在以前的算法中，这个文件不会被标记为未使用

function hello() {
  return 'Hello from module B';
}

module.exports = {
  hello
}; 