/**
 * QueryBuilder Integration Tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */
import { describe, test, expect, beforeEach } from 'bun:test';
import { RecordController } from '../../controllers/recordController';
import { QueryBuilder } from '../../query';

describe('QueryBuilder Integration', () => {
  let recordController: RecordController;

  beforeEach(() => {
    // Mock instance - não fará calls reais durante os testes
    recordController = new RecordController('https://dev12345.service-now.com', 'fake-token');
  });

  describe('RecordController Integration', () => {
    test('should create QueryBuilder through RecordController', () => {
      const queryBuilder = recordController.createQueryBuilder('incident');
      expect(queryBuilder).toBeDefined();
      expect(queryBuilder instanceof QueryBuilder).toBe(true);
    });

    test('should generate query through RecordController', async () => {
      const queryBuilder = recordController.createQueryBuilder('incident');
      queryBuilder.addQuery('state', '1');
      queryBuilder.addActiveQuery();
      queryBuilder.orderBy('number');

      const expectedQuery = 'state=1^active=true^ORDERBYnumber';
      const actualQuery = queryBuilder.generateQuery();
      expect(actualQuery).toBe(expectedQuery);
    });

    test('should build complex query for incident table', async () => {
      const queryBuilder = recordController.createQueryBuilder('incident');
      
      // Build complex query: active incidents with high priority or assigned to specific user
      queryBuilder.addActiveQuery();
      const priorityCondition = queryBuilder.addQuery('priority', '1');
      priorityCondition.addOrCondition('priority', '2');
      queryBuilder.addQuery('assigned_to', 'CONTAINS', 'john.doe');
      queryBuilder.addNotNullQuery('short_description');
      queryBuilder.orderByDesc('sys_created_on');

      const query = queryBuilder.generateQuery();
      expect(query).toBe(
        'active=true^priority=1^ORpriority=2^assigned_toCONTAINSjohn.doe^short_descriptionISNOTEMPTY^ORDERBYsys_created_on^ORDERBYDESCsys_created_on'
      );
    });

    test('should build JOIN query through RecordController', async () => {
      const queryBuilder = recordController.createQueryBuilder('incident');
      
      const joinQuery = queryBuilder.addJoinQuery('sys_user', 'assigned_to', 'sys_id');
      joinQuery.addQuery('active', 'true');
      joinQuery.addQuery('department', 'IT');

      const query = queryBuilder.generateQuery();
      expect(query).toBe('JOINincident.assigned_to=sys_user.sys_id!active=true^department=IT');
    });

    test('should build RL query through RecordController', async () => {
      const queryBuilder = recordController.createQueryBuilder('incident');
      
      const rlQuery = queryBuilder.addRLQuery('task_ci', 'ci_item', 'category=hardware');
      rlQuery.addQuery('active', 'true');

      const query = queryBuilder.generateQuery();
      expect(query).toBe('RLQUERYtask_ci.ci_item,category=hardware^active=true^ENDRLQUERY');
    });

    test('should handle empty queries gracefully', async () => {
      const queryBuilder = recordController.createQueryBuilder('incident');
      const query = queryBuilder.generateQuery();
      expect(query).toBe('');
    });

    test('should handle clear and rebuild', async () => {
      const queryBuilder = recordController.createQueryBuilder('incident');
      
      queryBuilder.addQuery('state', '1');
      queryBuilder.addActiveQuery();
      
      let query = queryBuilder.generateQuery();
      expect(query).toBe('state=1^active=true');
      
      queryBuilder.clear();
      query = queryBuilder.generateQuery();
      expect(query).toBe('');
      
      queryBuilder.addQuery('priority', '<=', '2');
      query = queryBuilder.generateQuery();
      expect(query).toBe('priority<=2');
    });
  });

  describe('Real World Scenarios', () => {
    test('should build Service Desk ticket query', async () => {
      const queryBuilder = recordController.createQueryBuilder('incident');
      
      // Find all open high-priority incidents assigned to current user in last 30 days
      queryBuilder.addQuery('state', 'IN', '1,2,6'); // New, In Progress, Resolved
      queryBuilder.addQuery('priority', '<=', '2'); // High or Critical
      queryBuilder.addQuery('assigned_to', 'CONTAINS', 'current.user');
      queryBuilder.addQuery('sys_created_on', '>=', 'javascript:gs.daysAgoStart(30)');
      queryBuilder.orderByDesc('priority');
      queryBuilder.orderBy('sys_created_on');

      const query = queryBuilder.generateQuery();
      expect(query).toContain('stateIN1,2,6');
      expect(query).toContain('priority<=2');
      expect(query).toContain('assigned_toCONTAINScurrent.user');
    });

    test('should build CMDB CI query with relationships', async () => {
      const queryBuilder = recordController.createQueryBuilder('cmdb_ci_computer');
      
      // Find servers in specific datacenter with related incidents
      queryBuilder.addActiveQuery();
      queryBuilder.addQuery('location', 'CONTAINS', 'datacenter-01');
      queryBuilder.addQuery('install_status', '1'); // Installed
      
      const rlQuery = queryBuilder.addRLQuery('task_ci', 'ci_item', 'category=incident');
      rlQuery.addQuery('state', 'IN', '1,2'); // Open incidents only
      rlQuery.addQuery('priority', '<=', '3'); // High priority

      const query = queryBuilder.generateQuery();
      expect(query).toContain('active=true');
      expect(query).toContain('location');
      expect(query).toContain('RLQUERY');
      expect(query).toContain('ENDRLQUERY');
    });
  });
});