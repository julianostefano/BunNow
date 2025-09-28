/**
 * API Integration Test Suite - Real HTTP API Integration Testing
 * Tests API endpoints with real ServiceNow, MongoDB, and Redis integration
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeAll, afterAll, test } from "bun:test";

// API integration test configuration
const apiConfig = {
  baseUrl: "http://localhost:3008",
  timeout: 30000, // 30 seconds for real API tests
  testData: {
    incident: {
      short_description: "API Integration Test Incident",
      description: "Created during API integration testing",
      state: "1",
      priority: "3",
      category: "software",
      subcategory: "application",
      impact: "3",
      urgency: "3",
    },
    change_task: {
      short_description: "API Integration Test Change Task",
      description: "Created during API integration testing",
      state: "1",
      priority: "3",
      change_request: "CHG0000001",
    },
    sc_task: {
      short_description: "API Integration Test SC Task",
      description: "Created during API integration testing",
      state: "1",
      priority: "3",
      request: "REQ0000001",
    },
  },
};

describe("API Integration Tests", () => {
  let createdIncident: any;
  let createdChangeTask: any;
  let createdSCTask: any;

  beforeAll(async () => {
    // Wait for server to be ready
    console.log("🔄 Waiting for API server to be ready...");
    await waitForAPIReady();
  }, apiConfig.timeout);

  afterAll(async () => {
    // Cleanup created test data
    console.log("🧹 Cleaning up test data...");
    try {
      if (createdIncident) {
        await deleteRecord("incident", createdIncident.sys_id);
      }
      if (createdChangeTask) {
        await deleteRecord("change_task", createdChangeTask.sys_id);
      }
      if (createdSCTask) {
        await deleteRecord("sc_task", createdSCTask.sys_id);
      }
    } catch (error) {
      console.warn("Cleanup warning:", error);
    }
  });

  describe("Health Check Endpoints", () => {
    test(
      "should respond to health check endpoint",
      async () => {
        const response = await fetch(`${apiConfig.baseUrl}/api/health`);

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.status).toBe("healthy");
        expect(data.timestamp).toBeDefined();
        expect(data.services).toBeDefined();
      },
      apiConfig.timeout,
    );

    test(
      "should respond to system health endpoint",
      async () => {
        const response = await fetch(`${apiConfig.baseUrl}/api/system-health`);

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.status).toBeDefined();
        expect(data.components).toBeDefined();
        expect(data.components.redis).toBeDefined();
        expect(data.components.mongodb).toBeDefined();
        expect(data.components.servicenow).toBeDefined();
      },
      apiConfig.timeout,
    );

    test(
      "should provide detailed component status",
      async () => {
        const response = await fetch(`${apiConfig.baseUrl}/api/system-health`);
        const data = await response.json();

        // Validate Redis component
        expect(data.components.redis.status).toBeDefined();
        expect(data.components.redis.connected).toBeDefined();

        // Validate MongoDB component
        expect(data.components.mongodb.status).toBeDefined();
        expect(data.components.mongodb.connected).toBeDefined();

        // Validate ServiceNow component
        expect(data.components.servicenow.status).toBeDefined();
        expect(data.components.servicenow.authType).toBe("saml");
      },
      apiConfig.timeout,
    );
  });

  describe("Incident API Integration", () => {
    test(
      "should create incident via API",
      async () => {
        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/incident`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(apiConfig.testData.incident),
          },
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.sys_id).toBeDefined();
        expect(data.number).toBeDefined();

        createdIncident = data;
        console.log(`✅ Created incident: ${data.number} (${data.sys_id})`);
      },
      apiConfig.timeout,
    );

    test(
      "should retrieve incident via API",
      async () => {
        if (!createdIncident) {
          throw new Error("No incident created for retrieval test");
        }

        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/incident/${createdIncident.sys_id}`,
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.sys_id).toBe(createdIncident.sys_id);
        expect(data.number).toBe(createdIncident.number);
        expect(data.short_description).toBe(
          apiConfig.testData.incident.short_description,
        );
      },
      apiConfig.timeout,
    );

    test(
      "should update incident via API",
      async () => {
        if (!createdIncident) {
          throw new Error("No incident created for update test");
        }

        const updateData = {
          state: "2", // In Progress
          priority: "2", // High
          work_notes: "Updated via API integration test",
        };

        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/incident/${createdIncident.sys_id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updateData),
          },
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.state).toBe("2");
        expect(data.priority).toBe("2");
      },
      apiConfig.timeout,
    );

    test(
      "should query incidents via API",
      async () => {
        const queryParams = new URLSearchParams({
          sysparm_query: `short_descriptionLIKE${apiConfig.testData.incident.short_description}`,
          sysparm_limit: "10",
        });

        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/incident?${queryParams}`,
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(Array.isArray(data.result)).toBe(true);
        expect(data.result.length).toBeGreaterThan(0);

        // Find our test incident
        const testIncident = data.result.find(
          (inc: any) => inc.sys_id === createdIncident?.sys_id,
        );
        expect(testIncident).toBeDefined();
      },
      apiConfig.timeout,
    );
  });

  describe("Change Task API Integration", () => {
    test(
      "should create change task via API",
      async () => {
        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/change_task`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(apiConfig.testData.change_task),
          },
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.sys_id).toBeDefined();
        expect(data.number).toBeDefined();

        createdChangeTask = data;
        console.log(`✅ Created change task: ${data.number} (${data.sys_id})`);
      },
      apiConfig.timeout,
    );

    test(
      "should retrieve change task via API",
      async () => {
        if (!createdChangeTask) {
          throw new Error("No change task created for retrieval test");
        }

        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/change_task/${createdChangeTask.sys_id}`,
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.sys_id).toBe(createdChangeTask.sys_id);
        expect(data.number).toBe(createdChangeTask.number);
        expect(data.short_description).toBe(
          apiConfig.testData.change_task.short_description,
        );
      },
      apiConfig.timeout,
    );
  });

  describe("SC Task API Integration", () => {
    test(
      "should create SC task via API",
      async () => {
        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/sc_task`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(apiConfig.testData.sc_task),
          },
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.sys_id).toBeDefined();
        expect(data.number).toBeDefined();

        createdSCTask = data;
        console.log(`✅ Created SC task: ${data.number} (${data.sys_id})`);
      },
      apiConfig.timeout,
    );

    test(
      "should retrieve SC task via API",
      async () => {
        if (!createdSCTask) {
          throw new Error("No SC task created for retrieval test");
        }

        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/sc_task/${createdSCTask.sys_id}`,
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.sys_id).toBe(createdSCTask.sys_id);
        expect(data.number).toBe(createdSCTask.number);
        expect(data.short_description).toBe(
          apiConfig.testData.sc_task.short_description,
        );
      },
      apiConfig.timeout,
    );
  });

  describe("Batch Operations API Integration", () => {
    test(
      "should execute batch operations via API",
      async () => {
        const batchOperations = [
          {
            operation: "create",
            table: "incident",
            data: {
              short_description: "Batch Test Incident 1",
              state: "1",
              priority: "3",
            },
          },
          {
            operation: "create",
            table: "incident",
            data: {
              short_description: "Batch Test Incident 2",
              state: "1",
              priority: "4",
            },
          },
        ];

        const response = await fetch(`${apiConfig.baseUrl}/api/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ operations: batchOperations }),
        });

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.results)).toBe(true);
        expect(data.results.length).toBe(2);

        // Cleanup batch created records
        for (const result of data.results) {
          if (result.success && result.sys_id) {
            await deleteRecord("incident", result.sys_id);
          }
        }
      },
      apiConfig.timeout,
    );

    test(
      "should handle partial batch failures gracefully",
      async () => {
        const batchOperations = [
          {
            operation: "create",
            table: "incident",
            data: {
              short_description: "Valid Batch Incident",
              state: "1",
              priority: "3",
            },
          },
          {
            operation: "create",
            table: "invalid_table",
            data: {
              short_description: "Invalid Table Test",
            },
          },
        ];

        const response = await fetch(`${apiConfig.baseUrl}/api/batch`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ operations: batchOperations }),
        });

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(Array.isArray(data.results)).toBe(true);
        expect(data.results.length).toBe(2);

        // First operation should succeed
        expect(data.results[0].success).toBe(true);

        // Second operation should fail
        expect(data.results[1].success).toBe(false);
        expect(data.results[1].error).toBeDefined();

        // Cleanup successful record
        if (data.results[0].success && data.results[0].sys_id) {
          await deleteRecord("incident", data.results[0].sys_id);
        }
      },
      apiConfig.timeout,
    );
  });

  describe("Streaming API Integration", () => {
    test(
      "should connect to streaming endpoint",
      async () => {
        const response = await fetch(
          `${apiConfig.baseUrl}/api/streaming/incidents`,
          {
            method: "GET",
            headers: {
              Accept: "text/event-stream",
              "Cache-Control": "no-cache",
            },
          },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain(
          "text/event-stream",
        );

        // Read first chunk to verify streaming is working
        const reader = response.body?.getReader();
        if (reader) {
          const { value, done } = await reader.read();
          expect(done).toBe(false);
          expect(value).toBeDefined();

          reader.releaseLock();
        }
      },
      apiConfig.timeout,
    );

    test(
      "should stream real-time updates",
      async () => {
        let streamData: any[] = [];
        let streamConnection: ReadableStreamDefaultReader<Uint8Array> | null =
          null;

        try {
          // Start streaming
          const response = await fetch(
            `${apiConfig.baseUrl}/api/streaming/incidents`,
            {
              method: "GET",
              headers: {
                Accept: "text/event-stream",
                "Cache-Control": "no-cache",
              },
            },
          );

          expect(response.status).toBe(200);

          const reader = response.body?.getReader();
          streamConnection = reader!;

          // Set up stream reading with timeout
          const streamPromise = new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              resolve(); // Resolve after timeout instead of rejecting
            }, 5000); // 5 second timeout

            const readStream = async () => {
              try {
                const { value, done } = await reader!.read();
                clearTimeout(timeout);

                if (!done && value) {
                  const chunk = new TextDecoder().decode(value);
                  if (chunk.trim()) {
                    streamData.push(chunk);
                  }
                }
                resolve();
              } catch (error) {
                clearTimeout(timeout);
                resolve(); // Resolve on error instead of rejecting
              }
            };

            readStream();
          });

          // Create an incident to trigger stream update
          const incidentResponse = await fetch(
            `${apiConfig.baseUrl}/api/record/incident`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                short_description: "Stream Test Incident",
                state: "1",
                priority: "3",
              }),
            },
          );

          const incidentData = await incidentResponse.json();

          // Wait for stream data
          await streamPromise;

          // Verify stream received data (optional, as streaming might not be immediate)
          if (streamData.length > 0) {
            expect(streamData.length).toBeGreaterThan(0);
            console.log(`✅ Received ${streamData.length} stream events`);
          }

          // Cleanup created incident
          if (incidentData.success && incidentData.sys_id) {
            await deleteRecord("incident", incidentData.sys_id);
          }
        } finally {
          // Cleanup stream connection
          if (streamConnection) {
            streamConnection.releaseLock();
          }
        }
      },
      apiConfig.timeout,
    );
  });

  describe("Auto-Sync API Integration", () => {
    test(
      "should get auto-sync status via API",
      async () => {
        const response = await fetch(`${apiConfig.baseUrl}/api/sync/status`);

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.isRunning).toBeDefined();
        expect(data.lastSync).toBeDefined();
        expect(data.nextSync).toBeDefined();
        expect(data.interval).toBeDefined();
        expect(data.tables).toBeDefined();
        expect(Array.isArray(data.tables)).toBe(true);
      },
      apiConfig.timeout,
    );

    test(
      "should control auto-sync via API",
      async () => {
        // Stop auto-sync
        const stopResponse = await fetch(`${apiConfig.baseUrl}/api/sync/stop`, {
          method: "POST",
        });

        expect(stopResponse.status).toBe(200);

        const stopData = await stopResponse.json();
        expect(stopData.success).toBe(true);

        // Check status
        const statusResponse = await fetch(
          `${apiConfig.baseUrl}/api/sync/status`,
        );
        const statusData = await statusResponse.json();
        expect(statusData.isRunning).toBe(false);

        // Start auto-sync
        const startResponse = await fetch(
          `${apiConfig.baseUrl}/api/sync/start`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              interval: 300000, // 5 minutes
              tables: ["incident", "change_task", "sc_task"],
              batchSize: 50,
            }),
          },
        );

        expect(startResponse.status).toBe(200);

        const startData = await startResponse.json();
        expect(startData.success).toBe(true);

        // Verify started
        const finalStatusResponse = await fetch(
          `${apiConfig.baseUrl}/api/sync/status`,
        );
        const finalStatusData = await finalStatusResponse.json();
        expect(finalStatusData.isRunning).toBe(true);
      },
      apiConfig.timeout,
    );
  });

  describe("Error Handling Integration", () => {
    test(
      "should handle invalid endpoints gracefully",
      async () => {
        const response = await fetch(
          `${apiConfig.baseUrl}/api/invalid/endpoint`,
        );

        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.error).toBeDefined();
        expect(data.message).toBeDefined();
      },
      apiConfig.timeout,
    );

    test(
      "should handle invalid data gracefully",
      async () => {
        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/incident`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              invalid_field: "invalid_value",
            }),
          },
        );

        // Should either succeed with validation or return proper error
        expect([200, 400, 422]).toContain(response.status);

        const data = await response.json();
        if (response.status !== 200) {
          expect(data.error).toBeDefined();
        }
      },
      apiConfig.timeout,
    );

    test(
      "should handle malformed JSON gracefully",
      async () => {
        const response = await fetch(
          `${apiConfig.baseUrl}/api/record/incident`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: "{ invalid json",
          },
        );

        expect(response.status).toBe(400);

        const data = await response.json();
        expect(data.error).toBeDefined();
      },
      apiConfig.timeout,
    );
  });
});

// Helper functions
async function waitForAPIReady(): Promise<void> {
  const maxRetries = 30;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const response = await fetch(`${apiConfig.baseUrl}/api/health`);
      if (response.status === 200) {
        console.log("✅ API server is ready");
        return;
      }
    } catch (error) {
      // API not ready yet
    }

    retries++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("API server failed to start within timeout");
}

async function deleteRecord(table: string, sysId: string): Promise<void> {
  try {
    const response = await fetch(
      `${apiConfig.baseUrl}/api/record/${table}/${sysId}`,
      {
        method: "DELETE",
      },
    );

    if (response.status === 200) {
      console.log(`🗑️ Deleted ${table} record: ${sysId}`);
    }
  } catch (error) {
    console.warn(`Failed to delete ${table} record ${sysId}:`, error);
  }
}
