const fs = require('fs');
const path = require('path');
const semver = require('semver');

let projectPackageJson;
const projectPackageJsonPath = path.resolve(__dirname, '../package.json');

try {
  projectPackageJson = JSON.parse(fs.readFileSync(projectPackageJsonPath, 'utf8'));
} catch (error) {
  console.error('❌ 错误: 无法读取或解析项目根目录的 package.json 文件: ' + projectPackageJsonPath);
  console.error(error.message);
  process.exit(1);
}

const projectNodeVersionRange = projectPackageJson.engines && projectPackageJson.engines.node;
if (!projectNodeVersionRange) {
  console.error('❌ 错误: 项目的 package.json 文件未指定 engines.node 版本。');
  process.exit(1);
}

const targetNodeVersion = semver.minVersion(projectNodeVersionRange)?.version;
if (!targetNodeVersion) {
  console.error(
    '❌ 错误: 无法从项目的 engine 设置 ("' +
      projectNodeVersionRange +
      '") 中确定最低 Node.js 版本。请使用明确的下限，例如 ">=14.0.0"。',
  );
  process.exit(1);
}

console.log(
  'ℹ️ 项目 Node.js 版本要求: ' +
    projectNodeVersionRange +
    ' (将使用 ' +
    targetNodeVersion +
    ' 进行比较)',
);
console.log('ℹ️ 正在检查依赖项的兼容性...\n');

const dependencies = projectPackageJson.dependencies || {};
const devDependencies = projectPackageJson.devDependencies || {};

let incompatibleProdDepsMessages = [];
let incompatibleDevDepsMessages = [];
let incompatibleProdCount = 0;
let incompatibleDevCount = 0;

function checkCompatibility(deps, type) {
  let incompatibleMessages = [];
  let incompatibleCount = 0;

  for (const depName in deps) {
    try {
      const depPackageJsonPath = path.resolve(
        __dirname, // current script's directory (e.g., project_root/scripts)
        '..', // up to project_root
        'node_modules',
        depName,
        'package.json',
      );
      const depPackageJson = JSON.parse(fs.readFileSync(depPackageJsonPath, 'utf8'));
      const depNodeEngine = depPackageJson.engines && depPackageJson.engines.node;
      const depVersion = depPackageJson.version;

      if (depNodeEngine) {
        if (!semver.satisfies(targetNodeVersion, depNodeEngine, { includePrerelease: true })) {
          incompatibleMessages.push(
            '⚠️  ' + depName + '@' + depVersion + ' 要求 Node.js: "' + depNodeEngine + '"',
          );
          incompatibleCount++;
        }
      }
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        // This specific error might now indicate that the constructed path is incorrect
        // or the package or its package.json truly doesn't exist at that location.
        console.log(
          '❌ 警告: 无法在预期路径找到依赖项的 package.json: ' +
            depName +
            ' (路径: ' +
            error.path +
            ')',
        );
      } else {
        console.error('❌ 错误: 检查依赖项 ' + depName + ' 时发生错误: ' + error.message);
      }
    }
  }
  return { incompatibleMessages, incompatibleCount };
}

const prodResults = checkCompatibility(dependencies, 'dependencies');
incompatibleProdDepsMessages = prodResults.incompatibleMessages;
incompatibleProdCount = prodResults.incompatibleCount;

const devResults = checkCompatibility(devDependencies, 'devDependencies');
incompatibleDevDepsMessages = devResults.incompatibleMessages;
incompatibleDevCount = devResults.incompatibleCount;

const totalIncompatibleCount = incompatibleProdCount + incompatibleDevCount;

if (totalIncompatibleCount > 0) {
  console.log('--- 检测到的不兼容依赖 ---');
  if (incompatibleProdDepsMessages.length > 0) {
    console.log('\n生产环境依赖 (dependencies):');
    incompatibleProdDepsMessages.forEach((pkgMsg) => console.log(pkgMsg));
  }
  if (incompatibleDevDepsMessages.length > 0) {
    console.log('\n开发环境依赖 (devDependencies):');
    incompatibleDevDepsMessages.forEach((pkgMsg) => console.log(pkgMsg));
  }
  console.log('\n---------------------------');
}

if (totalIncompatibleCount === 0) {
  console.log(
    '\n✅ 所有已检查的依赖项均根据其 engines.node 字段与 Node.js ' + targetNodeVersion + ' 兼容。',
  );
} else {
  console.log(
    '\n🔴 发现 ' +
      totalIncompatibleCount +
      ' 个依赖项与 Node.js ' +
      targetNodeVersion +
      ' 可能存在引擎不兼容问题。请检查以上列表。',
  );
  console.log(
    '   您可以考虑更新这些依赖的版本、寻找替代品，或调整项目的 Node.js 版本（如果可行）。',
  );
}
