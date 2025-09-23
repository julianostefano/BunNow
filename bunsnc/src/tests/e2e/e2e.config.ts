/**
 * End-to-End Testing Configuration
 * Centralized configuration for E2E test framework
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface E2ETestConfig {
  environment: "development" | "staging" | "production";
  timeout: {
    default: number;
    extended: number;
    critical: number;
  };
  retries: {
    maxAttempts: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
  performance: {
    thresholds: {
      responseTime: number;
      throughput: number;
      concurrentConnections: number;
    };
    benchmarks: {
      ticketCreation: number;
      ticketRetrieval: number;
      streamingLatency: number;
    };
  };
  serviceEndpoints: {
    servicenow: {
      baseUrl: string;
      timeout: number;
      retries: number;
    };
    mongodb: {
      connectionUrl: string;
      timeout: number;
      poolSize: number;
    };
    redis: {
      host: string;
      port: number;
      timeout: number;
    };
  };
  testData: {
    cleanup: boolean;
    dataPrefix: string;
    maxTestRecords: number;
    dataRetentionDays: number;
  };
}

export const E2E_CONFIG: E2ETestConfig = {
  environment: (process.env.NODE_ENV as any) || "development",

  timeout: {
    default: 30000, // 30 seconds
    extended: 60000, // 1 minute
    critical: 120000, // 2 minutes
  },

  retries: {
    maxAttempts: 3,
    backoffMultiplier: 2,
    initialDelay: 1000, // 1 second
  },

  performance: {
    thresholds: {
      responseTime: 5000, // 5 seconds max response time
      throughput: 100, // 100 operations per second
      concurrentConnections: 500, // 500 concurrent connections
    },
    benchmarks: {
      ticketCreation: 2000, // 2 seconds max for ticket creation
      ticketRetrieval: 1000, // 1 second max for ticket retrieval
      streamingLatency: 500, // 500ms max streaming latency
    },
  },

  serviceEndpoints: {
    servicenow: {
      baseUrl:
        process.env.SNC_INSTANCE_URL || "https://dev-instance.service-now.com",
      timeout: 15000,
      retries: 2,
    },
    mongodb: {
      connectionUrl:
        process.env.MONGODB_URL ||
        "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc_test?authSource=admin",
      timeout: 10000,
      poolSize: 10,
    },
    redis: {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      timeout: 5000,
    },
  },

  testData: {
    cleanup: process.env.E2E_CLEANUP !== "false",
    dataPrefix: "e2e-test",
    maxTestRecords: 1000,
    dataRetentionDays: 7,
  },
};

export interface TestScenario {
  name: string;
  description: string;
  category: "critical" | "workflow" | "performance" | "integration";
  priority: "high" | "medium" | "low";
  timeout?: number;
  retries?: number;
  prerequisites?: string[];
  teardown?: string[];
}

export const E2E_SCENARIOS: Record<string, TestScenario> = {
  ticketLifecycle: {
    name: "Complete Ticket Lifecycle",
    description: "End-to-end ticket creation, processing, and closure",
    category: "critical",
    priority: "high",
    timeout: E2E_CONFIG.timeout.default,
    prerequisites: ["serviceNowConnection", "streamingService"],
    teardown: ["cleanupTestTickets", "closeConnections"],
  },

  realtimeStreaming: {
    name: "Real-time Update Streaming",
    description:
      "Validate real-time ticket updates via multiple streaming protocols",
    category: "critical",
    priority: "high",
    timeout: E2E_CONFIG.timeout.default,
    prerequisites: ["redisConnection", "streamingService"],
    teardown: ["closeStreamConnections"],
  },

  hybridDataSync: {
    name: "Hybrid Data Synchronization",
    description: "MongoDB and ServiceNow data synchronization workflows",
    category: "integration",
    priority: "high",
    timeout: E2E_CONFIG.timeout.extended,
    prerequisites: ["mongodbConnection", "serviceNowConnection"],
    teardown: ["cleanupMongoDB", "cleanupServiceNow"],
  },

  helpdeskWorkflow: {
    name: "Help Desk Management Workflow",
    description:
      "Complete help desk ticket management from user request to resolution",
    category: "workflow",
    priority: "high",
    timeout: E2E_CONFIG.timeout.extended,
    prerequisites: ["serviceNowConnection", "streamingService", "userAccounts"],
    teardown: ["cleanupWorkflowData"],
  },

  incidentManagement: {
    name: "Critical Incident Management",
    description:
      "P1 incident escalation, war room coordination, and resolution",
    category: "workflow",
    priority: "high",
    timeout: E2E_CONFIG.timeout.critical,
    prerequisites: [
      "serviceNowConnection",
      "streamingService",
      "escalationChains",
    ],
    teardown: ["cleanupIncidentData", "resetEscalations"],
  },

  changeManagement: {
    name: "Change Request Approval Workflow",
    description:
      "Change request submission, CAB review, approval, and implementation",
    category: "workflow",
    priority: "medium",
    timeout: E2E_CONFIG.timeout.extended,
    prerequisites: ["serviceNowConnection", "approvalChains"],
    teardown: ["cleanupChangeRequests"],
  },

  performanceLoad: {
    name: "Performance Under Load",
    description:
      "System performance validation under concurrent load scenarios",
    category: "performance",
    priority: "medium",
    timeout: E2E_CONFIG.timeout.critical,
    prerequisites: ["allServices"],
    teardown: ["cleanupLoadTestData", "resetConnections"],
  },

  systemResilience: {
    name: "System Resilience and Recovery",
    description: "Error handling, failover, and recovery scenario testing",
    category: "critical",
    priority: "high",
    timeout: E2E_CONFIG.timeout.extended,
    prerequisites: ["allServices", "mockFailureScenarios"],
    teardown: ["restoreServices", "cleanupFailureTests"],
  },
};

export interface E2ETestMetrics {
  executionTime: number;
  operationsPerSecond: number;
  connectionCount: number;
  memoryUsage: number;
  errorRate: number;
  successRate: number;
}

export class E2ETestRunner {
  private metrics: Map<string, E2ETestMetrics> = new Map();
  private startTime: number = 0;

  startTest(scenarioName: string): void {
    this.startTime = performance.now();
    console.log(` Starting E2E Test: ${scenarioName}`);
  }

  endTest(
    scenarioName: string,
    operations: number,
    errors: number = 0,
  ): E2ETestMetrics {
    const endTime = performance.now();
    const executionTime = endTime - this.startTime;
    const operationsPerSecond = (operations / executionTime) * 1000;
    const successRate = ((operations - errors) / operations) * 100;
    const errorRate = (errors / operations) * 100;

    const metrics: E2ETestMetrics = {
      executionTime,
      operationsPerSecond,
      connectionCount: 0, // To be set by specific tests
      memoryUsage: 0, // To be set by specific tests
      errorRate,
      successRate,
    };

    this.metrics.set(scenarioName, metrics);

    console.log(` E2E Test Completed: ${scenarioName}`);
    console.log(`   Execution Time: ${executionTime.toFixed(2)}ms`);
    console.log(`   Operations/sec: ${operationsPerSecond.toFixed(2)}`);
    console.log(`   Success Rate: ${successRate.toFixed(2)}%`);

    return metrics;
  }

  getMetrics(
    scenarioName?: string,
  ): E2ETestMetrics | Map<string, E2ETestMetrics> {
    if (scenarioName) {
      return this.metrics.get(scenarioName) || ({} as E2ETestMetrics);
    }
    return this.metrics;
  }

  generateReport(): string {
    const report = [];
    report.push("=".repeat(60));
    report.push("E2E TEST EXECUTION REPORT");
    report.push("=".repeat(60));
    report.push("");

    this.metrics.forEach((metrics, scenario) => {
      report.push(`Scenario: ${scenario}`);
      report.push(`  Execution Time: ${metrics.executionTime.toFixed(2)}ms`);
      report.push(
        `  Operations/sec: ${metrics.operationsPerSecond.toFixed(2)}`,
      );
      report.push(`  Success Rate: ${metrics.successRate.toFixed(2)}%`);
      report.push(`  Error Rate: ${metrics.errorRate.toFixed(2)}%`);
      report.push("");
    });

    const avgExecutionTime =
      Array.from(this.metrics.values()).reduce(
        (sum, m) => sum + m.executionTime,
        0,
      ) / this.metrics.size;
    const avgSuccessRate =
      Array.from(this.metrics.values()).reduce(
        (sum, m) => sum + m.successRate,
        0,
      ) / this.metrics.size;

    report.push("SUMMARY");
    report.push("-------");
    report.push(`Total Scenarios: ${this.metrics.size}`);
    report.push(`Average Execution Time: ${avgExecutionTime.toFixed(2)}ms`);
    report.push(`Average Success Rate: ${avgSuccessRate.toFixed(2)}%`);
    report.push("");
    report.push("=".repeat(60));

    return report.join("\n");
  }
}

export const testRunner = new E2ETestRunner();

export interface MockServiceConfig {
  servicenow: {
    responseDelay: number;
    failureRate: number;
    enableFailureSimulation: boolean;
  };
  mongodb: {
    connectionDelay: number;
    queryDelay: number;
    enableSlowQueries: boolean;
  };
  redis: {
    publishDelay: number;
    connectionDropRate: number;
    enableLatencySimulation: boolean;
  };
}

export const MOCK_CONFIG: MockServiceConfig = {
  servicenow: {
    responseDelay: parseInt(process.env.MOCK_SNC_DELAY || "100"),
    failureRate: parseFloat(process.env.MOCK_SNC_FAILURE_RATE || "0.01"),
    enableFailureSimulation: process.env.MOCK_SNC_FAILURES === "true",
  },
  mongodb: {
    connectionDelay: parseInt(process.env.MOCK_MONGO_DELAY || "50"),
    queryDelay: parseInt(process.env.MOCK_MONGO_QUERY_DELAY || "75"),
    enableSlowQueries: process.env.MOCK_MONGO_SLOW_QUERIES === "true",
  },
  redis: {
    publishDelay: parseInt(process.env.MOCK_REDIS_DELAY || "25"),
    connectionDropRate: parseFloat(process.env.MOCK_REDIS_DROP_RATE || "0.005"),
    enableLatencySimulation: process.env.MOCK_REDIS_LATENCY === "true",
  },
};

export default E2E_CONFIG;
