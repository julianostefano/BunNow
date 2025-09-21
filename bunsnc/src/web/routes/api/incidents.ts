/**
 * Incidents API Routes - Enhanced with contractual SLA calculations
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { MongoClient } from "mongodb";
import { ServiceNowClient } from "../../../client/ServiceNowClient";
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

    logger.info(" [IncidentsAPI] All services initialized");
  }
  return {
    contractualSLAService,
    enhancedMetricsService,
    contractualViolationService,
  };
};

const app = new Elysia({ prefix: "/api/incidents" })
  .derive(async () => {
    const services = await initializeServices();
    return services;
  })

  .get(
    "/",
    async ({ query }) => {
      try {
        const client = new ServiceNowClient(
          process.env.SERVICENOW_INSTANCE_URL ||
            "https://dev12345.service-now.com",
          process.env.SERVICENOW_USERNAME || "admin",
          process.env.SERVICENOW_PASSWORD || "admin",
        );

        const gr = client.getGlideRecord("incident");

        // Apply filters from query parameters
        if (query.state && query.state !== "all") {
          gr.addQuery("state", query.state);
        }

        if (query.priority && query.priority !== "all") {
          gr.addQuery("priority", query.priority);
        }

        if (query.assignment_group) {
          gr.addQuery("assignment_group", "CONTAINS", query.assignment_group);
        }

        if (query.search) {
          gr.addQuery("short_description", "CONTAINS", query.search);
        }

        // Limit and ordering
        const limit = Math.min(parseInt(query.limit as string) || 50, 1000);
        gr.setLimit(limit);
        gr.orderByDesc("sys_created_on");

        gr.query();

        const incidents = [];
        while (gr.next()) {
          incidents.push({
            sys_id: gr.getValue("sys_id"),
            number: gr.getValue("number"),
            short_description: gr.getValue("short_description"),
            description: gr.getValue("description"),
            priority: gr.getValue("priority"),
            state: gr.getValue("state"),
            assignment_group: gr.getDisplayValue("assignment_group"),
            assigned_to: gr.getDisplayValue("assigned_to"),
            caller_id: gr.getDisplayValue("caller_id"),
            category: gr.getValue("category"),
            subcategory: gr.getValue("subcategory"),
            sys_created_on: gr.getValue("sys_created_on"),
            sys_updated_on: gr.getValue("sys_updated_on"),
            resolved_at: gr.getValue("resolved_at"),
            closed_at: gr.getValue("closed_at"),
            business_impact: gr.getValue("business_impact"),
            urgency: gr.getValue("urgency"),
          });
        }

        return {
          success: true,
          data: incidents,
          count: incidents.length,
          filters: {
            state: query.state || "all",
            priority: query.priority || "all",
            assignment_group: query.assignment_group || "",
            search: query.search || "",
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Error fetching incidents:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        state: t.Optional(t.String()),
        priority: t.Optional(t.String()),
        assignment_group: t.Optional(t.String()),
        search: t.Optional(t.String()),
        limit: t.Optional(t.String()),
      }),
    },
  )

  .get("/:id", async ({ params }) => {
    try {
      const client = new ServiceNowClient(
        process.env.SERVICENOW_INSTANCE_URL ||
          "https://dev12345.service-now.com",
        process.env.SERVICENOW_USERNAME || "admin",
        process.env.SERVICENOW_PASSWORD || "admin",
      );

      const gr = client.getGlideRecord("incident");
      gr.addQuery("sys_id", params.id);
      gr.query();

      if (!gr.next()) {
        return {
          success: false,
          error: "Incident not found",
          timestamp: new Date().toISOString(),
        };
      }

      const incident = {
        sys_id: gr.getValue("sys_id"),
        number: gr.getValue("number"),
        short_description: gr.getValue("short_description"),
        description: gr.getValue("description"),
        priority: gr.getValue("priority"),
        priority_display: gr.getDisplayValue("priority"),
        state: gr.getValue("state"),
        state_display: gr.getDisplayValue("state"),
        assignment_group: gr.getValue("assignment_group"),
        assignment_group_display: gr.getDisplayValue("assignment_group"),
        assigned_to: gr.getValue("assigned_to"),
        assigned_to_display: gr.getDisplayValue("assigned_to"),
        caller_id: gr.getValue("caller_id"),
        caller_id_display: gr.getDisplayValue("caller_id"),
        category: gr.getValue("category"),
        subcategory: gr.getValue("subcategory"),
        business_impact: gr.getValue("business_impact"),
        urgency: gr.getValue("urgency"),
        sys_created_on: gr.getValue("sys_created_on"),
        sys_updated_on: gr.getValue("sys_updated_on"),
        opened_at: gr.getValue("opened_at"),
        resolved_at: gr.getValue("resolved_at"),
        closed_at: gr.getValue("closed_at"),
        work_notes: gr.getValue("work_notes"),
        close_notes: gr.getValue("close_notes"),
        resolution_code: gr.getValue("resolution_code"),
        location: gr.getDisplayValue("location"),
        cmdb_ci: gr.getDisplayValue("cmdb_ci"),
      };

      return {
        success: true,
        data: incident,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.error("Error fetching incident:", error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  })

  // Get violation status for specific incident
  .get("/:id/violation", async ({ params, contractualViolationService }) => {
    try {
      const validationResult =
        await contractualViolationService.validateContractualViolation(
          params.id,
          TicketType.INCIDENT,
          {
            validate_group_closure: true,
            validate_sla_breach: true,
            validate_violation_marking: true,
            strict_validation: false, // Use OR logic
          },
        );

      return {
        success: true,
        data: validationResult,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error(
        ` [IncidentsAPI] Error validating incident ${params.id}:`,
        error,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  })

  .get(
    "/stats/summary",
    async ({ enhancedMetricsService, contractualViolationService }) => {
      try {
        const client = new ServiceNowClient(
          process.env.SERVICENOW_INSTANCE_URL ||
            "https://dev12345.service-now.com",
          process.env.SERVICENOW_USERNAME || "admin",
          process.env.SERVICENOW_PASSWORD || "admin",
        );

        // Get active incidents count
        const activeGr = client.getGlideRecord("incident");
        activeGr.addQuery("state", "!=", "6"); // Not resolved
        activeGr.addQuery("state", "!=", "7"); // Not closed
        activeGr.query();
        let activeCount = 0;
        while (activeGr.next()) activeCount++;

        // Get high priority incidents
        const highPriorityGr = client.getGlideRecord("incident");
        highPriorityGr.addQuery("priority", "IN", "1,2");
        highPriorityGr.addQuery("state", "!=", "6");
        highPriorityGr.addQuery("state", "!=", "7");
        highPriorityGr.query();
        let highPriorityCount = 0;
        while (highPriorityGr.next()) highPriorityCount++;

        // Get incidents created today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayGr = client.getGlideRecord("incident");
        todayGr.addQuery(
          "sys_created_on",
          ">=",
          today.toISOString().split("T")[0] + " 00:00:00",
        );
        todayGr.query();
        let todayCount = 0;
        let todayResolutionTimes: number[] = [];
        while (todayGr.next()) {
          todayCount++;

          // Calculate resolution time if resolved
          const createdAt = new Date(todayGr.getValue("sys_created_on"));
          const resolvedAt = todayGr.getValue("resolved_at");
          if (resolvedAt) {
            const resolutionTime =
              (new Date(resolvedAt).getTime() - createdAt.getTime()) /
              (1000 * 60 * 60);
            todayResolutionTimes.push(resolutionTime);
          }
        }

        // Get incidents resolved today
        const resolvedTodayGr = client.getGlideRecord("incident");
        resolvedTodayGr.addQuery(
          "resolved_at",
          ">=",
          today.toISOString().split("T")[0] + " 00:00:00",
        );
        resolvedTodayGr.query();
        let resolvedTodayCount = 0;
        while (resolvedTodayGr.next()) resolvedTodayCount++;

        // Priority distribution
        const priorities = ["1", "2", "3", "4", "5"];
        const priorityDistribution: Record<string, number> = {};

        for (const priority of priorities) {
          const priorityGr = client.getGlideRecord("incident");
          priorityGr.addQuery("priority", priority);
          priorityGr.addQuery("state", "!=", "6");
          priorityGr.addQuery("state", "!=", "7");
          priorityGr.query();
          let count = 0;
          while (priorityGr.next()) count++;
          priorityDistribution[priority] = count;
        }

        // Calculate real SLA metrics for the last 7 days
        let slaCompliance = 85; // Default fallback
        let avgResolutionTime = "2.4 hours"; // Default fallback
        let violationData: any = {
          total_violations: 0,
          violation_rate: 0,
          financial_impact: 0,
        };

        try {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const slaMetrics = await enhancedMetricsService.generateSLAMetrics(
            sevenDaysAgo,
            new Date(),
            TicketType.INCIDENT,
          );

          if (slaMetrics.length > 0) {
            const incidentMetrics = slaMetrics[0];
            slaCompliance = Math.round(incidentMetrics.compliance_percentage);
            avgResolutionTime = `${incidentMetrics.average_resolution_time.toFixed(1)} hours`;
          }

          // Get violation statistics
          const violationStats =
            await contractualViolationService.generateViolationStatistics(
              sevenDaysAgo,
              new Date(),
            );

          const incidentViolations =
            violationStats.violations_by_ticket_type["incident"] || 0;
          violationData = {
            total_violations: incidentViolations,
            violation_rate: violationStats.violation_rate_percentage,
            financial_impact:
              Math.round(violationStats.total_financial_impact * 100) / 100,
          };
        } catch (slaError) {
          logger.warn(
            " [IncidentsAPI] Could not calculate real SLA/violation metrics, using defaults:",
            slaError,
          );
        }

        // Calculate today's average resolution time
        if (todayResolutionTimes.length > 0) {
          const avgToday =
            todayResolutionTimes.reduce((a, b) => a + b, 0) /
            todayResolutionTimes.length;
          avgResolutionTime = `${avgToday.toFixed(1)} hours`;
        }

        return {
          success: true,
          data: {
            active: activeCount,
            high_priority: highPriorityCount,
            created_today: todayCount,
            resolved_today: resolvedTodayCount,
            priority_distribution: priorityDistribution,
            avg_resolution_time: avgResolutionTime,
            sla_compliance: slaCompliance,
            violation_data: violationData,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        logger.error(
          " [IncidentsAPI] Error fetching incident statistics:",
          error,
        );
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        };
      }
    },
  )

  .get(
    "/trends/hourly",
    async ({ query }) => {
      try {
        const client = new ServiceNowClient(
          process.env.SERVICENOW_INSTANCE_URL ||
            "https://dev12345.service-now.com",
          process.env.SERVICENOW_USERNAME || "admin",
          process.env.SERVICENOW_PASSWORD || "admin",
        );

        const days = parseInt(query.days as string) || 7;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const gr = client.getGlideRecord("incident");
        gr.addQuery(
          "sys_created_on",
          ">=",
          startDate.toISOString().split("T")[0] + " 00:00:00",
        );
        gr.query();

        const hourlyData = {};

        // Initialize hourly buckets
        for (let i = 0; i < 24; i++) {
          hourlyData[i] = 0;
        }

        while (gr.next()) {
          const createdDate = new Date(gr.getValue("sys_created_on"));
          const hour = createdDate.getHours();
          hourlyData[hour]++;
        }

        return {
          success: true,
          data: {
            labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
            values: Object.values(hourlyData),
            period: `${days} days`,
          },
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Error fetching hourly trends:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      query: t.Object({
        days: t.Optional(t.String()),
      }),
    },
  )

  .post(
    "/export/parquet",
    async ({ body }) => {
      try {
        // This would integrate with the ParquetWriter from bigdata module
        // For now, return a mock response
        return {
          success: true,
          message: "Parquet export initiated",
          job_id: `export_${Date.now()}`,
          estimated_completion: new Date(Date.now() + 300000).toISOString(), // 5 minutes
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        console.error("Error initiating parquet export:", error);
        return {
          success: false,
          error: error.message,
          timestamp: new Date().toISOString(),
        };
      }
    },
    {
      body: t.Object({
        filters: t.Optional(t.Object({})),
        format: t.Optional(t.String()),
        compression: t.Optional(t.String()),
      }),
    },
  );

export default app;
