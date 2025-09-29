/**
 * Test Fixtures - Sample Data for E2E Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Provides consistent test data for E2E testing
 */

export const testIncidents = [
  {
    sys_id: "test_inc_001",
    number: "INC0010001",
    short_description: "Test incident - Network connectivity issue",
    description: "User reports intermittent network connectivity in building A",
    state: "new",
    priority: "2",
    assigned_to: "test.analyst1",
    assignment_group: "Network Support",
    sys_created_on: "2025-09-29T08:00:00Z",
    sys_updated_on: "2025-09-29T08:00:00Z"
  },
  {
    sys_id: "test_inc_002",
    number: "INC0010002",
    short_description: "Test incident - Application error",
    description: "Critical application showing 500 error for all users",
    state: "in_progress",
    priority: "1",
    assigned_to: "test.analyst2",
    assignment_group: "Application Support",
    sys_created_on: "2025-09-29T09:00:00Z",
    sys_updated_on: "2025-09-29T09:30:00Z"
  },
  {
    sys_id: "test_inc_003",
    number: "INC0010003",
    short_description: "Test incident - Password reset request",
    description: "User forgot password and needs reset",
    state: "resolved",
    priority: "3",
    assigned_to: "test.analyst3",
    assignment_group: "Service Desk",
    sys_created_on: "2025-09-28T14:00:00Z",
    sys_updated_on: "2025-09-28T14:15:00Z"
  }
];

export const testAttachments = [
  {
    sys_id: "test_att_001",
    file_name: "network-diagram.pdf",
    size_bytes: 204800,
    content_type: "application/pdf",
    table_name: "incident",
    table_sys_id: "test_inc_001",
    sys_created_on: "2025-09-29T08:05:00Z"
  },
  {
    sys_id: "test_att_002",
    file_name: "error-screenshot.png",
    size_bytes: 153600,
    content_type: "image/png",
    table_name: "incident",
    table_sys_id: "test_inc_002",
    sys_created_on: "2025-09-29T09:10:00Z"
  }
];

export const testKnowledgeGraph = {
  nodes: [
    {
      sys_id: "kg_node_001",
      name: "Database Server",
      type: "infrastructure",
      technologies: ["PostgreSQL", "Linux"],
      description: "Primary database server for application"
    },
    {
      sys_id: "kg_node_002",
      name: "Web Application",
      type: "application",
      technologies: ["React", "TypeScript", "Elysia"],
      description: "Main web application frontend"
    },
    {
      sys_id: "kg_node_003",
      name: "API Gateway",
      type: "infrastructure",
      technologies: ["Nginx", "Docker"],
      description: "API gateway for microservices"
    }
  ],
  edges: [
    {
      source: "kg_node_002",
      target: "kg_node_003",
      relationship: "connects_to",
      weight: 10
    },
    {
      source: "kg_node_003",
      target: "kg_node_001",
      relationship: "queries",
      weight: 20
    }
  ]
};

export const testConfiguration = {
  servicenow: {
    instanceUrl: "https://test.service-now.com",
    username: "test.user",
    password: "test.password",
    clientId: "test_client_id",
    clientSecret: "test_client_secret"
  },
  mongodb: {
    host: process.env.MONGODB_HOST || "localhost",
    port: parseInt(process.env.MONGODB_PORT || "27017"),
    database: "test_bunsnc",
    username: process.env.MONGODB_USERNAME || "root",
    password: process.env.MONGODB_PASSWORD || "example"
  },
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    db: 15 // Use separate DB for tests
  },
  jwtSecret: "test_jwt_secret_key_for_e2e_testing"
};

export const testUsers = [
  {
    sys_id: "test_user_001",
    username: "test.analyst1",
    name: "Test Analyst 1",
    email: "test.analyst1@example.com",
    role: "analyst",
    active: true
  },
  {
    sys_id: "test_user_002",
    username: "test.analyst2",
    name: "Test Analyst 2",
    email: "test.analyst2@example.com",
    role: "analyst",
    active: true
  },
  {
    sys_id: "test_user_003",
    username: "test.admin",
    name: "Test Admin",
    email: "test.admin@example.com",
    role: "admin",
    active: true
  }
];

export const testGroups = [
  {
    sys_id: "test_group_001",
    name: "Network Support",
    description: "Network infrastructure support team",
    manager: "test_user_001"
  },
  {
    sys_id: "test_group_002",
    name: "Application Support",
    description: "Application development and support team",
    manager: "test_user_002"
  },
  {
    sys_id: "test_group_003",
    name: "Service Desk",
    description: "First-line support service desk",
    manager: "test_user_003"
  }
];

// Factory functions for creating test data
export function createTestIncident(overrides?: Partial<typeof testIncidents[0]>) {
  return {
    ...testIncidents[0],
    sys_id: `test_inc_${Date.now()}`,
    number: `INC${Date.now()}`,
    sys_created_on: new Date().toISOString(),
    sys_updated_on: new Date().toISOString(),
    ...overrides
  };
}

export function createTestAttachment(overrides?: Partial<typeof testAttachments[0]>) {
  return {
    ...testAttachments[0],
    sys_id: `test_att_${Date.now()}`,
    sys_created_on: new Date().toISOString(),
    ...overrides
  };
}

export function createTestKnowledgeNode(overrides?: Partial<typeof testKnowledgeGraph.nodes[0]>) {
  return {
    ...testKnowledgeGraph.nodes[0],
    sys_id: `kg_node_${Date.now()}`,
    ...overrides
  };
}