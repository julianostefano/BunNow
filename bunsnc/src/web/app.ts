/**
 * Web Application Entry Point
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowWebServer } from "./server";

interface WebServerConfig {
  port: number;
  jwtSecret: string;
  serviceNow: {
    instanceUrl: string;
    username: string;
    password: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  hadoop: {
    namenode: string;
    port: number;
    username: string;
  };
  opensearch: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    ssl?: boolean;
  };
  parquet: {
    outputPath: string;
    compressionType: "snappy" | "gzip" | "lz4" | "none";
  };
  mongodb: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
}
import { dataService } from "../services";

const config: WebServerConfig = {
  port: 3008,
  jwtSecret:
    process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production",

  serviceNow: {
    instanceUrl:
      process.env.SERVICENOW_INSTANCE_URL || "https://dev12345.service-now.com",
    username: process.env.SERVICENOW_USERNAME || "admin",
    password: process.env.SERVICENOW_PASSWORD || "admin",
  },

  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
  },

  hadoop: {
    namenode: process.env.HADOOP_NAMENODE || "localhost",
    port: parseInt(process.env.HADOOP_PORT || "8020"),
    username: process.env.HADOOP_USERNAME || "hadoop",
  },

  opensearch: {
    host: process.env.OPENSEARCH_HOST || "localhost",
    port: parseInt(process.env.OPENSEARCH_PORT || "9200"),
    username: process.env.OPENSEARCH_USERNAME,
    password: process.env.OPENSEARCH_PASSWORD,
    ssl: process.env.OPENSEARCH_SSL === "true",
  },

  parquet: {
    outputPath: process.env.PARQUET_OUTPUT_PATH || "/tmp/parquet",
    compressionType: (process.env.PARQUET_COMPRESSION as any) || "snappy",
  },

  mongodb: {
    host: process.env.MONGODB_HOST || "10.219.8.210",
    port: parseInt(process.env.MONGODB_PORT || "27018"),
    username: process.env.MONGODB_USERNAME || "admin",
    password: process.env.MONGODB_PASSWORD || "Logica2011_",
    database: process.env.MONGODB_DATABASE || "bunsnc",
  },
};

// 🛡️ PHASE 2: Validate config immediately after creation
console.log("🔍 [Config Validation] Validating configuration values...");
console.log(`🔍 [Config Validation] ServiceNow instanceUrl:`);
console.log(`   - Type: ${typeof config.serviceNow.instanceUrl}`);
console.log(`   - Value: "${config.serviceNow.instanceUrl}"`);
console.log(`   - Length: ${config.serviceNow.instanceUrl?.length}`);
console.log(`🔍 [Config Validation] ServiceNow username:`);
console.log(`   - Type: ${typeof config.serviceNow.username}`);
console.log(`   - Value: "${config.serviceNow.username}"`);
console.log(`   - Length: ${config.serviceNow.username?.length}`);
console.log(`🔍 [Config Validation] ServiceNow password:`);
console.log(`   - Type: ${typeof config.serviceNow.password}`);
console.log(`   - Length: ${config.serviceNow.password?.length}`);

// Validate ServiceNow config
if (
  config.serviceNow.instanceUrl === undefined ||
  config.serviceNow.instanceUrl === null
) {
  throw new Error(
    `[Config Validation] SERVICENOW_INSTANCE_URL is ${config.serviceNow.instanceUrl}. Check your .env file.`,
  );
}

if (typeof config.serviceNow.instanceUrl !== "string") {
  throw new Error(
    `[Config Validation] SERVICENOW_INSTANCE_URL must be a string, received: ${typeof config.serviceNow.instanceUrl}. Value: ${JSON.stringify(config.serviceNow.instanceUrl)}`,
  );
}

if (config.serviceNow.instanceUrl.trim() === "") {
  throw new Error(
    `[Config Validation] SERVICENOW_INSTANCE_URL cannot be empty. Check your .env file.`,
  );
}

if (
  config.serviceNow.username === undefined ||
  config.serviceNow.username === null
) {
  throw new Error(
    `[Config Validation] SERVICENOW_USERNAME is ${config.serviceNow.username}. Check your .env file.`,
  );
}

if (typeof config.serviceNow.username !== "string") {
  throw new Error(
    `[Config Validation] SERVICENOW_USERNAME must be a string, received: ${typeof config.serviceNow.username}`,
  );
}

if (config.serviceNow.username.trim() === "") {
  throw new Error(
    `[Config Validation] SERVICENOW_USERNAME cannot be empty. Check your .env file.`,
  );
}

if (
  config.serviceNow.password === undefined ||
  config.serviceNow.password === null
) {
  throw new Error(
    `[Config Validation] SERVICENOW_PASSWORD is ${config.serviceNow.password}. Check your .env file.`,
  );
}

if (typeof config.serviceNow.password !== "string") {
  throw new Error(
    `[Config Validation] SERVICENOW_PASSWORD must be a string, received: ${typeof config.serviceNow.password}`,
  );
}

if (config.serviceNow.password.trim() === "") {
  throw new Error(
    `[Config Validation] SERVICENOW_PASSWORD cannot be empty. Check your .env file.`,
  );
}

console.log("✅ [Config Validation] All ServiceNow config values are valid!");

async function startWebInterface() {
  try {
    // ✅ Validate environment variables BEFORE starting server
    console.log(
      "🔍 [Startup Validation] Checking ServiceNow environment variables...",
    );

    const requiredEnvVars = {
      SERVICENOW_INSTANCE_URL: process.env.SERVICENOW_INSTANCE_URL,
      SERVICENOW_USERNAME: process.env.SERVICENOW_USERNAME,
      SERVICENOW_PASSWORD: process.env.SERVICENOW_PASSWORD,
    };

    const missingVars = Object.entries(requiredEnvVars)
      .filter(([key, value]) => !value || value.trim() === "")
      .map(([key]) => key);

    if (missingVars.length > 0) {
      console.error(
        "❌ [Startup Validation] Missing required environment variables:",
      );
      missingVars.forEach((varName) => {
        console.error(`   - ${varName}: "${requiredEnvVars[varName]}"`);
      });
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`,
      );
    }

    console.log(
      "✅ [Startup Validation] All ServiceNow environment variables present",
    );
    console.log(
      `   - Instance URL: ${requiredEnvVars.SERVICENOW_INSTANCE_URL}`,
    );
    console.log(`   - Username: ${requiredEnvVars.SERVICENOW_USERNAME}`);

    console.log(" Starting ServiceNow Web Interface...");
    console.log(` Configuration:`);
    console.log(`   - Port: ${config.port}`);
    console.log(`   - ServiceNow: ${config.serviceNow.instanceUrl}`);
    console.log(`   - Redis: ${config.redis.host}:${config.redis.port}`);
    console.log(`   - Hadoop: ${config.hadoop.namenode}:${config.hadoop.port}`);
    console.log(
      `   - OpenSearch: ${config.opensearch.host}:${config.opensearch.port}`,
    );
    console.log(
      `   - MongoDB: ${config.mongodb.host}:${config.mongodb.port}/${config.mongodb.database}`,
    );
    console.log(`   - Parquet Output: ${config.parquet.outputPath}`);
    console.log(
      `   - Jaeger OTLP: ${process.env.JAEGER_OTLP_URL || "http://10.219.8.210:4318/v1/traces"}`,
    );
    console.log(`   - OpenTelemetry Service: BunSNC v1.0.0`);

    // ✅ Create server first
    const server = new ServiceNowWebServer(config);
    await server.start();

    // Initialize MongoDB persistence AFTER server starts (to get ServiceNowStreams)
    console.log("🍃 Initializing MongoDB persistence...");
    const { serviceNowAuthClient } = await import(
      "../services/ServiceNowAuthClient"
    );
    const redisStreams = server.getWebServerController().getRedisStreams();
    await dataService.initialize(serviceNowAuthClient, redisStreams);

    console.log("");
    console.log(" ServiceNow Web Interface started successfully!");
    console.log("");
    console.log(" Available endpoints:");
    console.log(`   Dashboard: http://localhost:${config.port}`);
    console.log(
      `   Incidents: http://localhost:${config.port}/dashboard/incidents`,
    );
    console.log(`   API Docs:  http://localhost:${config.port}/swagger`);
    console.log(`   Health:    http://localhost:${config.port}/health`);
    console.log("");
    console.log("🔌 Real-time features:");
    console.log(`   SSE Stream: http://localhost:${config.port}/events/stream`);
    console.log(`   WebSocket:  ws://localhost:${config.port}/ws/control`);
    console.log("");
  } catch (error: unknown) {
    console.error(" Failed to start ServiceNow Web Interface:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
async function gracefulShutdown(signal: string) {
  console.log(
    ` Received ${signal}, shutting down ServiceNow Web Interface gracefully...`,
  );

  try {
    // Stop auto-sync service
    dataService.stopAutoSync();
    console.log("🍃 Auto-sync service stopped gracefully");

    // Close MongoDB connection
    if (dataService.client) {
      await dataService.client.close();
      console.log("🍃 MongoDB connection closed gracefully");
    }
  } catch (error: unknown) {
    console.error(" Error during shutdown:", error);
  }

  process.exit(0);
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

// Start the application
startWebInterface();
