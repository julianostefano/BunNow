/**
 * BunSNC OpenTelemetry Instrumentation
 *
 * @description Clean Elysia OpenTelemetry configuration following 2025 best practices
 * @author Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * @company Ayesa - https://ayesa.com
 *
 * Features:
 * - Elysia native OpenTelemetry plugin
 * - OTLP exporter for Jaeger integration
 * - HTTP and GraphQL instrumentation
 * - Resource attributes following semantic conventions
 * - Production-ready configuration
 */

import { opentelemetry } from "@elysiajs/opentelemetry";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const isProduction = process.env.NODE_ENV === "production";
const serviceName = "BunSNC";
const serviceVersion = "1.0.0";

const jaegerOtlpURL =
  process.env.JAEGER_OTLP_URL || "http://10.219.8.210:4318/v1/traces";

console.log(
  `[OpenTelemetry] Initializing Elysia instrumentation for ${serviceName} v${serviceVersion}`,
);
console.log(`[OpenTelemetry] Jaeger OTLP endpoint: ${jaegerOtlpURL}`);
console.log(
  `[OpenTelemetry] Environment: ${isProduction ? "production" : "development"}`,
);

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: serviceVersion,
  "service.instance.id": `${serviceName}-${Date.now()}`,
  "deployment.environment": isProduction ? "production" : "development",
  "service.namespace": "bunsnc",
  "service.component": "backend-api",
  "telemetry.sdk.name": "opentelemetry",
  "telemetry.sdk.language": "typescript",
  "host.name": process.env.HOSTNAME || "localhost",
  "process.pid": process.pid,
  "process.runtime.name": "bun",
  "process.runtime.version": process.versions.bun || "unknown",
});

const otlpTraceExporter = new OTLPTraceExporter({
  url: jaegerOtlpURL,
  headers: {
    "Content-Type": "application/json",
  },
});

const batchSpanProcessor = new BatchSpanProcessor(otlpTraceExporter, {
  maxQueueSize: 2048,
  maxExportBatchSize: 512,
  scheduledDelayMillis: 1000,
  exportTimeoutMillis: 10000,
});

export const instrumentation = opentelemetry({
  serviceName,
  resource,
  spanProcessors: [batchSpanProcessor],
  instrumentations: [getNodeAutoInstrumentations()],
});

console.log("[OpenTelemetry] Elysia instrumentation initialized successfully");
console.log("[OpenTelemetry] Traces will be exported to Jaeger via OTLP");
