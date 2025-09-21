/**
 * Unified Tickets API Routes - Multi-ticket type statistics and violation data
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { MongoClient } from "mongodb";
import { ContractualSLAService } from "../../../services/ContractualSLAService";
import { EnhancedMetricsService } from "../../../services/EnhancedMetricsService";
import { ContractualViolationService } from "../../../services/ContractualViolationService";
import { TicketType } from "../../../types/ContractualSLA";
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

    logger.info(" [TicketsAPI] All services initialized");
  }
  return {
    contractualSLAService,
    enhancedMetricsService,
    contractualViolationService,
  };
};

const app = new Elysia({ prefix: "/api/tickets" })
  .derive(async () => {
    const services = await initializeServices();
    return services;
  })

  // Unified statistics for all ticket types
  .get(
    "/stats/unified",
    async ({ query, enhancedMetricsService, contractualViolationService }) => {
      try {
        const startDate = query.start_date
          ? new Date(query.start_date)
          : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const endDate = query.end_date ? new Date(query.end_date) : new Date();

        // Generate SLA metrics for all ticket types
        const slaMetrics = await enhancedMetricsService.generateSLAMetrics(
          startDate,
          endDate,
        );

        // Generate violation statistics
        const violationStats =
          await contractualViolationService.generateViolationStatistics(
            startDate,
            endDate,
          );

        // Calculate totals across all ticket types
        const totalMetrics = {
          total_tickets: slaMetrics.reduce(
            (sum, m) => sum + m.total_tickets,
            0,
          ),
          compliant_tickets: slaMetrics.reduce(
            (sum, m) => sum + m.compliant_tickets,
            0,
          ),
          breached_tickets: slaMetrics.reduce(
            (sum, m) => sum + m.breached_tickets,
            0,
          ),
          total_penalty_percentage:
            Math.round(
              slaMetrics.reduce(
                (sum, m) => sum + m.total_penalty_percentage,
                0,
              ) * 100,
            ) / 100,
          average_response_time: 0,
          average_resolution_time: 0,
        };

        // Calculate weighted averages for response and resolution times
        let totalResponseTime = 0;
        let totalResolutionTime = 0;
        let responseTicketCount = 0;
        let resolutionTicketCount = 0;

        for (const metric of slaMetrics) {
          if (metric.average_response_time > 0) {
            totalResponseTime +=
              metric.average_response_time * metric.total_tickets;
            responseTicketCount += metric.total_tickets;
          }
          if (metric.average_resolution_time > 0) {
            totalResolutionTime +=
              metric.average_resolution_time * metric.total_tickets;
            resolutionTicketCount += metric.total_tickets;
          }
        }

        totalMetrics.average_response_time =
          responseTicketCount > 0
            ? Math.round((totalResponseTime / responseTicketCount) * 100) / 100
            : 0;
        totalMetrics.average_resolution_time =
          resolutionTicketCount > 0
            ? Math.round((totalResolutionTime / resolutionTicketCount) * 100) /
              100
            : 0;

        const compliancePercentage =
          totalMetrics.total_tickets > 0
            ? Math.round(
                (totalMetrics.compliant_tickets / totalMetrics.total_tickets) *
                  10000,
              ) / 100
            : 0;

        // Group metrics by ticket type
        const byTicketType: Record<string, any> = {};
        for (const metric of slaMetrics) {
          byTicketType[metric.ticket_type] = {
            total_tickets: metric.total_tickets,
            compliant_tickets: metric.compliant_tickets,
            breached_tickets: metric.breached_tickets,
            compliance_percentage: metric.compliance_percentage,
            penalty_percentage: metric.total_penalty_percentage,
            average_response_time: metric.average_response_time,
            average_resolution_time: metric.average_resolution_time,
            metrics_by_priority: metric.metrics_by_priority,
          };
        }

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
            overall_metrics: {
              ...totalMetrics,
              compliance_percentage: compliancePercentage,
            },
            by_ticket_type: byTicketType,
            violation_statistics: {
              total_violations_found: violationStats.total_violations_found,
              violation_rate_percentage:
                violationStats.violation_rate_percentage,
              violations_by_ticket_type:
                violationStats.violations_by_ticket_type,
              violations_by_severity: violationStats.violations_by_severity,
              total_financial_impact: violationStats.total_financial_impact,
            },
            summary: {
              ticket_types_analyzed: slaMetrics.length,
              highest_compliance_type:
                slaMetrics.length > 0
                  ? slaMetrics.reduce((max, current) =>
                      current.compliance_percentage > max.compliance_percentage
                        ? current
                        : max,
                    ).ticket_type
                  : null,
              lowest_compliance_type:
                slaMetrics.length > 0
                  ? slaMetrics.reduce((min, current) =>
                      current.compliance_percentage < min.compliance_percentage
                        ? current
                        : min,
                    ).ticket_type
                  : null,
              total_penalty_impact: totalMetrics.total_penalty_percentage,
            },
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(
          " [TicketsAPI] Error generating unified statistics:",
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

  // Get ticket distribution by support groups
  .get(
    "/stats/by-groups",
    async ({ query }) => {
      try {
        const startDate = query.start_date
          ? new Date(query.start_date)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = query.end_date ? new Date(query.end_date) : new Date();

        const db = mongoClient.db(databaseName);
        const groupsCollection = db.collection("sn_groups");
        const groups = await groupsCollection.find({}).toArray();

        const groupStats: Record<string, any> = {};

        // Initialize group stats
        for (const group of groups) {
          groupStats[group.id] = {
            group_id: group.id,
            group_name: group.data?.nome || "Unknown",
            group_description: group.data?.descricao || "",
            responsavel: group.data?.responsavel || "",
            temperatura: group.data?.temperatura || 0,
            tags: group.data?.tags || [],
            tickets_by_type: {
              incident: 0,
              ctask: 0,
              sctask: 0,
            },
            total_tickets: 0,
            sla_compliance: 0,
            violations: 0,
          };
        }

        // Count tickets by group for each ticket type
        const ticketTypes = [
          {
            type: TicketType.INCIDENT,
            collection: "sn_incidents_collection",
            path: "data.incident",
          },
          {
            type: TicketType.CTASK,
            collection: "sn_ctasks_collection",
            path: "data.change_task",
          },
          {
            type: TicketType.SCTASK,
            collection: "sn_sctasks_collection",
            path: "data.sc_task",
          },
        ];

        for (const { type, collection, path } of ticketTypes) {
          const ticketCollection = db.collection(collection);
          const tickets = await ticketCollection
            .find({
              [`${path}.sys_created_on`]: {
                $gte: startDate.toISOString(),
                $lte: endDate.toISOString(),
              },
            })
            .toArray();

          for (const ticket of tickets) {
            const ticketData = path
              .split(".")
              .reduce((obj, key) => obj?.[key], ticket);
            if (ticketData?.assignment_group?.value) {
              const groupId = ticketData.assignment_group.value;
              if (groupStats[groupId]) {
                groupStats[groupId].tickets_by_type[type]++;
                groupStats[groupId].total_tickets++;
              }
            }
          }
        }

        // Convert to array and sort by total tickets
        const groupStatsList = Object.values(groupStats)
          .filter((group: any) => group.total_tickets > 0)
          .sort((a: any, b: any) => b.total_tickets - a.total_tickets);

        return {
          success: true,
          data: {
            period: {
              start_date: startDate.toISOString(),
              end_date: endDate.toISOString(),
            },
            total_groups: groups.length,
            active_groups: groupStatsList.length,
            groups: groupStatsList,
            summary: {
              most_active_group:
                groupStatsList.length > 0 ? groupStatsList[0] : null,
              total_tickets_across_groups: groupStatsList.reduce(
                (sum: number, group: any) => sum + group.total_tickets,
                0,
              ),
            },
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(" [TicketsAPI] Error generating group statistics:", error);
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

  // Validate ticket for contractual violations
  .get(
    "/violation/validate/:ticket_id",
    async ({ params, query, contractualViolationService }) => {
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

        const validationResult =
          await contractualViolationService.validateContractualViolation(
            params.ticket_id,
            ticketType,
            {
              validate_group_closure: true,
              validate_sla_breach: true,
              validate_violation_marking: true,
              strict_validation: false, // Use OR logic instead of AND
            },
          );

        return {
          success: true,
          data: validationResult,
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(
          ` [TicketsAPI] Error validating ticket ${params.ticket_id}:`,
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

  // Get violation report for time period
  .get(
    "/violation/report",
    async ({ query, contractualViolationService }) => {
      try {
        const startDate = query.start_date
          ? new Date(query.start_date)
          : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const endDate = query.end_date ? new Date(query.end_date) : new Date();

        const violationStats =
          await contractualViolationService.generateViolationStatistics(
            startDate,
            endDate,
          );

        return {
          success: true,
          data: {
            report_id: `violation_report_${Date.now()}`,
            generated_at: new Date().toISOString(),
            period: {
              start_date: startDate.toISOString(),
              end_date: endDate.toISOString(),
            },
            statistics: violationStats,
            recommendations:
              this.generateViolationRecommendations(violationStats),
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(" [TicketsAPI] Error generating violation report:", error);
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

  // Health check for all services
  .get(
    "/health",
    async ({
      contractualSLAService,
      enhancedMetricsService,
      contractualViolationService,
    }) => {
      try {
        const slaHealthy = await contractualSLAService.healthCheck();
        const violationHealthy =
          await contractualViolationService.healthCheck();

        const overallHealthy = slaHealthy && violationHealthy;

        return {
          success: true,
          data: {
            overall_healthy: overallHealthy,
            services: {
              contractual_sla_service: slaHealthy,
              enhanced_metrics_service: true, // No specific health check
              contractual_violation_service: violationHealthy,
            },
            mongodb_connected: mongoClient.topology?.isConnected() || false,
            cache_stats: {
              sla_cache: contractualSLAService.getCacheStats(),
              violation_cache: contractualViolationService.getCacheStats(),
            },
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(" [TicketsAPI] Health check failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        };
      }
    },
  );

// Helper function to generate violation recommendations
function generateViolationRecommendations(stats: any): string[] {
  const recommendations: string[] = [];

  if (stats.violation_rate_percentage > 10) {
    recommendations.push(
      "High violation rate detected. Review SLA configurations and group assignments.",
    );
  }

  if (stats.total_financial_impact > 5) {
    recommendations.push(
      "Significant financial impact from violations. Prioritize compliance improvements.",
    );
  }

  if (Object.keys(stats.violations_by_ticket_type).length > 0) {
    const highestViolationType = Object.entries(
      stats.violations_by_ticket_type,
    ).reduce(
      (max, [type, count]) =>
        (count as number) > max.count ? { type, count: count as number } : max,
      { type: "", count: 0 },
    );

    if (highestViolationType.count > 0) {
      recommendations.push(
        `Focus on ${highestViolationType.type} tickets - highest violation count (${highestViolationType.count}).`,
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "Good compliance levels maintained. Continue monitoring trends.",
    );
  }

  return recommendations;
}

export default app;
