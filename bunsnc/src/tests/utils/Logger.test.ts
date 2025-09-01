/**
 * Logger Tests - Comprehensive test suite for logging system
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { Logger, LogLevel, OperationLogger, logger } from '../../utils/Logger';

describe('Logger', () => {
  let testLogger: Logger;
  let consoleSpy: any;

  beforeEach(() => {
    testLogger = Logger.getInstance();
    consoleSpy = spyOn(console, 'log');
    testLogger.clearLogs();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  describe('Basic Logging', () => {
    test('should log debug messages', () => {
      Logger.configure({ level: LogLevel.DEBUG });
      
      testLogger.debug('Test debug message', 'TestContext');
      
      expect(consoleSpy).toHaveBeenCalled();
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('DEBUG');
      expect(logOutput).toContain('Test debug message');
      expect(logOutput).toContain('(TestContext)');
    });

    test('should log info messages', () => {
      testLogger.info('Test info message', 'TestContext');
      
      expect(consoleSpy).toHaveBeenCalled();
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('INFO');
      expect(logOutput).toContain('Test info message');
    });

    test('should log warning messages', () => {
      testLogger.warn('Test warning message', 'TestContext');
      
      expect(consoleSpy).toHaveBeenCalled();
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('WARN');
      expect(logOutput).toContain('Test warning message');
    });

    test('should log error messages with error object', () => {
      const testError = new Error('Test error');
      
      testLogger.error('Test error message', testError, 'TestContext');
      
      expect(consoleSpy).toHaveBeenCalled();
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('ERROR');
      expect(logOutput).toContain('Test error message');
    });

    test('should log critical messages', () => {
      const testError = new Error('Critical error');
      
      testLogger.critical('Critical issue', testError, 'TestContext');
      
      expect(consoleSpy).toHaveBeenCalled();
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('CRITICAL');
      expect(logOutput).toContain('Critical issue');
    });
  });

  describe('Log Levels', () => {
    test('should respect log level filtering', () => {
      Logger.configure({ level: LogLevel.WARN });
      
      testLogger.debug('Debug message');
      testLogger.info('Info message');
      testLogger.warn('Warning message');
      
      expect(consoleSpy).toHaveBeenCalledTimes(1); // Only warning should be logged
      const logOutput = consoleSpy.mock.calls[0][0];
      expect(logOutput).toContain('WARN');
    });

    test('should log all messages when level is DEBUG', () => {
      Logger.configure({ level: LogLevel.DEBUG });
      
      testLogger.debug('Debug message');
      testLogger.info('Info message');
      testLogger.warn('Warning message');
      testLogger.error('Error message');
      
      expect(consoleSpy).toHaveBeenCalledTimes(4);
    });
  });

  describe('Metadata Logging', () => {
    test('should log metadata', () => {
      testLogger.info('Test message', 'TestContext', {
        userId: '12345',
        operation: 'test',
        data: { key: 'value' }
      });
      
      expect(consoleSpy).toHaveBeenCalledTimes(2); // Message + metadata
      const metadataOutput = consoleSpy.mock.calls[1][1];
      expect(metadataOutput).toEqual({
        userId: '12345',
        operation: 'test',
        data: { key: 'value' }
      });
    });

    test('should handle empty metadata', () => {
      testLogger.info('Test message', 'TestContext', {});
      
      expect(consoleSpy).toHaveBeenCalledTimes(1); // Only message, no metadata
    });
  });

  describe('JSON Format', () => {
    test('should output JSON format when configured', () => {
      Logger.configure({ logFormat: 'json' });
      
      testLogger.info('Test message', 'TestContext');
      
      expect(consoleSpy).toHaveBeenCalled();
      const logOutput = consoleSpy.mock.calls[0][0];
      
      // Should be valid JSON
      expect(() => JSON.parse(logOutput)).not.toThrow();
      
      const parsed = JSON.parse(logOutput);
      expect(parsed.message).toBe('Test message');
      expect(parsed.context).toBe('TestContext');
      expect(parsed.level).toBe(LogLevel.INFO);
    });
  });

  describe('Stack Trace', () => {
    test('should include stack trace when enabled', () => {
      Logger.configure({ includeStackTrace: true });
      const consoleErrorSpy = spyOn(console, 'error');
      
      const testError = new Error('Test error with stack');
      testLogger.error('Error with stack', testError, 'TestContext');
      
      expect(consoleErrorSpy).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });
});

describe('OperationLogger', () => {
  let testLogger: Logger;
  let consoleSpy: any;

  beforeEach(() => {
    testLogger = Logger.getInstance();
    consoleSpy = spyOn(console, 'log');
    testLogger.clearLogs();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('should create and track operation', () => {
    const operation = testLogger.operation('test_operation', 'test_table', 'test_id');
    
    expect(operation).toBeInstanceOf(OperationLogger);
    expect(consoleSpy).toHaveBeenCalled();
    
    const logOutput = consoleSpy.mock.calls[0][0];
    expect(logOutput).toContain('Starting operation: test_operation');
  });

  test('should log operation success', () => {
    const operation = testLogger.operation('test_operation', 'test_table', 'test_id');
    consoleSpy.mockClear();
    
    operation.success('Operation completed successfully');
    
    expect(consoleSpy).toHaveBeenCalled();
    const logOutput = consoleSpy.mock.calls[0][0];
    expect(logOutput).toContain('Operation completed successfully');
    expect(logOutput).toContain('INFO');
  });

  test('should log operation error', () => {
    const operation = testLogger.operation('test_operation', 'test_table', 'test_id');
    consoleSpy.mockClear();
    
    const testError = new Error('Operation failed');
    operation.error('Operation failed', testError);
    
    expect(consoleSpy).toHaveBeenCalled();
    const logOutput = consoleSpy.mock.calls[0][0];
    expect(logOutput).toContain('Operation failed: test_operation');
    expect(logOutput).toContain('ERROR');
  });

  test('should log operation progress', () => {
    const operation = testLogger.operation('test_operation', 'test_table', 'test_id');
    consoleSpy.mockClear();
    
    operation.progress('Processing step 1 of 3');
    
    expect(consoleSpy).toHaveBeenCalled();
    const logOutput = consoleSpy.mock.calls[0][0];
    expect(logOutput).toContain('Operation progress: test_operation');
    expect(logOutput).toContain('Processing step 1 of 3');
  });

  test('should track operation duration', () => {
    const operation = testLogger.operation('test_operation');
    consoleSpy.mockClear();
    
    // Simulate some work
    const start = performance.now();
    while (performance.now() - start < 10) {
      // Wait for at least 10ms
    }
    
    operation.success('Completed');
    
    expect(consoleSpy).toHaveBeenCalled();
    // Check that duration is logged in metadata
    const metadataCall = consoleSpy.mock.calls.find(call => 
      call[1] && typeof call[1].duration === 'number'
    );
    expect(metadataCall).toBeTruthy();
    expect(metadataCall[1].duration).toBeGreaterThan(0);
  });

  test('should include additional metadata in success', () => {
    const operation = testLogger.operation('test_operation');
    consoleSpy.mockClear();
    
    operation.success('Completed', {
      recordsProcessed: 100,
      errors: 0
    });
    
    expect(consoleSpy).toHaveBeenCalledTimes(2); // Message + metadata
    const metadataCall = consoleSpy.mock.calls[1];
    expect(metadataCall[1].recordsProcessed).toBe(100);
    expect(metadataCall[1].errors).toBe(0);
  });
});

describe('Logger Singleton', () => {
  test('should return same instance', () => {
    const logger1 = Logger.getInstance();
    const logger2 = Logger.getInstance();
    
    expect(logger1).toBe(logger2);
  });

  test('should use global logger instance', () => {
    expect(logger).toBeInstanceOf(Logger);
  });
});

describe('Logger Configuration', () => {
  test('should configure logger settings', () => {
    const config = {
      level: LogLevel.ERROR,
      enableConsole: true,
      logFormat: 'json' as const,
      includeStackTrace: true
    };
    
    Logger.configure(config);
    
    // Test that debug and info are not logged
    const consoleSpy = spyOn(console, 'log');
    
    logger.debug('Debug message');
    logger.info('Info message');
    logger.error('Error message');
    
    expect(consoleSpy).toHaveBeenCalledTimes(1); // Only error should be logged
    
    consoleSpy.mockRestore();
  });

  test('should update existing logger instance', () => {
    const logger1 = Logger.getInstance();
    
    Logger.configure({ level: LogLevel.CRITICAL });
    
    const logger2 = Logger.getInstance();
    expect(logger1).toBe(logger2); // Same instance
  });
});

describe('Logger Buffer Processing', () => {
  test('should process log entries without blocking', async () => {
    const consoleSpy = spyOn(console, 'log');
    
    // Log multiple entries quickly
    for (let i = 0; i < 10; i++) {
      logger.info(`Message ${i}`);
    }
    
    // Give time for processing
    await new Promise(resolve => setTimeout(resolve, 50));
    
    expect(consoleSpy).toHaveBeenCalledTimes(10);
    
    consoleSpy.mockRestore();
  });
});

describe('Logger Error Handling', () => {
  test('should handle console errors gracefully', () => {
    const consoleSpy = spyOn(console, 'log').mockImplementation(() => {
      throw new Error('Console error');
    });
    
    // Should not throw
    expect(() => {
      logger.info('Test message');
    }).not.toThrow();
    
    consoleSpy.mockRestore();
  });

  test('should handle circular references in metadata', () => {
    const circular: any = { name: 'test' };
    circular.self = circular;
    
    const consoleSpy = spyOn(console, 'log');
    
    // Should not throw
    expect(() => {
      logger.info('Test with circular reference', 'Test', { data: circular });
    }).not.toThrow();
    
    consoleSpy.mockRestore();
  });
});