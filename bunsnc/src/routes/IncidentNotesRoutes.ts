/**
 * Incident Notes and SLA Routes - Direct API access for incident details
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia, t } from "elysia";
import { ServiceNowAuthClient } from "../services/ServiceNowAuthClient";
import { SLATrackingService } from "../services/SLATrackingService";

export function createIncidentNotesRoutes(
  serviceNowClient: ServiceNowAuthClient,
  slaService?: SLATrackingService,
) {
  return (
    new Elysia({ prefix: "/api/incident" })
      // Get complete incident details including notes and SLA
      .get("/details/:sysId", async ({ params, set }) => {
        try {
          const { sysId } = params;
          console.log(`🎯 [API] Incident details requested: ${sysId}`);

          // Get main incident data
          const incidentResponse = await serviceNowClient.makeRequestFullFields(
            "incident",
            `sys_id=${sysId}`,
            1,
          );

          if (!incidentResponse?.result?.[0]) {
            set.status = 404;
            return { error: "Incident not found" };
          }

          const incident = incidentResponse.result[0];

          // Get work notes and comments from journal field
          const notesResponse = await serviceNowClient.makeRequestFullFields(
            "sys_journal_field",
            `element_id=${sysId}^element=work_notes^ORDERBYsys_created_on`,
            100,
          );

          const commentsResponse = await serviceNowClient.makeRequestFullFields(
            "sys_journal_field",
            `element_id=${sysId}^element=comments^ORDERBYsys_created_on`,
            100,
          );

          // Get SLA data
          let slaData = null;
          if (slaService) {
            try {
              slaData = await slaService.getSLAStatus(sysId);
            } catch (error: unknown) {
              console.warn(" Could not fetch SLA data:", error);
            }
          }

          // Get task_sla records for this incident
          const slaResponse = await serviceNowClient.makeRequestFullFields(
            "task_sla",
            `task=${sysId}^active=true`,
            10,
          );

          const result = {
            incident: {
              sys_id: extractValue(incident.sys_id),
              number: extractValue(incident.number),
              short_description: extractValue(incident.short_description),
              description: extractValue(incident.description),
              state: extractValue(incident.state),
              priority: extractValue(incident.priority),
              urgency: extractValue(incident.urgency),
              impact: extractValue(incident.impact),
              category: extractValue(incident.category),
              subcategory: extractValue(incident.subcategory),
              assignment_group: extractValue(incident.assignment_group),
              assigned_to: extractValue(incident.assigned_to),
              caller_id: extractValue(incident.caller_id),
              opened_by: extractValue(incident.opened_by),
              sys_created_on: extractValue(incident.sys_created_on),
              sys_updated_on: extractValue(incident.sys_updated_on),
              opened_at: extractValue(incident.opened_at),
              resolved_at: extractValue(incident.resolved_at),
              closed_at: extractValue(incident.closed_at),
              work_notes: extractValue(incident.work_notes),
              comments: extractValue(incident.comments),
              close_notes: extractValue(incident.close_notes),
              resolution_code: extractValue(incident.resolution_code),
              close_code: extractValue(incident.close_code),
              company: extractValue(incident.company),
              location: extractValue(incident.location),
              contact_type: extractValue(incident.contact_type),
              vendor: extractValue(incident.vendor),
              service_offering: extractValue(incident.service_offering),
            },
            notes: {
              work_notes:
                notesResponse?.result?.map((note) => ({
                  sys_id: extractValue(note.sys_id),
                  sys_created_on: extractValue(note.sys_created_on),
                  sys_created_by: extractValue(note.sys_created_by),
                  value: extractValue(note.value),
                })) || [],
              comments:
                commentsResponse?.result?.map((comment) => ({
                  sys_id: extractValue(comment.sys_id),
                  sys_created_on: extractValue(comment.sys_created_on),
                  sys_created_by: extractValue(comment.sys_created_by),
                  value: extractValue(comment.value),
                })) || [],
            },
            sla: {
              tracking_service_data: slaData,
              task_sla_records:
                slaResponse?.result?.map((sla) => ({
                  sys_id: extractValue(sla.sys_id),
                  sla: extractValue(sla.sla),
                  stage: extractValue(sla.stage),
                  state: extractValue(sla.state),
                  active: extractValue(sla.active),
                  has_breached: extractValue(sla.has_breached),
                  breach_time: extractValue(sla.breach_time),
                  business_percentage: extractValue(sla.business_percentage),
                  business_time_left: extractValue(sla.business_time_left),
                  business_duration: extractValue(sla.business_duration),
                  schedule: extractValue(sla.schedule),
                  start_time: extractValue(sla.start_time),
                  end_time: extractValue(sla.end_time),
                  planned_end_time: extractValue(sla.planned_end_time),
                  sys_created_on: extractValue(sla.sys_created_on),
                  sys_updated_on: extractValue(sla.sys_updated_on),
                })) || [],
            },
            metadata: {
              retrieved_at: new Date().toISOString(),
              total_work_notes: notesResponse?.result?.length || 0,
              total_comments: commentsResponse?.result?.length || 0,
              total_sla_records: slaResponse?.result?.length || 0,
            },
          };

          set.headers["content-type"] = "application/json";
          return result;
        } catch (error: unknown) {
          console.error(" [API] Error getting incident details:", error);
          set.status = 500;
          return {
            error: "Failed to retrieve incident details",
            message: error.message,
          };
        }
      })

      // Get only notes for specific incident
      .get("/notes/:sysId", async ({ params, set }) => {
        try {
          const { sysId } = params;
          console.log(` [API] Incident notes requested: ${sysId}`);

          // Get work notes
          const notesResponse = await serviceNowClient.makeRequestFullFields(
            "sys_journal_field",
            `element_id=${sysId}^element=work_notes^ORDERBYsys_created_on`,
            100,
          );

          // Get comments
          const commentsResponse = await serviceNowClient.makeRequestFullFields(
            "sys_journal_field",
            `element_id=${sysId}^element=comments^ORDERBYsys_created_on`,
            100,
          );

          const result = {
            sys_id: sysId,
            work_notes:
              notesResponse?.result?.map((note) => ({
                sys_id: extractValue(note.sys_id),
                created_on: extractValue(note.sys_created_on),
                created_by: extractValue(note.sys_created_by),
                content: extractValue(note.value),
              })) || [],
            comments:
              commentsResponse?.result?.map((comment) => ({
                sys_id: extractValue(comment.sys_id),
                created_on: extractValue(comment.sys_created_on),
                created_by: extractValue(comment.sys_created_by),
                content: extractValue(comment.value),
              })) || [],
            total_notes:
              (notesResponse?.result?.length || 0) +
              (commentsResponse?.result?.length || 0),
            retrieved_at: new Date().toISOString(),
          };

          set.headers["content-type"] = "application/json";
          return result;
        } catch (error: unknown) {
          console.error(" [API] Error getting incident notes:", error);
          set.status = 500;
          return {
            error: "Failed to retrieve incident notes",
            message: error.message,
          };
        }
      })

      // Get only SLA information for specific incident
      .get("/sla/:sysId", async ({ params, set }) => {
        try {
          const { sysId } = params;
          console.log(` [API] Incident SLA requested: ${sysId}`);

          // Get task_sla records
          const slaResponse = await serviceNowClient.makeRequestFullFields(
            "task_sla",
            `task=${sysId}`,
            50,
          );

          // Get SLA from tracking service if available
          let trackingSLA = null;
          if (slaService) {
            try {
              trackingSLA = await slaService.getSLAStatus(sysId);
            } catch (error: unknown) {
              console.warn(" Could not fetch tracking SLA data:", error);
            }
          }

          const result = {
            sys_id: sysId,
            sla_records:
              slaResponse?.result?.map((sla) => ({
                sys_id: extractValue(sla.sys_id),
                sla_definition: extractValue(sla.sla),
                stage: extractValue(sla.stage),
                state: extractValue(sla.state),
                active: extractValue(sla.active) === "true",
                has_breached: extractValue(sla.has_breached) === "true",
                breach_time: extractValue(sla.breach_time),
                business_percentage:
                  parseFloat(extractValue(sla.business_percentage)) || 0,
                business_time_left: extractValue(sla.business_time_left),
                business_duration: extractValue(sla.business_duration),
                calendar_duration: extractValue(sla.calendar_duration),
                schedule: extractValue(sla.schedule),
                start_time: extractValue(sla.start_time),
                end_time: extractValue(sla.end_time),
                planned_end_time: extractValue(sla.planned_end_time),
                original_breach_time: extractValue(sla.original_breach_time),
                sys_created_on: extractValue(sla.sys_created_on),
                sys_updated_on: extractValue(sla.sys_updated_on),
              })) || [],
            tracking_service: trackingSLA,
            total_sla_records: slaResponse?.result?.length || 0,
            retrieved_at: new Date().toISOString(),
          };

          set.headers["content-type"] = "application/json";
          return result;
        } catch (error: unknown) {
          console.error(" [API] Error getting incident SLA:", error);
          set.status = 500;
          return {
            error: "Failed to retrieve incident SLA",
            message: error.message,
          };
        }
      })

      // POST endpoint to add a new note to an incident
      .post(
        "/add-note/:sysId",
        async ({ params, body, set }) => {
          try {
            const { sysId } = params;
            const { note, noteType = "work_notes" } = body;

            console.log(
              `📝 [API] Adding ${noteType} to incident: ${sysId}`,
            );

            if (!note || note.trim() === "") {
              set.status = 400;
              return {
                success: false,
                error: "Note content is required",
              };
            }

            // Validate noteType
            if (!["work_notes", "comments"].includes(noteType)) {
              set.status = 400;
              return {
                success: false,
                error: "Invalid note type. Must be 'work_notes' or 'comments'",
              };
            }

            // Update incident with new note via PUT to incident table
            const updateData: Record<string, string> = {};
            updateData[noteType] = note;

            const response = await serviceNowClient.updateRecord(
              "incident",
              sysId,
              updateData,
            );

            if (response?.result) {
              console.log(`✅ [API] Note added successfully to ${sysId}`);
              return {
                success: true,
                message: "Note added successfully",
                noteType,
                sys_id: sysId,
              };
            } else {
              set.status = 500;
              return {
                success: false,
                error: "Failed to add note",
              };
            }
          } catch (error: any) {
            console.error(`❌ [API] Error adding note:`, error);
            set.status = 500;
            return {
              success: false,
              error: error.message || "Internal server error",
            };
          }
        },
        {
          body: t.Object({
            note: t.String({ minLength: 1, maxLength: 4000 }),
            noteType: t.Optional(
              t.Union([t.Literal("work_notes"), t.Literal("comments")]),
            ),
          }),
        },
      )
  );
}

// Helper function to extract values from ServiceNow response
function extractValue(field: any): string {
  if (!field) return "";
  if (typeof field === "string") return field;
  if (typeof field === "object" && field.display_value !== undefined)
    return String(field.display_value);
  if (typeof field === "object" && field.value !== undefined)
    return String(field.value);
  return String(field);
}
