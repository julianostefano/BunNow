# BunSNC Testing Guide

**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**
**Version: v5.4.3**
**Date: 29/09/2025**

---

## Overview

This guide covers the complete testing strategy for BunSNC, including unit tests, integration tests, E2E tests, and CI/CD pipeline execution.

---

## Testing Architecture

### Test Types

1. **Unit Tests** - Test individual plugins and components
2. **Integration Tests** - Test plugin composition and interactions
3. **E2E Tests** - Test complete user flows with real infrastructure
4. **Contract Tests** - Type-safe API testing with Eden Treaty

### Test Structure

```
bunsnc/tests/
├── plugin-integration.test.ts      # Integration tests for plugins
├── e2e/
│   ├── plugins-e2e.test.ts         # E2E tests for all 10 plugins
│   ├── eden-treaty-e2e.test.ts     # Type-safe API client tests
│   └── service-locator-e2e.test.ts # Dependency injection tests
├── mocks/
│   └── servicenow-mock.ts          # Mock ServiceNow API
├── fixtures/
│   └── test-data.ts                # Test data fixtures
└── utils/
    └── test-helpers.ts             # Test utility functions
```

---

## Running Tests Locally

### Prerequisites

- **Bun** >=1.0.0 installed
- **MongoDB** running (optional, tests use mocks)
- **Redis** running (optional, tests use mocks)

### Quick Start

```bash
cd bunsnc

# Run all tests
bun test

# Run specific test file
bun test tests/plugin-integration.test.ts

# Run E2E tests
bun test tests/e2e/

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

### Environment Variables

```bash
# MongoDB configuration
export MONGODB_HOST=localhost
export MONGODB_PORT=27017
export MONGODB_USERNAME=root
export MONGODB_PASSWORD=example

# Redis configuration
export REDIS_HOST=localhost
export REDIS_PORT=6379

# ServiceNow (optional, uses mocks by default)
export SERVICENOW_INSTANCE_URL=https://your-instance.service-now.com
export SERVICENOW_USERNAME=your-username
export SERVICENOW_PASSWORD=your-password
```

---

## E2E Testing

### Plugin E2E Tests

Tests all 10 Elysia plugins in production-like environment:

```bash
bun test tests/e2e/plugins-e2e.test.ts
```

**Tests:**
- Config Manager initialization
- MongoDB controller connection
- Redis cache controller
- Sync controller operations
- Health monitoring
- Service Locator dependency injection
- API Controller (10 endpoints)
- Ticket Controller (6 endpoints)
- Attachment Controller (7 endpoints)
- Knowledge Graph Controller (5 endpoints)

### Eden Treaty E2E Tests

Type-safe API client testing:

```bash
bun test tests/e2e/eden-treaty-e2e.test.ts
```

**Tests:**
- TypeBox schema validation
- Type-safe response handling
- Contract testing (client ↔ server)
- Error handling with types

### Service Locator E2E Tests

Dependency injection validation:

```bash
bun test tests/e2e/service-locator-e2e.test.ts
```

**Tests:**
- Service registration
- Dependency resolution order
- Service composition
- Graceful degradation
- Plugin loading order

---

## GitHub Actions CI/CD

### Workflow: `bunsnc-ci.yaml`

Automated CI/CD pipeline runs on:
- Push to `main` or `develop` branches
- Pull requests to `main`

### Pipeline Stages

#### 1. Lint and Type Check
```yaml
jobs:
  lint-and-typecheck:
    - TypeScript type checking
    - Prettier format check
    - ESLint linting
```

#### 2. Unit Tests
```yaml
jobs:
  unit-tests:
    - Plugin integration tests
    - Individual plugin tests
```

#### 3. E2E Tests with Infrastructure
```yaml
jobs:
  e2e-tests:
    services:
      - MongoDB 7.0
      - Redis 7.4
    tests:
      - Plugin E2E tests
      - Eden Treaty tests
      - Service Locator tests
```

#### 4. Build CLI Binary
```yaml
jobs:
  build:
    - Compile CLI binary
    - Test binary execution
    - Upload artifacts
```

#### 5. Test Coverage
```yaml
jobs:
  test-coverage:
    - Generate coverage report
    - Upload to Codecov
```

### Viewing CI/CD Results

[![CI/CD Pipeline](https://github.com/julianostefano/BunNow/actions/workflows/bunsnc-ci.yaml/badge.svg)](https://github.com/julianostefano/BunNow/actions/workflows/bunsnc-ci.yaml)

**GitHub Actions Dashboard:**
1. Go to repository on GitHub
2. Click "Actions" tab
3. Select "BunSNC CI/CD Pipeline" workflow
4. View run details and logs

---

## Writing Tests

### Unit Test Example

```typescript
import { describe, test, expect } from "bun:test";
import { myPlugin } from "../src/plugins/my-plugin";

describe("My Plugin", () => {
  test("should initialize correctly", () => {
    expect(myPlugin).toBeDefined();
  });
});
```

### E2E Test Example

```typescript
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { TestServer } from "../utils/test-helpers";

describe("My Feature E2E", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = new TestServer(app, { port: 4000 });
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  test("should handle request", async () => {
    const response = await server.get("/api/endpoint");
    expect(response.ok).toBe(true);
  });
});
```

### Using Mock Data

```typescript
import { mockServiceNow } from "../mocks/servicenow-mock";
import { testIncidents } from "../fixtures/test-data";

test("should use mock data", () => {
  const incidents = mockServiceNow.getIncidents();
  expect(incidents).toHaveLength(3);
});
```

---

## Testing Best Practices

### 1. Isolation
- Each test should be independent
- Use `beforeEach`/`afterEach` for cleanup
- Don't rely on test execution order

### 2. Determinism
- Avoid flaky tests with proper waits
- Use `waitFor()` helper for async conditions
- Don't use fixed delays

### 3. Descriptive Names
```typescript
// ❌ Bad
test("test 1", () => { ... });

// ✅ Good
test("should return 404 for non-existent resource", () => { ... });
```

### 4. Arrange-Act-Assert
```typescript
test("should create incident", async () => {
  // Arrange
  const incidentData = createTestIncident();

  // Act
  const response = await server.post("/api/incidents", incidentData);

  // Assert
  expect(response.ok).toBe(true);
  const data = await response.json();
  expect(data.result.sys_id).toBeDefined();
});
```

### 5. Test Coverage
- Aim for ≥80% coverage
- Focus on critical paths
- Test edge cases and error handling

---

## Debugging Tests

### Failed Test Investigation

```bash
# Run specific test with verbose output
bun test tests/e2e/plugins-e2e.test.ts --verbose

# Run single test case
bun test tests/e2e/plugins-e2e.test.ts -t "should connect to MongoDB"

# Enable debug logs
DEBUG=* bun test tests/e2e/plugins-e2e.test.ts
```

### Common Issues

**1. Port Already in Use**
```bash
# Kill process on port
lsof -ti:4000 | xargs kill -9
```

**2. MongoDB/Redis Not Available**
```bash
# Start services with Docker
docker run -d -p 27017:27017 mongo:7.0
docker run -d -p 6379:6379 redis:7.4-alpine
```

**3. Test Timeout**
```typescript
// Increase timeout for slow tests
test("slow operation", async () => {
  // ...
}, { timeout: 30000 }); // 30 seconds
```

---

## Performance Testing

### Benchmarking

```typescript
import { measurePerformance, TestMetrics } from "../utils/test-helpers";

const metrics = new TestMetrics();

test("should benchmark endpoint", async () => {
  const { duration } = await measurePerformance(async () => {
    return await server.get("/api/health");
  });

  metrics.record("health_endpoint", duration);
  expect(duration).toBeLessThan(100); // Should respond in < 100ms
});
```

### Load Testing

```bash
# Install k6 (optional)
brew install k6

# Run load test
k6 run scripts/load-test.js
```

---

## CI/CD Troubleshooting

### GitHub Actions Failures

**Check Workflow Logs:**
1. Go to Actions tab
2. Select failed run
3. Expand failed step
4. Review error messages

**Common CI Failures:**

1. **Dependency Installation Failed**
   - Check `bun.lockb` is committed
   - Verify `package.json` syntax

2. **Test Failures**
   - Run tests locally first
   - Check environment variables
   - Verify service availability

3. **Build Failures**
   - Check TypeScript errors
   - Verify import paths
   - Check tsconfig.json

### Re-running Failed Jobs

GitHub Actions UI → Click "Re-run failed jobs"

---

## Test Metrics

### Current Coverage

- **Unit Tests:** 16/16 passing (100%)
- **E2E Tests:** New in v5.4.3
- **Coverage:** Target ≥80%

### Performance Benchmarks

- Health endpoint: < 100ms
- API endpoints average: < 200ms
- Concurrent requests: 5+ simultaneous

---

## Contributing

### Adding New Tests

1. Create test file in appropriate directory
2. Follow naming convention: `*.test.ts`
3. Use existing fixtures and mocks
4. Run tests locally before committing

### Test Review Checklist

- [ ] Tests are isolated and deterministic
- [ ] Descriptive test names
- [ ] Proper cleanup in afterEach/afterAll
- [ ] No hardcoded timeouts
- [ ] Uses test helpers and fixtures
- [ ] Passes in CI/CD

---

## Resources

- [Bun Test Documentation](https://bun.sh/docs/cli/test)
- [Elysia Testing Guide](https://elysiajs.com/patterns/testing.html)
- [GitHub Actions Docs](https://docs.github.com/en/actions)

---

**Last Updated:** v5.4.3 - 29/09/2025