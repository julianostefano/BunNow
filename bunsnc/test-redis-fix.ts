/**
 * Test Redis Plugin Fix - Temporary test server
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { redisPlugin } from "./src/plugins/redis";

const testApp = new Elysia({ name: "redis-test" })
  .use(redisPlugin)
  .get("/", ({ redis, redisCache, redisStreams }) => {
    console.log("✅ Redis Plugin DI Working!");
    console.log("✅ Primary Redis:", !!redis);
    console.log("✅ Cache Redis:", !!redisCache);
    console.log("✅ Streams Redis:", !!redisStreams);

    return {
      success: true,
      connections: {
        primary: !!redis,
        cache: !!redisCache,
        streams: !!redisStreams,
      },
      message: "Redis Plugin DI functioning correctly"
    };
  })
  .get("/health", async ({ healthCheckRedis }) => {
    const isHealthy = await healthCheckRedis();
    return {
      redis: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
    };
  })
  .listen(3010);

console.log("🧪 Redis Plugin Test Server running on http://localhost:3010");
console.log("📍 Test endpoints:");
console.log("   - GET /        - Test Redis DI");
console.log("   - GET /health  - Test Redis health");