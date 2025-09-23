/**
 * MongoDB Integration Test - Testing MongoDB Collections
 * Tests the new specialized collections system
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ticketCollectionService } from "../services/TicketCollectionService";
import { ServiceNowClient } from "../client/ServiceNowClient";
import { TicketIntegrationService } from "../services/TicketIntegrationService";

async function testMongoDBIntegration() {
  console.log("🧪 Starting MongoDB Integration Test...\n");

  try {
    // Test 1: Check MongoDB connection
    console.log("1️⃣ Testing MongoDB connection...");
    const stats = await ticketCollectionService.getCollectionStats();
    console.log(" MongoDB connection successful");
    console.log(" Current stats:", JSON.stringify(stats, null, 2));
    console.log("");

    // Test 2: Test sample incident creation
    console.log("2️⃣ Testing sample incident creation...");
    const sampleIncident = {
      sys_id: "test_incident_001",
      number: "INC0000001",
      short_description: "Test MongoDB Integration",
      state: "1",
      assignment_group: {
        display_value: "Test Group",
        value: "test_group_001",
      },
      sys_created_on: new Date().toISOString(),
      sys_updated_on: new Date().toISOString(),
    };

    const sampleSLMs = [
      {
        sys_id: "slm_test_001",
        inc_number: "INC0000001",
        taskslatable_business_percentage: "95.0",
        taskslatable_start_time: new Date().toISOString(),
        taskslatable_end_time: "",
        taskslatable_sla: "P1 - Critical",
        taskslatable_stage: "In Progress",
        taskslatable_has_breached: "false",
        assignment_group: "Test Group",
        raw_data: {},
      },
    ];

    try {
      const incidentSuccess = await ticketCollectionService.upsertIncident(
        sampleIncident,
        sampleSLMs,
      );
      console.log(
        " Incident creation:",
        incidentSuccess ? "Success" : "Failed",
      );
    } catch (error: unknown) {
      console.log(" Incident creation failed:", error.message);
      console.error("Full error:", error);
    }
    console.log("");

    // Test 3: Test sample change task creation
    console.log("3️⃣ Testing sample change task creation...");
    const sampleChangeTask = {
      sys_id: "test_change_task_001",
      number: "CTASK0000001",
      short_description: "Test MongoDB Change Task",
      state: "2",
      assignment_group: {
        display_value: "Test Group",
        value: "test_group_001",
      },
      sys_created_on: new Date().toISOString(),
      sys_updated_on: new Date().toISOString(),
    };

    const changeTaskSuccess = await ticketCollectionService.upsertChangeTask(
      sampleChangeTask,
      sampleSLMs,
    );
    console.log(
      " Change Task creation:",
      changeTaskSuccess ? "Success" : "Failed",
    );
    console.log("");

    // Test 4: Test sample SC task creation
    console.log("4️⃣ Testing sample SC task creation...");
    const sampleSCTask = {
      sys_id: "test_sc_task_001",
      number: "SCTASK0000001",
      short_description: "Test MongoDB SC Task",
      state: "3",
      assignment_group: {
        display_value: "Test Group",
        value: "test_group_001",
      },
      sys_created_on: new Date().toISOString(),
      sys_updated_on: new Date().toISOString(),
    };

    const scTaskSuccess = await ticketCollectionService.upsertSCTask(
      sampleSCTask,
      sampleSLMs,
    );
    console.log(" SC Task creation:", scTaskSuccess ? "Success" : "Failed");
    console.log("");

    // Test 5: Test group creation
    console.log("5️⃣ Testing sample group creation...");
    const sampleGroup = {
      sys_id: "test_group_001",
      name: "Test Group",
      description: "Test group for MongoDB integration",
      active: "true",
    };

    const groupSuccess = await ticketCollectionService.upsertGroup(sampleGroup);
    console.log(" Group creation:", groupSuccess ? "Success" : "Failed");
    console.log("");

    // Test 6: Test data retrieval
    console.log("6️⃣ Testing data retrieval...");

    const incidents = await ticketCollectionService.getTickets(
      "incident",
      {},
      5,
    );
    console.log(` Retrieved ${incidents.length} incidents`);

    const changeTasks = await ticketCollectionService.getTickets(
      "change_task",
      {},
      5,
    );
    console.log(` Retrieved ${changeTasks.length} change tasks`);

    const scTasks = await ticketCollectionService.getTickets("sc_task", {}, 5);
    console.log(` Retrieved ${scTasks.length} SC tasks`);

    const groups = await ticketCollectionService.getTargetGroups();
    console.log(
      ` Retrieved ${groups.length} groups: ${groups.slice(0, 3).join(", ")}...`,
    );
    console.log("");

    // Test 7: Test count functionality
    console.log("7️⃣ Testing count functionality...");
    const incidentCount =
      await ticketCollectionService.getTicketCount("incident");
    const changeTaskCount =
      await ticketCollectionService.getTicketCount("change_task");
    const scTaskCount = await ticketCollectionService.getTicketCount("sc_task");

    console.log(" Collection counts:");
    console.log(`   - Incidents: ${incidentCount}`);
    console.log(`   - Change Tasks: ${changeTaskCount}`);
    console.log(`   - SC Tasks: ${scTaskCount}`);
    console.log("");

    // Test 8: Updated stats
    console.log("8️⃣ Getting updated collection stats...");
    const finalStats = await ticketCollectionService.getCollectionStats();
    console.log(" Final stats:", JSON.stringify(finalStats, null, 2));
    console.log("");

    console.log(" MongoDB Integration Test completed successfully!");
    console.log(
      "🎯 All collections are working correctly with specialized storage.",
    );
  } catch (error: unknown) {
    console.error(" MongoDB Integration Test failed:", error);
    console.error("Stack trace:", error.stack);
  }
}

// Run the test
testMongoDBIntegration();
