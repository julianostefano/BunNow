/**
 * Error Handler Utility - Centralized error handling
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface ErrorContext {
  operation: string;
  endpoint?: string;
  params?: any;
  timestamp?: string;
}

export class ServiceNowError extends Error {
  statusCode: number;
  context: ErrorContext;
  response?: Response;

  constructor(
    message: string,
    statusCode: number = 500,
    context: ErrorContext,
    response?: Response,
  ) {
    super(message);
    this.name = "ServiceNowError";
    this.statusCode = statusCode;
    this.context = context;
    this.response = response;
  }
}

export class ErrorHandler {
  /**
   * Log error with context information
   * @param operation - Operation that failed
   * @param error - Error object
   * @param context - Additional context information
   */
  static logError(operation: string, error: any, context?: any): void {
    const logData = {
      operation,
      error: error.message || error,
      timestamp: new Date().toISOString(),
      context,
    };

    console.error(`Operation failed: ${operation}`, logData);
  }

  /**
   * Determine user-friendly error message
   * @param error - Error object
   * @returns User-friendly error message
   */
  static getUserMessage(error: any): string {
    if (error.message?.includes("not found")) {
      return "Recurso não encontrado";
    }

    if (error.message?.includes("timeout")) {
      return "Tempo limite excedido. Tente novamente.";
    }

    if (error.message?.includes("unauthorized")) {
      return "Acesso não autorizado";
    }

    return "Erro interno do servidor";
  }

  /**
   * Check if error is retryable
   * @param error - Error object
   * @returns True if error is retryable
   */
  static isRetryable(error: any): boolean {
    const retryableErrors = ["timeout", "network", "connection"];
    const message = error.message?.toLowerCase() || "";

    return retryableErrors.some((keyword) => message.includes(keyword));
  }

  /**
   * Create standardized error response
   * @param error - Error object
   * @param operation - Operation that failed
   * @returns Standardized error object
   */
  static createErrorResponse(error: any, operation: string) {
    return {
      success: false,
      error: {
        message: this.getUserMessage(error),
        operation,
        timestamp: new Date().toISOString(),
        retryable: this.isRetryable(error),
      },
    };
  }

  /**
   * Convert unknown error to Error instance - TypeScript best practice
   * @param error - Unknown error
   * @returns Error instance
   */
  static toError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }

  /**
   * Extract message from unknown error safely
   * @param error - Unknown error
   * @returns Error message string
   */
  static getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  /**
   * Type-safe error logging for unknown errors
   * @param operation - Operation that failed
   * @param error - Unknown error
   * @param context - Additional context
   */
  static logUnknownError(
    operation: string,
    error: unknown,
    context?: any,
  ): void {
    const errorMessage = this.getErrorMessage(error);
    const errorObj = this.toError(error);

    const logData = {
      operation,
      message: errorMessage,
      stack: errorObj.stack,
      timestamp: new Date().toISOString(),
      context,
    };

    console.error(`❌ ${operation}:`, logData);
  }
}
