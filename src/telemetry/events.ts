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

export type TelemetryEvent = CommandEvent | ErrorEvent;
