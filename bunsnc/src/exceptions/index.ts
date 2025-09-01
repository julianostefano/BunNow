/**
 * ServiceNow Specific Exceptions - Full PySNC Compatibility
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

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
 * Utility function to handle and throw appropriate exceptions
 */
export function handleServiceNowError(error: any, operation?: string): never {
  // Handle null/undefined errors
  if (error === null || error === undefined) {
    throw new ServiceNowException(`${operation || 'Operation'} failed`);
  }
  
  // Handle string errors
  if (typeof error === 'string') {
    throw new ServiceNowException(error);
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
 * Decorator for methods that should handle ServiceNow errors
 */
export function handleErrors(operation?: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        handleServiceNowError(error, operation || propertyKey);
      }
    };
    
    return descriptor;
  };
}

// All exceptions are already exported above