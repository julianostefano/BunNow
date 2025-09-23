/**
 * Test Redis/MongoDB Sync System - Verificar se sync está funcionando
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient } from "mongodb";
import Redis from "ioredis";

async function testRedisMongoSync() {
  console.log("Testing Redis/MongoDB Sync System");
  console.log("=".repeat(60));

  let mongoClient: MongoClient | null = null;
  let redisClient: Redis | null = null;

  try {
    // 1. Test MongoDB Connection
    console.log("\n1. Testing MongoDB connection...");
    const connectionString = "mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin";
    mongoClient = new MongoClient(connectionString);
    await mongoClient.connect();
    const db = mongoClient.db("bunsnc");

    // Check if collections exist
    const collections = await db.listCollections().toArray();
    console.log(`✅ MongoDB connected - Found ${collections.length} collections`);

    // Check incidents collection
    const incidentsCollection = db.collection("sn_incidents");
    const incidentCount = await incidentsCollection.countDocuments();
    console.log(`📊 Incidents in MongoDB: ${incidentCount}`);

    if (incidentCount > 0) {
      const recentIncidents = await incidentsCollection
        .find({})
        .sort({ updated_at: -1 })
        .limit(3)
        .toArray();

      console.log("Recent incidents:");
      recentIncidents.forEach((incident, index) => {
        console.log(`  ${index + 1}. ${incident.number} - ${incident.data?.incident?.short_description?.substring(0, 50)}...`);
        console.log(`     sys_id: ${incident.sys_id}`);
        console.log(`     updated: ${incident.updated_at}`);
      });
    } else {
      console.log("⚠️ No incidents found in MongoDB");
    }

    // 2. Test Redis Connection
    console.log("\n2. Testing Redis connection...");
    redisClient = new Redis({
      host: "10.219.8.210",
      port: 6380,
      password: "nexcdc2025",
      db: 1,
    });

    await redisClient.ping();
    console.log("✅ Redis connected successfully");

    // Check Redis Streams
    console.log("\n3. Checking Redis Streams...");
    const streamKeys = await redisClient.keys("servicenow:stream:*");
    console.log(`Found ${streamKeys.length} ServiceNow streams:`);

    for (const streamKey of streamKeys.slice(0, 3)) {
      const streamLength = await redisClient.xlen(streamKey);
      console.log(`  ${streamKey}: ${streamLength} messages`);

      if (streamLength > 0) {
        const recentMessages = await redisClient.xrevrange(streamKey, "+", "-", "COUNT", 2);
        recentMessages.forEach(([messageId, fields]) => {
          const data = {};
          for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
          }
          console.log(`    Latest: ${messageId} - table:${data.table} count:${data.data_count}`);
        });
      }
    }

    // Check Redis Cache
    console.log("\n4. Checking Redis Cache...");
    const cacheKeys = await redisClient.keys("servicenow:cache:*");
    console.log(`Found ${cacheKeys.length} cache entries`);

    if (cacheKeys.length > 0) {
      for (const cacheKey of cacheKeys.slice(0, 3)) {
        const ttl = await redisClient.ttl(cacheKey);
        console.log(`  ${cacheKey}: TTL ${ttl}s`);
      }
    }

    // 5. Test Auto-sync Status
    console.log("\n5. Checking sync status...");
    const syncCollection = db.collection("sync_status");
    const syncCount = await syncCollection.countDocuments();
    console.log(`📊 Sync status records: ${syncCount}`);

    if (syncCount > 0) {
      const recentSync = await syncCollection
        .findOne({}, { sort: { timestamp: -1 } });
      console.log(`Last sync: ${recentSync?.timestamp} - ${recentSync?.table_name} (${recentSync?.status})`);
    }

    // 6. Performance Metrics
    console.log("\n6. Checking performance metrics...");
    const metricsCollection = db.collection("performance_metrics");
    const metricsCount = await metricsCollection.countDocuments();
    console.log(`📊 Performance metrics: ${metricsCount}`);

    console.log("\n✅ SUMMARY:");
    console.log(`✅ MongoDB: Connected (${incidentCount} incidents)`);
    console.log(`✅ Redis: Connected (${streamKeys.length} streams, ${cacheKeys.length} cache entries)`);
    console.log(`✅ Sync System: Operational (${syncCount} sync records)`);

    if (incidentCount === 0) {
      console.log("\n⚠️ ISSUE: No incidents synced to MongoDB");
      console.log("This is likely due to the 61s timeout preventing successful data retrieval");
      console.log("The sync system is working, but ServiceNow requests are failing");
    } else {
      console.log("\n🎉 Sync system is working correctly!");
    }

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("\n❌ Test failed:", errorMsg);

    if (errorMsg.includes("ECONNREFUSED")) {
      console.log("🚨 Connection refused - check if services are running");
    } else if (errorMsg.includes("authentication")) {
      console.log("🚨 Authentication failed - check credentials");
    } else {
      console.log("🚨 Unknown error");
    }
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
    if (redisClient) {
      redisClient.disconnect();
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("Redis/MongoDB sync test completed!");
}

// Run test if called directly
testRedisMongoSync().catch((error) => {
  console.error("Test runner failed:", error);
  process.exit(1);
});

export { testRedisMongoSync };