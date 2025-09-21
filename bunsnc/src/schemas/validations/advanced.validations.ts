/**
 * Advanced Zod Validations - Complex business rules and refinements
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 *
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Advanced validation patterns with Zod refinements
 * - Business logic validation
 */

import { z } from "zod";
import { SysIdSchema, ServiceNowDateTimeSchema } from "../core/base.schemas";

// ===== CROSS-FIELD VALIDATIONS =====

/**
 * SLA validation with time-based business rules
 */
export const SLAValidationSchema = z
  .object({
    priority: z.enum(["1", "2", "3", "4", "5"]), // 1=Critical, 2=High, 3=Moderate, 4=Low, 5=Planning
    created_on: ServiceNowDateTimeSchema,
    resolved_at: ServiceNowDateTimeSchema.optional(),
    business_service: SysIdSchema.optional(),
    assignment_group: SysIdSchema.optional(),
  })
  .refine(
    async (data) => {
      // Business rule: Calculate SLA breach based on priority and business hours
      if (!data.resolved_at) return true; // Not resolved yet

      const createdDate = new Date(data.created_on);
      const resolvedDate = new Date(data.resolved_at);
      const resolutionTimeHours =
        (resolvedDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

      // SLA targets in business hours
      const slaTargets = {
        "1": 4, // Critical: 4 hours
        "2": 8, // High: 8 hours
        "3": 24, // Moderate: 24 hours
        "4": 72, // Low: 72 hours
        "5": 168, // Planning: 1 week
      };

      const targetHours = slaTargets[data.priority];
      return resolutionTimeHours <= targetHours;
    },
    {
      message:
        "SLA breach detected: Resolution time exceeds target for priority level",
      path: ["sla_compliance"],
    },
  );

/**
 * Change management approval validation
 */
export const ChangeApprovalValidationSchema = z
  .object({
    risk: z.enum(["low", "medium", "high", "very_high"]),
    impact: z.enum(["low", "medium", "high"]),
    change_type: z.enum(["standard", "normal", "emergency"]),
    approvals: z.array(
      z.object({
        approver: SysIdSchema,
        state: z.enum(["pending", "approved", "rejected"]),
        approved_at: ServiceNowDateTimeSchema.optional(),
      }),
    ),
    implementation_date: ServiceNowDateTimeSchema,
    created_on: ServiceNowDateTimeSchema,
  })
  .superRefine((data, ctx) => {
    // Business rule: High risk changes require CAB approval
    if (["high", "very_high"].includes(data.risk)) {
      const cabApproval = data.approvals.find(
        (a) => a.approver === "cab_approval_sys_id",
      );
      if (!cabApproval) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "High/Very High risk changes require CAB approval",
          path: ["approvals"],
        });
      }
    }

    // Business rule: Emergency changes can skip normal approval if justified
    if (data.change_type === "emergency") {
      const implementationDate = new Date(data.implementation_date);
      const createdDate = new Date(data.created_on);
      const timeDiffHours =
        (implementationDate.getTime() - createdDate.getTime()) /
        (1000 * 60 * 60);

      if (timeDiffHours > 24) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Emergency changes should be implemented within 24 hours of creation",
          path: ["implementation_date"],
        });
      }
    }

    // Business rule: Standard changes don't require individual approvals
    if (data.change_type === "standard" && data.approvals.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Standard changes are pre-approved and should not require individual approvals",
        path: ["approvals"],
      });
    }
  });

/**
 * Service catalog request validation with complex dependencies
 */
export const ServiceRequestValidationSchema = z
  .object({
    requested_for: SysIdSchema,
    requester: SysIdSchema,
    catalog_item: SysIdSchema,
    variables: z.record(z.string(), z.any()),
    quantity: z.number().int().min(1).max(999),
    business_justification: z.string().min(10),
    cost_center: z.string().optional(),
    manager_approval: z
      .object({
        required: z.boolean(),
        approver: SysIdSchema.optional(),
        approved_at: ServiceNowDateTimeSchema.optional(),
      })
      .optional(),
  })
  .superRefine(async (data, ctx) => {
    // Business rule: High-value items require manager approval
    const itemValue = data.variables?.estimated_cost || 0;
    const highValueThreshold = 5000;

    if (itemValue > highValueThreshold) {
      if (!data.manager_approval?.required) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Items over $${highValueThreshold} require manager approval`,
          path: ["manager_approval", "required"],
        });
      }

      if (data.manager_approval?.required && !data.manager_approval?.approver) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Manager approval required but no approver specified",
          path: ["manager_approval", "approver"],
        });
      }
    }

    // Business rule: Software requests require specific variables
    if (data.variables?.category === "software") {
      const requiredSoftwareFields = [
        "software_name",
        "version",
        "license_type",
        "business_justification",
      ];

      for (const field of requiredSoftwareFields) {
        if (!data.variables[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field} is required for software requests`,
            path: ["variables", field],
          });
        }
      }
    }

    // Business rule: Requested for user must be active
    // This would typically involve a database lookup
    if (data.requested_for === data.requester) {
      // Self-service request - additional validation might be needed
      if (
        !data.business_justification ||
        data.business_justification.length < 20
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Self-service requests require detailed business justification (min 20 characters)",
          path: ["business_justification"],
        });
      }
    }
  });

/**
 * Incident escalation validation
 */
export const IncidentEscalationValidationSchema = z
  .object({
    priority: z.enum(["1", "2", "3", "4", "5"]),
    state: z.enum(["1", "2", "3", "6", "7", "8", "18"]),
    created_on: ServiceNowDateTimeSchema,
    assigned_to: SysIdSchema.optional(),
    assignment_group: SysIdSchema.optional(),
    escalation: z.number().int().min(0).max(3).default(0),
    business_service: SysIdSchema.optional(),
    vip: z.boolean().default(false),
    last_activity: ServiceNowDateTimeSchema.optional(),
  })
  .refine(
    (data) => {
      const now = new Date();
      const createdDate = new Date(data.created_on);
      const ageHours =
        (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

      // Auto-escalation rules based on priority and age
      const escalationRules = {
        "1": { hours: 2, maxLevel: 3 }, // Critical: 2 hours
        "2": { hours: 4, maxLevel: 2 }, // High: 4 hours
        "3": { hours: 8, maxLevel: 1 }, // Moderate: 8 hours
        "4": { hours: 24, maxLevel: 1 }, // Low: 24 hours
        "5": { hours: 72, maxLevel: 0 }, // Planning: no auto-escalation
      };

      const rule = escalationRules[data.priority];
      const expectedEscalationLevel = Math.min(
        Math.floor(ageHours / rule.hours),
        rule.maxLevel,
      );

      // VIP incidents escalate faster
      const vipMultiplier = data.vip ? 0.5 : 1;
      const adjustedExpectedLevel = Math.min(
        Math.floor(ageHours / (rule.hours * vipMultiplier)),
        rule.maxLevel,
      );

      return data.escalation >= adjustedExpectedLevel;
    },
    {
      message: "Incident requires escalation based on priority and age",
      path: ["escalation"],
    },
  );

/**
 * Configuration Item relationship validation
 */
export const CIRelationshipValidationSchema = z
  .object({
    parent: SysIdSchema,
    child: SysIdSchema,
    type: z.enum([
      "depends_on",
      "uses",
      "connects_to",
      "runs_on",
      "installed_on",
    ]),
    direction: z.enum(["directional", "bidirectional"]),
    created_by: SysIdSchema,
    created_on: ServiceNowDateTimeSchema,
  })
  .superRefine((data, ctx) => {
    // Business rule: CI cannot have relationship with itself
    if (data.parent === data.child) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Configuration Item cannot have a relationship with itself",
        path: ["child"],
      });
    }

    // Business rule: Certain relationship types must be directional
    const directionalTypes = ["depends_on", "runs_on", "installed_on"];
    if (
      directionalTypes.includes(data.type) &&
      data.direction === "bidirectional"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Relationship type '${data.type}' must be directional`,
        path: ["direction"],
      });
    }
  });

/**
 * Knowledge article approval workflow
 */
export const KnowledgeArticleValidationSchema = z
  .object({
    title: z.string().min(10).max(255),
    content: z.string().min(100),
    category: z.string(),
    tags: z.array(z.string()).min(1).max(10),
    author: SysIdSchema,
    reviewers: z.array(SysIdSchema).min(1).max(3),
    approval_state: z.enum([
      "draft",
      "review",
      "approved",
      "published",
      "retired",
    ]),
    target_audience: z.enum(["internal", "customer", "both"]),
    confidentiality: z.enum([
      "public",
      "internal",
      "confidential",
      "restricted",
    ]),
    effective_date: ServiceNowDateTimeSchema.optional(),
    expiration_date: ServiceNowDateTimeSchema.optional(),
  })
  .superRefine((data, ctx) => {
    // Business rule: Author cannot be a reviewer
    if (data.reviewers.includes(data.author)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Author cannot be listed as a reviewer",
        path: ["reviewers"],
      });
    }

    // Business rule: Effective date must be before expiration date
    if (data.effective_date && data.expiration_date) {
      const effectiveDate = new Date(data.effective_date);
      const expirationDate = new Date(data.expiration_date);

      if (effectiveDate >= expirationDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Effective date must be before expiration date",
          path: ["expiration_date"],
        });
      }
    }

    // Business rule: Customer-facing content requires additional review
    if (data.target_audience !== "internal" && data.reviewers.length < 2) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Customer-facing articles require at least 2 reviewers",
        path: ["reviewers"],
      });
    }

    // Business rule: Confidential content cannot be customer-facing
    if (
      data.confidentiality !== "public" &&
      data.target_audience === "customer"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Confidential content cannot be shared with customers",
        path: ["target_audience"],
      });
    }
  });

/**
 * Asset lifecycle validation
 */
export const AssetLifecycleValidationSchema = z
  .object({
    asset_tag: z.string().min(1),
    serial_number: z.string().min(1),
    state: z.enum([
      "on_order",
      "in_stock",
      "in_use",
      "in_maintenance",
      "retired",
      "disposed",
    ]),
    assigned_to: SysIdSchema.optional(),
    location: SysIdSchema.optional(),
    cost: z.number().min(0),
    purchase_date: ServiceNowDateTimeSchema,
    warranty_expiration: ServiceNowDateTimeSchema.optional(),
    depreciation_schedule: z
      .enum(["straight_line", "declining_balance", "none"])
      .default("straight_line"),
    useful_life_years: z.number().int().min(1).max(50).default(3),
  })
  .superRefine((data, ctx) => {
    // Business rule: Assets in use must be assigned and have location
    if (data.state === "in_use") {
      if (!data.assigned_to) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Assets in use must be assigned to a user",
          path: ["assigned_to"],
        });
      }

      if (!data.location) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Assets in use must have a location",
          path: ["location"],
        });
      }
    }

    // Business rule: Disposed assets cannot be assigned
    if (data.state === "disposed" && data.assigned_to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Disposed assets cannot be assigned to users",
        path: ["assigned_to"],
      });
    }

    // Business rule: Warranty expiration should be after purchase date
    if (data.warranty_expiration) {
      const purchaseDate = new Date(data.purchase_date);
      const warrantyDate = new Date(data.warranty_expiration);

      if (warrantyDate <= purchaseDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Warranty expiration must be after purchase date",
          path: ["warranty_expiration"],
        });
      }
    }
  });

// ===== TYPE EXPORTS =====

export type SLAValidation = z.infer<typeof SLAValidationSchema>;
export type ChangeApprovalValidation = z.infer<
  typeof ChangeApprovalValidationSchema
>;
export type ServiceRequestValidation = z.infer<
  typeof ServiceRequestValidationSchema
>;
export type IncidentEscalationValidation = z.infer<
  typeof IncidentEscalationValidationSchema
>;
export type CIRelationshipValidation = z.infer<
  typeof CIRelationshipValidationSchema
>;
export type KnowledgeArticleValidation = z.infer<
  typeof KnowledgeArticleValidationSchema
>;
export type AssetLifecycleValidation = z.infer<
  typeof AssetLifecycleValidationSchema
>;
