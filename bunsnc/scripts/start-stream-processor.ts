/**
 * Start Stream Processor - Inicia processamento Redis Streams
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { streamHandler } from "../src/services/streaming/StreamHandler";
import { logger } from "../src/utils/Logger";

export class StreamProcessorStarter {
  async start(): Promise<void> {
    try {
      logger.info("🚀 Starting ServiceNow Stream Processor...");
      logger.info("=" * 60);

      logger.info("📋 Configuration:");
      logger.info(`   Redis Host: ${process.env.REDIS_HOST || "10.219.8.210"}`);
      logger.info(`   Redis Port: ${process.env.REDIS_PORT || "6380"}`);
      logger.info(`   Stream Key: ${process.env.REDIS_STREAMS_KEY || "servicenow:changes"}`);

      await streamHandler.initialize();

      const healthStatus = await streamHandler.getHealthStatus();

      if (!healthStatus.healthy) {
        logger.error("❌ Stream processor health check failed");
        logger.error("   Redis Connection:", healthStatus.redisConnection ? "✅" : "❌");
        process.exit(1);
      }

      logger.info("✅ Health check passed");
      logger.info("   Redis Connection: ✅");
      logger.info("   Stream Processing: ✅");

      logger.info("\n🎯 Starting stream consumer...");
      logger.info("   Monitoring: incidents, change_tasks, sc_tasks");
      logger.info("   Press Ctrl+C to stop\n");

      process.on("SIGINT", async () => {
        logger.info("\n🛑 Received SIGINT, shutting down gracefully...");
        await streamHandler.stop();
        process.exit(0);
      });

      process.on("SIGTERM", async () => {
        logger.info("\n🛑 Received SIGTERM, shutting down gracefully...");
        await streamHandler.stop();
        process.exit(0);
      });

      await streamHandler.start();

    } catch (error: unknown) {
      logger.error("❌ Failed to start stream processor:", error);
      process.exit(1);
    }
  }
}

if (require.main === module) {
  const starter = new StreamProcessorStarter();
  starter.start().catch((error) => {
    logger.error("Stream processor startup failed:", error);
    process.exit(1);
  });
}