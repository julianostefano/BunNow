/**
 * ServiceNowClient Unit Tests - Phase 3
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach, mock, afterEach } from "bun:test";
import { ServiceNowClient } from "../../client/ServiceNowClient";
import { GlideRecord } from "../../record/GlideRecord";
import { TableAPI } from "../../api/TableAPI";
import { AttachmentAPI } from "../../api/AttachmentAPI";
import { BatchAPI } from "../../api/BatchAPI";

// Mock global fetch
const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ result: [] }),
    text: () => Promise.resolve(""),
    blob: () => Promise.resolve(new Blob()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    headers: new Map([["X-Total-Count", "0"]]),
  } as any),
);

global.fetch = mockFetch;

describe("ServiceNowClient", () => {
  let client: ServiceNowClient;
  const instanceUrl = "https://dev12345.service-now.com";
  const authToken = "Bearer test-token-123";

  beforeEach(() => {
    client = new ServiceNowClient(instanceUrl, authToken);
    mockFetch.mockClear();
  });

  afterEach(() => {
    mockFetch.mockClear();
  });

  describe("Construction", () => {
    test("should create client with instance URL and auth token", () => {
      expect(client.instance).toBe(instanceUrl);
      expect(client.auth).toBe(authToken);
    });

    test("should normalize instance URL by removing trailing slash", () => {
      const clientWithSlash = new ServiceNowClient(
        "https://dev12345.service-now.com/",
        authToken,
      );
      expect(clientWithSlash.instance).toBe("https://dev12345.service-now.com");
    });

    test("should initialize all API instances", () => {
      expect(client.table).toBeInstanceOf(TableAPI);
      expect(client.attachment).toBeInstanceOf(AttachmentAPI);
      expect(client.batch).toBeInstanceOf(BatchAPI);
      expect(client.serviceNow).toBeDefined();
    });
  });

  describe("Factory Methods", () => {
    test("should create GlideRecord instance", () => {
      const gr = client.GlideRecord("incident");
      expect(gr).toBeInstanceOf(GlideRecord);
      expect(gr.table).toBe("incident");
      expect(gr.batchSize).toBe(500);
    });

    test("should create GlideRecord with custom parameters", () => {
      const gr = client.GlideRecord("task", 100, false);
      expect(gr.table).toBe("task");
      expect(gr.batchSize).toBe(100);
    });

    test("should create batch instance with custom options", () => {
      const batch = client.createBatch({
        maxRetries: 5,
        retryDelay: 2000,
        concurrencyLimit: 5,
      });
      expect(batch).toBeInstanceOf(BatchAPI);
    });
  });

  describe("Static Factory Methods", () => {
    test("should create client with static create method", () => {
      const staticClient = ServiceNowClient.create(instanceUrl, authToken);
      expect(staticClient).toBeInstanceOf(ServiceNowClient);
      expect(staticClient.instance).toBe(instanceUrl);
    });

    test("should create client with basic auth", () => {
      const basicAuthClient = ServiceNowClient.createWithBasicAuth(
        instanceUrl,
        "username",
        "password",
      );
      expect(basicAuthClient).toBeInstanceOf(ServiceNowClient);
      expect(basicAuthClient.auth).toMatch(/^Basic /);
    });

    test("should create client with OAuth", () => {
      const oauthClient = ServiceNowClient.createWithOAuth(
        instanceUrl,
        "access-token-123",
      );
      expect(oauthClient).toBeInstanceOf(ServiceNowClient);
      expect(oauthClient.auth).toBe("Bearer access-token-123");
    });

    test("should create client from environment variables", () => {
      // Set up environment variables
      const originalInstance = process.env.SERVICENOW_INSTANCE;
      const originalToken = process.env.SERVICENOW_TOKEN;

      process.env.SERVICENOW_INSTANCE = instanceUrl;
      process.env.SERVICENOW_TOKEN = authToken;

      const envClient = ServiceNowClient.fromEnv();
      expect(envClient.instance).toBe(instanceUrl);
      expect(envClient.auth).toBe(authToken);

      // Restore original environment variables
      if (originalInstance) {
        process.env.SERVICENOW_INSTANCE = originalInstance;
      } else {
        delete process.env.SERVICENOW_INSTANCE;
      }
      if (originalToken) {
        process.env.SERVICENOW_TOKEN = originalToken;
      } else {
        delete process.env.SERVICENOW_TOKEN;
      }
    });

    test("should throw error when environment variables are missing", () => {
      const originalInstance = process.env.SERVICENOW_INSTANCE;
      const originalToken = process.env.SERVICENOW_TOKEN;

      delete process.env.SERVICENOW_INSTANCE;
      delete process.env.SERVICENOW_TOKEN;

      expect(() => ServiceNowClient.fromEnv()).toThrow(
        "SERVICENOW_INSTANCE environment variable is required",
      );

      process.env.SERVICENOW_INSTANCE = instanceUrl;
      expect(() => ServiceNowClient.fromEnv()).toThrow(
        "SERVICENOW_TOKEN environment variable is required",
      );

      // Restore
      if (originalInstance) process.env.SERVICENOW_INSTANCE = originalInstance;
      if (originalToken) process.env.SERVICENOW_TOKEN = originalToken;
    });
  });

  describe("CRUD Operations", () => {
    test("should query records", async () => {
      const mockData = [{ sys_id: "test1", number: "INC001" }];
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: mockData }),
      } as any);

      const results = await client.query({
        table: "incident",
        query: "state=1",
        limit: 10,
      });

      expect(results).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should create record", async () => {
      const newRecord = {
        sys_id: "new123",
        short_description: "Test incident",
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: newRecord }),
      } as any);

      const result = await client.create("incident", {
        short_description: "Test incident",
      });

      expect(result).toEqual(newRecord);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should read single record", async () => {
      const record = { sys_id: "test123", number: "INC001" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: record }),
      } as any);

      const result = await client.read("incident", "test123");

      expect(result).toEqual(record);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should update record", async () => {
      const updatedRecord = { sys_id: "test123", state: "2" };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: updatedRecord }),
      } as any);

      const result = await client.update("incident", "test123", { state: "2" });

      expect(result).toEqual(updatedRecord);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should delete record", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as any);

      const result = await client.delete("incident", "test123");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Attachment Operations", () => {
    test("should upload attachment", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([
          ["Location", "/api/now/attachment/attachment123/file"],
        ]),
      } as any);

      const file = new Blob(["test content"], { type: "text/plain" });
      const result = await client.uploadAttachment(
        "test.txt",
        "incident",
        "inc123",
        file,
      );

      expect(result).toBe("attachment123");
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should download attachment", async () => {
      const mockResponse = {
        ok: true,
        blob: () => Promise.resolve(new Blob(["file content"])),
      } as any;

      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await client.downloadAttachment("attachment123");

      expect(result).toBe(mockResponse);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should list attachments", async () => {
      const attachments = [
        { sys_id: "att1", file_name: "file1.txt" },
        { sys_id: "att2", file_name: "file2.pdf" },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ result: attachments }),
      } as any);

      const result = await client.listAttachments("incident", "inc123");

      expect(result).toEqual(attachments);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test("should delete attachment", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
      } as any);

      const result = await client.deleteAttachment("attachment123");

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Utility Methods", () => {
    test("should test connection successfully", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      } as any);

      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/now/table/sys_properties"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: authToken,
          }),
        }),
      );
    });

    test("should handle connection test failure", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as any);

      const result = await client.testConnection();

      expect(result).toBe(false);
    });

    test("should get instance stats", async () => {
      const statsData = {
        status: "connected",
        instance: instanceUrl,
        version: "San Diego",
      };

      // Mock the table.getStats method
      client.table.getStats = mock(() => Promise.resolve(statsData));

      const result = await client.getStats();

      expect(result).toEqual(statsData);
    });

    test("should get record count", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Map([["X-Total-Count", "150"]]),
      } as any);

      const result = await client.getCount("incident", "state=1");

      expect(result).toBe(150);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("Error Handling", () => {
    test("should handle query errors", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () => Promise.resolve("Bad Request"),
      } as any);

      await expect(
        client.query({
          table: "incident",
          query: "invalid=query",
        }),
      ).rejects.toThrow();
    });

    test("should handle network errors", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      await expect(client.read("incident", "test123")).rejects.toThrow();
    });
  });

  describe("Batch Operations", () => {
    test("should execute sequence of operations", async () => {
      const operations = [
        { method: "GET" as const, table: "incident", sysId: "inc1" },
        {
          method: "POST" as const,
          table: "incident",
          data: { short_description: "Test" },
        },
      ];

      // Mock responses for batch operations
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ result: { sys_id: "inc1", state: "1" } }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              result: { sys_id: "inc2", short_description: "Test" },
            }),
        } as any);

      const results = await client.executeSequence(operations);

      expect(results).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
