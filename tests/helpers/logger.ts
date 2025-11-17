type LogMethod = 'info' | 'warn' | 'error' | 'debug' | 'verbose' | 'trace';

type LoggerLike = Record<LogMethod, (...args: any[]) => void>;

export type LoggerSpies = Record<LogMethod, jest.SpyInstance>;

const methods: LogMethod[] = ['info', 'warn', 'error', 'debug', 'verbose', 'trace'];

export function silenceLogger(loggerInstance: LoggerLike): LoggerSpies {
  return methods.reduce((acc, method) => {
    const current = loggerInstance[method];
    if (jest.isMockFunction(current)) {
      const existingSpy = current as jest.SpyInstance;
      existingSpy.mockImplementation(() => {});
      existingSpy.mockClear();
      acc[method] = existingSpy;
      return acc;
    }
    const spy = jest.spyOn(loggerInstance, method).mockImplementation(() => {});
    acc[method] = spy;
    return acc;
  }, {} as LoggerSpies);
}
