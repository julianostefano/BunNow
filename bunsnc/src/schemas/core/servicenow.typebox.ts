/**
 * ServiceNow-specific TypeBox Schemas
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * FIX v1.0.0 (HIGH-1): Migrated from Zod to TypeBox
 * - ServiceNow state enums
 * - Table-specific validations
 * - Business rules
 */

import { t, type Static } from "elysia";

// ===== INCIDENT STATES =====

/**
 * Incident state values
 * 1 = New
 * 2 = In Progress
 * 3 = On Hold
 * 6 = Resolved
 * 7 = Closed
 * 8 = Canceled
 */
export const IncidentState = t.Union([
  t.Literal("1"),
  t.Literal("2"),
  t.Literal("3"),
  t.Literal("6"),
  t.Literal("7"),
  t.Literal("8"),
]);

export type IncidentStateType = Static<typeof IncidentState>;

// ===== CHANGE REQUEST STATES =====

/**
 * Change Request state values
 * -5 = New
 * -4 = Assess
 * -3 = Authorize
 * -2 = Scheduled
 * -1 = Implement
 * 0 = Review
 * 3 = Closed
 * 4 = Canceled
 */
export const ChangeRequestState = t.Union([
  t.Literal("-5"),
  t.Literal("-4"),
  t.Literal("-3"),
  t.Literal("-2"),
  t.Literal("-1"),
  t.Literal("0"),
  t.Literal("3"),
  t.Literal("4"),
]);

export type ChangeRequestStateType = Static<typeof ChangeRequestState>;

// ===== PROBLEM STATES =====

/**
 * Problem state values
 * 1 = New
 * 2 = Assess
 * 3 = Root Cause Analysis
 * 4 = Fix in Progress
 * 6 = Resolved
 * 7 = Closed
 */
export const ProblemState = t.Union([
  t.Literal("1"),
  t.Literal("2"),
  t.Literal("3"),
  t.Literal("4"),
  t.Literal("6"),
  t.Literal("7"),
]);

export type ProblemStateType = Static<typeof ProblemState>;

// ===== TASK STATES =====

/**
 * Generic task state values (sc_task, change_task)
 * -5 = Pending
 * 1 = Open
 * 2 = Work in Progress
 * 3 = Closed Complete
 * 4 = Closed Incomplete
 * 7 = Closed Skipped
 */
export const TaskState = t.Union([
  t.Literal("-5"),
  t.Literal("1"),
  t.Literal("2"),
  t.Literal("3"),
  t.Literal("4"),
  t.Literal("7"),
]);

export type TaskStateType = Static<typeof TaskState>;

// ===== APPROVAL STATES =====

/**
 * Approval state values
 * requested = Requested
 * approved = Approved
 * rejected = Rejected
 * not_required = Not Required
 */
export const ApprovalState = t.Union([
  t.Literal("requested"),
  t.Literal("approved"),
  t.Literal("rejected"),
  t.Literal("not_required"),
]);

export type ApprovalStateType = Static<typeof ApprovalState>;

// ===== RISK VALUES =====

/**
 * Change risk values
 * 1 = High
 * 2 = Moderate
 * 3 = Low
 */
export const ChangeRisk = t.Union([
  t.Literal("1"),
  t.Literal("2"),
  t.Literal("3"),
]);

export type ChangeRiskType = Static<typeof ChangeRisk>;

// ===== CONTACT TYPES =====

/**
 * Incident contact types
 */
export const ContactType = t.Union([
  t.Literal("email"),
  t.Literal("phone"),
  t.Literal("self-service"),
  t.Literal("walk-in"),
]);

export type ContactTypeType = Static<typeof ContactType>;

// ===== SEVERITY VALUES =====

/**
 * Problem severity values
 * 1 = Critical
 * 2 = High
 * 3 = Moderate
 * 4 = Low
 */
export const Severity = t.Union([
  t.Literal("1"),
  t.Literal("2"),
  t.Literal("3"),
  t.Literal("4"),
]);

export type SeverityType = Static<typeof Severity>;

// ===== TABLE NAMES =====

/**
 * Common ServiceNow table names
 */
export const ServiceNowTable = t.Union([
  t.Literal("incident"),
  t.Literal("problem"),
  t.Literal("change_request"),
  t.Literal("sc_task"),
  t.Literal("change_task"),
  t.Literal("sc_req_item"),
  t.Literal("cmdb_ci"),
  t.Literal("sys_user"),
  t.Literal("sys_user_group"),
]);

export type ServiceNowTableType = Static<typeof ServiceNowTable>;

// ===== REFERENCE FIELDS =====

/**
 * ServiceNow reference field (can be sys_id or display value object)
 */
export const Reference = t.Union([
  t.String({ pattern: "^[0-9a-f]{32}$" }), // sys_id
  t.Object({
    value: t.String({ pattern: "^[0-9a-f]{32}$" }),
    display_value: t.String(),
    link: t.Optional(t.String()),
  }),
]);

export type ReferenceType = Static<typeof Reference>;

// ===== DISPLAY VALUE OPTIONS =====

/**
 * sysparm_display_value options
 */
export const DisplayValue = t.Union([
  t.Literal("true"),
  t.Literal("false"),
  t.Literal("all"),
]);

export type DisplayValueType = Static<typeof DisplayValue>;

// ===== EXPORT SUMMARY =====

/**
 * ServiceNow-specific enums and types:
 *
 * States:
 * - IncidentState: 1-8 (New, In Progress, On Hold, Resolved, Closed, Canceled)
 * - ChangeRequestState: -5 to 4 (New through Closed/Canceled)
 * - ProblemState: 1-7 (New through Closed)
 * - TaskState: -5, 1-4, 7 (Pending through Closed Skipped)
 * - ApprovalState: requested, approved, rejected, not_required
 *
 * Other enums:
 * - ChangeRisk: 1-3 (High, Moderate, Low)
 * - ContactType: email, phone, self-service, walk-in
 * - Severity: 1-4 (Critical, High, Moderate, Low)
 * - ServiceNowTable: Common table names
 *
 * Special types:
 * - Reference: sys_id or {value, display_value, link}
 * - DisplayValue: Query parameter options
 */
