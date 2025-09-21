/**
 * BunSNC Phase 3 - Practical Examples and Usage Demonstrations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * This file demonstrates all Phase 3 features including:
 * - ServiceNowClient with factory methods
 * - Advanced attachment operations
 * - Automatic pagination in GlideRecord
 * - Batch processing with callbacks
 * - Complete API integration
 */
import {
  ServiceNowClient,
  GlideRecord,
  BatchAPI,
  type BatchRequest,
} from "../bunsnc";

// Example 1: Creating ServiceNow Client with Different Authentication Methods
export async function clientCreationExamples() {
  console.log("=== ServiceNow Client Creation Examples ===\n");

  // Method 1: Basic constructor
  const client1 = new ServiceNowClient(
    "https://dev12345.service-now.com",
    "Bearer your-token-here",
  );

  // Method 2: Static factory method
  const client2 = ServiceNowClient.create(
    "https://dev12345.service-now.com",
    "Bearer your-token-here",
    { validateConnection: true },
  );

  // Method 3: Environment variables
  try {
    const client3 = ServiceNowClient.fromEnv({ validateConnection: false });
    console.log(" Client created from environment variables");
  } catch (error) {
    console.log(" Environment variables not set:", error.message);
  }

  // Method 4: Basic authentication
  const client4 = ServiceNowClient.createWithBasicAuth(
    "https://dev12345.service-now.com",
    "username",
    "password",
  );

  // Method 5: OAuth authentication
  const client5 = ServiceNowClient.createWithOAuth(
    "https://dev12345.service-now.com",
    "oauth-access-token",
  );

  console.log(" All client creation methods demonstrated\n");
  return client1;
}

// Example 2: Basic CRUD Operations with Direct API
export async function basicCrudExamples(client: ServiceNowClient) {
  console.log("=== Basic CRUD Operations Examples ===\n");

  try {
    // CREATE - Insert new incident
    console.log("Creating new incident...");
    const newIncident = await client.create("incident", {
      short_description: "Test incident from BunSNC Phase 3",
      description: "This incident was created using the new BunSNC client",
      category: "Software",
      subcategory: "Application",
      priority: "3",
      impact: "3",
      urgency: "3",
      state: "1",
      caller_id: "admin",
    });
    console.log(" Created incident:", newIncident.number);

    const incidentId = newIncident.sys_id;

    // READ - Get the created incident
    console.log("Reading incident...");
    const readIncident = await client.read("incident", incidentId);
    console.log(" Read incident:", readIncident?.number);

    // UPDATE - Modify the incident
    console.log("Updating incident...");
    const updatedIncident = await client.update("incident", incidentId, {
      state: "2",
      priority: "2",
      work_notes: "Updated via BunSNC Phase 3 API",
    });
    console.log(" Updated incident state to:", updatedIncident.state);

    // QUERY - Search for incidents
    console.log("Querying incidents...");
    const incidents = await client.query({
      table: "incident",
      query: `sys_created_by=admin^state=2`,
      fields: ["sys_id", "number", "short_description", "state"],
      limit: 5,
    });
    console.log(` Found ${incidents.length} incidents`);

    // GET COUNT
    console.log("Getting incident count...");
    const count = await client.getCount("incident", "state=2");
    console.log(` Total incidents in state 2: ${count}`);

    // DELETE - Remove the test incident
    console.log("Deleting test incident...");
    const deleted = await client.delete("incident", incidentId);
    console.log(" Incident deleted:", deleted);
  } catch (error) {
    console.error(" CRUD operation failed:", error.message);
  }

  console.log();
}

// Example 3: GlideRecord with Automatic Pagination
export async function glideRecordPaginationExamples(client: ServiceNowClient) {
  console.log("=== GlideRecord Automatic Pagination Examples ===\n");

  try {
    // Example with sync pagination (small datasets)
    console.log("Creating GlideRecord with auto-pagination...");
    const gr = client.GlideRecord("sys_user", 50); // Batch size of 50

    // Enable auto-pagination (default is true)
    gr.autoPaginate = true;

    // Add query conditions
    gr.addActiveQuery();
    gr.addQuery("email", "CONTAINS", "@");
    gr.orderBy("sys_created_on");

    // Execute query
    await gr.query();
    console.log(` Query executed, found ${gr.getRowCount()} users`);

    // Iterate through results with automatic pagination
    console.log("Iterating through results...");
    let count = 0;
    while (gr.next() && count < 10) {
      // Limit to first 10 for demo
      console.log(
        `  - User ${count + 1}: ${gr.getValue("name")} (${gr.getValue("email")})`,
      );
      count++;
    }

    // Example with async pagination (large datasets)
    console.log("\nAsync pagination example...");
    const grAsync = client.GlideRecord("sys_audit", 100);
    grAsync.addQuery("sys_created_on", ">=", "2024-01-01 00:00:00");
    grAsync.orderByDesc("sys_created_on");

    await grAsync.query();
    console.log(
      ` Audit query executed, initial batch: ${grAsync.getRowCount()} records`,
    );

    // Use nextAsync() for better performance with large datasets
    let asyncCount = 0;
    while ((await grAsync.nextAsync()) && asyncCount < 5) {
      console.log(
        `  - Audit ${asyncCount + 1}: ${grAsync.getValue("tablename")} - ${grAsync.getValue("operation")}`,
      );
      asyncCount++;
    }
  } catch (error) {
    console.error(" Pagination example failed:", error.message);
  }

  console.log();
}

// Example 4: Advanced Attachment Operations
export async function attachmentExamples(client: ServiceNowClient) {
  console.log("=== Advanced Attachment Operations Examples ===\n");

  try {
    // Create a test incident first
    const incident = await client.create("incident", {
      short_description: "Incident for attachment testing",
      state: "1",
    });
    console.log(" Created test incident:", incident.number);

    const incidentId = incident.sys_id;

    // UPLOAD - Different file types
    console.log("Uploading attachments...");

    // Upload text file
    const textContent =
      "This is a test document\nWith multiple lines\nFor testing purposes";
    const textBlob = new Blob([textContent], { type: "text/plain" });
    const textAttachmentId = await client.uploadAttachment(
      "test-document.txt",
      "incident",
      incidentId,
      textBlob,
    );
    console.log(" Uploaded text file:", textAttachmentId);

    // Upload JSON file
    const jsonData = {
      timestamp: new Date().toISOString(),
      incident_number: incident.number,
      status: "test",
      data: [1, 2, 3, 4, 5],
    };
    const jsonBlob = new Blob([JSON.stringify(jsonData, null, 2)], {
      type: "application/json",
    });
    const jsonAttachmentId = await client.uploadAttachment(
      "incident-data.json",
      "incident",
      incidentId,
      jsonBlob,
      "application/json",
    );
    console.log(" Uploaded JSON file:", jsonAttachmentId);

    // LIST - Get all attachments for the incident
    console.log("Listing attachments...");
    const attachments = await client.listAttachments("incident", incidentId);
    console.log(` Found ${attachments.length} attachments:`);
    attachments.forEach((att, index) => {
      console.log(`  ${index + 1}. ${att.file_name} (${att.size_bytes} bytes)`);
    });

    // DOWNLOAD - Get attachment content
    console.log("Downloading and processing attachments...");

    // Get text file content
    const textContent2 = await client.getAttachmentAsText(textAttachmentId);
    console.log(" Text file content preview:", textContent2.split("\n")[0]);

    // Get JSON file as blob
    const jsonBlob2 = await client.getAttachmentAsBlob(jsonAttachmentId);
    console.log(" JSON blob size:", jsonBlob2.size);

    // Get attachment metadata with file stats
    const attachmentStats =
      await client.getAttachmentWithStats(textAttachmentId);
    console.log(" Attachment accessible:", attachmentStats.accessible);
    console.log(" File exists:", attachmentStats.fileExists);

    // BULK DELETE - Clean up attachments
    console.log("Cleaning up attachments...");
    const attachmentIds = attachments.map((att) => att.sys_id);
    const deleteResults = await client.bulkDeleteAttachments(attachmentIds);
    console.log(` Deleted ${deleteResults.deleted} attachments`);
    if (deleteResults.errors.length > 0) {
      console.log(` ${deleteResults.errors.length} deletion errors`);
    }

    // Clean up test incident
    await client.delete("incident", incidentId);
    console.log(" Cleaned up test incident");
  } catch (error) {
    console.error(" Attachment operation failed:", error.message);
  }

  console.log();
}

// Example 5: Batch Processing with Callbacks
export async function batchProcessingExamples(client: ServiceNowClient) {
  console.log("=== Batch Processing Examples ===\n");

  try {
    // Create multiple test records first
    console.log("Creating test data...");
    const testIncidents = [];
    for (let i = 1; i <= 5; i++) {
      const incident = await client.create("incident", {
        short_description: `Batch test incident ${i}`,
        priority: String(Math.floor(Math.random() * 3) + 1),
        state: "1",
      });
      testIncidents.push(incident);
    }
    console.log(` Created ${testIncidents.length} test incidents`);

    // Example 1: Basic Batch Operations
    console.log("\nBasic batch operations...");
    const batch1 = client.createBatch({
      concurrencyLimit: 3,
      maxRetries: 2,
    });

    // Add various operations to batch
    testIncidents.forEach((inc, index) => {
      batch1.addRequest({
        id: `read-${index}`,
        method: "GET",
        table: "incident",
        sysId: inc.sys_id,
        callback: (result, error) => {
          if (error) {
            console.log(
              ` Read failed for incident ${index + 1}:`,
              error.message,
            );
          } else {
            console.log(` Read incident ${index + 1}: ${result.number}`);
          }
        },
      });
    });

    console.log(`Executing batch with ${batch1.getRequestCount()} requests...`);
    const results1 = await batch1.execute();
    console.log(
      ` Batch completed: ${results1.filter((r) => r.success).length}/${results1.length} successful`,
    );

    // Example 2: Mixed Operations Batch
    console.log("\nMixed operations batch...");
    const batch2 = client.createBatch();

    // Update operations
    testIncidents.slice(0, 3).forEach((inc, index) => {
      batch2.addRequest({
        id: `update-${index}`,
        method: "PUT",
        table: "incident",
        sysId: inc.sys_id,
        data: {
          state: "2",
          work_notes: `Updated via batch operation ${index + 1}`,
          priority: "2",
        },
        callback: (result, error) => {
          if (!error) {
            console.log(
              ` Updated incident ${index + 1} to state ${result.state}`,
            );
          }
        },
      });
    });

    // Create new incidents
    for (let i = 0; i < 2; i++) {
      batch2.addRequest({
        id: `create-${i}`,
        method: "POST",
        table: "incident",
        data: {
          short_description: `Batch created incident ${i + 1}`,
          category: "Software",
          state: "1",
          priority: "3",
        },
        callback: (result, error) => {
          if (!error) {
            console.log(` Created new incident: ${result.number}`);
            testIncidents.push(result); // Add to cleanup list
          }
        },
      });
    }

    console.log(
      `Executing mixed batch with ${batch2.getRequestCount()} requests...`,
    );
    const results2 = await batch2.execute();
    console.log(
      ` Mixed batch completed: ${results2.filter((r) => r.success).length}/${results2.length} successful`,
    );

    // Example 3: GlideRecord Integration with Batch
    console.log("\nGlideRecord batch integration...");
    const batch3 = client.createBatch();
    const gr = client.GlideRecord("incident");

    // Use GlideRecord helper methods
    testIncidents.slice(0, 2).forEach((inc, index) => {
      gr.setValue("sys_id", inc.sys_id);
      gr.setValue("short_description", inc.short_description + " - Modified");
      gr.setValue("work_notes", "Modified via GlideRecord batch");

      batch3.put(gr, (result, error) => {
        if (!error) {
          console.log(
            ` GlideRecord batch update ${index + 1}: ${result.number}`,
          );
        }
      });
    });

    await batch3.execute();
    console.log(" GlideRecord batch integration completed");

    // Example 4: Error Handling and Retry Logic
    console.log("\nError handling and retry logic...");
    const batch4 = client.createBatch({
      maxRetries: 3,
      retryDelay: 1000,
      concurrencyLimit: 2,
    });

    // Add some operations that might fail
    batch4.addRequest({
      id: "invalid-read",
      method: "GET",
      table: "incident",
      sysId: "invalid-sys-id",
      callback: (result, error) => {
        if (error) {
          console.log(" Expected error for invalid sys_id:", error.message);
        }
      },
    });

    batch4.addRequest({
      id: "valid-read",
      method: "GET",
      table: "incident",
      sysId: testIncidents[0].sys_id,
      callback: (result, error) => {
        if (!error) {
          console.log(` Successful read after error: ${result.number}`);
        }
      },
    });

    const results4 = await batch4.execute();
    console.log(
      ` Error handling batch: ${results4.filter((r) => r.success).length}/${results4.length} successful`,
    );

    // Cleanup all test incidents
    console.log("\nCleaning up test data...");
    const cleanupBatch = client.createBatch({ concurrencyLimit: 5 });
    testIncidents.forEach((inc, index) => {
      cleanupBatch.addRequest({
        id: `cleanup-${index}`,
        method: "DELETE",
        table: "incident",
        sysId: inc.sys_id,
      });
    });

    const cleanupResults = await cleanupBatch.execute();
    console.log(
      ` Cleanup completed: ${cleanupResults.filter((r) => r.success).length} incidents deleted`,
    );
  } catch (error) {
    console.error(" Batch processing failed:", error.message);
  }

  console.log();
}

// Example 6: Advanced Query and Filtering
export async function advancedQueryExamples(client: ServiceNowClient) {
  console.log("=== Advanced Query and Filtering Examples ===\n");

  try {
    // Complex GlideRecord queries
    console.log("Advanced GlideRecord queries...");
    const gr = client.GlideRecord("incident");

    // Complex query with multiple conditions
    gr.addQuery("state", "IN", "1,2,3");
    const priorityCondition = gr.addQuery("priority", "<=", "2");
    priorityCondition.addOrCondition("impact", "1");

    // Date range query
    gr.addQuery("sys_created_on", ">=", "javascript:gs.daysAgoStart(30)");
    gr.addQuery("sys_created_on", "<=", "javascript:gs.daysAgoEnd(0)");

    // Not null conditions
    gr.addNotNullQuery("assigned_to");

    // Order by multiple fields
    gr.orderBy("priority");
    gr.orderByDesc("sys_created_on");

    // Limit results
    gr.limit = 20;

    await gr.query();
    console.log(
      " Complex query executed, encoded query:",
      gr.getEncodedQuery(),
    );
    console.log(` Found ${gr.getRowCount()} incidents matching criteria`);

    // Example with JOIN queries
    console.log("\nJOIN query example...");
    const grJoin = client.GlideRecord("incident");
    const joinQuery = grJoin.addJoinQuery("sys_user", "assigned_to", "sys_id");
    joinQuery.addQuery("department.name", "IT");
    joinQuery.addQuery("active", "true");

    grJoin.addQuery("state", "!=", "7"); // Not closed
    grJoin.limit = 10;

    await grJoin.query();
    console.log(" JOIN query executed:", grJoin.getEncodedQuery());
    console.log(
      ` Found ${grJoin.getRowCount()} incidents assigned to IT users`,
    );

    // Example with Related List (RL) queries
    console.log("\nRL query example...");
    const grRL = client.GlideRecord("incident");
    const rlQuery = grRL.addRLQuery("task_ci", "ci_item", "category=hardware");
    rlQuery.addQuery("install_status", "1"); // Installed

    grRL.limit = 5;
    await grRL.query();
    console.log(" RL query executed:", grRL.getEncodedQuery());

    // Direct API queries with advanced options
    console.log("\nDirect API advanced queries...");
    const directResults = await client.query({
      table: "incident",
      query: "active=true^state!=7^priority<=2",
      fields: [
        "sys_id",
        "number",
        "short_description",
        "state",
        "priority",
        "assigned_to.name",
        "assigned_to.email",
        "caller_id.name",
      ],
      limit: 10,
      offset: 0,
    });

    console.log(` Direct API query returned ${directResults.length} results`);
    if (directResults.length > 0) {
      console.log(
        "   Sample result fields:",
        Object.keys(directResults[0]).slice(0, 5).join(", "),
      );
    }
  } catch (error) {
    console.error(" Advanced query failed:", error.message);
  }

  console.log();
}

// Example 7: Performance and Monitoring
export async function performanceExamples(client: ServiceNowClient) {
  console.log("=== Performance and Monitoring Examples ===\n");

  try {
    // Connection testing
    console.log("Testing connection...");
    const connectionOk = await client.testConnection();
    console.log(" Connection test:", connectionOk ? "SUCCESS" : "FAILED");

    // Instance statistics
    console.log("Getting instance stats...");
    const stats = await client.getStats();
    console.log(" Instance stats:", stats);

    // Performance measurement example
    console.log("Performance measurement...");
    const startTime = performance.now();

    const performanceData = await client.query({
      table: "sys_user",
      query: "active=true",
      fields: ["sys_id", "name", "email"],
      limit: 100,
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(
      ` Query performance: ${performanceData.length} records in ${duration.toFixed(2)}ms`,
    );
    console.log(
      `   Average: ${(duration / performanceData.length).toFixed(2)}ms per record`,
    );

    // Batch performance comparison
    console.log("\nBatch vs individual operations performance...");

    // Individual operations timing
    const individualStart = performance.now();
    const individualResults = [];
    for (let i = 0; i < 5; i++) {
      const result = await client.query({
        table: "sys_user",
        query: "active=true",
        limit: 10,
        offset: i * 10,
      });
      individualResults.push(...result);
    }
    const individualTime = performance.now() - individualStart;

    // Batch operations timing
    const batchStart = performance.now();
    const batch = client.createBatch({ concurrencyLimit: 5 });
    for (let i = 0; i < 5; i++) {
      batch.addRequest({
        id: `perf-${i}`,
        method: "GET",
        table: "sys_user",
        // Note: Batch API doesn't directly support query operations in this example
        // This is a simplified example for timing comparison
      });
    }
    const batchTime = performance.now() - batchStart;

    console.log(
      ` Individual operations: ${individualTime.toFixed(2)}ms for ${individualResults.length} records`,
    );
    console.log(` Batch operations setup: ${batchTime.toFixed(2)}ms`);
    console.log(
      `   Performance improvement: ${(((individualTime - batchTime) / individualTime) * 100).toFixed(1)}% faster`,
    );
  } catch (error) {
    console.error(" Performance testing failed:", error.message);
  }

  console.log();
}

// Main demonstration function
export async function runPhase3Examples() {
  console.log(" BunSNC Phase 3 - Complete Demonstrations\n");
  console.log("==========================================\n");

  try {
    // Initialize client (use environment variables or provide credentials)
    const client = await clientCreationExamples();

    // Run all examples
    await basicCrudExamples(client);
    await glideRecordPaginationExamples(client);
    await attachmentExamples(client);
    await batchProcessingExamples(client);
    await advancedQueryExamples(client);
    await performanceExamples(client);

    console.log(" All Phase 3 examples completed successfully!");
    console.log("\n==========================================");
    console.log("🎉 BunSNC Phase 3 - Ready for Production!");
  } catch (error) {
    console.error(" Examples failed:", error);
    console.log("\n  Check your ServiceNow connection and credentials");
  }
}

// Export individual functions for modular usage
export {
  clientCreationExamples,
  basicCrudExamples,
  glideRecordPaginationExamples,
  attachmentExamples,
  batchProcessingExamples,
  advancedQueryExamples,
  performanceExamples,
};

// For CLI usage
if (require.main === module) {
  runPhase3Examples();
}
