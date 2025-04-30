/**
 * Verbosity levels for logging:
 * 0 = ESSENTIAL: Only critical information (errors, warnings, final results)
 * 1 = NORMAL: Basic debug information (DEFAULT with --verbose flag)
 * 2 = VERBOSE: Detailed debug information (configuration, processing steps)
 * 3 = TRACE: Extremely detailed information (path resolution, all file operations)
 */
export enum LogLevel {
  ESSENTIAL = 0,
  NORMAL = 1,
  VERBOSE = 2,
  TRACE = 3,
}

interface LoggerOptions {
  /** The verbosity level (0-3) */
  level: LogLevel;
  /** Project root path for path normalization */
  projectRoot?: string;
  /** Whether to use relative paths in logs */
  useRelativePaths?: boolean;
  /** Whether to colorize log output */
  useColors?: boolean;
  /** Language for logs (defaults to English) */
  language?: 'en' | 'zh';
}

/**
 * Debug logger utility for the analyzer
 */
class DebugLogger {
  private options: LoggerOptions;

  /**
   * Create a new debug logger
   */
  constructor(options: Partial<LoggerOptions> = {}) {
    this.options = {
      level: options.level ?? (options.level === 0 ? 0 : LogLevel.ESSENTIAL),
      projectRoot: options.projectRoot,
      useRelativePaths: options.useRelativePaths ?? true,
      useColors: options.useColors ?? true,
      language: options.language ?? 'en',
    };
  }

  /**
   * Update logger options
   */
  setOptions(options: Partial<LoggerOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Set the verbosity level
   */
  setLevel(level: LogLevel | boolean): void {
    if (typeof level === 'boolean') {
      // Convert boolean verbose flag to appropriate level
      this.options.level = level ? LogLevel.NORMAL : LogLevel.ESSENTIAL;
    } else {
      this.options.level = level;
    }
  }

  /**
   * Get the current verbosity level
   */
  getLevel(): LogLevel {
    return this.options.level;
  }

  /**
   * Set the project root for path normalization
   */
  setProjectRoot(projectRoot: string): void {
    this.options.projectRoot = projectRoot;
  }

  /**
   * Log a message at ESSENTIAL level (always shown)
   */
  info(message: string, ...args: any[]): void {
    this._log('INFO', LogLevel.ESSENTIAL, message, ...args);
  }

  /**
   * Log a warning message (always shown)
   */
  warn(message: string, ...args: any[]): void {
    this._log('WARN', LogLevel.ESSENTIAL, message, ...args);
  }

  /**
   * Log an error message (always shown)
   */
  error(message: string, ...args: any[]): void {
    this._log('ERROR', LogLevel.ESSENTIAL, message, ...args);
  }

  /**
   * Log a message at NORMAL level
   * Only shown when verbose flag is enabled
   */
  debug(message: string, ...args: any[]): void {
    this._log('DEBUG', LogLevel.NORMAL, message, ...args);
  }

  /**
   * Log a message at VERBOSE level
   * Requires verbosity level of 2 or higher
   */
  verbose(message: string, ...args: any[]): void {
    this._log('VERBOSE', LogLevel.VERBOSE, message, ...args);
  }

  /**
   * Log a message at TRACE level
   * Requires verbosity level of 3
   */
  trace(message: string, ...args: any[]): void {
    this._log('TRACE', LogLevel.TRACE, message, ...args);
  }

  /**
   * Normalize paths in log messages if needed
   */
  private normalizePath(input: string): string {
    if (!this.options.useRelativePaths || !this.options.projectRoot) {
      return input;
    }

    // Try to find and convert absolute paths to relative ones
    return input.replace(new RegExp(this.options.projectRoot.replace(/\\/g, '\\\\'), 'g'), '.');
  }

  /**
   * Internal logging implementation
   */
  private _log(prefix: string, level: LogLevel, message: string, ...args: any[]): void {
    if (this.options.level < level) {
      return;
    }

    // Normalize paths in the message
    if (this.options.projectRoot) {
      message = this.normalizePath(message);

      // Also try to normalize paths in objects
      args = args.map((arg) => {
        if (typeof arg === 'string') {
          return this.normalizePath(arg);
        } else if (typeof arg === 'object' && arg !== null) {
          // For objects, we need to stringify and normalize all strings
          try {
            const str = JSON.stringify(arg);
            return JSON.parse(this.normalizePath(str));
          } catch (e) {
            return arg;
          }
        }
        return arg;
      });
    }

    // Format the message with arguments
    let formatted = message;
    if (args.length > 0) {
      if (args.length === 1 && typeof args[0] === 'object') {
        // Special case for logging objects - format them nicely
        formatted = `${message} ${JSON.stringify(args[0], null, 2)}`;
      } else {
        formatted = `${message} ${args
          .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
          .join(' ')}`;
      }
    }

    console.log(`${prefix} - ${formatted}`);
  }
}

// Create a default instance for convenient import
export const logger = new DebugLogger();
