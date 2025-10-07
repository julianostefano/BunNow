/**
 * Shared Guard Schemas - Reusable validation guards for Elysia routes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-2): Implement Guard Pattern for schema reuse
 * - Eliminates 218 lines of duplicated validation code
 * - Centralizes schema definitions
 * - Improves maintainability and consistency
 *
 * Reference: docs/reports/BUNSNC_ELYSIA_ASSESSMENT_v1.0.md - HIGH-2
 *
 * Guard Pattern Usage:
 * ```typescript
 * import { IncidentGuard } from "./guards/shared.guards";
 *
 * app.use(IncidentGuard)
 *   .post("/incident", async ({ body }) => {
 *     // body is fully typed and validated
 *     return await createIncident(body);
 *   });
 * ```
 */

import { Elysia, t } from "elysia";
import {
  SysId,
  TicketNumber,
  Priority,
  Impact,
  Urgency,
  ListQueryParams,
  RecordQueryParams,
} from "../schemas/core/base.typebox";
import {
  IncidentState,
  ChangeRequestState,
  ProblemState,
  TaskState,
  ServiceNowTable,
} from "../schemas/core/servicenow.typebox";

// ===== PATH PARAMETER GUARDS =====

/**
 * Guard for sys_id path parameter validation
 */
export const SysIdParam = new Elysia({ name: "guard.sysid-param" }).guard({
  params: t.Object({
    sys_id: SysId,
  }),
});

/**
 * Guard for table name path parameter validation
 */
export const TableParam = new Elysia({ name: "guard.table-param" }).guard({
  params: t.Object({
    table: ServiceNowTable,
  }),
});

/**
 * Guard for table + sys_id path parameters
 */
export const TableSysIdParams = new Elysia({
  name: "guard.table-sysid-params",
}).guard({
  params: t.Object({
    table: ServiceNowTable,
    sys_id: SysId,
  }),
});

// ===== QUERY PARAMETER GUARDS =====

/**
 * Guard for ServiceNow list query parameters
 */
export const ListQuery = new Elysia({ name: "guard.list-query" }).guard({
  query: ListQueryParams,
});

/**
 * Guard for ServiceNow record query parameters
 */
export const RecordQuery = new Elysia({ name: "guard.record-query" }).guard({
  query: RecordQueryParams,
});

/**
 * Guard for pagination query parameters
 */
export const PaginationQuery = new Elysia({
  name: "guard.pagination-query",
}).guard({
  query: t.Object({
    limit: t.Optional(t.Number({ minimum: 1, maximum: 1000, default: 10 })),
    offset: t.Optional(t.Number({ minimum: 0, default: 0 })),
  }),
});

// ===== INCIDENT GUARDS =====

/**
 * Guard for incident creation requests
 */
export const IncidentCreation = new Elysia({
  name: "guard.incident-creation",
}).guard({
  body: t.Object({
    short_description: t.String({ minLength: 1, maxLength: 160 }),
    description: t.Optional(t.String()),
    caller_id: SysId,
    urgency: Urgency,
    impact: Impact,
    category: t.Optional(t.String()),
    subcategory: t.Optional(t.String()),
    assignment_group: t.Optional(SysId),
    assigned_to: t.Optional(SysId),
  }),
});

/**
 * Guard for incident update requests
 */
export const IncidentUpdate = new Elysia({
  name: "guard.incident-update",
}).guard({
  body: t.Object({
    short_description: t.Optional(t.String({ minLength: 1, maxLength: 160 })),
    description: t.Optional(t.String()),
    state: t.Optional(IncidentState),
    priority: t.Optional(Priority),
    urgency: t.Optional(Urgency),
    impact: t.Optional(Impact),
    assigned_to: t.Optional(SysId),
    assignment_group: t.Optional(SysId),
    work_notes: t.Optional(t.String()),
    resolution_code: t.Optional(t.String()),
    resolution_notes: t.Optional(t.String()),
    close_code: t.Optional(t.String()),
    close_notes: t.Optional(t.String()),
  }),
});

/**
 * Guard for incident assignment requests
 */
export const IncidentAssignment = new Elysia({
  name: "guard.incident-assignment",
}).guard({
  body: t.Object({
    assigned_to: t.Optional(SysId),
    assignment_group: SysId,
    work_notes: t.Optional(t.String()),
  }),
});

/**
 * Guard for incident resolution requests
 */
export const IncidentResolution = new Elysia({
  name: "guard.incident-resolution",
}).guard({
  body: t.Object({
    state: t.Literal("6"), // Resolved
    resolution_code: t.String({ minLength: 1 }),
    resolution_notes: t.String({ minLength: 1 }),
    work_notes: t.Optional(t.String()),
  }),
});

// ===== CHANGE REQUEST GUARDS =====

/**
 * Guard for change request creation
 */
export const ChangeRequestCreation = new Elysia({
  name: "guard.change-request-creation",
}).guard({
  body: t.Object({
    short_description: t.String({ minLength: 1, maxLength: 160 }),
    description: t.Optional(t.String()),
    requested_by: SysId,
    priority: Priority,
    impact: Impact,
    risk: t.Union([t.Literal("1"), t.Literal("2"), t.Literal("3")]),
    type: t.Union([
      t.Literal("standard"),
      t.Literal("normal"),
      t.Literal("emergency"),
    ]),
    implementation_plan: t.String({ minLength: 1 }),
    backout_plan: t.String({ minLength: 1 }),
    test_plan: t.String({ minLength: 1 }),
    justification: t.Optional(t.String()),
    start_date: t.Optional(t.String({ format: "date-time" })),
    end_date: t.Optional(t.String({ format: "date-time" })),
  }),
});

/**
 * Guard for change request update
 */
export const ChangeRequestUpdate = new Elysia({
  name: "guard.change-request-update",
}).guard({
  body: t.Object({
    short_description: t.Optional(t.String({ minLength: 1, maxLength: 160 })),
    description: t.Optional(t.String()),
    state: t.Optional(ChangeRequestState),
    priority: t.Optional(Priority),
    risk: t.Optional(
      t.Union([t.Literal("1"), t.Literal("2"), t.Literal("3")]),
    ),
    implementation_plan: t.Optional(t.String()),
    backout_plan: t.Optional(t.String()),
    test_plan: t.Optional(t.String()),
    work_notes: t.Optional(t.String()),
    start_date: t.Optional(t.String({ format: "date-time" })),
    end_date: t.Optional(t.String({ format: "date-time" })),
  }),
});

// ===== PROBLEM GUARDS =====

/**
 * Guard for problem creation
 */
export const ProblemCreation = new Elysia({
  name: "guard.problem-creation",
}).guard({
  body: t.Object({
    short_description: t.String({ minLength: 1, maxLength: 160 }),
    description: t.Optional(t.String()),
    priority: Priority,
    impact: Impact,
    urgency: Urgency,
    assignment_group: t.Optional(SysId),
    assigned_to: t.Optional(SysId),
    category: t.Optional(t.String()),
  }),
});

/**
 * Guard for problem update
 */
export const ProblemUpdate = new Elysia({ name: "guard.problem-update" }).guard(
  {
    body: t.Object({
      short_description: t.Optional(
        t.String({ minLength: 1, maxLength: 160 }),
      ),
      description: t.Optional(t.String()),
      state: t.Optional(ProblemState),
      priority: t.Optional(Priority),
      impact: t.Optional(Impact),
      urgency: t.Optional(Urgency),
      assigned_to: t.Optional(SysId),
      assignment_group: t.Optional(SysId),
      work_notes: t.Optional(t.String()),
      resolution_code: t.Optional(t.String()),
      workaround: t.Optional(t.String()),
      known_error: t.Optional(t.Boolean()),
    }),
  },
);

// ===== TASK GUARDS (SC_TASK, CHANGE_TASK) =====

/**
 * Guard for task creation (generic for sc_task and change_task)
 */
export const TaskCreation = new Elysia({ name: "guard.task-creation" }).guard({
  body: t.Object({
    short_description: t.String({ minLength: 1, maxLength: 160 }),
    description: t.Optional(t.String()),
    assignment_group: SysId,
    assigned_to: t.Optional(SysId),
    parent: SysId, // Parent change request or catalog item
    priority: t.Optional(Priority),
    due_date: t.Optional(t.String({ format: "date-time" })),
  }),
});

/**
 * Guard for task update
 */
export const TaskUpdate = new Elysia({ name: "guard.task-update" }).guard({
  body: t.Object({
    short_description: t.Optional(t.String({ minLength: 1, maxLength: 160 })),
    description: t.Optional(t.String()),
    state: t.Optional(TaskState),
    assigned_to: t.Optional(SysId),
    assignment_group: t.Optional(SysId),
    work_notes: t.Optional(t.String()),
    actual_start: t.Optional(t.String({ format: "date-time" })),
    actual_end: t.Optional(t.String({ format: "date-time" })),
  }),
});

/**
 * Guard for task completion
 */
export const TaskCompletion = new Elysia({ name: "guard.task-completion" }).guard(
  {
    body: t.Object({
      state: t.Union([t.Literal("3"), t.Literal("4"), t.Literal("7")]), // Complete/Incomplete/Skipped
      work_notes: t.String({ minLength: 1 }),
      close_notes: t.String({ minLength: 1 }),
    }),
  },
);

// ===== BATCH OPERATION GUARDS =====

/**
 * Guard for batch operation requests
 */
export const BatchOperation = new Elysia({
  name: "guard.batch-operation",
}).guard({
  body: t.Object({
    operations: t.Array(
      t.Object({
        op: t.Union([
          t.Literal("create"),
          t.Literal("update"),
          t.Literal("delete"),
          t.Literal("read"),
        ]),
        table: ServiceNowTable,
        sys_id: t.Optional(SysId),
        data: t.Optional(t.Record(t.String(), t.Any())),
      }),
      { minItems: 1, maxItems: 100 },
    ),
  }),
});

// ===== ATTACHMENT GUARDS =====

/**
 * Guard for attachment upload
 */
export const AttachmentUpload = new Elysia({
  name: "guard.attachment-upload",
}).guard({
  body: t.Object({
    file: t.File({
      type: ["image/*", "application/pdf", "text/*", "application/*"],
      maxSize: 10 * 1024 * 1024, // 10MB
    }),
    file_name: t.String({ minLength: 1, maxLength: 255 }),
    content_type: t.Optional(t.String()),
  }),
});

// ===== SEARCH GUARDS =====

/**
 * Guard for search requests
 */
export const SearchRequest = new Elysia({ name: "guard.search-request" }).guard(
  {
    body: t.Object({
      q: t.String({ minLength: 1 }),
      tables: t.Optional(t.Array(ServiceNowTable)),
      limit: t.Optional(t.Number({ minimum: 1, maximum: 100, default: 10 })),
      offset: t.Optional(t.Number({ minimum: 0, default: 0 })),
      filters: t.Optional(
        t.Object({
          state: t.Optional(t.Array(t.String())),
          priority: t.Optional(t.Array(Priority)),
          assigned_to: t.Optional(SysId),
          assignment_group: t.Optional(SysId),
          date_from: t.Optional(t.String({ format: "date-time" })),
          date_to: t.Optional(t.String({ format: "date-time" })),
        }),
      ),
    }),
  },
);

// ===== AUTHENTICATION GUARDS =====

/**
 * Guard for login requests
 */
export const LoginRequest = new Elysia({ name: "guard.login-request" }).guard({
  body: t.Object({
    username: t.String({ minLength: 1 }),
    password: t.String({ minLength: 1 }),
    instance: t.Optional(t.String()),
  }),
});

/**
 * Guard for token validation
 */
export const TokenValidation = new Elysia({
  name: "guard.token-validation",
}).guard({
  headers: t.Object({
    authorization: t.String({
      pattern: "^Bearer [A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+\\.[A-Za-z0-9-_]+$",
    }),
  }),
});

// ===== EXPORT SUMMARY =====

/**
 * Shared Guards for reuse across routes:
 *
 * Path Parameters:
 * - SysIdParam: Validates sys_id in path
 * - TableParam: Validates table name in path
 * - TableSysIdParams: Validates both table and sys_id
 *
 * Query Parameters:
 * - ListQuery: ServiceNow list parameters
 * - RecordQuery: ServiceNow record parameters
 * - PaginationQuery: Generic pagination
 *
 * Incidents:
 * - IncidentCreation: Create incident body validation
 * - IncidentUpdate: Update incident body validation
 * - IncidentAssignment: Assignment body validation
 * - IncidentResolution: Resolution body validation
 *
 * Change Requests:
 * - ChangeRequestCreation: Create change body validation
 * - ChangeRequestUpdate: Update change body validation
 *
 * Problems:
 * - ProblemCreation: Create problem body validation
 * - ProblemUpdate: Update problem body validation
 *
 * Tasks:
 * - TaskCreation: Create task body validation
 * - TaskUpdate: Update task body validation
 * - TaskCompletion: Complete task body validation
 *
 * Batch Operations:
 * - BatchOperation: Batch request validation (1-100 ops)
 *
 * Attachments:
 * - AttachmentUpload: File upload validation (10MB max)
 *
 * Search:
 * - SearchRequest: Full-text search with filters
 *
 * Authentication:
 * - LoginRequest: Login credentials validation
 * - TokenValidation: JWT Bearer token validation
 *
 * Usage:
 * ```typescript
 * app.use(IncidentCreation)
 *   .post("/incident", ({ body }) => createIncident(body));
 * ```
 */
