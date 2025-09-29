/**
 * Test Utilities - Helper Functions for E2E Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Provides common test setup, teardown, and utility functions
 */

import type { Elysia } from "elysia";

export interface TestServerConfig {
  port: number;
  host?: string;
}

export class TestServer {
  private server: any;
  private app: Elysia;
  private config: TestServerConfig;

  constructor(app: Elysia, config: TestServerConfig) {
    this.app = app;
    this.config = config;
  }

  async start(): Promise<void> {
    this.server = this.app.listen(this.config.port);
    await this.waitForReady();
  }

  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  private async waitForReady(timeout: number = 5000): Promise<void> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(this.getUrl("/health"));
        if (response.ok) return;
      } catch (error) {
        // Server not ready yet
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    throw new Error(`Test server failed to start within ${timeout}ms`);
  }

  getUrl(path: string = ""): string {
    const host = this.config.host || "localhost";
    return `http://${host}:${this.config.port}${path}`;
  }

  async get(path: string, options?: RequestInit): Promise<Response> {
    return fetch(this.getUrl(path), {
      method: "GET",
      ...options
    });
  }

  async post(path: string, body?: any, options?: RequestInit): Promise<Response> {
    return fetch(this.getUrl(path), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      },
      body: body ? JSON.stringify(body) : undefined,
      ...options
    });
  }

  async put(path: string, body?: any, options?: RequestInit): Promise<Response> {
    return fetch(this.getUrl(path), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers
      },
      body: body ? JSON.stringify(body) : undefined,
      ...options
    });
  }

  async delete(path: string, options?: RequestInit): Promise<Response> {
    return fetch(this.getUrl(path), {
      method: "DELETE",
      ...options
    });
  }
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const timeout = options.timeout || 5000;
  const interval = options.interval || 100;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const result = await condition();
    if (result) return;

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

export async function retryAsync<T>(
  fn: () => Promise<T>,
  options: { retries?: number; delay?: number } = {}
): Promise<T> {
  const retries = options.retries || 3;
  const delay = options.delay || 1000;

  let lastError: any;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

export function expectJsonResponse(response: Response): void {
  const contentType = response.headers.get("content-type");

  if (!contentType || !contentType.includes("application/json")) {
    throw new Error(`Expected JSON response, got: ${contentType}`);
  }
}

export async function expectSuccessResponse(response: Response): Promise<any> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Expected success response, got ${response.status}: ${text}`);
  }

  expectJsonResponse(response);

  const data = await response.json();

  if (data.success === false) {
    throw new Error(`Response indicates failure: ${JSON.stringify(data)}`);
  }

  return data;
}

export function generateUniqueId(prefix: string = "test"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function measurePerformance<T>(
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  const result = await fn();
  const duration = Date.now() - start;

  return { result, duration };
}

export function createMockRequestBody(template: any, overrides: any = {}): any {
  return {
    ...template,
    ...overrides,
    _timestamp: new Date().toISOString()
  };
}

export class TestMetrics {
  private metrics: Map<string, number[]> = new Map();

  record(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }

    this.metrics.get(name)!.push(value);
  }

  getAverage(name: string): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;

    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  getMin(name: string): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;

    return Math.min(...values);
  }

  getMax(name: string): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;

    return Math.max(...values);
  }

  getPercentile(name: string, percentile: number): number {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;

    return sorted[Math.max(0, index)];
  }

  report(): Record<string, any> {
    const report: Record<string, any> = {};

    for (const [name, values] of this.metrics.entries()) {
      report[name] = {
        count: values.length,
        avg: this.getAverage(name),
        min: this.getMin(name),
        max: this.getMax(name),
        p50: this.getPercentile(name, 50),
        p95: this.getPercentile(name, 95),
        p99: this.getPercentile(name, 99)
      };
    }

    return report;
  }

  clear(): void {
    this.metrics.clear();
  }
}

export function isCI(): boolean {
  return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
}

export function skipInCI(reason: string): boolean {
  if (isCI()) {
    console.log(`⚠️ Skipping test in CI: ${reason}`);
    return true;
  }

  return false;
}