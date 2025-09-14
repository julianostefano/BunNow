/**
 * End-to-End Workflow Scenario Testing
 * Validates real-world user workflows and business processes
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { ConsolidatedServiceNowService } from '../../services/ConsolidatedServiceNowService';
import { unifiedStreamingService, UnifiedStreamingService } from '../../services/UnifiedStreamingService';
import type { ServiceNowClient } from '../../types/servicenow';

// Workflow Scenario Configurations
const WORKFLOW_CONFIG = {
  timeout: 45000,
  scenarios: {
    helpDeskWorkflow: {
      name: 'Help Desk Ticket Management Workflow',
      steps: ['ticket_creation', 'triage', 'assignment', 'resolution', 'closure', 'feedback'],
      roles: ['end_user', 'help_desk_agent', 'technician', 'manager']
    },
    incidentManagement: {
      name: 'Critical Incident Management Workflow',
      steps: ['incident_detection', 'escalation', 'war_room', 'mitigation', 'resolution', 'postmortem'],
      priority: 'P1'
    },
    changeManagement: {
      name: 'Change Request Approval Workflow',
      steps: ['change_request', 'impact_assessment', 'cab_review', 'approval', 'implementation', 'validation'],
      approvers: ['technical_lead', 'change_manager', 'business_owner']
    }
  }
};

// Enhanced Mock ServiceNow Client with Workflow Support
const workflowServiceNowClient: ServiceNowClient = {
  makeRequest: async (table: string, query?: string, limit?: number) => {
    const baseRecord = {
      sys_id: `workflow-${table}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      number: `${table.toUpperCase()}${String(Math.floor(Math.random() * 1000000)).padStart(7, '0')}`,
      sys_created_on: new Date().toISOString(),
      sys_updated_on: new Date().toISOString()
    };

    // Table-specific workflow data
    switch (table) {
      case 'incident':
        return {
          result: [{
            ...baseRecord,
            state: '1',
            priority: '3',
            impact: '3',
            urgency: '3',
            short_description: 'Workflow E2E Test Incident',
            description: 'Testing incident workflow end-to-end',
            assigned_to: '',
            caller_id: 'workflow.user',
            category: 'software',
            subcategory: 'application',
            company: 'E2E Test Company',
            location: 'Test Location'
          }]
        };

      case 'change_request':
        return {
          result: [{
            ...baseRecord,
            state: '1', // New
            type: 'normal',
            priority: '3',
            risk: '3',
            short_description: 'Workflow E2E Test Change Request',
            description: 'Testing change management workflow',
            requested_by: 'workflow.requester',
            implementation_plan: 'E2E test implementation plan',
            backout_plan: 'E2E test backout plan',
            test_plan: 'E2E test validation plan'
          }]
        };

      case 'sc_request':
        return {
          result: [{
            ...baseRecord,
            state: '1',
            priority: '3',
            short_description: 'Workflow E2E Service Request',
            description: 'Testing service request workflow',
            requested_for: 'workflow.user',
            request_type: 'software'
          }]
        };

      default:
        return { result: [baseRecord] };
    }
  },

  makeRequestFullFields: async (table: string, query?: string, limit?: number) => {
    const basicResult = await workflowServiceNowClient.makeRequest(table, query, limit);
    return {
      result: basicResult.result.map(record => ({
        ...record,
        work_notes: 'Workflow test work notes',
        comments: 'Workflow test comments',
        approval_history: 'E2E approval history',
        resolution_code: '',
        close_code: '',
        opened_by: 'workflow.opener',
        assignment_group: 'E2E Test Group'
      }))
    };
  },

  createRecord: async (table: string, data: any) => {
    const result = await workflowServiceNowClient.makeRequest(table);
    return {
      result: {
        ...result.result[0],
        ...data,
        sys_created_on: new Date().toISOString()
      }
    };
  },

  updateRecord: async (table: string, sysId: string, data: any) => {
    return {
      result: {
        sys_id: sysId,
        ...data,
        sys_updated_on: new Date().toISOString()
      }
    };
  },

  deleteRecord: async (table: string, sysId: string) => {
    return {
      result: {
        sys_id: sysId,
        deleted: true,
        deleted_on: new Date().toISOString()
      }
    };
  }
};

describe('Workflow Scenarios - End-to-End Testing', () => {
  let consolidatedTicketService: ConsolidatedServiceNowService;
  let streamingService: UnifiedStreamingService;

  beforeAll(async () => {
    consolidatedTicketService = new ConsolidatedServiceNowService(workflowServiceNowClient);
    streamingService = UnifiedStreamingService.getInstance();

    // Initialize streaming with workflow support
    const mockRedisStreams = {
      subscribe: async (eventType: string, handler: any) => {
        console.log(`Workflow E2E Redis subscribe: ${eventType}`);
        return Promise.resolve();
      },
      publishChange: async (change: any) => {
        console.log(`Workflow E2E Redis publish:`, change);
        return Promise.resolve('workflow-message-id');
      },
      healthCheck: () => Promise.resolve({ status: 'healthy' })
    } as any;

    streamingService.initialize(mockRedisStreams);
  });

  afterAll(async () => {
    streamingService.cleanup();
  });

  describe('Workflow Scenario 1: Help Desk Ticket Management', () => {
    it('should execute complete help desk workflow from user request to resolution', async () => {
      console.log('=== Help Desk Workflow E2E Test Started ===');

      // Step 1: End User Creates Ticket
      console.log('Step 1: End user submitting help request...');
      const userRequest = {
        short_description: 'Cannot access email application',
        description: 'User reports email application crashes when trying to open. Error message: "Application has stopped working"',
        priority: '3',
        impact: '2',
        urgency: '2',
        caller_id: 'john.doe@company.com',
        category: 'software',
        subcategory: 'email',
        company: 'Test Company',
        location: 'New York Office'
      };

      const createdTicket = await consolidatedTicketService.createTicket('incident', userRequest);
      expect(createdTicket).toBeDefined();
      expect(createdTicket.sys_id).toBeDefined();
      expect(createdTicket.state).toBe('1'); // New
      
      const ticketSysId = createdTicket.sys_id;
      const ticketNumber = createdTicket.number;
      console.log(`✓ Ticket ${ticketNumber} created successfully`);

      // Step 2: Setup Real-time Monitoring
      console.log('Step 2: Setting up real-time monitoring for stakeholders...');
      const userSSEConnection = streamingService.createTicketSSEConnection(ticketSysId);
      const managerDashboardStream = streamingService.createStream(
        'help-desk-manager-001',
        'dashboard-stats',
        { intervalSeconds: 5 }
      );
      
      expect(userSSEConnection).toBeInstanceOf(Response);
      expect(managerDashboardStream).toBeDefined();
      console.log('✓ Real-time monitoring established');

      // Step 3: Help Desk Agent Triage
      console.log('Step 3: Help desk agent performing triage...');
      const triageUpdate = {
        state: '2', // In Progress  
        assigned_to: 'help.desk.agent',
        assignment_group: 'Help Desk L1',
        priority: '2', // Escalated due to business impact
        work_notes: 'Initial triage completed. Email issue affecting productivity. Escalating to L2 support.',
        comments: 'User contacted via phone. Confirmed issue reproduction steps.'
      };

      const triagedTicket = await consolidatedTicketService.updateTicket(
        'incident',
        ticketSysId,
        triageUpdate
      );
      expect(triagedTicket.state).toBe('2');
      expect(triagedTicket.assigned_to).toBe('help.desk.agent');
      console.log('✓ Triage completed, ticket escalated');

      // Step 4: Technical Assignment
      console.log('Step 4: Assigning to technical specialist...');
      const technicalAssignment = {
        assigned_to: 'email.specialist',
        assignment_group: 'Email Support Team',
        work_notes: 'Assigned to email specialist for detailed investigation. User reports application crashes.',
        state: '3' // Work in Progress
      };

      const assignedTicket = await consolidatedTicketService.updateTicket(
        'incident',
        ticketSysId,
        technicalAssignment
      );
      expect(assignedTicket.assigned_to).toBe('email.specialist');
      console.log('✓ Ticket assigned to technical specialist');

      // Step 5: Investigation and Resolution
      console.log('Step 5: Technical investigation and resolution...');
      const resolutionUpdate = {
        state: '6', // Resolved
        resolution_code: 'Solved (Permanently)',
        work_notes: 'Investigation revealed corrupted email profile. Rebuilt user email profile and tested functionality. Issue resolved.',
        close_notes: 'Email application working correctly after profile rebuild. User confirmed resolution.',
        resolution_notes: 'Root cause: Corrupted email profile due to recent system update. Preventive measure: Added profile backup automation.'
      };

      const resolvedTicket = await consolidatedTicketService.updateTicket(
        'incident',
        ticketSysId,
        resolutionUpdate
      );
      expect(resolvedTicket.state).toBe('6');
      console.log('✓ Ticket resolved by technical specialist');

      // Step 6: User Validation and Closure
      console.log('Step 6: User validation and ticket closure...');
      const closureUpdate = {
        state: '7', // Closed
        close_code: 'Solved (Permanently)',
        caller_feedback: 'Excellent service. Issue resolved quickly and professionally.',
        satisfaction_survey: 'Very Satisfied',
        work_notes: 'User confirmed resolution via phone call. No further issues reported.',
        close_notes: 'Ticket closed after user confirmation. Resolution time: 2 hours 15 minutes.'
      };

      const closedTicket = await consolidatedTicketService.updateTicket(
        'incident',
        ticketSysId,
        closureUpdate
      );
      expect(closedTicket.state).toBe('7');
      console.log('✓ Ticket closed with user confirmation');

      // Step 7: Verify Streaming Events
      console.log('Step 7: Verifying real-time event streaming...');
      const finalStats = streamingService.getConnectionStats();
      expect(finalStats.totalConnections).toBeGreaterThan(0);
      expect(finalStats.ticketConnections.has(ticketSysId)).toBe(true);

      // Simulate workflow completion event
      const workflowCompletionEvent = {
        event: 'workflow-completed' as const,
        data: {
          sysId: ticketSysId,
          number: ticketNumber,
          workflow: 'help-desk-management',
          completionTime: new Date().toISOString(),
          totalDuration: '2 hours 15 minutes',
          customerSatisfaction: 'Very Satisfied'
        },
        timestamp: new Date().toISOString()
      };

      streamingService.broadcastEvent(workflowCompletionEvent);
      console.log('✓ Workflow completion events broadcasted');

      console.log('=== Help Desk Workflow E2E Test Completed Successfully ===');
      console.log(`Final Status: Ticket ${ticketNumber} - Closed/Resolved with high customer satisfaction`);

    }, WORKFLOW_CONFIG.timeout);
  });

  describe('Workflow Scenario 2: Critical Incident Management', () => {
    it('should execute P1 critical incident workflow with escalation procedures', async () => {
      console.log('=== Critical Incident Management E2E Test Started ===');

      // Step 1: Incident Detection and Creation
      console.log('Step 1: Critical incident detected and reported...');
      const criticalIncident = {
        short_description: 'Production Email Service Complete Outage',
        description: 'All users unable to access email service. Mail servers responding with timeout errors. Business operations severely impacted.',
        priority: '1', // Critical
        impact: '1',   // High impact
        urgency: '1',  // High urgency  
        category: 'infrastructure',
        subcategory: 'email',
        state: '1',
        caller_id: 'monitoring.system',
        company: 'Enterprise Corp',
        assignment_group: 'Infrastructure Team',
        business_impact: 'Complete email service outage affecting 5000+ users. Revenue impact estimated at $10K/hour.'
      };

      const p1Incident = await consolidatedTicketService.createTicket('incident', criticalIncident);
      expect(p1Incident).toBeDefined();
      expect(p1Incident.priority).toBe('1');
      
      const incidentSysId = p1Incident.sys_id;
      const incidentNumber = p1Incident.number;
      console.log(`✓ P1 Incident ${incidentNumber} created - Priority: Critical`);

      // Step 2: Immediate Escalation and Notification
      console.log('Step 2: Immediate escalation to on-call team...');
      
      // Setup multiple monitoring streams for stakeholders
      const warRoomStream = streamingService.createTicketSSEConnection(incidentSysId);
      const executiveDashboard = streamingService.createStream(
        'executive-dashboard',
        'dashboard-stats',
        { intervalSeconds: 30 }
      );
      const incidentCommanderStream = streamingService.createStream(
        'incident-commander',
        'sla-monitoring', 
        { filters: { breachesOnly: true } }
      );

      expect(warRoomStream).toBeInstanceOf(Response);
      expect(executiveDashboard).toBeDefined();
      expect(incidentCommanderStream).toBeDefined();

      const escalationUpdate = {
        state: '2', // In Progress
        assigned_to: 'incident.commander',
        assignment_group: 'Major Incident Team',
        priority: '1',
        work_notes: 'P1 INCIDENT: Email service outage. War room initiated. Incident commander assigned. Executive team notified.',
        escalation_level: '3',
        war_room_bridge: 'Conference Line: 555-0123, PIN: 7890',
        stakeholders_notified: 'CTO, IT Director, Operations Manager, Customer Support Manager'
      };

      const escalatedIncident = await consolidatedTicketService.updateTicket(
        'incident',
        incidentSysId,
        escalationUpdate
      );
      expect(escalatedIncident.assigned_to).toBe('incident.commander');
      console.log('✓ Incident escalated to Major Incident Team');

      // Step 3: War Room Coordination
      console.log('Step 3: War room coordination and resource mobilization...');
      const warRoomUpdate = {
        state: '3', // Work in Progress
        work_notes: 'War room active. Teams mobilized: Infrastructure (3), Database (2), Network (2), Customer Support (5). Initial assessment in progress.',
        resolution_team: 'Infrastructure Team, Database Team, Network Operations',
        current_status: 'Investigating root cause. Database connectivity issues identified. Failover procedures initiated.',
        next_update_time: new Date(Date.now() + 15 * 60000).toISOString() // Next update in 15 minutes
      };

      const warRoomActive = await consolidatedTicketService.updateTicket(
        'incident',
        incidentSysId,
        warRoomUpdate
      );
      expect(warRoomActive.state).toBe('3');
      console.log('✓ War room active, teams mobilized');

      // Step 4: Mitigation Actions
      console.log('Step 4: Implementing mitigation procedures...');
      const mitigationUpdate = {
        work_notes: 'MITIGATION: Failover to backup mail servers initiated. Database cluster failover completed. Service restoration in progress.',
        mitigation_actions: 'Backup servers activated, Load balancer redirected, Database cluster failover executed',
        current_status: 'Partial service restoration achieved. 60% of users can access email. Full restoration ETA: 30 minutes.',
        business_impact_update: 'Partial service restored. Current impact reduced to $3K/hour.'
      };

      const mitigatedIncident = await consolidatedTicketService.updateTicket(
        'incident',
        incidentSysId,
        mitigationUpdate
      );
      expect(mitigatedIncident).toBeDefined();
      console.log('✓ Mitigation actions implemented');

      // Step 5: Full Resolution
      console.log('Step 5: Achieving full service restoration...');
      const resolutionUpdate = {
        state: '6', // Resolved
        resolution_code: 'Solved (Permanently)',
        work_notes: 'RESOLVED: Full email service restored. All users can access email normally. Performance monitoring shows normal metrics.',
        resolution_summary: 'Root cause: Primary database server hardware failure. Resolution: Automatic failover to backup cluster completed successfully.',
        service_restored_time: new Date().toISOString(),
        resolution_team_final: 'Infrastructure Team (lead), Database Team, Network Operations',
        final_business_impact: 'Total outage duration: 47 minutes. Estimated revenue impact: $7,800.'
      };

      const resolvedP1 = await consolidatedTicketService.updateTicket(
        'incident',
        incidentSysId,
        resolutionUpdate
      );
      expect(resolvedP1.state).toBe('6');
      console.log('✓ P1 Incident fully resolved');

      // Step 6: Post-Incident Activities
      console.log('Step 6: Post-incident documentation and closure...');
      const closureUpdate = {
        state: '7', // Closed
        close_code: 'Solved (Permanently)',
        post_mortem_required: 'Yes',
        post_mortem_scheduled: new Date(Date.now() + 24 * 60 * 60000).toISOString(), // Tomorrow
        lessons_learned: 'Database monitoring alerts need tuning. Failover automation worked correctly. Communication procedures effective.',
        preventive_actions: 'Enhanced database monitoring, Additional backup server capacity, Updated escalation procedures',
        final_stakeholder_communication: 'Executive summary sent to all stakeholders. Customer communication completed via multiple channels.'
      };

      const closedP1 = await consolidatedTicketService.updateTicket(
        'incident',
        incidentSysId,
        closureUpdate
      );
      expect(closedP1.state).toBe('7');
      console.log('✓ P1 Incident closed with post-mortem scheduled');

      // Step 7: Verify Critical Incident Metrics
      const streamingStats = streamingService.getConnectionStats();
      expect(streamingStats.totalConnections).toBeGreaterThan(0);

      console.log('=== Critical Incident Management E2E Test Completed Successfully ===');
      console.log(`Final Status: P1 Incident ${incidentNumber} - Resolved in 47 minutes with successful service restoration`);

    }, WORKFLOW_CONFIG.timeout);
  });

  describe('Workflow Scenario 3: Change Management Approval Workflow', () => {
    it('should execute complete change request approval workflow', async () => {
      console.log('=== Change Management Workflow E2E Test Started ===');

      // Step 1: Change Request Submission
      console.log('Step 1: Submitting change request...');
      const changeRequest = {
        short_description: 'Upgrade Production Database Server Memory',
        description: 'Upgrade database server RAM from 64GB to 128GB to improve performance and support increased user load.',
        type: 'standard',
        priority: '2',
        risk: '2',
        impact: '2',
        requested_by: 'database.admin',
        business_justification: 'Current memory utilization at 95%. Upgrade will improve response times by 40% and support 50% more concurrent users.',
        implementation_plan: 'Schedule maintenance window, Install additional RAM modules, Update server configuration, Perform validation testing',
        backout_plan: 'Remove new RAM modules, Restore previous configuration, Restart services with original settings',
        test_plan: 'Performance benchmarking, Load testing, Database integrity verification, Application connectivity tests',
        scheduled_start_date: new Date(Date.now() + 7 * 24 * 60 * 60000).toISOString(), // One week from now
        scheduled_end_date: new Date(Date.now() + 7 * 24 * 60 * 60000 + 4 * 60 * 60000).toISOString(), // 4 hours duration
        maintenance_window: '2:00 AM - 6:00 AM EST'
      };

      const createdChange = await consolidatedTicketService.createTicket('change_request', changeRequest);
      expect(createdChange).toBeDefined();
      expect(createdChange.type).toBe('standard');
      
      const changeSysId = createdChange.sys_id;
      const changeNumber = createdChange.number;
      console.log(`✓ Change Request ${changeNumber} submitted successfully`);

      // Step 2: Impact Assessment
      console.log('Step 2: Conducting impact assessment...');
      
      // Setup change tracking streams
      const changeTrackerStream = streamingService.createTicketSSEConnection(changeSysId);
      const cabDashboard = streamingService.createStream(
        'cab-dashboard',
        'dashboard-stats',
        { intervalSeconds: 60 }
      );
      
      expect(changeTrackerStream).toBeInstanceOf(Response);
      expect(cabDashboard).toBeDefined();

      const impactAssessment = {
        state: '2', // Assessment
        assigned_to: 'change.analyst',
        assignment_group: 'Change Management',
        work_notes: 'Impact assessment initiated. Analyzing affected systems and dependencies.',
        impact_analysis: 'Affected Systems: Production DB, Web Applications (5), Reporting Services. Downtime: 4 hours maximum.',
        risk_analysis: 'Low risk - Standard procedure. Hardware upgrade with proven backout plan. Maintenance window selected for minimal business impact.',
        stakeholder_analysis: 'IT Operations, Database Team, Web Development, Business Users (Marketing, Sales)',
        dependency_analysis: 'Web applications will be unavailable during maintenance. Reporting services temporarily affected.'
      };

      const assessedChange = await consolidatedTicketService.updateTicket(
        'change_request',
        changeSysId,
        impactAssessment
      );
      expect(assessedChange.assigned_to).toBe('change.analyst');
      console.log('✓ Impact assessment completed');

      // Step 3: CAB Review Process
      console.log('Step 3: Change Advisory Board review...');
      const cabReview = {
        state: '3', // Authorize
        work_notes: 'CAB Review initiated. Change presented to board members for approval consideration.',
        cab_date: new Date(Date.now() + 2 * 24 * 60 * 60000).toISOString(), // CAB meeting in 2 days
        cab_members: 'IT Director, Database Manager, Operations Manager, Security Lead, Business Representative',
        cab_recommendation: 'Approved with conditions',
        approval_conditions: 'Additional validation testing required, Stakeholder communication plan mandatory, Extended monitoring post-implementation'
      };

      const cabReviewedChange = await consolidatedTicketService.updateTicket(
        'change_request',
        changeSysId,
        cabReview
      );
      expect(cabReviewedChange.state).toBe('3');
      console.log('✓ CAB review completed with conditional approval');

      // Step 4: Stakeholder Approvals
      console.log('Step 4: Collecting stakeholder approvals...');
      const approvalUpdate = {
        state: '4', // Scheduled
        work_notes: 'All required approvals obtained. Change scheduled for implementation.',
        technical_approval: 'Approved - Database Manager (John Smith)',
        business_approval: 'Approved - Operations Manager (Jane Doe)', 
        security_approval: 'Approved - Security Lead (Mike Wilson)',
        final_approval: 'Approved - IT Director (Sarah Johnson)',
        approval_date: new Date().toISOString(),
        implementation_assigned_to: 'database.team.lead',
        pre_implementation_checklist: 'Backup verification, Team notification, Tool preparation, Communication sent'
      };

      const approvedChange = await consolidatedTicketService.updateTicket(
        'change_request', 
        changeSysId,
        approvalUpdate
      );
      expect(approvedChange.state).toBe('4');
      console.log('✓ All stakeholder approvals obtained');

      // Step 5: Implementation
      console.log('Step 5: Change implementation...');
      const implementationUpdate = {
        state: '5', // Implement
        work_notes: 'Change implementation started. Maintenance window active. RAM upgrade in progress.',
        implementation_start_time: new Date().toISOString(),
        implementation_status: 'In Progress',
        implementation_team: 'Database Team (3), Infrastructure Team (2), Network Operations (1)',
        implementation_notes: 'Server shut down successful, RAM modules installed, Configuration updated, System boot successful, Initial testing passed'
      };

      const implementingChange = await consolidatedTicketService.updateTicket(
        'change_request',
        changeSysId,
        implementationUpdate
      );
      expect(implementingChange.state).toBe('5');
      console.log('✓ Change implementation in progress');

      // Step 6: Validation and Closure
      console.log('Step 6: Post-implementation validation...');
      const validationUpdate = {
        state: '6', // Review
        implementation_end_time: new Date().toISOString(),
        implementation_status: 'Completed Successfully',
        validation_results: 'All tests passed. Database performance improved 42%. No connectivity issues detected.',
        post_implementation_testing: 'Performance benchmarks: PASSED, Load testing: PASSED, Integrity verification: PASSED, Application connectivity: PASSED',
        success_criteria_met: 'Yes - All objectives achieved',
        actual_downtime: '3 hours 15 minutes (45 minutes under estimated)',
        rollback_required: 'No'
      };

      const validatedChange = await consolidatedTicketService.updateTicket(
        'change_request',
        changeSysId,
        validationUpdate
      );
      expect(validatedChange.state).toBe('6');

      // Final Closure
      const closureUpdate = {
        state: '7', // Closed
        close_code: 'Successful',
        close_notes: 'Change implemented successfully. All objectives met. No issues reported.',
        lessons_learned: 'Implementation completed ahead of schedule. Excellent team coordination. Documentation was comprehensive.',
        post_implementation_review: 'Scheduled for next week to assess long-term performance improvements'
      };

      const closedChange = await consolidatedTicketService.updateTicket(
        'change_request',
        changeSysId,
        closureUpdate
      );
      expect(closedChange.state).toBe('7');
      console.log('✓ Change successfully implemented and closed');

      console.log('=== Change Management Workflow E2E Test Completed Successfully ===');
      console.log(`Final Status: Change ${changeNumber} - Successfully implemented with performance improvements achieved`);

    }, WORKFLOW_CONFIG.timeout);
  });

  describe('Workflow Integration Validation', () => {
    it('should handle multiple concurrent workflows without interference', async () => {
      console.log('=== Multi-Workflow Concurrent Test Started ===');

      const concurrentWorkflows = [
        { type: 'incident', description: 'Concurrent Incident 1' },
        { type: 'incident', description: 'Concurrent Incident 2' },
        { type: 'change_request', description: 'Concurrent Change 1' },
        { type: 'change_request', description: 'Concurrent Change 2' },
        { type: 'sc_request', description: 'Concurrent Service Request 1' }
      ];

      const workflowPromises = concurrentWorkflows.map(async (workflow, index) => {
        const ticketData = {
          short_description: `${workflow.description} - E2E Test`,
          description: `Concurrent workflow testing - ${workflow.type} #${index + 1}`,
          priority: '3'
        };

        // Create ticket
        const ticket = await consolidatedTicketService.createTicket(workflow.type, ticketData);
        
        // Setup monitoring
        const sseConnection = streamingService.createTicketSSEConnection(ticket.sys_id);
        
        // Simulate workflow progression
        const progressUpdate = {
          state: '2',
          work_notes: `Concurrent workflow ${index + 1} progressing`,
          assigned_to: `concurrent.user.${index + 1}`
        };
        
        const updatedTicket = await consolidatedTicketService.updateTicket(
          workflow.type,
          ticket.sys_id,
          progressUpdate
        );

        return {
          original: ticket,
          updated: updatedTicket,
          hasSSE: sseConnection instanceof Response
        };
      });

      const results = await Promise.all(workflowPromises);

      // Validate all workflows completed successfully
      results.forEach((result, index) => {
        expect(result.original).toBeDefined();
        expect(result.updated).toBeDefined();
        expect(result.hasSSE).toBe(true);
        expect(result.updated.state).toBe('2');
        console.log(`✓ Concurrent workflow ${index + 1} completed successfully`);
      });

      // Verify streaming service handled all connections
      const streamStats = streamingService.getConnectionStats();
      expect(streamStats.totalConnections).toBeGreaterThanOrEqual(concurrentWorkflows.length);

      console.log('=== Multi-Workflow Concurrent Test Completed Successfully ===');
      console.log(`Successfully processed ${concurrentWorkflows.length} concurrent workflows`);
    }, WORKFLOW_CONFIG.timeout);

    it('should maintain workflow data integrity under load', async () => {
      const loadTestTickets = 25;
      const operationsPerTicket = 4; // create, assign, update, resolve

      console.log(`Starting workflow load test: ${loadTestTickets} tickets x ${operationsPerTicket} operations each`);

      const loadTestPromises = [];

      for (let i = 0; i < loadTestTickets; i++) {
        const loadTestPromise = (async () => {
          // Create
          const ticket = await consolidatedTicketService.createTicket('incident', {
            short_description: `Load Test Incident ${i + 1}`,
            description: `Workflow load testing ticket ${i + 1}`,
            priority: '3',
            category: 'software'
          });

          // Assign
          const assigned = await consolidatedTicketService.updateTicket('incident', ticket.sys_id, {
            state: '2',
            assigned_to: `load.test.user.${i + 1}`,
            work_notes: `Load test assignment ${i + 1}`
          });

          // Update
          const updated = await consolidatedTicketService.updateTicket('incident', ticket.sys_id, {
            state: '3',
            work_notes: `Load test progress update ${i + 1}`,
            priority: '2'
          });

          // Resolve
          const resolved = await consolidatedTicketService.updateTicket('incident', ticket.sys_id, {
            state: '6',
            resolution_code: 'Solved (Permanently)',
            work_notes: `Load test resolution ${i + 1}`
          });

          return {
            created: ticket,
            assigned: assigned,
            updated: updated,
            resolved: resolved
          };
        })();

        loadTestPromises.push(loadTestPromise);
      }

      const loadResults = await Promise.all(loadTestPromises);

      // Validate data integrity
      loadResults.forEach((result, index) => {
        expect(result.created.sys_id).toBeDefined();
        expect(result.assigned.sys_id).toBe(result.created.sys_id);
        expect(result.updated.sys_id).toBe(result.created.sys_id);
        expect(result.resolved.sys_id).toBe(result.created.sys_id);
        expect(result.resolved.state).toBe('6');
      });

      console.log(`✓ Workflow load test completed successfully: ${loadTestTickets} tickets processed with full data integrity`);
    }, WORKFLOW_CONFIG.timeout * 2);
  });
});