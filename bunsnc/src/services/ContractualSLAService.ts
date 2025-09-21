/**
 * Contractual SLA Service - Manages SLA data and compliance calculations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Collection, MongoClient } from "mongodb";
import { logger } from "../utils/Logger";
import {
  ContractualSLA,
  TicketType,
  MetricType,
  SLAPriority,
  SLAComplianceResult,
  BusinessHoursConfig,
  DEFAULT_BUSINESS_HOURS,
  SLACalculationOptions,
} from "../types/ContractualSLA";

export class ContractualSLAService {
  private static instance: ContractualSLAService;
  private collection: Collection<ContractualSLA>;
  private cache: Map<string, ContractualSLA[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  constructor(
    private mongoClient: MongoClient,
    private databaseName: string,
  ) {
    this.collection = this.mongoClient
      .db(this.databaseName)
      .collection<ContractualSLA>("sn_sla_contratado");
  }

  static getInstance(
    mongoClient?: MongoClient,
    databaseName?: string,
  ): ContractualSLAService {
    if (!ContractualSLAService.instance && mongoClient && databaseName) {
      ContractualSLAService.instance = new ContractualSLAService(
        mongoClient,
        databaseName,
      );
    }
    return ContractualSLAService.instance;
  }

  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    try {
      logger.info(" [ContractualSLA] Initializing service...");

      // Pre-warm cache with all SLA data
      await this.loadAllSLAs();

      logger.info(" [ContractualSLA] Service initialized successfully");
    } catch (error) {
      logger.error(" [ContractualSLA] Failed to initialize:", error);
      throw error;
    }
  }

  /**
   * Get SLA configuration for specific ticket type, priority and metric
   */
  async getSLA(
    ticketType: TicketType,
    priority: SLAPriority,
    metricType: MetricType,
  ): Promise<ContractualSLA | null> {
    try {
      const cacheKey = `${ticketType}-${priority}-${metricType}`;

      // Try cache first
      const cachedResult = this.getCachedSLA(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      // Query database
      const sla = await this.collection.findOne({
        ticket_type: ticketType,
        priority: priority,
        metric_type: metricType,
      });

      // Cache the result
      if (sla) {
        this.setCacheSLA(cacheKey, [sla]);
      }

      return sla;
    } catch (error) {
      logger.error(
        ` [ContractualSLA] Error getting SLA for ${ticketType}-${priority}-${metricType}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Get all SLAs for a specific ticket type
   */
  async getSLAsForTicketType(
    ticketType: TicketType,
  ): Promise<ContractualSLA[]> {
    try {
      const cacheKey = `type-${ticketType}`;

      // Check cache first
      const cachedResult = this.getCachedSLA(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      // Query database
      const slas = await this.collection
        .find({ ticket_type: ticketType })
        .toArray();

      // Cache the result
      this.setCacheSLA(cacheKey, slas);

      return slas;
    } catch (error) {
      logger.error(
        ` [ContractualSLA] Error getting SLAs for ticket type ${ticketType}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Get all SLAs for a specific metric type
   */
  async getSLAsForMetricType(
    metricType: MetricType,
  ): Promise<ContractualSLA[]> {
    try {
      const cacheKey = `metric-${metricType}`;

      // Check cache first
      const cachedResult = this.getCachedSLA(cacheKey);
      if (cachedResult) {
        return cachedResult;
      }

      // Query database
      const slas = await this.collection
        .find({ metric_type: metricType })
        .toArray();

      // Cache the result
      this.setCacheSLA(cacheKey, slas);

      return slas;
    } catch (error) {
      logger.error(
        ` [ContractualSLA] Error getting SLAs for metric type ${metricType}:`,
        error,
      );
      return [];
    }
  }

  /**
   * Load all SLAs into cache
   */
  private async loadAllSLAs(): Promise<void> {
    try {
      const allSLAs = await this.collection.find({}).toArray();
      logger.info(
        ` [ContractualSLA] Loaded ${allSLAs.length} SLA configurations`,
      );

      // Group and cache by different criteria
      const byTicketType = new Map<TicketType, ContractualSLA[]>();
      const byMetricType = new Map<MetricType, ContractualSLA[]>();

      for (const sla of allSLAs) {
        // Cache individual SLAs
        const individualKey = `${sla.ticket_type}-${sla.priority}-${sla.metric_type}`;
        this.setCacheSLA(individualKey, [sla]);

        // Group by ticket type
        if (!byTicketType.has(sla.ticket_type)) {
          byTicketType.set(sla.ticket_type, []);
        }
        byTicketType.get(sla.ticket_type)!.push(sla);

        // Group by metric type
        if (!byMetricType.has(sla.metric_type)) {
          byMetricType.set(sla.metric_type, []);
        }
        byMetricType.get(sla.metric_type)!.push(sla);
      }

      // Cache grouped data
      for (const [ticketType, slas] of byTicketType) {
        this.setCacheSLA(`type-${ticketType}`, slas);
      }

      for (const [metricType, slas] of byMetricType) {
        this.setCacheSLA(`metric-${metricType}`, slas);
      }

      // Cache all SLAs
      this.setCacheSLA("all", allSLAs);
    } catch (error) {
      logger.error(" [ContractualSLA] Error loading all SLAs:", error);
      throw error;
    }
  }

  /**
   * Calculate SLA compliance for a ticket
   */
  async calculateCompliance(
    ticketId: string,
    ticketType: TicketType,
    priority: SLAPriority,
    metricType: MetricType,
    actualHours: number,
    options?: SLACalculationOptions,
  ): Promise<SLAComplianceResult | null> {
    try {
      const sla = await this.getSLA(ticketType, priority, metricType);
      if (!sla) {
        logger.warn(
          ` [ContractualSLA] No SLA found for ${ticketType}-${priority}-${metricType}`,
        );
        return null;
      }

      // Adjust hours for business hours if required
      let adjustedActualHours = actualHours;
      if (
        sla.business_hours_only &&
        options?.include_business_hours_only !== false
      ) {
        adjustedActualHours = this.calculateBusinessHours(
          actualHours,
          options?.business_hours_config || DEFAULT_BUSINESS_HOURS,
        );
      }

      const isCompliant = adjustedActualHours <= sla.sla_hours;
      const breachHours = isCompliant ? 0 : adjustedActualHours - sla.sla_hours;

      // Calculate penalty
      let penaltyPercentage = 0;
      if (!isCompliant && options?.penalty_calculation_enabled !== false) {
        penaltyPercentage =
          options?.custom_penalties?.[
            `${ticketType}-${priority}-${metricType}`
          ] || sla.penalty_percentage;
      }

      return {
        ticket_id: ticketId,
        ticket_type: ticketType,
        priority: priority,
        metric_type: metricType,
        sla_hours: sla.sla_hours,
        actual_hours: adjustedActualHours,
        is_compliant: isCompliant,
        breach_hours: breachHours,
        penalty_percentage: penaltyPercentage,
        business_hours_only: sla.business_hours_only,
        calculated_at: new Date(),
      };
    } catch (error) {
      logger.error(
        ` [ContractualSLA] Error calculating compliance for ticket ${ticketId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Calculate business hours between dates
   */
  private calculateBusinessHours(
    totalHours: number,
    config: BusinessHoursConfig,
  ): number {
    // Simplified business hours calculation
    // In a production system, this would use a proper business hours library
    // that accounts for weekends, holidays, and specific time ranges

    const businessDaysPerWeek = 5; // Monday-Friday
    const hoursPerBusinessDay = 8; // 8:00-17:00 = 9 hours (assuming 1 hour lunch break)
    const totalDaysPerWeek = 7;

    // Convert total hours to business hours
    const businessHourRatio =
      (businessDaysPerWeek * hoursPerBusinessDay) / (totalDaysPerWeek * 24);

    return totalHours * businessHourRatio;
  }

  /**
   * Get SLA statistics
   */
  async getStatistics(): Promise<{
    total_slas: number;
    by_ticket_type: Record<TicketType, number>;
    by_metric_type: Record<MetricType, number>;
    average_response_sla: number;
    average_resolution_sla: number;
    highest_penalty: number;
  }> {
    try {
      const allSLAs = await this.getAllSLAs();

      const stats = {
        total_slas: allSLAs.length,
        by_ticket_type: {} as Record<TicketType, number>,
        by_metric_type: {} as Record<MetricType, number>,
        average_response_sla: 0,
        average_resolution_sla: 0,
        highest_penalty: 0,
      };

      let totalResponseHours = 0;
      let responseCount = 0;
      let totalResolutionHours = 0;
      let resolutionCount = 0;

      for (const sla of allSLAs) {
        // Count by ticket type
        stats.by_ticket_type[sla.ticket_type] =
          (stats.by_ticket_type[sla.ticket_type] || 0) + 1;

        // Count by metric type
        stats.by_metric_type[sla.metric_type] =
          (stats.by_metric_type[sla.metric_type] || 0) + 1;

        // Calculate averages
        if (sla.metric_type === MetricType.RESPONSE_TIME) {
          totalResponseHours += sla.sla_hours;
          responseCount++;
        } else if (sla.metric_type === MetricType.RESOLUTION_TIME) {
          totalResolutionHours += sla.sla_hours;
          resolutionCount++;
        }

        // Track highest penalty
        if (sla.penalty_percentage > stats.highest_penalty) {
          stats.highest_penalty = sla.penalty_percentage;
        }
      }

      stats.average_response_sla =
        responseCount > 0 ? totalResponseHours / responseCount : 0;
      stats.average_resolution_sla =
        resolutionCount > 0 ? totalResolutionHours / resolutionCount : 0;

      return stats;
    } catch (error) {
      logger.error(" [ContractualSLA] Error getting statistics:", error);
      throw error;
    }
  }

  /**
   * Get all SLAs
   */
  async getAllSLAs(): Promise<ContractualSLA[]> {
    try {
      const cachedResult = this.getCachedSLA("all");
      if (cachedResult) {
        return cachedResult;
      }

      const slas = await this.collection.find({}).toArray();
      this.setCacheSLA("all", slas);

      return slas;
    } catch (error) {
      logger.error(" [ContractualSLA] Error getting all SLAs:", error);
      return [];
    }
  }

  /**
   * Cache management methods
   */
  private getCachedSLA(key: string): ContractualSLA[] | null {
    const expiry = this.cacheExpiry.get(key);
    if (expiry && Date.now() > expiry) {
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
      return null;
    }
    return this.cache.get(key) || null;
  }

  private setCacheSLA(key: string, slas: ContractualSLA[]): void {
    this.cache.set(key, slas);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    logger.info("🧹 [ContractualSLA] Cache cleared");
  }

  /**
   * Refresh cache
   */
  async refreshCache(): Promise<void> {
    this.clearCache();
    await this.loadAllSLAs();
    logger.info(" [ContractualSLA] Cache refreshed");
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const count = await this.collection.countDocuments();
      return count > 0;
    } catch (error) {
      logger.error(" [ContractualSLA] Health check failed:", error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; memory_usage_estimate: number } {
    let totalEntries = 0;
    let memoryEstimate = 0;

    for (const [key, slas] of this.cache) {
      totalEntries += slas.length;
      memoryEstimate += JSON.stringify({ key, slas }).length;
    }

    return {
      entries: totalEntries,
      memory_usage_estimate: memoryEstimate,
    };
  }
}
