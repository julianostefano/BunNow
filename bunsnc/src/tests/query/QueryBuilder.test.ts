/**
 * QueryBuilder Unit Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  QueryBuilder,
  QueryCondition,
  OrCondition,
  JoinQuery,
  RLQuery,
} from "../../query";

describe("QueryBuilder", () => {
  let queryBuilder: QueryBuilder;

  beforeEach(() => {
    queryBuilder = new QueryBuilder("incident");
  });

  describe("Basic Query Operations", () => {
    test("should create simple query condition", () => {
      queryBuilder.addQuery("state", "1");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("state=1");
    });

    test("should create query with operator", () => {
      queryBuilder.addQuery("priority", "<=", "2");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("priority<=2");
    });

    test("should create multiple query conditions with AND", () => {
      queryBuilder.addQuery("state", "1");
      queryBuilder.addQuery("priority", "<=", "2");
      queryBuilder.addQuery("active", "true");

      const query = queryBuilder.generateQuery();
      expect(query).toBe("state=1^priority<=2^active=true");
    });

    test("should handle string operators", () => {
      queryBuilder.addQuery("short_description", "CONTAINS", "network");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("short_descriptionCONTAINSnetwork");
    });

    test("should handle STARTSWITH operator", () => {
      queryBuilder.addQuery("number", "STARTSWITH", "INC");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("numberSTARTSWITHINC");
    });

    test("should handle IN operator", () => {
      queryBuilder.addQuery("state", "IN", "1,2,3");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("stateIN1,2,3");
    });
  });

  describe("Special Query Operations", () => {
    test("should add active query", () => {
      queryBuilder.addActiveQuery();
      const query = queryBuilder.generateQuery();
      expect(query).toBe("active=true");
    });

    test("should add null query", () => {
      queryBuilder.addNullQuery("resolved_at");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("resolved_atISEMPTY");
    });

    test("should add not null query", () => {
      queryBuilder.addNotNullQuery("assigned_to");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("assigned_toISNOTEMPTY");
    });

    test("should add encoded query", () => {
      queryBuilder.addQuery("state", "1");
      queryBuilder.addEncodedQuery("priority<=2");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("state=1^priority<=2");
    });
  });

  describe("OR Conditions", () => {
    test("should add OR condition to query condition", () => {
      const condition = queryBuilder.addQuery("state", "1");
      condition.addOrCondition("state", "2");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("state=1^ORstate=2");
    });

    test("should add multiple OR conditions", () => {
      const condition = queryBuilder.addQuery("priority", "1");
      condition.addOrCondition("priority", "2");
      condition.addOrCondition("priority", "3");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("priority=1^ORpriority=2^ORpriority=3");
    });
  });

  describe("Order By Operations", () => {
    test("should add ascending order by", () => {
      queryBuilder.addQuery("state", "1");
      queryBuilder.orderBy("number");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("state=1^ORDERBYnumber");
    });

    test("should add descending order by", () => {
      queryBuilder.addQuery("state", "1");
      queryBuilder.orderByDesc("sys_created_on");
      const query = queryBuilder.generateQuery();
      expect(query).toBe(
        "state=1^ORDERBYsys_created_on^ORDERBYDESCsys_created_on",
      );
    });
  });

  describe("JOIN Queries", () => {
    test("should create basic JOIN query", () => {
      const joinQuery = queryBuilder.addJoinQuery("sys_user");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("JOINincident.sys_id=sys_user.sys_id!");
    });

    test("should create JOIN query with specific fields", () => {
      const joinQuery = queryBuilder.addJoinQuery(
        "sys_user",
        "assigned_to",
        "sys_id",
      );
      const query = queryBuilder.generateQuery();
      expect(query).toBe("JOINincident.assigned_to=sys_user.sys_id!");
    });

    test("should create JOIN query with conditions", () => {
      const joinQuery = queryBuilder.addJoinQuery("sys_user");
      joinQuery.addQuery("active", "true");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("JOINincident.sys_id=sys_user.sys_id!active=true");
    });
  });

  describe("Related List Queries", () => {
    test("should create basic RL query", () => {
      const rlQuery = queryBuilder.addRLQuery(
        "task_ci",
        "ci_item",
        "some_condition",
      );
      const query = queryBuilder.generateQuery();
      expect(query).toBe("RLQUERYtask_ci.ci_item,some_condition^ENDRLQUERY");
    });

    test("should create RL query with stop at relationship", () => {
      const rlQuery = queryBuilder.addRLQuery(
        "task_ci",
        "ci_item",
        "some_condition",
        true,
      );
      const query = queryBuilder.generateQuery();
      expect(query).toBe(
        "RLQUERYtask_ci.ci_item,some_condition,m2m^ENDRLQUERY",
      );
    });

    test("should create RL query with conditions", () => {
      const rlQuery = queryBuilder.addRLQuery(
        "task_ci",
        "ci_item",
        "some_condition",
      );
      rlQuery.addQuery("active", "true");
      const query = queryBuilder.generateQuery();
      expect(query).toBe(
        "RLQUERYtask_ci.ci_item,some_condition^active=true^ENDRLQUERY",
      );
    });
  });

  describe("Complex Queries", () => {
    test("should combine multiple query types", () => {
      queryBuilder.addQuery("state", "1");
      queryBuilder.addActiveQuery();
      const condition = queryBuilder.addQuery("priority", "1");
      condition.addOrCondition("priority", "2");
      queryBuilder.orderBy("number");

      const query = queryBuilder.generateQuery();
      expect(query).toBe(
        "state=1^active=true^priority=1^ORpriority=2^ORDERBYnumber",
      );
    });

    test("should handle empty query", () => {
      const query = queryBuilder.generateQuery();
      expect(query).toBe("");
    });

    test("should handle query with only encoded query", () => {
      queryBuilder.addEncodedQuery("state=1^priority<=2");
      const query = queryBuilder.generateQuery();
      expect(query).toBe("state=1^priority<=2");
    });
  });

  describe("Factory Methods", () => {
    test("should create QueryBuilder with static method", () => {
      const qb = QueryBuilder.create("task");
      qb.addQuery("state", "1");
      const query = qb.generateQuery();
      expect(query).toBe("state=1");
    });
  });

  describe("Clear Functionality", () => {
    test("should clear query builder", () => {
      queryBuilder.addQuery("state", "1");
      queryBuilder.addEncodedQuery("priority<=2");
      queryBuilder.orderBy("number");

      let query = queryBuilder.generateQuery();
      expect(query).toBe("state=1^priority<=2^ORDERBYnumber");

      queryBuilder.clear();
      query = queryBuilder.generateQuery();
      expect(query).toBe("");
    });
  });

  describe("Error Handling", () => {
    test("should throw error for JOIN query without table", () => {
      const qbWithoutTable = new QueryBuilder();
      expect(() => qbWithoutTable.addJoinQuery("sys_user")).toThrow(
        "Cannot execute join query as Query object was not instantiated with a table name",
      );
    });

    test("should throw error for RL query without table", () => {
      const qbWithoutTable = new QueryBuilder();
      expect(() =>
        qbWithoutTable.addRLQuery("task_ci", "ci_item", "condition"),
      ).toThrow(
        "Cannot execute RL query as Query object was not instantiated with a table name",
      );
    });
  });
});
