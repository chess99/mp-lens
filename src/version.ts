// 从环境变量中获取版本信息，由构建工具注入
export const version = process.env.npm_package_version || 'unknown';
