/**
 * QueryBuilder Usage Examples
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { RecordController } from "../controllers/recordController";
import { QueryBuilder } from "../query";

// Example usage of QueryBuilder with RecordController
export class QueryBuilderExamples {
  private recordController: RecordController;

  constructor(instanceUrl: string, authToken: string) {
    this.recordController = new RecordController(instanceUrl, authToken);
  }

  /**
   * Example 1: Basic query with multiple conditions
   */
  async findOpenHighPriorityIncidents() {
    const queryBuilder = this.recordController.createQueryBuilder("incident");

    queryBuilder.addQuery("state", "1"); // New state
    queryBuilder.addQuery("priority", "<=", "2"); // High or Critical priority
    queryBuilder.addActiveQuery();
    queryBuilder.orderByDesc("sys_created_on");

    return this.recordController.queryWithBuilder("incident", queryBuilder);
  }

  /**
   * Example 2: Query with OR conditions
   */
  async findIncidentsAssignedToTeam() {
    const queryBuilder = this.recordController.createQueryBuilder("incident");

    // Find incidents assigned to specific users or groups
    const assignedCondition = queryBuilder.addQuery(
      "assigned_to",
      "CONTAINS",
      "john.doe",
    );
    assignedCondition.addOrCondition(
      "assignment_group",
      "CONTAINS",
      "IT Support",
    );
    assignedCondition.addOrCondition(
      "assignment_group",
      "CONTAINS",
      "Network Team",
    );

    queryBuilder.addActiveQuery();
    queryBuilder.orderBy("priority");

    return this.recordController.queryWithBuilder("incident", queryBuilder);
  }

  /**
   * Example 3: JOIN query to get user details
   */
  async findIncidentsWithUserDetails() {
    const queryBuilder = this.recordController.createQueryBuilder("incident");

    queryBuilder.addActiveQuery();
    queryBuilder.addQuery("state", "IN", "1,2,6");

    // JOIN with sys_user table to get assigned user details
    const joinQuery = queryBuilder.addJoinQuery(
      "sys_user",
      "assigned_to",
      "sys_id",
    );
    joinQuery.addQuery("active", "true");
    joinQuery.addQuery("department", "IT");

    return this.recordController.queryWithBuilder("incident", queryBuilder);
  }

  /**
   * Example 4: Related List query for CI with incidents
   */
  async findCIWithOpenIncidents() {
    const queryBuilder =
      this.recordController.createQueryBuilder("cmdb_ci_computer");

    queryBuilder.addActiveQuery();
    queryBuilder.addQuery("install_status", "1"); // Installed

    // Find CIs that have related open incidents
    const rlQuery = queryBuilder.addRLQuery(
      "task_ci",
      "ci_item",
      "category=incident",
    );
    rlQuery.addQuery("state", "IN", "1,2"); // Open states
    rlQuery.addQuery("priority", "<=", "3"); // High priority incidents

    return this.recordController.queryWithBuilder(
      "cmdb_ci_computer",
      queryBuilder,
    );
  }

  /**
   * Example 5: Complex query with null checks and encoded query
   */
  async findIncidentsRequiringAttention() {
    const queryBuilder = this.recordController.createQueryBuilder("incident");

    // Basic conditions
    queryBuilder.addActiveQuery();
    queryBuilder.addQuery("state", "IN", "1,2"); // Open states

    // Null/Not null conditions
    queryBuilder.addNotNullQuery("short_description"); // Must have description
    queryBuilder.addNullQuery("resolved_at"); // Not yet resolved

    // Add custom encoded query for complex business rules
    queryBuilder.addEncodedQuery("business_impact<=2^urgency<=2");

    // Order by priority and creation date
    queryBuilder.orderByDesc("priority");
    queryBuilder.orderBy("sys_created_on");

    return this.recordController.queryWithBuilder("incident", queryBuilder);
  }

  /**
   * Example 6: Dynamic query building
   */
  buildDynamicQuery(
    table: string,
    filters: { field: string; operator: string; value: any }[],
  ) {
    const queryBuilder = this.recordController.createQueryBuilder(table);

    // Add filters dynamically
    filters.forEach((filter) => {
      queryBuilder.addQuery(filter.field, filter.operator, filter.value);
    });

    return queryBuilder;
  }

  /**
   * Example 7: Query with special operators
   */
  async findIncidentsWithSpecialCriteria() {
    const queryBuilder = this.recordController.createQueryBuilder("incident");

    // String operators
    queryBuilder.addQuery("short_description", "CONTAINS", "network");
    queryBuilder.addQuery("category", "STARTSWITH", "hardware");
    queryBuilder.addQuery("subcategory", "ENDSWITH", "server");

    // Comparison operators
    queryBuilder.addQuery("sys_created_on", ">=", "2025-01-01 00:00:00");
    queryBuilder.addQuery("priority", "!=", "5"); // Not lowest priority

    // Special operators
    queryBuilder.addQuery("state", "INSTANCEOF", "incident");

    return this.recordController.queryWithBuilder("incident", queryBuilder);
  }
}

// Usage example
/*
const examples = new QueryBuilderExamples('https://dev12345.service-now.com', 'auth-token');

// Find open high priority incidents
const openIncidents = await examples.findOpenHighPriorityIncidents();

// Build dynamic query
const dynamicQuery = examples.buildDynamicQuery('incident', [
  { field: 'state', operator: '1', value: undefined },
  { field: 'priority', operator: '<=', value: '2' },
  { field: 'assigned_to', operator: 'CONTAINS', value: 'admin' }
]);

const results = await examples.recordController.queryWithBuilder('incident', dynamicQuery);
*/
