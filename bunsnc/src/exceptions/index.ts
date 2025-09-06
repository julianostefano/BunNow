/**
 * ServiceNow Specific Exceptions - Full PySNC Compatibility
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { ServiceNowError, type ErrorContext } from '../utils/ErrorHandler';

/**
 * Base class for all ServiceNow exceptions
 */
export class ServiceNowException extends Error {
  constructor(message: string, public statusCode?: number, public response?: any) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Thrown when authentication fails
 */
export class AuthenticationException extends ServiceNowException {
  constructor(message: string = 'Authentication failed', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when insert operations fail
 */
export class InsertException extends ServiceNowException {
  constructor(message: string = 'Insert operation failed', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when update operations fail
 */
export class UpdateException extends ServiceNowException {
  constructor(message: string = 'Update operation failed', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when delete operations fail
 */
export class DeleteException extends ServiceNowException {
  constructor(message: string = 'Delete operation failed', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when a record is not found
 */
export class NotFoundException extends ServiceNowException {
  constructor(message: string = 'Record not found', statusCode: number = 404, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when HTTP requests fail
 */
export class RequestException extends ServiceNowException {
  constructor(message: string = 'Request failed', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when user lacks required roles/permissions
 */
export class RoleException extends ServiceNowException {
  constructor(message: string = 'Insufficient permissions', statusCode: number = 403, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when server-side evaluation/script execution fails
 */
export class EvaluationException extends ServiceNowException {
  constructor(message: string = 'Server evaluation failed', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when ACL query operations fail
 */
export class AclQueryException extends ServiceNowException {
  constructor(message: string = 'ACL query failed', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when instance-related operations fail
 */
export class InstanceException extends ServiceNowException {
  constructor(message: string = 'Instance operation failed', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when file upload operations fail
 */
export class UploadException extends ServiceNowException {
  constructor(message: string = 'File upload failed', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Thrown when no record is available for operation
 */
export class NoRecordException extends ServiceNowException {
  constructor(message: string = 'No record available', statusCode?: number, response?: any) {
    super(message, statusCode, response);
  }
}

/**
 * Factory function to create appropriate exception based on HTTP status code
 */
export function createExceptionFromResponse(statusCode: number, message: string, response?: any): ServiceNowException {
  switch (statusCode) {
    case 401:
      return new AuthenticationException(message, statusCode, response);
    case 403:
      return new RoleException(message, statusCode, response);
    case 404:
      return new NotFoundException(message, statusCode, response);
    case 400:
    case 422:
      // Bad request or validation error
      if (message.toLowerCase().includes('insert')) {
        return new InsertException(message, statusCode, response);
      }
      if (message.toLowerCase().includes('update')) {
        return new UpdateException(message, statusCode, response);
      }
      if (message.toLowerCase().includes('delete')) {
        return new DeleteException(message, statusCode, response);
      }
      return new RequestException(message, statusCode, response);
    case 500:
    case 502:
    case 503:
    case 504:
      return new EvaluationException(message, statusCode, response);
    default:
      return new RequestException(message, statusCode, response);
  }
}

/**
 * Utility function to handle and throw appropriate exceptions with advanced error handling
 */
export function handleServiceNowError(error: any, operation?: string, context?: Partial<ErrorContext>): never {
  // Handle null/undefined errors
  if (error === null || error === undefined) {
    throw new ServiceNowException(`${operation || 'Operation'} failed`);
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    throw new ServiceNowException(error);
  }
  
  // Handle ServiceNowError from ErrorHandler
  if (error instanceof ServiceNowError) {
    // Convert to legacy exception for backwards compatibility
    throw createExceptionFromResponse(error.statusCode, error.message, error.details);
  }
  
  // Handle already ServiceNow exceptions
  if (error instanceof ServiceNowException) {
    throw error;
  }
  
  // Handle fetch/HTTP errors
  if (error && (error.status || error.statusCode)) {
    const statusCode = error.status || error.statusCode;
    const message = error.message || error.statusText || `${operation || 'Operation'} failed`;
    throw createExceptionFromResponse(statusCode, message, error);
  }
  
  // Handle network errors
  if (error && (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED')) {
    throw new InstanceException(`Cannot connect to ServiceNow instance: ${error.message || 'Connection failed'}`);
  }
  
  // Handle timeout errors
  if (error && (error.code === 'ETIMEDOUT' || error.timeout)) {
    throw new RequestException(`Request timeout: ${error.message || 'Timeout occurred'}`);
  }
  
  // Generic error
  const message = (error && error.message) || `${operation || 'Operation'} failed`;
  throw new ServiceNowException(message);
}

/**
 * Enhanced error handler that uses the advanced ErrorHandler for retry and recovery
 */
export async function handleServiceNowErrorWithRecovery<T>(
  error: any, 
  operation: string,
  retryOperation: () => Promise<T>,
  context?: Partial<ErrorContext>
): Promise<T> {
  const fullContext: ErrorContext = {
    operation,
    timestamp: Date.now(),
    ...context
  };
  
  try {
    return await errorHandler.handleError(error, fullContext, retryOperation);
  } catch (finalError) {
    // If ErrorHandler couldn't recover, fall back to legacy exception handling
    handleServiceNowError(finalError, operation, context);
  }
}

/**
 * Create ServiceNowError from response data
 */
export function createServiceNowError(
  statusCode: number,
  responseText: string,
  context: ErrorContext,
  response?: Response
): ServiceNowError {
  return errorHandler.createError(statusCode, responseText, context, response);
}

/**
 * Decorator for methods that should handle ServiceNow errors with retry and recovery
 */
export function handleErrors(operation?: string, enableRecovery: boolean = false) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const operationName = operation || propertyKey;
      const context: ErrorContext = {
        operation: operationName,
        timestamp: Date.now(),
        clientId: (this as any).clientId || (this as any).apiId
      };
      
      if (enableRecovery) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          // Use advanced error handling with retry and recovery
          return await handleServiceNowErrorWithRecovery(
            error,
            operationName,
            () => originalMethod.apply(this, args),
            context
          );
        }
      } else {
        // Use simple error handling for backwards compatibility
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          handleServiceNowError(error, operationName, context);
        }
      }
    };
    
    return descriptor;
  };
}

/**
 * Advanced decorator with full error handling capabilities
 */
export function handleErrorsWithRecovery(operation?: string, retryConfig?: any) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const operationName = operation || propertyKey;
      const context: ErrorContext = {
        operation: operationName,
        timestamp: Date.now(),
        clientId: (this as any).clientId || (this as any).apiId,
        table: args[0] // Assume first argument is table name
      };
      
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        return await handleServiceNowErrorWithRecovery(
          error,
          operationName,
          () => originalMethod.apply(this, args),
          context
        );
      }
    };
    
    return descriptor;
  };
}

// Export ErrorHandler types and instances for advanced usage
export { ServiceNowError, type ErrorContext } from '../utils/ErrorHandler';
import { errorHandler } from '../utils/ErrorHandler';
export { errorHandler };
export { performanceMonitor } from '../utils/PerformanceMonitor';
export { transactionManager, Transaction } from '../utils/TransactionManager';

// All exceptions are already exported above