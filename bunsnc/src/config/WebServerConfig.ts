/**
 * Web Server Configuration Interface and Default Settings
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface WebServerConfig {
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

export const createWebServerConfig = (): WebServerConfig => ({
  port: parseInt(process.env.PORT || "3008"),
  jwtSecret:
    process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production",

  serviceNow: {
    instanceUrl:
      process.env.SERVICENOW_INSTANCE_URL || "https://dev12345.service-now.com",
    username: process.env.SERVICENOW_USERNAME || "admin",
    password: process.env.SERVICENOW_PASSWORD || "admin",
  },

  redis: {
    host: process.env.REDIS_HOST || "10.219.8.210",
    port: parseInt(process.env.REDIS_PORT || "6380"),
    password: process.env.REDIS_PASSWORD,
  },

  hadoop: {
    namenode: process.env.HADOOP_NAMENODE || "localhost",
    port: parseInt(process.env.HADOOP_PORT || "8020"),
    username: process.env.HADOOP_USERNAME || "hadoop",
  },

  opensearch: {
    host: process.env.OPENSEARCH_HOST || "10.219.8.210",
    port: parseInt(process.env.OPENSEARCH_PORT || "9200"),
    username: process.env.OPENSEARCH_USERNAME || "admin",
    password: process.env.OPENSEARCH_PASSWORD || "admin",
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
});

export default createWebServerConfig;
