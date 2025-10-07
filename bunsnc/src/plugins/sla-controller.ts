/**
 * SLA Controller Plugin - Singleton Lazy Loading Pattern v5.6.1
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-3): Standardize service instantiation patterns
 * - Implements Singleton Lazy Loading Pattern
 * - Provides ContractualSLAService, EnhancedMetricsService, ContractualViolationService
 * - Eliminates per-request service instantiation
 *
 * Reference: docs/reports/BUNSNC_ELYSIA_ASSESSMENT_v1.0.md - HIGH-3
 */

import { Elysia } from "elysia";
import { MongoClient } from "mongodb";
import { ContractualSLAService } from "../services/ContractualSLAService";
import { EnhancedMetricsService } from "../services/EnhancedMetricsService";
import { ContractualViolationService } from "../services/ContractualViolationService";
import { logger } from "../utils/Logger";

// Singleton instances (Lazy Loading Pattern v5.6.1)
let _slaServiceSingleton: ContractualSLAService | null = null;
let _metricsServiceSingleton: EnhancedMetricsService | null = null;
let _violationServiceSingleton: ContractualViolationService | null = null;
let _mongoClientSingleton: MongoClient | null = null;

/**
 * Get SLA services with singleton lazy loading
 * Only initializes on first call, reuses across all requests
 */
const getSLAServices = async () => {
  if (_slaServiceSingleton && _metricsServiceSingleton && _violationServiceSingleton) {
    return {
      contractualSLAService: _slaServiceSingleton,
      enhancedMetricsService: _metricsServiceSingleton,
      contractualViolationService: _violationServiceSingleton,
    };
  }

  logger.info("📦 [SLA Plugin] Creating SLA services (SINGLETON - first initialization)");

  // Initialize MongoDB client (singleton)
  if (!_mongoClientSingleton) {
    const mongoUrl = process.env.MONGODB_URL || "mongodb://localhost:27018";
    const databaseName = process.env.MONGODB_DATABASE || "bunsnc";

    _mongoClientSingleton = new MongoClient(mongoUrl);
    await _mongoClientSingleton.connect();
    logger.info(`✅ [SLA Plugin] MongoDB connected to ${mongoUrl}`);

    // Create and initialize services
    _slaServiceSingleton = ContractualSLAService.getInstance(
      _mongoClientSingleton,
      databaseName,
    );
    await _slaServiceSingleton.initialize();

    _metricsServiceSingleton = EnhancedMetricsService.getInstance(
      _mongoClientSingleton,
      databaseName,
      _slaServiceSingleton,
    );

    _violationServiceSingleton = ContractualViolationService.getInstance(
      _mongoClientSingleton,
      databaseName,
      _slaServiceSingleton,
    );
    await _violationServiceSingleton.initialize();

    logger.info("✅ [SLA Plugin] All SLA services initialized (SINGLETON - reused across all requests)");
  }

  return {
    contractualSLAService: _slaServiceSingleton!,
    enhancedMetricsService: _metricsServiceSingleton!,
    contractualViolationService: _violationServiceSingleton!,
  };
};

/**
 * SLA Plugin - Provides SLA services via dependency injection
 *
 * Usage:
 * ```typescript
 * app.use(slaPlugin)
 *   .get("/incidents/:id/violation", async ({
 *     params,
 *     contractualViolationService
 *   }) => {
 *     const result = await contractualViolationService.validateContractualViolation(params.id);
 *     return result;
 *   });
 * ```
 */
export const slaPlugin = new Elysia({ name: "sla-controller" })
  .derive(async function getSLAContext() {
    return await getSLAServices();
  })
  .as("global");
