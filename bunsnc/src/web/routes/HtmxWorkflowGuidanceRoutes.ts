/**
 * HTMX Agent Workflow Guidance Routes
 * Provides step-by-step intelligent guidance for common support scenarios
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { Elysia } from "elysia";
import { html } from "@elysiajs/html";
import { LLMClient } from "../../clients/LLMClient";
import { EmbeddingClient } from "../../clients/EmbeddingClient";
import { RerankClient } from "../../clients/RerankClient";
import { OpenSearchClient } from "../../clients/OpenSearchClient";
import { ServiceNowAuthClient } from "../../services/ServiceNowAuthClient";
import { logger } from "../../utils/Logger";

interface WorkflowStep {
  id: string;
  title: string;
  description: string;
  action_type: "check" | "execute" | "verify" | "document";
  estimated_time: string;
  dependencies?: string[];
  tools_required?: string[];
  validation_criteria?: string[];
  next_steps?: string[];
}

interface WorkflowSession {
  sessionId: string;
  ticketId: string;
  workflowType: string;
  currentStep: number;
  steps: WorkflowStep[];
  completedSteps: string[];
  agentNotes: string[];
  created: string;
  lastUpdated: string;
}

const workflowSessions = new Map<string, WorkflowSession>();

const llmClient = new LLMClient();
const embeddingClient = new EmbeddingClient();
const rerankClient = new RerankClient();
const openSearchClient = new OpenSearchClient({
  host: process.env.OPENSEARCH_HOST || "10.219.8.210",
  port: parseInt(process.env.OPENSEARCH_PORT || "9200"),
  ssl: false,
  timeout: 30000,
});
const serviceNowClient = new ServiceNowAuthClient();

export const workflowGuidanceRoutes = new Elysia({ prefix: "/workflow" })
  .use(html())

  // Workflow Dashboard
  .get("/dashboard", async ({ html }) => {
    const activeSessions = Array.from(workflowSessions.values())
      .filter((session) => session.completedSteps.length < session.steps.length)
      .slice(0, 10);

    return html(`
      <div class="workflow-container">
        <div class="workflow-header">
          <h1> Agent Workflow Guidance</h1>
          <div class="workflow-stats">
            <span class="stat">Active Sessions: ${activeSessions.length}</span>
            <span class="stat">Today: ${workflowSessions.size}</span>
          </div>
        </div>

        <div class="workflow-actions">
          <button class="btn-primary"
                  hx-get="/workflow/start-form"
                  hx-target="#workflow-content">
            Start New Workflow
          </button>

          <button class="btn-secondary"
                  hx-get="/workflow/templates"
                  hx-target="#workflow-content">
            View Templates
          </button>
        </div>

        <div id="workflow-content">
          ${
            activeSessions.length > 0
              ? `
            <div class="active-sessions">
              <h3>Active Workflow Sessions</h3>
              ${activeSessions
                .map(
                  (session) => `
                <div class="session-card"
                     hx-get="/workflow/session/${session.sessionId}"
                     hx-target="#workflow-content">
                  <div class="session-header">
                    <strong>${session.workflowType}</strong>
                    <span class="ticket-ref">${session.ticketId}</span>
                  </div>
                  <div class="session-progress">
                    Step ${session.currentStep + 1} of ${session.steps.length}
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: ${(session.completedSteps.length / session.steps.length) * 100}%"></div>
                    </div>
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
          `
              : `
            <div class="empty-state">
              <p>No active workflow sessions. Start a new workflow to get guided assistance.</p>
            </div>
          `
          }
        </div>
      </div>
    `);
  })

  // Start Workflow Form
  .get("/start-form", async ({ html }) => {
    return html(`
      <div class="workflow-form">
        <h3>Start New Workflow</h3>
        <form hx-post="/workflow/create" hx-target="#workflow-content">
          <div class="form-group">
            <label>Ticket ID (ServiceNow)</label>
            <input type="text" name="ticketId" placeholder="INC0000123" required>
          </div>

          <div class="form-group">
            <label>Workflow Type</label>
            <select name="workflowType" required>
              <option value="">Select workflow type...</option>
              <option value="incident_resolution">Incident Resolution</option>
              <option value="database_troubleshooting">Database Troubleshooting</option>
              <option value="network_diagnosis">Network Diagnosis</option>
              <option value="application_error">Application Error Analysis</option>
              <option value="performance_optimization">Performance Optimization</option>
              <option value="security_investigation">Security Investigation</option>
              <option value="change_implementation">Change Implementation</option>
            </select>
          </div>

          <div class="form-group">
            <label>Priority Level</label>
            <select name="priority">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div class="form-group">
            <label>Initial Description</label>
            <textarea name="description" placeholder="Describe the issue or task..." rows="3"></textarea>
          </div>

          <div class="form-actions">
            <button type="submit" class="btn-primary">Create Workflow</button>
            <button type="button" class="btn-secondary"
                    hx-get="/workflow/dashboard"
                    hx-target="#workflow-content">Cancel</button>
          </div>
        </form>
      </div>
    `);
  })

  // Create Workflow Session
  .post("/create", async ({ body, html }) => {
    try {
      const {
        ticketId,
        workflowType,
        priority = "medium",
        description = "",
      } = body as any;

      const sessionId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Get ticket details from ServiceNow
      let ticketDetails = null;
      try {
        const table = ticketId.startsWith("INC")
          ? "incident"
          : ticketId.startsWith("CHG")
            ? "change_request"
            : ticketId.startsWith("SCTASK")
              ? "sc_task"
              : "incident";

        const response = await serviceNowClient.makeRequest(
          "GET",
          `/${table}`,
          {
            sysparm_query: `number=${ticketId}`,
            sysparm_limit: 1,
          },
        );

        if (response.data.result && response.data.result.length > 0) {
          ticketDetails = response.data.result[0];
        }
      } catch (error: unknown) {
        logger.warn("Failed to fetch ticket details:", error);
      }

      // Generate workflow steps using AI
      const steps = await generateWorkflowSteps(
        workflowType,
        description,
        ticketDetails,
        priority,
      );

      const session: WorkflowSession = {
        sessionId,
        ticketId,
        workflowType,
        currentStep: 0,
        steps,
        completedSteps: [],
        agentNotes: [],
        created: new Date().toISOString(),
        lastUpdated: new Date().toISOString(),
      };

      workflowSessions.set(sessionId, session);

      logger.info(
        `Created workflow session ${sessionId} for ticket ${ticketId}`,
      );

      return html(`
        <div class="workflow-session">
          <div class="session-header">
            <h3>${workflowType} - ${ticketId}</h3>
            <span class="priority-badge priority-${priority}">${priority.toUpperCase()}</span>
          </div>

          <div class="session-info">
            <p><strong>Steps:</strong> ${steps.length}</p>
            <p><strong>Estimated Time:</strong> ${calculateTotalTime(steps)}</p>
          </div>

          <div class="current-step">
            ${renderWorkflowStep(session, 0)}
          </div>

          <div class="session-actions">
            <button class="btn-primary"
                    hx-post="/workflow/step/${sessionId}/0/start"
                    hx-target=".current-step">
              Start First Step
            </button>
          </div>
        </div>
      `);
    } catch (error: unknown) {
      logger.error("Failed to create workflow session:", error);
      return html(
        `<div class="error">Failed to create workflow: ${error}</div>`,
      );
    }
  })

  // Get Workflow Session
  .get("/session/:sessionId", async ({ params, html }) => {
    const session = workflowSessions.get(params.sessionId);
    if (!session) {
      return html(`<div class="error">Workflow session not found</div>`);
    }

    return html(`
      <div class="workflow-session">
        <div class="session-header">
          <h3>${session.workflowType} - ${session.ticketId}</h3>
          <div class="session-progress">
            Progress: ${session.completedSteps.length}/${session.steps.length}
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${(session.completedSteps.length / session.steps.length) * 100}%"></div>
            </div>
          </div>
        </div>

        <div class="current-step">
          ${renderWorkflowStep(session, session.currentStep)}
        </div>

        ${
          session.agentNotes.length > 0
            ? `
          <div class="agent-notes">
            <h4>Agent Notes</h4>
            ${session.agentNotes.map((note) => `<p class="note">${note}</p>`).join("")}
          </div>
        `
            : ""
        }
      </div>
    `);
  })

  // Start/Complete Step
  .post(
    "/step/:sessionId/:stepIndex/:action",
    async ({ params, body, html }) => {
      const { sessionId, stepIndex, action } = params;
      const session = workflowSessions.get(sessionId);

      if (!session) {
        return html(`<div class="error">Session not found</div>`);
      }

      const stepIdx = parseInt(stepIndex);
      const step = session.steps[stepIdx];

      if (!step) {
        return html(`<div class="error">Step not found</div>`);
      }

      if (action === "complete") {
        const { notes = "", outcome = "success" } = body as any;

        session.completedSteps.push(step.id);
        if (notes) {
          session.agentNotes.push(`Step ${stepIdx + 1}: ${notes}`);
        }

        if (stepIdx < session.steps.length - 1) {
          session.currentStep = stepIdx + 1;
        }

        session.lastUpdated = new Date().toISOString();

        if (session.completedSteps.length === session.steps.length) {
          return html(`
          <div class="workflow-complete">
            <h4>🎉 Workflow Complete!</h4>
            <p>All steps have been completed successfully.</p>
            <button class="btn-primary"
                    hx-get="/workflow/dashboard"
                    hx-target="#workflow-content">
              Back to Dashboard
            </button>
          </div>
        `);
        }

        return html(renderWorkflowStep(session, session.currentStep));
      }

      return html(renderWorkflowStep(session, stepIdx));
    },
  )

  // Add Agent Note
  .post("/note/:sessionId", async ({ params, body, html }) => {
    const session = workflowSessions.get(params.sessionId);
    if (!session) {
      return html(`<div class="error">Session not found</div>`);
    }

    const { note } = body as any;
    if (note) {
      session.agentNotes.push(`Agent Note: ${note}`);
      session.lastUpdated = new Date().toISOString();
    }

    return html(`<div class="success">Note added successfully</div>`);
  })

  // Workflow Templates
  .get("/templates", async ({ html }) => {
    const templates = getWorkflowTemplates();

    return html(`
      <div class="workflow-templates">
        <h3>Workflow Templates</h3>
        <div class="templates-grid">
          ${templates
            .map(
              (template) => `
            <div class="template-card">
              <h4>${template.name}</h4>
              <p>${template.description}</p>
              <div class="template-meta">
                <span>Steps: ${template.steps}</span>
                <span>Time: ${template.estimatedTime}</span>
              </div>
            </div>
          `,
            )
            .join("")}
        </div>

        <button class="btn-secondary"
                hx-get="/workflow/dashboard"
                hx-target="#workflow-content">
          Back to Dashboard
        </button>
      </div>
    `);
  });

function renderWorkflowStep(
  session: WorkflowSession,
  stepIndex: number,
): string {
  const step = session.steps[stepIndex];
  const isCompleted = session.completedSteps.includes(step.id);
  const isActive = session.currentStep === stepIndex;

  return `
    <div class="workflow-step ${isCompleted ? "completed" : ""} ${isActive ? "active" : ""}">
      <div class="step-header">
        <h4>Step ${stepIndex + 1}: ${step.title}</h4>
        <span class="step-time">${step.estimated_time}</span>
      </div>

      <div class="step-content">
        <p>${step.description}</p>

        ${
          step.tools_required
            ? `
          <div class="tools-required">
            <strong>Tools Required:</strong>
            <ul>${step.tools_required.map((tool) => `<li>${tool}</li>`).join("")}</ul>
          </div>
        `
            : ""
        }

        ${
          step.validation_criteria
            ? `
          <div class="validation-criteria">
            <strong>Validation Criteria:</strong>
            <ul>${step.validation_criteria.map((criteria) => `<li>${criteria}</li>`).join("")}</ul>
          </div>
        `
            : ""
        }
      </div>

      ${
        isActive && !isCompleted
          ? `
        <div class="step-actions">
          <form hx-post="/workflow/step/${session.sessionId}/${stepIndex}/complete"
                hx-target=".current-step">
            <div class="form-group">
              <label>Notes (optional)</label>
              <textarea name="notes" placeholder="Add any observations or notes..."></textarea>
            </div>

            <div class="form-group">
              <label>Outcome</label>
              <select name="outcome">
                <option value="success">Successful</option>
                <option value="partial">Partially Successful</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
              </select>
            </div>

            <button type="submit" class="btn-primary">Complete Step</button>
          </form>
        </div>
      `
          : ""
      }

      ${
        isCompleted
          ? `
        <div class="step-completed">
           Step completed
        </div>
      `
          : ""
      }
    </div>
  `;
}

async function generateWorkflowSteps(
  workflowType: string,
  description: string,
  ticketDetails: any,
  priority: string,
): Promise<WorkflowStep[]> {
  try {
    const context = `
      Workflow Type: ${workflowType}
      Description: ${description}
      Priority: ${priority}
      ${ticketDetails ? `Ticket Details: ${JSON.stringify(ticketDetails, null, 2)}` : ""}
    `;

    const prompt = `Generate a detailed workflow with 4-8 steps for ${workflowType}.
    Context: ${context}

    Return ONLY a JSON array of steps with this exact structure:
    [
      {
        "id": "step_1",
        "title": "Step Title",
        "description": "Detailed description",
        "action_type": "check|execute|verify|document",
        "estimated_time": "5-10 min",
        "tools_required": ["tool1", "tool2"],
        "validation_criteria": ["criteria1", "criteria2"]
      }
    ]`;

    const response = await llmClient.generateCompletion(prompt, {
      temperature: 0.3,
      max_tokens: 1000,
    });

    const steps = JSON.parse(response);
    return Array.isArray(steps) ? steps : getDefaultWorkflowSteps(workflowType);
  } catch (error: unknown) {
    logger.warn("Failed to generate AI workflow steps, using defaults:", error);
    return getDefaultWorkflowSteps(workflowType);
  }
}

function getDefaultWorkflowSteps(workflowType: string): WorkflowStep[] {
  const templates: Record<string, WorkflowStep[]> = {
    incident_resolution: [
      {
        id: "initial_assessment",
        title: "Initial Assessment",
        description:
          "Gather information about the incident and assess severity",
        action_type: "check",
        estimated_time: "5-10 min",
        tools_required: ["ServiceNow", "Monitoring Tools"],
        validation_criteria: ["Incident details collected", "Impact assessed"],
      },
      {
        id: "reproduce_issue",
        title: "Reproduce Issue",
        description: "Attempt to reproduce the reported issue",
        action_type: "execute",
        estimated_time: "10-15 min",
      },
      {
        id: "apply_solution",
        title: "Apply Solution",
        description: "Implement the identified solution",
        action_type: "execute",
        estimated_time: "15-30 min",
      },
      {
        id: "verify_resolution",
        title: "Verify Resolution",
        description: "Confirm the issue is resolved",
        action_type: "verify",
        estimated_time: "5-10 min",
      },
    ],
  };

  return templates[workflowType] || templates.incident_resolution;
}

function calculateTotalTime(steps: WorkflowStep[]): string {
  const totalMinutes = steps.reduce((total, step) => {
    const timeStr = step.estimated_time;
    const match = timeStr.match(/(\d+)-(\d+)/);
    if (match) {
      const avg = (parseInt(match[1]) + parseInt(match[2])) / 2;
      return total + avg;
    }
    return total + 10; // default
  }, 0);

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function getWorkflowTemplates() {
  return [
    {
      name: "Incident Resolution",
      description: "Standard incident troubleshooting workflow",
      steps: 4,
      estimatedTime: "30-60 min",
    },
    {
      name: "Database Troubleshooting",
      description: "Database connectivity and performance issues",
      steps: 6,
      estimatedTime: "45-90 min",
    },
    {
      name: "Network Diagnosis",
      description: "Network connectivity and routing problems",
      steps: 5,
      estimatedTime: "30-75 min",
    },
    {
      name: "Security Investigation",
      description: "Security incident analysis and response",
      steps: 8,
      estimatedTime: "60-120 min",
    },
  ];
}
