/**
 * GlideRecord Usage Examples - Full PySNC Compatibility
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { GlideRecord } from "../record/GlideRecord";
import { GlideElement } from "../record/GlideElement";
import { ServiceNowException } from "../exceptions";

// Mock ServiceNow client for examples
interface ServiceNowClient {
  instance: string;
  serviceNow: any;
  GlideRecord: (
    table: string,
    batchSize?: number,
    rewindable?: boolean,
  ) => GlideRecord;
}

export class GlideRecordExamples {
  private client: ServiceNowClient;

  constructor(client: ServiceNowClient) {
    this.client = client;
  }

  /**
   * Example 1: Basic CRUD Operations
   */
  async basicCrudOperations() {
    console.log("=== Basic CRUD Operations ===");

    // Create new incident
    const gr = this.client.GlideRecord("incident");
    gr.setValue("short_description", "Network outage in building A");
    gr.setValue("category", "network");
    gr.setValue("impact", "2");
    gr.setValue("urgency", "2");
    gr.setValue("state", "1"); // New

    try {
      const sysId = await gr.insert();
      console.log("Created incident with sys_id:", sysId?.getValue());
    } catch (error) {
      console.error("Failed to create incident:", error);
    }

    // Read incident by number
    const readGr = this.client.GlideRecord("incident");
    const found = await readGr.get("number", "INC0010001");
    if (found) {
      console.log("Found incident:", readGr.getValue("short_description"));
      console.log("State display:", readGr.getDisplayValue("state"));
    }

    // Update incident
    if (found) {
      readGr.setValue("state", "2"); // In Progress
      readGr.setValue("work_notes", "Investigating network issue");

      try {
        await readGr.update();
        console.log("Updated incident successfully");
      } catch (error) {
        console.error("Failed to update incident:", error);
      }
    }

    // Delete incident (be careful in production!)
    // await readGr.delete();
  }

  /**
   * Example 2: Advanced Querying
   */
  async advancedQuerying() {
    console.log("=== Advanced Querying ===");

    const gr = this.client.GlideRecord("incident");

    // Complex query with multiple conditions
    gr.addActiveQuery();
    gr.addQuery("state", "IN", "1,2,6"); // New, In Progress, Resolved
    gr.addQuery("impact", "<=", "2"); // High impact
    gr.addQuery("priority", "!=", "5"); // Not lowest priority

    // OR conditions
    const categoryCondition = gr.addQuery("category", "software");
    categoryCondition.addOrCondition("category", "hardware");
    categoryCondition.addOrCondition("category", "network");

    // Null/Not null queries
    gr.addNotNullQuery("assigned_to");
    gr.addNullQuery("resolved_at");

    // Date range query
    gr.addQuery("sys_created_on", ">=", "2024-01-01 00:00:00");

    // String operations
    gr.addQuery("short_description", "CONTAINS", "server");
    gr.addQuery("caller_id", "STARTSWITH", "admin");

    // Order results
    gr.orderByDesc("sys_created_on");
    gr.orderBy("priority");

    // Set limit
    gr.limit = 50;

    try {
      await gr.query();
      console.log(`Found ${gr.getRowCount()} incidents matching criteria`);
      console.log("Generated query:", gr.getEncodedQuery());

      // Iterate through results
      while (gr.next()) {
        console.log(
          `- ${gr.getValue("number")}: ${gr.getValue("short_description")}`,
        );
        console.log(
          `  State: ${gr.getDisplayValue("state")}, Priority: ${gr.getValue("priority")}`,
        );
        console.log(`  Created: ${gr.getValue("sys_created_on")}`);
        console.log(`  Link: ${gr.getLink()}`);
      }
    } catch (error) {
      console.error("Query failed:", error);
    }
  }

  /**
   * Example 3: JOIN Queries
   */
  async joinQueries() {
    console.log("=== JOIN Queries ===");

    const gr = this.client.GlideRecord("incident");

    // JOIN with sys_user table to get assigned user details
    const userJoin = gr.addJoinQuery("sys_user", "assigned_to", "sys_id");
    userJoin.addQuery("active", "true");
    userJoin.addQuery("department", "IT");
    userJoin.addQuery("location", "CONTAINS", "New York");

    gr.addActiveQuery();
    gr.addQuery("state", "IN", "1,2");

    try {
      await gr.query();
      console.log("JOIN query executed successfully");
      console.log("Generated query:", gr.getEncodedQuery());
    } catch (error) {
      console.error("JOIN query failed:", error);
    }
  }

  /**
   * Example 4: Related List Queries
   */
  async relatedListQueries() {
    console.log("=== Related List Queries ===");

    // Find incidents that have related CI records
    const gr = this.client.GlideRecord("incident");

    const rlQuery = gr.addRLQuery("task_ci", "ci_item", "category=hardware");
    rlQuery.addQuery("install_status", "1"); // Installed
    rlQuery.addQuery("operational_status", "1"); // Operational

    gr.addActiveQuery();
    gr.addQuery("state", "IN", "1,2");

    try {
      await gr.query();
      console.log("Related list query executed");
      console.log("Query:", gr.getEncodedQuery());
    } catch (error) {
      console.error("RL query failed:", error);
    }
  }

  /**
   * Example 5: GlideElement Operations
   */
  async glideElementOperations() {
    console.log("=== GlideElement Operations ===");

    const gr = this.client.GlideRecord("incident");
    await gr.get("number", "INC0010001");

    if (gr.next()) {
      // Get elements
      const stateElement = gr.getElement("state");
      const descElement = gr.getElement("short_description");
      const dateElement = gr.getElement("sys_created_on");

      console.log("State element:");
      console.log("  Name:", stateElement.getName());
      console.log("  Value:", stateElement.getValue());
      console.log("  Display Value:", stateElement.getDisplayValue());
      console.log("  Is Nil:", stateElement.nil());
      console.log("  Changes:", stateElement.changes());

      // Modify element
      descElement.setValue("Updated description via GlideElement");
      console.log("Element changed:", descElement.changes());

      // Date operations
      if (dateElement.getValue()) {
        console.log("Created date:", dateElement.dateValue());
        console.log("Numeric value:", dateElement.dateNumericValue());
      }

      // Serialization
      console.log("State serialized:", stateElement.serialize());
    }
  }

  /**
   * Example 6: Iteration Patterns
   */
  async iterationPatterns() {
    console.log("=== Iteration Patterns ===");

    const gr = this.client.GlideRecord("incident", 100); // Batch size 100
    gr.addActiveQuery();
    gr.addQuery("state", "IN", "1,2");
    gr.limit = 500;

    try {
      await gr.query();

      // Pattern 1: While loop
      console.log("=== While Loop Pattern ===");
      let count = 0;
      while (gr.next()) {
        count++;
        console.log(
          `${count}. ${gr.getValue("number")}: ${gr.getValue("short_description")}`,
        );

        if (count >= 5) break; // Limit output for demo
      }

      // Pattern 2: Iterator protocol (for...of)
      console.log("\n=== Iterator Pattern ===");
      gr.rewind();
      let iterCount = 0;
      for (const record of gr) {
        iterCount++;
        console.log(`${iterCount}. ${record.getValue("number")}`);

        if (iterCount >= 5) break; // Limit output for demo
      }

      // Pattern 3: Manual navigation
      console.log("\n=== Manual Navigation ===");
      gr.rewind();
      console.log("Has next?", gr.hasNext());
      console.log("Current location:", gr.location);

      if (gr.hasNext()) {
        gr.next();
        console.log("After next - Location:", gr.location);
        console.log("Record:", gr.getValue("number"));
      }
    } catch (error) {
      console.error("Iteration failed:", error);
    }
  }

  /**
   * Example 7: Serialization and Data Export
   */
  async serializationExamples() {
    console.log("=== Serialization Examples ===");

    const gr = this.client.GlideRecord("incident");
    gr.addQuery("state", "1");
    gr.limit = 3;

    try {
      await gr.query();

      // Serialize current record
      if (gr.next()) {
        console.log("Current record serialized:");
        console.log(JSON.stringify(gr.serialize(), null, 2));
      }

      // Serialize all records
      console.log("\nAll records serialized:");
      const allRecords = gr.serializeAll();
      console.log(`Serialized ${allRecords.length} records`);

      // Export to JSON file (pseudo-code)
      // await this.exportToFile('incidents.json', allRecords);
    } catch (error) {
      console.error("Serialization failed:", error);
    }
  }

  /**
   * Example 8: Error Handling
   */
  async errorHandlingExamples() {
    console.log("=== Error Handling Examples ===");

    const gr = this.client.GlideRecord("incident");

    try {
      // Try to get non-existent record
      const found = await gr.get("non_existent_id");
      if (!found) {
        console.log("Record not found - handled gracefully");
      }
    } catch (error) {
      if (error instanceof ServiceNowException) {
        console.error("ServiceNow error:", error.message);
        console.error("Status code:", error.statusCode);
      } else {
        console.error("Unexpected error:", error);
      }
    }

    // Try operations on empty record set
    try {
      await gr.update(); // Should fail - no current record
    } catch (error) {
      console.log("Expected error:", error.message);
    }

    try {
      await gr.delete(); // Should fail - no current record
    } catch (error) {
      console.log("Expected error:", error.message);
    }
  }

  /**
   * Example 9: Advanced Field Operations
   */
  async advancedFieldOperations() {
    console.log("=== Advanced Field Operations ===");

    const gr = this.client.GlideRecord("incident");
    await gr.get("number", "INC0010001");

    if (gr.next()) {
      // Working with different field types
      console.log("=== String Fields ===");
      console.log("Short description:", gr.getValue("short_description"));
      gr.setValue("work_notes", "Added via GlideRecord example");

      console.log("=== Reference Fields ===");
      const assignedTo = gr.getElement("assigned_to");
      console.log("Assigned to value:", assignedTo.getValue()); // sys_id
      console.log("Assigned to display:", assignedTo.getDisplayValue()); // name
      console.log("Assigned to link:", assignedTo.getLink()); // reference link

      console.log("=== Date Fields ===");
      const createdOn = gr.getElement("sys_created_on");
      if (!createdOn.nil()) {
        console.log("Created on:", createdOn.dateValue());
        console.log("Created timestamp:", createdOn.dateNumericValue());
      }

      console.log("=== Choice Fields ===");
      const state = gr.getElement("state");
      console.log("State value:", state.getValue());
      console.log("State display:", state.getDisplayValue());

      // Check for changes
      console.log("Record has changes:", gr.changes());
    }
  }

  /**
   * Example 10: Batch Operations
   */
  async batchOperationsExample() {
    console.log("=== Batch Operations Example ===");

    // Process large result set efficiently
    const gr = this.client.GlideRecord("incident", 50); // Small batch size
    gr.addQuery("state", "7"); // Closed
    gr.addQuery("sys_updated_on", "<", "2024-01-01 00:00:00"); // Old records

    try {
      await gr.query();

      console.log(`Processing ${gr.getRowCount()} old closed incidents`);
      let processed = 0;
      let batch = 0;

      while (gr.next()) {
        processed++;

        // Process record (e.g., archive, cleanup, etc.)
        const number = gr.getValue("number");
        const updatedOn = gr.getValue("sys_updated_on");

        if (processed % 50 === 1) {
          batch++;
          console.log(
            `Processing batch ${batch} - Record: ${number} (${updatedOn})`,
          );
        }

        // Simulated processing
        // await this.archiveIncident(gr);

        // Break early for demo
        if (processed >= 100) {
          console.log("Demo limit reached");
          break;
        }
      }

      console.log(`Processed ${processed} records total`);
    } catch (error) {
      console.error("Batch processing failed:", error);
    }
  }
}

// Usage example
/*
// Initialize client
const client = new ServiceNowClient('https://dev12345.service-now.com', 'auth_token');
const examples = new GlideRecordExamples(client);

// Run examples
async function runExamples() {
  try {
    await examples.basicCrudOperations();
    await examples.advancedQuerying();
    await examples.joinQueries();
    await examples.relatedListQueries();
    await examples.glideElementOperations();
    await examples.iterationPatterns();
    await examples.serializationExamples();
    await examples.errorHandlingExamples();
    await examples.advancedFieldOperations();
    await examples.batchOperationsExample();
  } catch (error) {
    console.error('Examples failed:', error);
  }
}

// runExamples();
*/

export default GlideRecordExamples;
