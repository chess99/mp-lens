import { inferIssueType, telemetry } from '../../src/telemetry';
import { CommandEvent, ErrorEvent, UserIssueEvent } from '../../src/telemetry/events';

// Mock PostHog
jest.mock('../../src/telemetry/posthog', () => ({
  sendToPostHog: jest.fn(),
}));

// Mock telemetry config
jest.mock('../../src/telemetry/config', () => ({
  isTelemetryEnabled: jest.fn(() => true),
}));

// Mock user ID
jest.mock('../../src/telemetry/user', () => ({
  getOrCreateUserId: jest.fn(() => 'test-user-id'),
}));

import { isTelemetryEnabled } from '../../src/telemetry/config';
import { sendToPostHog } from '../../src/telemetry/posthog';

describe('Telemetry Integration Tests', () => {
  const mockSendToPostHog = sendToPostHog as jest.MockedFunction<typeof sendToPostHog>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Initialize telemetry before each test
    telemetry.init({ telemetry: true });
  });

  describe('Command Event Tracking', () => {
    it('should capture command events correctly', () => {
      const commandEvent: Omit<CommandEvent, 'userId' | 'timestamp'> = {
        event: 'command',
        command: 'graph',
        args: ['-f', 'html'],
        version: '1.0.0',
      };

      telemetry.capture(commandEvent);

      expect(mockSendToPostHog).toHaveBeenCalledWith({
        event: 'command',
        distinctId: 'test-user-id',
        properties: expect.objectContaining({
          command: 'graph',
          args: ['-f', 'html'],
          version: '1.0.0',
        }),
      });
    });

    it('should capture different command types', () => {
      const commands = ['graph', 'lint', 'purgewxss', 'clean', 'cpd'];

      commands.forEach((command) => {
        const commandEvent: Omit<CommandEvent, 'userId' | 'timestamp'> = {
          event: 'command',
          command,
          args: [],
          version: '1.0.0',
        };

        telemetry.capture(commandEvent);
      });

      expect(mockSendToPostHog).toHaveBeenCalledTimes(commands.length);

      commands.forEach((command, index) => {
        expect(mockSendToPostHog).toHaveBeenNthCalledWith(index + 1, {
          event: 'command',
          distinctId: 'test-user-id',
          properties: expect.objectContaining({
            command,
          }),
        });
      });
    });
  });

  describe('User Issue Event Tracking (HandledError)', () => {
    it('should capture user issues correctly', () => {
      const userIssueEvent: Omit<UserIssueEvent, 'userId' | 'timestamp'> = {
        event: 'user-issue',
        command: 'purgewxss',
        issueType: 'file-not-found',
        issueMessage: 'WXSS 文件未找到: /nonexistent/file.wxss',
        version: '1.0.0',
        args: ['purgewxss', '/nonexistent/file.wxss'],
      };

      telemetry.capture(userIssueEvent);

      expect(mockSendToPostHog).toHaveBeenCalledWith({
        event: 'user-issue',
        distinctId: 'test-user-id',
        properties: expect.objectContaining({
          command: 'purgewxss',
          issueType: 'file-not-found',
          issueMessage: 'WXSS 文件未找到: /nonexistent/file.wxss',
          version: '1.0.0',
          args: ['purgewxss', '/nonexistent/file.wxss'],
        }),
      });
    });

    it('should track different types of user issues', () => {
      const issues = [
        {
          command: 'purgewxss',
          issueType: 'file-not-found',
          issueMessage: 'WXSS 文件未找到: /path/file.wxss',
        },
        {
          command: 'purgewxss',
          issueType: 'invalid-file-type',
          issueMessage: '输入文件不是 .wxss 文件: test.js',
        },
        {
          command: 'lint',
          issueType: 'file-not-found',
          issueMessage: '目标路径未找到: /nonexistent/path',
        },
        {
          command: 'lint',
          issueType: 'invalid-file-type',
          issueMessage: '不支持的文件类型: .js',
        },
        {
          command: 'graph',
          issueType: 'invalid-format',
          issueMessage: '不支持的输出格式: xml',
        },
      ];

      issues.forEach((issue) => {
        const userIssueEvent: Omit<UserIssueEvent, 'userId' | 'timestamp'> = {
          event: 'user-issue',
          command: issue.command,
          issueType: issue.issueType,
          issueMessage: issue.issueMessage,
          version: '1.0.0',
          args: [],
        };

        telemetry.capture(userIssueEvent);
      });

      expect(mockSendToPostHog).toHaveBeenCalledTimes(issues.length);
    });
  });

  describe('System Error Event Tracking', () => {
    it('should capture system errors correctly', () => {
      const errorEvent: Omit<ErrorEvent, 'userId' | 'timestamp'> = {
        event: 'error',
        command: 'graph',
        errorMessage: 'Unexpected error occurred',
        stack: 'Error: Unexpected error\n    at ...',
        version: '1.0.0',
        args: ['graph', '-f', 'html'],
      };

      telemetry.capture(errorEvent);

      expect(mockSendToPostHog).toHaveBeenCalledWith({
        event: 'error',
        distinctId: 'test-user-id',
        properties: expect.objectContaining({
          command: 'graph',
          errorMessage: 'Unexpected error occurred',
          stack: 'Error: Unexpected error\n    at ...',
          version: '1.0.0',
          args: ['graph', '-f', 'html'],
        }),
      });
    });
  });

  describe('Issue Type Inference', () => {
    it('should infer file-not-found issue type', () => {
      const messages = [
        'WXSS 文件未找到: /path/file.wxss',
        '目标路径未找到: /nonexistent/path',
        'File not found',
        '文件不存在',
      ];

      messages.forEach((message) => {
        expect(inferIssueType(message)).toBe('file-not-found');
      });
    });

    it('should infer invalid-file-type issue type', () => {
      const messages = [
        '输入文件不是 .wxss 文件: test.js',
        '不支持的文件类型: .js',
        'Unsupported file type',
        '文件类型错误',
      ];

      messages.forEach((message) => {
        expect(inferIssueType(message)).toBe('invalid-file-type');
      });
    });

    it('should infer invalid-format issue type', () => {
      const messages = ['不支持的输出格式: xml', 'Invalid format specified', '格式错误'];

      messages.forEach((message) => {
        expect(inferIssueType(message)).toBe('invalid-format');
      });
    });

    it('should infer config-error issue type', () => {
      const messages = [
        '配置文件错误',
        'Configuration error',
        'Invalid configuration',
        '配置不正确',
      ];

      messages.forEach((message) => {
        expect(inferIssueType(message)).toBe('config-error');
      });
    });

    it('should infer permission-error issue type', () => {
      const messages = ['权限不足', 'Permission denied', 'Access denied', '没有权限'];

      messages.forEach((message) => {
        expect(inferIssueType(message)).toBe('permission-error');
      });
    });

    it('should default to other for unrecognized messages', () => {
      const messages = ['Some random error message', '未知错误', 'Random issue'];

      messages.forEach((message) => {
        expect(inferIssueType(message)).toBe('other');
      });
    });
  });

  describe('Event Properties', () => {
    it('should include all required properties for command events', () => {
      const commandEvent: Omit<CommandEvent, 'userId' | 'timestamp'> = {
        event: 'command',
        command: 'test-command',
        args: ['arg1', 'arg2'],
        version: '1.0.0',
        properties: {
          customProp: 'value',
        },
      };

      telemetry.capture(commandEvent);

      expect(mockSendToPostHog).toHaveBeenCalledWith({
        event: 'command',
        distinctId: 'test-user-id',
        properties: expect.objectContaining({
          command: 'test-command',
          args: ['arg1', 'arg2'],
          version: '1.0.0',
          customProp: 'value',
        }),
      });
    });

    it('should include all required properties for user issue events', () => {
      const userIssueEvent: Omit<UserIssueEvent, 'userId' | 'timestamp'> = {
        event: 'user-issue',
        command: 'test-command',
        issueType: 'test-issue',
        issueMessage: 'Test issue message',
        version: '1.0.0',
        args: ['arg1'],
        properties: {
          context: 'test-context',
        },
      };

      telemetry.capture(userIssueEvent);

      expect(mockSendToPostHog).toHaveBeenCalledWith({
        event: 'user-issue',
        distinctId: 'test-user-id',
        properties: expect.objectContaining({
          command: 'test-command',
          issueType: 'test-issue',
          issueMessage: 'Test issue message',
          version: '1.0.0',
          args: ['arg1'],
          context: 'test-context',
        }),
      });
    });
  });

  describe('Telemetry Disabled', () => {
    it('should not send events when telemetry is disabled', () => {
      // Mock telemetry as disabled
      (isTelemetryEnabled as jest.Mock).mockReturnValue(false);

      // Initialize telemetry as disabled
      telemetry.init({ telemetry: false });

      telemetry.capture({
        event: 'command',
        command: 'test',
        args: [],
        version: '1.0.0',
      });

      expect(mockSendToPostHog).not.toHaveBeenCalled();
    });
  });
});
