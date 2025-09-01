/**
 * ErrorHandler - Advanced Error Handling and Recovery for BunSNC
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { logger } from './Logger';
import { performanceMonitor } from './PerformanceMonitor';

export interface ErrorContext {
  operation: string;
  table?: string;
  sysId?: string;
  data?: any;
  timestamp: number;
  attemptNumber?: number;
  clientId?: string;
  requestId?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number; // milliseconds
  maxDelay: number; // milliseconds
  backoffFactor: number;
  jitter: boolean;
  retryableErrors: Array<string | RegExp>;
  nonRetryableErrors: Array<string | RegExp>;
}

export interface RecoveryStrategy {
  name: string;
  priority: number;
  condition: (error: Error, context: ErrorContext) => boolean;
  action: (error: Error, context: ErrorContext) => Promise<any>;
  description: string;
}

export class ServiceNowError extends Error {
  public readonly statusCode: number;
  public readonly errorCode?: string;
  public readonly details?: any;
  public readonly context: ErrorContext;
  public readonly isRetryable: boolean;
  public readonly timestamp: number;

  constructor(
    message: string,
    statusCode: number,
    context: ErrorContext,
    errorCode?: string,
    details?: any,
    isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'ServiceNowError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.context = context;
    this.isRetryable = isRetryable;
    this.timestamp = Date.now();
  }
}

export class ErrorHandler {
  private static instance: ErrorHandler;
  private retryConfig: RetryConfig;
  private recoveryStrategies: RecoveryStrategy[] = [];
  private errorStats = {
    total: 0,
    byType: new Map<string, number>(),
    byStatusCode: new Map<number, number>(),
    byOperation: new Map<string, number>(),
    recovered: 0,
    retried: 0
  };

  private constructor() {
    this.setupDefaultRetryConfig();
    this.setupDefaultRecoveryStrategies();
    
    logger.debug('ErrorHandler initialized', 'ErrorHandler', {
      retryConfig: this.retryConfig,
      recoveryStrategies: this.recoveryStrategies.length
    });
  }

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Handle an error with automatic retry and recovery
   */
  async handleError<T>(
    error: Error,
    context: ErrorContext,
    operation: () => Promise<T>
  ): Promise<T> {
    this.recordError(error, context);
    
    const serviceNowError = this.normalizeError(error, context);
    
    // Try recovery strategies first
    const recoveryResult = await this.attemptRecovery(serviceNowError, context);
    if (recoveryResult.success) {
      this.errorStats.recovered++;
      logger.info('Error recovered successfully', 'ErrorHandler', {
        error: error.message,
        strategy: recoveryResult.strategy,
        context
      });
      return recoveryResult.result;
    }

    // If recovery failed and error is retryable, try retry with backoff
    if (this.isRetryable(serviceNowError)) {
      const retryResult = await this.retryWithBackoff(operation, context);
      if (retryResult.success) {
        this.errorStats.retried++;
        return retryResult.result;
      }
    }

    // All recovery and retry attempts failed
    performanceMonitor.recordErrorRate(1, 1, context.operation);
    
    logger.error('Error handling failed - all recovery and retry attempts exhausted', serviceNowError, 'ErrorHandler', {
      context,
      totalAttempts: (context.attemptNumber || 0) + 1
    });
    
    throw serviceNowError;
  }

  /**
   * Create a ServiceNow error from response
   */
  createError(
    statusCode: number,
    responseText: string,
    context: ErrorContext,
    response?: Response
  ): ServiceNowError {
    let errorCode: string | undefined;
    let details: any;
    let message = `ServiceNow API error: ${statusCode}`;

    try {
      const errorData = JSON.parse(responseText);
      if (errorData.error) {
        message = errorData.error.message || errorData.error.detail || message;
        errorCode = errorData.error.code;
        details = errorData.error;
      } else if (errorData.message) {
        message = errorData.message;
      }
    } catch {
      // Not JSON, use raw response text
      message = responseText || message;
    }

    const isRetryable = this.determineRetryability(statusCode, errorCode, message);

    return new ServiceNowError(
      message,
      statusCode,
      context,
      errorCode,
      details,
      isRetryable
    );
  }

  /**
   * Add a custom recovery strategy
   */
  addRecoveryStrategy(strategy: RecoveryStrategy): void {
    this.recoveryStrategies.push(strategy);
    this.recoveryStrategies.sort((a, b) => b.priority - a.priority);
    
    logger.debug('Recovery strategy added', 'ErrorHandler', {
      name: strategy.name,
      priority: strategy.priority
    });
  }

  /**
   * Update retry configuration
   */
  updateRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
    logger.debug('Retry config updated', 'ErrorHandler', {
      config: this.retryConfig
    });
  }

  /**
   * Get error statistics
   */
  getStats(): any {
    return {
      ...this.errorStats,
      byType: Object.fromEntries(this.errorStats.byType),
      byStatusCode: Object.fromEntries(this.errorStats.byStatusCode),
      byOperation: Object.fromEntries(this.errorStats.byOperation),
      recoveryRate: this.errorStats.total > 0 ? this.errorStats.recovered / this.errorStats.total : 0,
      retryRate: this.errorStats.total > 0 ? this.errorStats.retried / this.errorStats.total : 0
    };
  }

  /**
   * Clear error statistics
   */
  clearStats(): void {
    this.errorStats = {
      total: 0,
      byType: new Map(),
      byStatusCode: new Map(),
      byOperation: new Map(),
      recovered: 0,
      retried: 0
    };
    logger.info('Error statistics cleared', 'ErrorHandler');
  }

  private normalizeError(error: Error, context: ErrorContext): ServiceNowError {
    if (error instanceof ServiceNowError) {
      return error;
    }

    // Convert generic errors to ServiceNowError
    const statusCode = (error as any).statusCode || (error as any).status || 500;
    const errorCode = (error as any).code;
    const details = (error as any).details || { originalError: error.message };

    return new ServiceNowError(
      error.message,
      statusCode,
      context,
      errorCode,
      details,
      this.determineRetryability(statusCode, errorCode, error.message)
    );
  }

  private recordError(error: Error, context: ErrorContext): void {
    this.errorStats.total++;
    
    // Record by type
    const errorType = error.constructor.name;
    this.errorStats.byType.set(errorType, (this.errorStats.byType.get(errorType) || 0) + 1);
    
    // Record by status code
    const statusCode = (error as any).statusCode || (error as any).status || 500;
    this.errorStats.byStatusCode.set(statusCode, (this.errorStats.byStatusCode.get(statusCode) || 0) + 1);
    
    // Record by operation
    this.errorStats.byOperation.set(context.operation, (this.errorStats.byOperation.get(context.operation) || 0) + 1);
  }

  private async attemptRecovery(
    error: ServiceNowError,
    context: ErrorContext
  ): Promise<{ success: boolean; result?: any; strategy?: string }> {
    for (const strategy of this.recoveryStrategies) {
      if (strategy.condition(error, context)) {
        try {
          logger.debug(`Attempting recovery with strategy: ${strategy.name}`, 'ErrorHandler', {
            error: error.message,
            context
          });
          
          const result = await strategy.action(error, context);
          
          logger.info(`Recovery successful with strategy: ${strategy.name}`, 'ErrorHandler', {
            error: error.message,
            context
          });
          
          return {
            success: true,
            result,
            strategy: strategy.name
          };
        } catch (recoveryError) {
          logger.warn(`Recovery strategy failed: ${strategy.name}`, 'ErrorHandler', {
            originalError: error.message,
            recoveryError: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
            context
          });
        }
      }
    }
    
    return { success: false };
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: ErrorContext
  ): Promise<{ success: boolean; result?: T }> {
    let attempt = context.attemptNumber || 0;
    
    while (attempt < this.retryConfig.maxRetries) {
      attempt++;
      
      const delay = this.calculateDelay(attempt);
      
      logger.debug(`Retrying operation (${attempt}/${this.retryConfig.maxRetries}) after ${delay}ms`, 'ErrorHandler', {
        operation: context.operation,
        attempt,
        delay
      });
      
      await this.sleep(delay);
      
      try {
        const result = await operation();
        
        logger.info(`Operation successful after retry ${attempt}`, 'ErrorHandler', {
          operation: context.operation,
          totalAttempts: attempt + 1
        });
        
        return { success: true, result };
      } catch (retryError) {
        logger.warn(`Retry ${attempt} failed`, 'ErrorHandler', {
          operation: context.operation,
          error: retryError instanceof Error ? retryError.message : String(retryError)
        });
        
        // Check if this new error is still retryable
        if (!this.isRetryable(retryError instanceof Error ? retryError : new Error(String(retryError)))) {
          logger.info('Error no longer retryable, stopping retry attempts', 'ErrorHandler', {
            operation: context.operation,
            attempt
          });
          break;
        }
      }
    }
    
    return { success: false };
  }

  private isRetryable(error: Error): boolean {
    const message = error.message;
    const statusCode = (error as any).statusCode || (error as any).status;
    
    // Check non-retryable patterns first
    for (const pattern of this.retryConfig.nonRetryableErrors) {
      if (pattern instanceof RegExp) {
        if (pattern.test(message)) return false;
      } else {
        if (message.includes(pattern)) return false;
      }
    }
    
    // Check retryable patterns
    for (const pattern of this.retryConfig.retryableErrors) {
      if (pattern instanceof RegExp) {
        if (pattern.test(message)) return true;
      } else {
        if (message.includes(pattern)) return true;
      }
    }
    
    // Default retryable status codes
    if (statusCode) {
      return [408, 429, 500, 502, 503, 504].includes(statusCode);
    }
    
    return false;
  }

  private determineRetryability(statusCode: number, errorCode?: string, message?: string): boolean {
    // Non-retryable status codes
    if ([400, 401, 403, 404, 405, 409, 422].includes(statusCode)) {
      return false;
    }
    
    // Retryable status codes
    if ([408, 429, 500, 502, 503, 504].includes(statusCode)) {
      return true;
    }
    
    // Check message patterns
    if (message) {
      const retryablePatterns = ['timeout', 'connection', 'network', 'temporary'];
      const nonRetryablePatterns = ['unauthorized', 'forbidden', 'not found', 'invalid'];
      
      const lowerMessage = message.toLowerCase();
      
      if (nonRetryablePatterns.some(pattern => lowerMessage.includes(pattern))) {
        return false;
      }
      
      if (retryablePatterns.some(pattern => lowerMessage.includes(pattern))) {
        return true;
      }
    }
    
    return false;
  }

  private calculateDelay(attempt: number): number {
    let delay = this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt - 1);
    delay = Math.min(delay, this.retryConfig.maxDelay);
    
    if (this.retryConfig.jitter) {
      delay += Math.random() * delay * 0.1; // Add up to 10% jitter
    }
    
    return Math.floor(delay);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private setupDefaultRetryConfig(): void {
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      jitter: true,
      retryableErrors: [
        'timeout',
        'connection',
        'network',
        'ECONNRESET',
        'ENOTFOUND',
        'ECONNREFUSED',
        /rate limit/i,
        /too many requests/i
      ],
      nonRetryableErrors: [
        'unauthorized',
        'forbidden',
        'not found',
        'bad request',
        'invalid',
        /authentication/i,
        /permission/i
      ]
    };
  }

  private setupDefaultRecoveryStrategies(): void {
    // Authentication refresh strategy
    this.addRecoveryStrategy({
      name: 'auth_refresh',
      priority: 100,
      description: 'Refresh authentication token and retry',
      condition: (error) => error.statusCode === 401 || error.message.toLowerCase().includes('unauthorized'),
      action: async (error, context) => {
        // This would integrate with the authentication system
        // For now, just log the attempt
        logger.info('Would attempt to refresh authentication', 'ErrorHandler', {
          context
        });
        throw new Error('Auth refresh not implemented');
      }
    });

    // Rate limit backoff strategy
    this.addRecoveryStrategy({
      name: 'rate_limit_backoff',
      priority: 90,
      description: 'Wait for rate limit reset and retry',
      condition: (error) => error.statusCode === 429,
      action: async (error, context) => {
        const retryAfter = (error.details?.retryAfter || 60) * 1000;
        logger.info(`Rate limited, waiting ${retryAfter}ms before retry`, 'ErrorHandler', {
          context,
          retryAfter
        });
        await this.sleep(retryAfter);
        throw new Error('Rate limit recovery - retry needed');
      }
    });

    // Connection reset strategy
    this.addRecoveryStrategy({
      name: 'connection_reset',
      priority: 80,
      description: 'Handle connection resets with immediate retry',
      condition: (error) => error.message.includes('ECONNRESET') || error.message.includes('connection'),
      action: async (error, context) => {
        logger.info('Connection reset detected, immediate retry', 'ErrorHandler', {
          context
        });
        await this.sleep(1000); // Brief delay
        throw new Error('Connection reset - retry needed');
      }
    });
  }
}

// Global error handler instance
export const errorHandler = ErrorHandler.getInstance();
export default errorHandler;