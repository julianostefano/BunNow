/**
 * ServiceNow Exceptions Unit Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect } from "bun:test";
import {
  ServiceNowException,
  AuthenticationException,
  InsertException,
  UpdateException,
  DeleteException,
  NotFoundException,
  RequestException,
  RoleException,
  EvaluationException,
  AclQueryException,
  InstanceException,
  UploadException,
  NoRecordException,
  createExceptionFromResponse,
  handleServiceNowError,
  handleErrors,
} from "../../exceptions";

describe("ServiceNow Exceptions", () => {
  describe("Base ServiceNowException", () => {
    test("should create basic exception", () => {
      const exception = new ServiceNowException("Test error");

      expect(exception.message).toBe("Test error");
      expect(exception.name).toBe("ServiceNowException");
      expect(exception).toBeInstanceOf(Error);
      expect(exception).toBeInstanceOf(ServiceNowException);
    });

    test("should create exception with status code and response", () => {
      const response = { error: "details" };
      const exception = new ServiceNowException("Test error", 500, response);

      expect(exception.message).toBe("Test error");
      expect(exception.statusCode).toBe(500);
      expect(exception.response).toEqual(response);
    });
  });

  describe("Specific Exceptions", () => {
    test("should create AuthenticationException", () => {
      const exception = new AuthenticationException();
      expect(exception.message).toBe("Authentication failed");
      expect(exception.name).toBe("AuthenticationException");
      expect(exception).toBeInstanceOf(ServiceNowException);
    });

    test("should create InsertException", () => {
      const exception = new InsertException("Insert failed");
      expect(exception.message).toBe("Insert failed");
      expect(exception.name).toBe("InsertException");
    });

    test("should create UpdateException", () => {
      const exception = new UpdateException("Update failed");
      expect(exception.message).toBe("Update failed");
      expect(exception.name).toBe("UpdateException");
    });

    test("should create DeleteException", () => {
      const exception = new DeleteException("Delete failed");
      expect(exception.message).toBe("Delete failed");
      expect(exception.name).toBe("DeleteException");
    });

    test("should create NotFoundException with default 404", () => {
      const exception = new NotFoundException();
      expect(exception.message).toBe("Record not found");
      expect(exception.statusCode).toBe(404);
      expect(exception.name).toBe("NotFoundException");
    });

    test("should create RequestException", () => {
      const exception = new RequestException("Request failed");
      expect(exception.message).toBe("Request failed");
      expect(exception.name).toBe("RequestException");
    });

    test("should create RoleException with default 403", () => {
      const exception = new RoleException();
      expect(exception.message).toBe("Insufficient permissions");
      expect(exception.statusCode).toBe(403);
      expect(exception.name).toBe("RoleException");
    });

    test("should create EvaluationException", () => {
      const exception = new EvaluationException("Evaluation failed");
      expect(exception.message).toBe("Evaluation failed");
      expect(exception.name).toBe("EvaluationException");
    });

    test("should create AclQueryException", () => {
      const exception = new AclQueryException("ACL query failed");
      expect(exception.message).toBe("ACL query failed");
      expect(exception.name).toBe("AclQueryException");
    });

    test("should create InstanceException", () => {
      const exception = new InstanceException("Instance error");
      expect(exception.message).toBe("Instance error");
      expect(exception.name).toBe("InstanceException");
    });

    test("should create UploadException", () => {
      const exception = new UploadException("Upload failed");
      expect(exception.message).toBe("Upload failed");
      expect(exception.name).toBe("UploadException");
    });

    test("should create NoRecordException", () => {
      const exception = new NoRecordException("No record");
      expect(exception.message).toBe("No record");
      expect(exception.name).toBe("NoRecordException");
    });
  });

  describe("Exception Factory", () => {
    test("should create AuthenticationException for 401", () => {
      const exception = createExceptionFromResponse(401, "Unauthorized");
      expect(exception).toBeInstanceOf(AuthenticationException);
      expect(exception.statusCode).toBe(401);
    });

    test("should create RoleException for 403", () => {
      const exception = createExceptionFromResponse(403, "Forbidden");
      expect(exception).toBeInstanceOf(RoleException);
      expect(exception.statusCode).toBe(403);
    });

    test("should create NotFoundException for 404", () => {
      const exception = createExceptionFromResponse(404, "Not Found");
      expect(exception).toBeInstanceOf(NotFoundException);
      expect(exception.statusCode).toBe(404);
    });

    test("should create InsertException for 400 with insert keyword", () => {
      const exception = createExceptionFromResponse(
        400,
        "Insert validation failed",
      );
      expect(exception).toBeInstanceOf(InsertException);
      expect(exception.statusCode).toBe(400);
    });

    test("should create UpdateException for 422 with update keyword", () => {
      const exception = createExceptionFromResponse(
        422,
        "Update validation failed",
      );
      expect(exception).toBeInstanceOf(UpdateException);
      expect(exception.statusCode).toBe(422);
    });

    test("should create DeleteException for 400 with delete keyword", () => {
      const exception = createExceptionFromResponse(
        400,
        "Delete operation failed",
      );
      expect(exception).toBeInstanceOf(DeleteException);
      expect(exception.statusCode).toBe(400);
    });

    test("should create EvaluationException for 500", () => {
      const exception = createExceptionFromResponse(
        500,
        "Internal Server Error",
      );
      expect(exception).toBeInstanceOf(EvaluationException);
      expect(exception.statusCode).toBe(500);
    });

    test("should create RequestException for unknown status codes", () => {
      const exception = createExceptionFromResponse(418, "I am a teapot");
      expect(exception).toBeInstanceOf(RequestException);
      expect(exception.statusCode).toBe(418);
    });
  });

  describe("Error Handler", () => {
    test("should rethrow ServiceNowException as-is", () => {
      const originalException = new AuthenticationException("Auth failed");

      expect(() => handleServiceNowError(originalException)).toThrow(
        AuthenticationException,
      );
      expect(() => handleServiceNowError(originalException)).toThrow(
        "Auth failed",
      );
    });

    test("should handle HTTP errors", () => {
      const httpError = {
        status: 404,
        message: "Resource not found",
      };

      expect(() => handleServiceNowError(httpError)).toThrow(NotFoundException);
      expect(() => handleServiceNowError(httpError)).toThrow(
        "Resource not found",
      );
    });

    test("should handle network errors", () => {
      const networkError = {
        code: "ENOTFOUND",
        message: "getaddrinfo ENOTFOUND",
      };

      expect(() => handleServiceNowError(networkError)).toThrow(
        InstanceException,
      );
      expect(() => handleServiceNowError(networkError)).toThrow(
        "Cannot connect to ServiceNow instance",
      );
    });

    test("should handle connection refused errors", () => {
      const connectionError = {
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED",
      };

      expect(() => handleServiceNowError(connectionError)).toThrow(
        InstanceException,
      );
    });

    test("should handle timeout errors", () => {
      const timeoutError = {
        code: "ETIMEDOUT",
        message: "request timeout",
      };

      expect(() => handleServiceNowError(timeoutError)).toThrow(
        RequestException,
      );
      expect(() => handleServiceNowError(timeoutError)).toThrow(
        "Request timeout",
      );
    });

    test("should handle timeout flag", () => {
      const timeoutError = {
        timeout: true,
        message: "operation timed out",
      };

      expect(() => handleServiceNowError(timeoutError)).toThrow(
        RequestException,
      );
    });

    test("should handle generic errors", () => {
      const genericError = {
        message: "Something went wrong",
      };

      expect(() => handleServiceNowError(genericError)).toThrow(
        ServiceNowException,
      );
      expect(() => handleServiceNowError(genericError)).toThrow(
        "Something went wrong",
      );
    });

    test("should include operation context", () => {
      const error = { message: "Failed" };

      expect(() => handleServiceNowError(error, "create record")).toThrow(
        "Failed",
      );
    });

    test("should provide default operation name", () => {
      const error = {};

      expect(() => handleServiceNowError(error)).toThrow("Operation failed");
    });
  });

  describe("Error Decorator", () => {
    test("should create decorator function", () => {
      const decorator = handleErrors("test operation");
      expect(typeof decorator).toBe("function");
    });

    test("should handle async method errors", async () => {
      class TestClass {
        @handleErrors("test method")
        async failingMethod() {
          throw new Error("Method failed");
        }
      }

      const instance = new TestClass();
      await expect(instance.failingMethod()).rejects.toThrow(
        ServiceNowException,
      );
    });

    test("should use property key as operation name", async () => {
      class TestClass {
        @handleErrors()
        async customMethod() {
          const error = { status: 404 };
          throw error;
        }
      }

      const instance = new TestClass();
      await expect(instance.customMethod()).rejects.toThrow(NotFoundException);
    });

    test("should preserve return value for successful calls", async () => {
      class TestClass {
        @handleErrors("test method")
        async successMethod() {
          return "success";
        }
      }

      const instance = new TestClass();
      const result = await instance.successMethod();
      expect(result).toBe("success");
    });
  });

  describe("Edge Cases", () => {
    test("should handle null/undefined errors", () => {
      expect(() => handleServiceNowError(null)).toThrow(ServiceNowException);
      expect(() => handleServiceNowError(undefined)).toThrow(
        ServiceNowException,
      );
    });

    test("should handle errors without messages", () => {
      expect(() => handleServiceNowError({})).toThrow("Operation failed");
    });

    test("should handle string errors", () => {
      expect(() => handleServiceNowError("String error")).toThrow(
        "String error",
      );
    });

    test("should handle errors with both status and statusCode", () => {
      const error = {
        status: 401,
        statusCode: 400,
        message: "Conflict",
      };

      // Should use status first
      expect(() => handleServiceNowError(error)).toThrow(
        AuthenticationException,
      );
    });
  });
});
