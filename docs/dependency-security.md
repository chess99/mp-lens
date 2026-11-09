# 依赖安全检查

运行 `npm run audit:dependencies`，执行与 CI 相同的检查：

1. 使用 `npm audit --omit=dev` 检查生产依赖，任何级别的漏洞都会失败。
2. 使用 `audit-ci` 检查全部依赖，阻止低危及以上漏洞，仅接受 `audit-ci.jsonc` 中未到期的精确例外。审计服务不可用时检查也会失败。

## 临时例外

- 公告：[GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)，deepmerge 返回对象的原型污染，低危。
- 范围：仅限开发依赖 `jest`、`ts-jest` 到 `deepmerge` 的依赖链，其他入口仍会失败。
- 路径配置限定公告编号、Jest 依赖链入口及 `jest-config>deepmerge` 终点；通配符仅兼容 npm 10/11 对循环依赖中间路径和末尾分隔符的不同报告形式。生产依赖由前置审计独立检查，不接受此例外。
- 原因：截至 2026-11-09，deepmerge 最新版 4.3.1 没有修复版本，Jest 最新版 30.5.2 仍依赖它。本项目只通过受版本控制的本地 Jest 配置使用该依赖，不加载外部测试配置；它不属于生产依赖。
- 到期时间：2026-12-09 00:00（北京时间）。届时例外自动失效，需重新评估。上游修复发布后，应更新依赖并删除例外。

该例外不会修复 deepmerge 本身的漏洞；不要在生产代码中使用它，也不要用 Jest 加载不可信配置。

## 版本约束

`glob` 使用 14.0.4 及以上版本，`rimraf` 使用 6.1.4 及以上版本，修复文件匹配依赖链中的漏洞。`@typescript-eslint/typescript-estree` 的间接依赖 `minimatch` 暂时通过 `overrides` 升级到 11.0.5 及以上版本；待上游版本约束覆盖安全版本后，可删除该覆盖项。调整这些依赖后需运行完整测试和 ESLint。
