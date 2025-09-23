/**
 * Redis Streams Test Script
 * Tests Redis connectivity and ServiceNow streaming functionality
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowStreams, serviceNowStreams } from "../src/config/redis-streams";
import { logger } from "../src/utils/Logger";

export class RedisStreamsTest {
  private testStream: ServiceNowStreams;

  constructor() {
    // Create a test instance with separate consumer name
    this.testStream = new ServiceNowStreams({
      consumerName: `test-consumer-${Date.now()}`,
      consumerGroup: "test-group",
      streamKey: "test:servicenow:changes",
    });
  }

  async testBasicConnection(): Promise<void> {
    try {
      logger.info("🔗 Testing Redis basic connection...");

      const health = await this.testStream.healthCheck();

      if (health.status === "healthy") {
        logger.info("✅ Redis connection healthy");
        logger.info(`   Ping duration: ${health.details.pingDuration}ms`);
        logger.info(`   Host: ${health.details.connection.host}:${health.details.connection.port}`);
        logger.info(`   Database: ${health.details.connection.db}`);
      } else {
        logger.error("❌ Redis connection unhealthy:", health.details);
        throw new Error(`Redis unhealthy: ${health.details.error}`);
      }

    } catch (error: unknown) {
      logger.error("❌ Redis connection test failed:", error);
      throw error;
    }
  }

  async testStreamInitialization(): Promise<void> {
    try {
      logger.info("🚀 Testing Redis stream initialization...");

      await this.testStream.initialize();
      logger.info("✅ Redis stream initialized successfully");

      const stats = await this.testStream.getStreamStats();
      logger.info("📊 Stream Statistics:");
      logger.info(`   Stream: ${stats.stream}`);
      logger.info(`   Length: ${stats.length || 0} messages`);
      logger.info(`   Groups: ${stats.groups?.length || 0}`);
      logger.info(`   Consumer: ${stats.consumerName}`);

    } catch (error: unknown) {
      logger.error("❌ Stream initialization failed:", error);
      throw error;
    }
  }

  async testMessagePublishing(): Promise<void> {
    try {
      logger.info("📤 Testing message publishing...");

      // Test incident creation
      const incidentData = {
        sys_id: "test_incident_001",
        number: "INC0000001",
        state: "2",
        assignment_group: { display_value: "Database Administration" },
        short_description: "Test database connection timeout issue",
        priority: "2",
        category: "database",
        created_on: new Date().toISOString(),
      };

      const messageId1 = await this.testStream.publishIncidentCreated(incidentData);
      logger.info(`✅ Published incident creation: ${messageId1}`);

      // Test incident update
      const updatedIncident = {
        ...incidentData,
        state: "6",
        resolution_notes: "Issue resolved by restarting database service",
      };

      const messageId2 = await this.testStream.publishIncidentUpdated(updatedIncident);
      logger.info(`✅ Published incident update: ${messageId2}`);

      // Test change task creation
      const changeTaskData = {
        type: "change_task",
        action: "created",
        sys_id: "test_ctask_001",
        number: "CTASK0000001",
        state: "3",
        assignment_group: "IT Operations",
        short_description: "Deploy new database configuration",
        timestamp: new Date().toISOString(),
        data: {
          change_request: "CHG0000001",
          planned_start_date: new Date().toISOString(),
          planned_end_date: new Date(Date.now() + 3600000).toISOString(),
        },
      };

      const messageId3 = await this.testStream.publishChange(changeTaskData);
      logger.info(`✅ Published change task creation: ${messageId3}`);

      // Wait a moment for messages to be processed
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check updated stats
      const stats = await this.testStream.getStreamStats();
      logger.info(`📊 Stream now has ${stats.length || 0} messages`);

    } catch (error: unknown) {
      logger.error("❌ Message publishing failed:", error);
      throw error;
    }
  }

  async testMessageConsumption(): Promise<void> {
    try {
      logger.info("📥 Testing message consumption...");

      let receivedMessages = 0;
      const maxWaitTime = 10000; // 10 seconds
      const startTime = Date.now();

      // Register a test consumer
      this.testStream.registerConsumer(["incident", "change_task"], async (change) => {
        receivedMessages++;
        logger.info(`🎯 Received message ${receivedMessages}:`);
        logger.info(`   Type: ${change.type}, Action: ${change.action}`);
        logger.info(`   Number: ${change.number}, State: ${change.state}`);
        logger.info(`   Description: ${change.short_description}`);
      });

      // Start consumer in background
      const consumerPromise = this.testStream.startConsumer();

      // Wait for messages or timeout
      while (receivedMessages === 0 && (Date.now() - startTime) < maxWaitTime) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      if (receivedMessages > 0) {
        logger.info(`✅ Successfully consumed ${receivedMessages} messages`);
      } else {
        logger.warn("⚠️ No messages consumed (may be normal if stream is empty)");
      }

      // Stop consumer (this would typically run indefinitely)
      await this.testStream.close();

    } catch (error: unknown) {
      logger.error("❌ Message consumption failed:", error);
      throw error;
    }
  }

  async testSSEIntegration(): Promise<void> {
    try {
      logger.info("📡 Testing SSE integration capability...");

      let sseEvents = 0;

      // Register SSE event handler
      this.testStream.subscribe("ticket-updates", async (change) => {
        sseEvents++;
        logger.info(`📡 SSE Event ${sseEvents}: ${change.type}:${change.action} - ${change.number}`);
      });

      // Publish a test event
      await this.testStream.publishChange({
        type: "incident",
        action: "updated",
        sys_id: "test_sse_001",
        number: "INC0000002",
        state: "3",
        assignment_group: "Network Support",
        short_description: "Network connectivity restored",
        timestamp: new Date().toISOString(),
        data: { resolution_code: "Resolved" },
      });

      logger.info("✅ SSE integration test completed");

    } catch (error: unknown) {
      logger.error("❌ SSE integration test failed:", error);
      throw error;
    }
  }

  async testProductionStreams(): Promise<void> {
    try {
      logger.info("🏭 Testing production ServiceNow streams...");

      const health = await serviceNowStreams.healthCheck();

      if (health.status === "healthy") {
        logger.info("✅ Production streams healthy");

        const stats = await serviceNowStreams.getStreamStats();
        logger.info("📊 Production Stream Stats:");
        logger.info(`   Stream: ${stats.stream}`);
        logger.info(`   Messages: ${stats.length || 0}`);
        logger.info(`   Consumer Groups: ${stats.groups?.length || 0}`);
        logger.info(`   Registered Consumers: ${stats.registeredConsumers?.length || 0}`);

        if (stats.groups && stats.groups.length > 0) {
          stats.groups.forEach((group: any, index: number) => {
            logger.info(`   Group ${index + 1}: ${group.name} (${group.consumers} consumers, ${group.pending} pending)`);
          });
        }

      } else {
        logger.warn("⚠️ Production streams not healthy:", health.details);
      }

    } catch (error: unknown) {
      logger.error("❌ Production streams test failed:", error);
      // Don't throw - production streams might not be fully configured
    }
  }

  async runAllTests(): Promise<void> {
    try {
      logger.info("🚀 Starting Redis Streams comprehensive testing...");
      logger.info("=" * 80);

      await this.testBasicConnection();
      await this.testStreamInitialization();
      await this.testMessagePublishing();
      await this.testSSEIntegration();
      await this.testProductionStreams();

      logger.info("\n" + "=" * 80);
      logger.info("🎉 Redis Streams testing completed successfully!");

      // Note about message consumption
      logger.info("\nℹ️  Message consumption test skipped in this run");
      logger.info("   (would start infinite consumer loop)");
      logger.info("   To test consumption, run: bun scripts/start-redis-consumer.ts");

    } catch (error: unknown) {
      logger.error("❌ Redis Streams testing failed:", error);
      throw error;
    } finally {
      // Clean up test resources
      try {
        await this.testStream.close();
      } catch (error: unknown) {
        // Ignore cleanup errors
      }
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const test = new RedisStreamsTest();
  test.runAllTests().catch((error) => {
    logger.error("Test runner failed:", error);
    process.exit(1);
  });
}