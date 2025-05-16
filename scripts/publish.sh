#!/bin/bash

# 颜色标记
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# 打印带颜色的信息
function info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

function warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

function error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# 检查命令执行是否成功
function check_status() {
  if [ $? -ne 0 ]; then
    error "$1"
    exit 1
  else
    info "$2"
  fi
}

# 确保脚本在项目根目录执行
if [ ! -f "package.json" ]; then
  error "请在项目根目录下运行此脚本"
  exit 1
fi

# 检查是否有未提交的更改
if [ -n "$(git status --porcelain)" ]; then
  warn "你有未提交的更改，请先提交或储藏它们"
  git status
  read -p "是否继续？(y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# 从当前版本获取信息
CURRENT_VERSION=$(node -p "require('./package.json').version")
info "当前版本: v${CURRENT_VERSION}"

# 选择版本更新类型
echo "请选择要发布的版本类型:"
echo "1) patch - 修复程序错误的更新 (x.x.X)"
echo "2) minor - 向后兼容的功能更新 (x.X.x)"
echo "3) major - 不兼容的 API 更改 (X.x.x)"
echo "4) prerelease - 预发布版本 (x.x.x-alpha.x)"
echo "5) 自定义版本号"

read -p "请选择 (1-5): " VERSION_CHOICE

case $VERSION_CHOICE in
  1)
    VERSION_TYPE="patch"
    ;;
  2)
    VERSION_TYPE="minor"
    ;;
  3)
    VERSION_TYPE="major"
    ;;
  4)
    VERSION_TYPE="prerelease"
    ;;
  5)
    read -p "请输入完整的版本号 (如 1.2.3): " CUSTOM_VERSION
    VERSION_TYPE=$CUSTOM_VERSION
    ;;
  *)
    error "无效的选择"
    exit 1
    ;;
esac

# 计算新版本号 (仅用于显示)
if [ "$VERSION_TYPE" != "$CUSTOM_VERSION" ]; then
  NEW_VERSION=$(npm --no-git-tag-version version $VERSION_TYPE | sed 's/v//')
  # 回滚版本号更改
  git checkout -- package.json package-lock.json
  info "将更新到: v${NEW_VERSION}"
else
  NEW_VERSION=$CUSTOM_VERSION
  info "将更新到: v${NEW_VERSION}"
fi

# 确认发布
read -p "确认发布? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  info "已取消发布"
  exit 0
fi

# 使用公共 npm 源安装依赖
info "使用公共 npm 源安装依赖..."
rm -rf node_modules
npm install --registry=https://registry.npmjs.org/
check_status "安装依赖失败" "依赖安装成功"

# 运行测试
info "运行测试..."
npm test
check_status "测试失败" "测试通过"

# 执行构建
info "执行构建..."
npm run build
check_status "构建失败" "构建成功"

# 检查 npm ci 是否能正常工作 (这是 GitHub Actions 会执行的命令)
info "检查 npm ci 是否工作正常..."
rm -rf node_modules
npm ci
check_status "npm ci 失败，package-lock.json 可能不一致" "npm ci 检查通过"

# 更新版本
info "更新版本..."
if [ "$VERSION_TYPE" != "$CUSTOM_VERSION" ]; then
  npm --no-git-tag-version version $VERSION_TYPE
else
  npm --no-git-tag-version version $CUSTOM_VERSION
fi
check_status "版本更新失败" "版本已更新到 v$(node -p "require('./package.json').version")"

# 提交版本更改
info "提交版本更改..."
git add package.json package-lock.json
git commit -m "release: v$(node -p "require('./package.json').version")"
check_status "提交失败" "版本更改已提交"

# 创建标签
info "创建标签 v$(node -p "require('./package.json').version")..."
git tag -a "v$(node -p "require('./package.json').version")" -m "Version $(node -p "require('./package.json').version")"
check_status "标签创建失败" "标签已创建"

# 提示下一步操作
info "完成! 要发布新版本，请执行以下命令:"
echo "  git push origin main"
echo "  git push origin v$(node -p "require('./package.json').version")"
echo "这将触发 GitHub Actions 工作流来发布 npm 包" 