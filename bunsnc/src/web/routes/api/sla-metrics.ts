/**
 * SLA Metrics API Routes - Contractual SLA compliance and metrics endpoints
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { MongoClient } from "mongodb";
import { ContractualSLAService } from "../../../services/ContractualSLAService";
import { EnhancedMetricsService } from "../../../services/EnhancedMetricsService";
import { ContractualViolationService } from "../../../services/ContractualViolationService";
import { TicketType, MetricType } from "../../../types/ContractualSLA";
import { logger } from "../../../utils/Logger";

// Initialize services
const mongoClient = new MongoClient(
  process.env.MONGODB_URL || "mongodb://localhost:27017",
);
const databaseName = process.env.MONGODB_DATABASE || "bunsnc";

let contractualSLAService: ContractualSLAService;
let enhancedMetricsService: EnhancedMetricsService;
let contractualViolationService: ContractualViolationService;

// Initialize services on first request
const initializeServices = async () => {
  if (!contractualSLAService) {
    await mongoClient.connect();
    contractualSLAService = ContractualSLAService.getInstance(
      mongoClient,
      databaseName,
    );
    await contractualSLAService.initialize();

    enhancedMetricsService = EnhancedMetricsService.getInstance(
      mongoClient,
      databaseName,
      contractualSLAService,
    );

    contractualViolationService = ContractualViolationService.getInstance(
      mongoClient,
      databaseName,
      contractualSLAService,
    );
    await contractualViolationService.initialize();

    logger.info(" [SLAMetrics] All services initialized");
  }
  return {
    contractualSLAService,
    enhancedMetricsService,
    contractualViolationService,
  };
};

const app = new Elysia({ prefix: "/api/sla-metrics" })
  .derive(async () => {
    const services = await initializeServices();
    return services;
  })

  // Get SLA configuration
  .get("/config", async ({ contractualSLAService }) => {
    try {
      const statistics = await contractualSLAService.getStatistics();
      const allSLAs = await contractualSLAService.getAllSLAs();

      return {
        success: true,
        data: {
          statistics,
          configurations: allSLAs.map((sla) => ({
            id: sla.id,
            ticket_type: sla.ticket_type,
            metric_type: sla.metric_type,
            priority: sla.priority,
            sla_hours: sla.sla_hours,
            penalty_percentage: sla.penalty_percentage,
            description: sla.description,
            business_hours_only: sla.business_hours_only,
          })),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(" [SLAMetrics] Error getting SLA config:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  })

  // Get SLA configuration for specific ticket type
  .get("/config/:ticket_type", async ({ params, contractualSLAService }) => {
    try {
      const ticketType = params.ticket_type.toLowerCase() as TicketType;

      if (!Object.values(TicketType).includes(ticketType)) {
        return {
          success: false,
          error: `Invalid ticket type: ${params.ticket_type}`,
          timestamp: new Date().toISOString(),
        };
      }

      const slas = await contractualSLAService.getSLAsForTicketType(ticketType);

      return {
        success: true,
        data: {
          ticket_type: ticketType,
          sla_configurations: slas,
          total_configurations: slas.length,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(
        ` [SLAMetrics] Error getting SLA config for ${params.ticket_type}:`,
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  })

  // Calculate SLA for specific ticket
  .get(
    "/ticket/:ticket_id/sla",
    async ({ params, query, enhancedMetricsService }) => {
      try {
        const ticketType =
          ((query.ticket_type as string)?.toLowerCase() as TicketType) ||
          TicketType.INCIDENT;

        if (!Object.values(TicketType).includes(ticketType)) {
          return {
            success: false,
            error: `Invalid ticket type: ${query.ticket_type}`,
            timestamp: new Date().toISOString(),
          };
        }

        const slaStatus = await enhancedMetricsService.calculateTicketSLA(
          params.ticket_id,
          ticketType,
        );

        if (!slaStatus) {
          return {
            success: false,
            error: `Unable to calculate SLA for ticket ${params.ticket_id}`,
            timestamp: new Date().toISOString(),
          };
        }

        return {
          success: true,
          data: slaStatus,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(
          ` [SLAMetrics] Error calculating SLA for ticket ${params.ticket_id}:`,
          error,
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        ticket_type: t.Optional(t.String()),
      }),
    },
  )

  // Get SLA metrics for time period
  .get(
    "/metrics",
    async ({ query, enhancedMetricsService }) => {
      try {
        const startDate = query.start_date
          ? new Date(query.start_date)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Default: 7 days ago
        const endDate = query.end_date ? new Date(query.end_date) : new Date(); // Default: now
        const ticketType = query.ticket_type?.toLowerCase() as
          | TicketType
          | undefined;

        if (ticketType && !Object.values(TicketType).includes(ticketType)) {
          return {
            success: false,
            error: `Invalid ticket type: ${query.ticket_type}`,
            timestamp: new Date().toISOString(),
          };
        }

        const metrics = await enhancedMetricsService.generateSLAMetrics(
          startDate,
          endDate,
          ticketType,
        );

        return {
          success: true,
          data: {
            period: {
              start_date: startDate.toISOString(),
              end_date: endDate.toISOString(),
              days: Math.ceil(
                (endDate.getTime() - startDate.getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            },
            metrics: metrics,
            summary: {
              total_ticket_types: metrics.length,
              overall_compliance:
                metrics.length > 0
                  ? Math.round(
                      (metrics.reduce(
                        (sum, m) => sum + m.compliance_percentage,
                        0,
                      ) /
                        metrics.length) *
                        100,
                    ) / 100
                  : 0,
              total_penalties:
                Math.round(
                  metrics.reduce(
                    (sum, m) => sum + m.total_penalty_percentage,
                    0,
                  ) * 100,
                ) / 100,
            },
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(" [SLAMetrics] Error generating metrics:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
        ticket_type: t.Optional(t.String()),
      }),
    },
  )

  // Get comprehensive dashboard data
  .get(
    "/dashboard",
    async ({ query, enhancedMetricsService, contractualViolationService }) => {
      try {
        const startDate = query.start_date
          ? new Date(query.start_date)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default: 30 days ago
        const endDate = query.end_date ? new Date(query.end_date) : new Date(); // Default: now

        const dashboardData = await enhancedMetricsService.getDashboardData(
          startDate,
          endDate,
        );

        // Add violation statistics to dashboard
        const violationStats =
          await contractualViolationService.generateViolationStatistics(
            startDate,
            endDate,
          );

        const enhancedDashboardData = {
          ...dashboardData,
          violation_metrics: {
            total_violations_found: violationStats.total_violations_found,
            violation_rate_percentage: violationStats.violation_rate_percentage,
            violations_by_ticket_type: violationStats.violations_by_ticket_type,
            violations_by_severity: violationStats.violations_by_severity,
            total_financial_impact: violationStats.total_financial_impact,
            violations_by_group: violationStats.violations_by_group,
          },
        };

        return {
          success: true,
          data: enhancedDashboardData,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(" [SLAMetrics] Error generating dashboard data:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
      }),
    },
  )

  // Get SLA compliance summary by ticket type
  .get(
    "/compliance/summary",
    async ({ query, enhancedMetricsService }) => {
      try {
        const startDate = query.start_date
          ? new Date(query.start_date)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const endDate = query.end_date ? new Date(query.end_date) : new Date();

        const metrics = await enhancedMetricsService.generateSLAMetrics(
          startDate,
          endDate,
        );

        const summary = {
          period: {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          },
          by_ticket_type: {} as Record<string, any>,
          overall: {
            total_tickets: 0,
            compliant_tickets: 0,
            breached_tickets: 0,
            compliance_percentage: 0,
            total_penalty_percentage: 0,
          },
        };

        let totalTickets = 0;
        let totalCompliant = 0;
        let totalPenalty = 0;

        for (const metric of metrics) {
          summary.by_ticket_type[metric.ticket_type] = {
            total_tickets: metric.total_tickets,
            compliant_tickets: metric.compliant_tickets,
            breached_tickets: metric.breached_tickets,
            compliance_percentage: metric.compliance_percentage,
            penalty_percentage: metric.total_penalty_percentage,
            average_response_time: metric.average_response_time,
            average_resolution_time: metric.average_resolution_time,
          };

          totalTickets += metric.total_tickets;
          totalCompliant += metric.compliant_tickets;
          totalPenalty += metric.total_penalty_percentage;
        }

        summary.overall = {
          total_tickets: totalTickets,
          compliant_tickets: totalCompliant,
          breached_tickets: totalTickets - totalCompliant,
          compliance_percentage:
            totalTickets > 0
              ? Math.round((totalCompliant / totalTickets) * 10000) / 100
              : 0,
          total_penalty_percentage: Math.round(totalPenalty * 100) / 100,
        };

        return {
          success: true,
          data: summary,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(
          " [SLAMetrics] Error generating compliance summary:",
          error,
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
      }),
    },
  )

  // Get penalty impact report
  .get(
    "/penalties/report",
    async ({ query, enhancedMetricsService }) => {
      try {
        const startDate = query.start_date
          ? new Date(query.start_date)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = query.end_date ? new Date(query.end_date) : new Date();

        const metrics = await enhancedMetricsService.generateSLAMetrics(
          startDate,
          endDate,
        );

        const penaltyReport = {
          period: {
            start_date: startDate.toISOString(),
            end_date: endDate.toISOString(),
          },
          total_penalty_percentage: 0,
          penalties_by_ticket_type: {} as Record<string, any>,
          penalties_by_priority: {} as Record<string, any>,
          high_impact_breaches: [] as any[],
        };

        let totalPenalty = 0;

        for (const metric of metrics) {
          totalPenalty += metric.total_penalty_percentage;

          penaltyReport.penalties_by_ticket_type[metric.ticket_type] = {
            penalty_percentage: metric.total_penalty_percentage,
            breached_tickets: metric.breached_tickets,
            total_tickets: metric.total_tickets,
          };

          // Aggregate by priority
          for (const priorityMetric of metric.metrics_by_priority) {
            if (!penaltyReport.penalties_by_priority[priorityMetric.priority]) {
              penaltyReport.penalties_by_priority[priorityMetric.priority] = {
                penalty_percentage: 0,
                breached_tickets: 0,
                total_tickets: 0,
              };
            }

            const existing =
              penaltyReport.penalties_by_priority[priorityMetric.priority];
            existing.penalty_percentage += priorityMetric.penalty_percentage;
            existing.breached_tickets += priorityMetric.breached_tickets;
            existing.total_tickets += priorityMetric.total_tickets;
          }
        }

        penaltyReport.total_penalty_percentage =
          Math.round(totalPenalty * 100) / 100;

        return {
          success: true,
          data: penaltyReport,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(" [SLAMetrics] Error generating penalty report:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        start_date: t.Optional(t.String()),
        end_date: t.Optional(t.String()),
      }),
    },
  )

  // Health check endpoint
  .get("/health", async ({ contractualSLAService }) => {
    try {
      const isHealthy = await contractualSLAService.healthCheck();
      const cacheStats = contractualSLAService.getCacheStats();

      return {
        success: true,
        data: {
          service_healthy: isHealthy,
          cache_stats: cacheStats,
          mongodb_connected:
            (mongoClient as any).topology?.isConnected() || false,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(" [SLAMetrics] Health check failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  })

  // Cache management endpoints
  .post("/cache/refresh", async ({ contractualSLAService }) => {
    try {
      await contractualSLAService.refreshCache();

      return {
        success: true,
        message: "Cache refreshed successfully",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(" [SLAMetrics] Cache refresh failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  })

  .delete("/cache", async ({ contractualSLAService }) => {
    try {
      contractualSLAService.clearCache();

      return {
        success: true,
        message: "Cache cleared successfully",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(" [SLAMetrics] Cache clear failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  });

export default app;
