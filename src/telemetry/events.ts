// telemetry/events.ts

export interface TelemetryBaseEvent {
  event: string; // 事件名称
  timestamp: number;
  userId: string;
  properties?: Record<string, any>;
}

export interface CommandEvent extends TelemetryBaseEvent {
  event: 'command';
  command: string;
  args: string[];
  version: string;
}

export interface ErrorEvent extends TelemetryBaseEvent {
  event: 'error';
  command?: string;
  errorMessage: string;
  stack?: string;
  version: string;
  args?: string[];
}

// 新增：用户遇到的预期问题事件（HandledError）
export interface UserIssueEvent extends TelemetryBaseEvent {
  event: 'user-issue';
  command: string;
  issueType: string; // 问题类型，如 'file-not-found', 'invalid-format', 'config-error' 等
  issueMessage: string; // 用户看到的错误信息
  version: string;
  args: string[];
}

export type TelemetryEvent = CommandEvent | ErrorEvent | UserIssueEvent;

/**
 * 从 HandledError 的错误信息中推断问题类型
 * 这有助于在 PostHog 中进行分类分析
 */
export function inferIssueType(errorMessage: string): string {
  const message = errorMessage.toLowerCase();

  // 文件/目录不存在
  if (
    message.includes('does not exist') ||
    message.includes('未找到') ||
    message.includes('not found') ||
    message.includes('找不到')
  ) {
    return 'file-not-found';
  }

  // 文件格式/类型错误
  if (
    message.includes('不支持的文件类型') ||
    message.includes('unsupported file type') ||
    message.includes('不是一个文件') ||
    message.includes('不是 .') ||
    message.includes('invalid format')
  ) {
    return 'invalid-file-type';
  }

  // 配置文件问题
  if (
    message.includes('app.json') ||
    message.includes('配置') ||
    message.includes('config') ||
    message.includes('failed to process')
  ) {
    return 'config-error';
  }

  // 命令依赖问题
  if (
    (message.includes('command') && message.includes('not found')) ||
    message.includes('jscpd') ||
    message.includes('请确保') ||
    message.includes('已安装')
  ) {
    return 'dependency-missing';
  }

  // 权限问题
  if (
    message.includes('permission') ||
    message.includes('权限') ||
    message.includes('access denied')
  ) {
    return 'permission-error';
  }

  // 默认分类
  return 'other';
}
