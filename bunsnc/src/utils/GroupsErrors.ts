/**
 * Custom Error Classes for Groups API - Following BunSNC Best Practices
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export class GroupsAPIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'GROUPS_ERROR'
  ) {
    super(message);
    this.name = 'GroupsAPIError';
  }
}

export class GroupValidationError extends GroupsAPIError {
  constructor(message: string, field?: string) {
    super(message, 400, 'GROUPS_VALIDATION_ERROR');
    this.name = 'GroupValidationError';
    if (field) {
      this.message = `${field}: ${message}`;
    }
  }
}

export class GroupNotFoundError extends GroupsAPIError {
  constructor(identifier: string | number, type: 'id' | 'name' = 'id') {
    super(`Group not found with ${type}: ${identifier}`, 404, 'GROUP_NOT_FOUND');
    this.name = 'GroupNotFoundError';
  }
}

export class GroupServiceInitializationError extends GroupsAPIError {
  constructor(message: string, originalError?: Error) {
    super(`GroupService initialization failed: ${message}`, 503, 'GROUP_SERVICE_INIT_ERROR');
    this.name = 'GroupServiceInitializationError';
    if (originalError) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }
}

export class MongoDBConnectionError extends GroupsAPIError {
  constructor(message: string) {
    super(`MongoDB connection error: ${message}`, 503, 'MONGODB_CONNECTION_ERROR');
    this.name = 'MongoDBConnectionError';
  }
}

export class ElysiaFrameworkError extends GroupsAPIError {
  constructor(message: string, originalError?: Error) {
    super(`Elysia framework error: ${message}`, 500, 'ELYSIA_FRAMEWORK_ERROR');
    this.name = 'ElysiaFrameworkError';
    
    // Special handling for _r_r is not defined error
    if (originalError?.message?.includes('_r_r is not defined')) {
      this.code = 'ELYSIA_RRR_BUG';
      this.message = 'Elysia framework bug detected (_r_r is not defined). Using error handler workaround.';
    }
  }
}