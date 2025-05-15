我们来实现一个新功能 `mp-lens purgewxss [wxss-file-path]`, 功能如下:
查找这个wxss同名的wxml, 解析wxml内的所有tag和class, 与wxss内的所有selector对比, 报告不一致的情况

假如传入了 `[wxss-file-path]` 则只分析这个文件
否则先进行项目分析, 收集所有wxss (通过glob), 然后进行对比

使用purgecss @<https://purgecss.com/api.html>
根据小程序的css作用域分多次调用purgecss, 例如收集完组件的wxml和wxss后调用一次, 各个组件分开调用 `new PurgeCSS().purge`

需要考虑的特别情况:

1. 假如class="{{ }}"" 这样的动态样式, 需要把这些动态样式抽取出来放进safelist
2. 假如wxml引用了其他wxml, 需要递归解析收集起来, 可以在 src/linter/wxml-analyzer.ts 内扩展相关工具
3. 默认不进行实际的文件修改, 只进行分析和报告, `--write` 参数可以进行实际的文件修改 (类似 prettier 的工作方式)
