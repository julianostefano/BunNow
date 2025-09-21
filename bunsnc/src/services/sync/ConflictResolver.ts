/**
 * Conflict Resolver - Handle data conflicts between MongoDB and ServiceNow
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

export interface ConflictData {
  sys_id: string;
  table: string;
  mongoData: any;
  serviceNowData: any;
  conflictFields: string[];
  resolution: "pending" | "resolved";
  resolvedWith: "mongodb" | "servicenow" | null;
  timestamp: string;
}

export type ConflictResolutionStrategy =
  | "servicenow_wins"
  | "mongodb_wins"
  | "newest_wins"
  | "manual";

export class ConflictResolver {
  private conflicts: Map<string, ConflictData> = new Map();
  private strategy: ConflictResolutionStrategy;

  constructor(strategy: ConflictResolutionStrategy = "newest_wins") {
    this.strategy = strategy;
  }

  /**
   * Check for data conflicts between MongoDB and ServiceNow data
   */
  checkForConflicts(
    mongoData: any,
    serviceNowData: any,
    table: string,
  ): ConflictData | null {
    const conflictFields: string[] = [];
    const criticalFields = [
      "state",
      "priority",
      "short_description",
      "assignment_group",
    ];

    for (const field of criticalFields) {
      const mongoValue = this.normalizeValue(mongoData[field]);
      const snowValue = this.normalizeValue(serviceNowData[field]);

      if (mongoValue !== snowValue) {
        conflictFields.push(field);
      }
    }

    if (conflictFields.length > 0) {
      const conflictData: ConflictData = {
        sys_id: serviceNowData.sys_id,
        table,
        mongoData,
        serviceNowData,
        conflictFields,
        resolution: "pending",
        resolvedWith: null,
        timestamp: new Date().toISOString(),
      };

      const conflictId = `${table}:${serviceNowData.sys_id}`;
      this.conflicts.set(conflictId, conflictData);

      console.log(
        `⚔️ Conflict detected for ${table}/${serviceNowData.sys_id}: ${conflictFields.join(", ")}`,
      );
      return conflictData;
    }

    return null;
  }

  /**
   * Resolve conflict based on strategy
   */
  resolveConflict(conflict: ConflictData): {
    data: any;
    source: "mongodb" | "servicenow";
  } {
    let winningData: any;
    let resolution: "mongodb" | "servicenow";

    switch (this.strategy) {
      case "servicenow_wins":
        winningData = conflict.serviceNowData;
        resolution = "servicenow";
        break;

      case "mongodb_wins":
        winningData = conflict.mongoData;
        resolution = "mongodb";
        break;

      case "newest_wins":
        const mongoTime = new Date(conflict.mongoData.sys_updated_on || 0);
        const snowTime = new Date(conflict.serviceNowData.sys_updated_on || 0);

        if (snowTime > mongoTime) {
          winningData = conflict.serviceNowData;
          resolution = "servicenow";
        } else {
          winningData = conflict.mongoData;
          resolution = "mongodb";
        }
        break;

      case "manual":
        throw new Error(
          `Manual resolution required for ${conflict.table}/${conflict.sys_id}`,
        );

      default:
        winningData = conflict.serviceNowData;
        resolution = "servicenow";
    }

    // Update conflict status
    conflict.resolution = "resolved";
    conflict.resolvedWith = resolution;

    console.log(
      ` Resolved conflict for ${conflict.table}/${conflict.sys_id}: ${resolution} wins`,
    );

    return { data: winningData, source: resolution };
  }

  /**
   * Get all pending conflicts
   */
  getPendingConflicts(): ConflictData[] {
    return Array.from(this.conflicts.values()).filter(
      (c) => c.resolution === "pending",
    );
  }

  /**
   * Clear resolved conflicts
   */
  clearResolvedConflicts(): void {
    for (const [key, conflict] of this.conflicts) {
      if (conflict.resolution === "resolved") {
        this.conflicts.delete(key);
      }
    }
  }

  /**
   * Get conflict statistics
   */
  getConflictStats(): {
    total: number;
    pending: number;
    resolved: number;
    byTable: Record<string, number>;
  } {
    const stats = {
      total: this.conflicts.size,
      pending: 0,
      resolved: 0,
      byTable: {} as Record<string, number>,
    };

    for (const conflict of this.conflicts.values()) {
      if (conflict.resolution === "pending") {
        stats.pending++;
      } else {
        stats.resolved++;
      }

      stats.byTable[conflict.table] = (stats.byTable[conflict.table] || 0) + 1;
    }

    return stats;
  }

  /**
   * Normalize field values for comparison
   */
  private normalizeValue(value: any): string {
    if (!value) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "object" && value.display_value)
      return value.display_value.trim();
    if (typeof value === "object" && value.value) return value.value.trim();
    return String(value).trim();
  }

  /**
   * Update resolution strategy
   */
  setStrategy(strategy: ConflictResolutionStrategy): void {
    this.strategy = strategy;
    console.log(` Conflict resolution strategy updated: ${strategy}`);
  }
}
