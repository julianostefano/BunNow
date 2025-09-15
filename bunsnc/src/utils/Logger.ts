/**
 * Logger - Structured logging system for BunSNC
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  operation?: string;
  table?: string;
  sysId?: string;
  duration?: number;
  error?: Error;
  metadata?: Record<string, any>;
}

export interface LoggerConfig {
  level: LogLevel;
  enableConsole: boolean;
  enableFile: boolean;
  maxFileSize: number;
  maxFiles: number;
  logFormat: 'json' | 'pretty';
  includeStackTrace: boolean;
}

export class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private logBuffer: LogEntry[] = [];
  private isProcessing = false;

  private constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: LogLevel.INFO,
      enableConsole: true,
      enableFile: false,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      logFormat: 'pretty',
      includeStackTrace: false,
      ...config
    };
  }

  static getInstance(config?: Partial<LoggerConfig>): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    }
    return Logger.instance;
  }

  static configure(config: Partial<LoggerConfig>): void {
    if (!Logger.instance) {
      Logger.instance = new Logger(config);
    } else {
      Logger.instance.config = { ...Logger.instance.config, ...config };
    }
  }

  debug(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, message, context, metadata);
  }

  info(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, message, context, metadata);
  }

  warn(message: string, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, message, context, metadata);
  }

  error(message: string, error?: Error, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, message, context, { ...metadata, error });
  }

  critical(message: string, error?: Error, context?: string, metadata?: Record<string, any>): void {
    this.log(LogLevel.CRITICAL, message, context, { ...metadata, error });
  }

  operation(operation: string, table?: string, sysId?: string, metadata?: Record<string, any>): OperationLogger {
    return new OperationLogger(this, operation, table, sysId, metadata);
  }

  private log(level: LogLevel, message: string, context?: string, metadata?: Record<string, any>): void {
    if (level < this.config.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      ...metadata
    };

    this.logBuffer.push(entry);
    this.processLogBuffer();
  }

  private processLogBuffer(): void {
    if (this.isProcessing || this.logBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;

    // Process logs asynchronously to avoid blocking
    setImmediate(async () => {
      try {
        const entriesToProcess = [...this.logBuffer];
        this.logBuffer = [];

        await Promise.all(
          entriesToProcess.map(async (entry) => {
            const promises: Promise<void>[] = [];

            if (this.config.enableConsole) {
              promises.push(this.writeToConsoleAsync(entry));
            }

            if (this.config.enableFile) {
              promises.push(this.writeToFileAsync(entry));
            }

            await Promise.all(promises);
          })
        );
      } catch (error) {
        // Fallback to synchronous console error to avoid log loops
        console.error('[Logger] Async processing failed:', error);
      } finally {
        this.isProcessing = false;

        // Process any logs that arrived while we were processing
        if (this.logBuffer.length > 0) {
          setImmediate(() => this.processLogBuffer());
        }
      }
    });
  }

  private async writeToConsoleAsync(entry: LogEntry): Promise<void> {
    return new Promise((resolve) => {
      setImmediate(() => {
        try {
          this.writeToConsole(entry);
          resolve();
        } catch (error) {
          console.error('[Logger] Console write failed:', error);
          resolve();
        }
      });
    });
  }

  private async writeToFileAsync(entry: LogEntry): Promise<void> {
    return new Promise((resolve) => {
      setImmediate(async () => {
        try {
          await this.writeToFile(entry);
          resolve();
        } catch (error) {
          console.error('[Logger] File write failed:', error);
          resolve();
        }
      });
    });
  }

  private writeToConsole(entry: LogEntry): void {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
    const levelColors = {
      [LogLevel.DEBUG]: '\x1b[36m',
      [LogLevel.INFO]: '\x1b[32m',
      [LogLevel.WARN]: '\x1b[33m',
      [LogLevel.ERROR]: '\x1b[31m',
      [LogLevel.CRITICAL]: '\x1b[35m'
    };
    const resetColor = '\x1b[0m';

    if (this.config.logFormat === 'json') {
      console.log(JSON.stringify(entry));
    } else {
      const timestamp = entry.timestamp.split('T')[1]?.split('.')[0] || '';
      const levelName = levelNames[entry.level];
      const color = levelColors[entry.level] || '';

      let logLine = `${color}[${timestamp}] ${levelName}${resetColor}: ${entry.message}`;

      if (entry.context) {
        logLine += ` (${entry.context})`;
      }

      if (entry.operation) {
        logLine += ` [${entry.operation}]`;
      }

      if (entry.table) {
        logLine += ` table=${entry.table}`;
      }

      if (entry.sysId) {
        logLine += ` sys_id=${entry.sysId}`;
      }

      if (entry.duration !== undefined) {
        logLine += ` (${entry.duration}ms)`;
      }

      console.log(logLine);

      if (entry.error && this.config.includeStackTrace) {
        console.error(entry.error.stack);
      }

      if (entry.metadata && Object.keys(entry.metadata).length > 0) {
        const cleanMetadata = { ...entry.metadata };
        delete cleanMetadata.error; // Already handled above
        if (Object.keys(cleanMetadata).length > 0) {
          console.log('  Metadata:', JSON.stringify(cleanMetadata, null, 2));
        }
      }
    }
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    if (typeof process !== 'undefined' && process.env.BUNSNC_LOG_FILE) {
      try {
        const logLine = JSON.stringify(entry) + '\n';
        // Use Bun's async file API
        if (typeof Bun !== 'undefined') {
          await Bun.write(process.env.BUNSNC_LOG_FILE, logLine, { createPath: true });
        }
      } catch (error) {
        // Fallback to console if file write fails
        console.error('[Logger] File write error:', error);
      }
    }
  }

  getLogs(level?: LogLevel, limit: number = 100): LogEntry[] {
    // This would return from file storage in a real implementation
    // For now, return empty array as logs are immediately processed
    return [];
  }

  clearLogs(): void {
    this.logBuffer = [];
  }

  getMetrics(): {
    totalLogs: number;
    logsByLevel: Record<string, number>;
    averageProcessingTime: number;
  } {
    // Implementation would track metrics over time
    return {
      totalLogs: 0,
      logsByLevel: {},
      averageProcessingTime: 0
    };
  }
}

export class OperationLogger {
  private startTime: number;
  private operation: string;
  private table?: string;
  private sysId?: string;
  private metadata?: Record<string, any>;

  constructor(
    private logger: Logger,
    operation: string,
    table?: string,
    sysId?: string,
    metadata?: Record<string, any>
  ) {
    this.startTime = performance.now();
    this.operation = operation;
    this.table = table;
    this.sysId = sysId;
    this.metadata = metadata;

    this.logger.debug(`Starting operation: ${operation}`, 'OperationLogger', {
      operation,
      table,
      sysId,
      ...metadata
    });
  }

  success(message?: string, additionalMetadata?: Record<string, any>): void {
    const duration = performance.now() - this.startTime;
    
    this.logger.info(
      message || `Operation completed: ${this.operation}`,
      'OperationLogger',
      {
        operation: this.operation,
        table: this.table,
        sysId: this.sysId,
        duration,
        ...this.metadata,
        ...additionalMetadata
      }
    );
  }

  error(message: string, error?: Error, additionalMetadata?: Record<string, any>): void {
    const duration = performance.now() - this.startTime;
    
    this.logger.error(
      `Operation failed: ${this.operation} - ${message}`,
      error,
      'OperationLogger',
      {
        operation: this.operation,
        table: this.table,
        sysId: this.sysId,
        duration,
        ...this.metadata,
        ...additionalMetadata
      }
    );
  }

  progress(message: string, additionalMetadata?: Record<string, any>): void {
    const duration = performance.now() - this.startTime;
    
    this.logger.debug(
      `Operation progress: ${this.operation} - ${message}`,
      'OperationLogger',
      {
        operation: this.operation,
        table: this.table,
        sysId: this.sysId,
        duration,
        ...this.metadata,
        ...additionalMetadata
      }
    );
  }
}

// Global logger instance
export const logger = Logger.getInstance();

// Convenience exports
export const log = logger;
export default logger;