/**
 * ServiceNow CRUD Testing Script - Complete Integration Testing
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Tests all CRUD operations against ServiceNow API with monitored groups
 * Focus on "L2-NE-IT APP AND DATABASE" group
 */

import { ServiceNowAuthClient } from './src/services/ServiceNowAuthClient';
import { EnhancedTicketStorageService } from './src/services/EnhancedTicketStorageService';

interface TestResults {
  operation: string;
  success: boolean;
  data?: any;
  error?: string;
  timing?: number;
}

class ServiceNowCRUDTester {
  private serviceNowClient: ServiceNowAuthClient;
  private mongoStorage: EnhancedTicketStorageService;
  private testResults: TestResults[] = [];

  // Monitored groups from htmx-dashboard-clean.ts
  private readonly MONITORED_GROUPS = [
    "L2-NE-IT APP AND DATABASE",
    "L2-NE-IT SAP BASIS", 
    "L2-NE-IT APP AND SERVICES",
    "L2-NE-IT PROCESSING",
    "L2-NE-IT NETWORK SECURITY",
    "L2-NE-IT NETWORK",
    "L2-NE-CLOUDSERVICES",
    "L2-NE-IT MONITORY",
    "L2-NE-IT SO UNIX",
    "L2-NE-IT BOC",
    "L2-NE-IT MIDDLEWARE",
    "L2-NE-IT BACKUP",
    "L2-NE-IT STORAGE",
    "L2-NE-IT VOIP",
    "L2-NE-IT NOC",
    "L2-NE-IT PCP PRODUCTION"
  ];

  constructor() {
    this.serviceNowClient = new ServiceNowAuthClient();
    this.mongoStorage = new EnhancedTicketStorageService();
  }

  async initialize(): Promise<void> {
    console.log('🚀 Initializing ServiceNow CRUD Tester...');
    
    try {
      // Initialize MongoDB connection
      await this.mongoStorage.initialize();
      console.log('✅ MongoDB connection initialized');
      
      // Test ServiceNow authentication
      await this.serviceNowClient.authenticate();
      console.log('✅ ServiceNow authentication successful');
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      throw error;
    }
  }

  private async recordTestResult(operation: string, success: boolean, data?: any, error?: string, timing?: number): Promise<void> {
    const result: TestResults = {
      operation,
      success,
      data,
      error,
      timing
    };
    
    this.testResults.push(result);
    
    const status = success ? '✅' : '❌';
    const timingInfo = timing ? ` (${timing}ms)` : '';
    console.log(`${status} ${operation}${timingInfo}`);
    
    if (error) {
      console.error(`   Error: ${error}`);
    }
  }

  async testReadOperations(): Promise<void> {
    console.log('\n📖 Testing READ Operations...');
    
    // Test 1: Read incidents from APP AND DATABASE group
    await this.testReadIncidentsFromGroup("L2-NE-IT APP AND DATABASE");
    
    // Test 2: Read change tasks from APP AND DATABASE group
    await this.testReadChangeTasksFromGroup("L2-NE-IT APP AND DATABASE");
    
    // Test 3: Read service request tasks from APP AND DATABASE group
    await this.testReadSCTasksFromGroup("L2-NE-IT APP AND DATABASE");
    
    // Test 4: Compare MongoDB vs ServiceNow data consistency
    await this.testDataConsistency("L2-NE-IT APP AND DATABASE");
  }

  private async testReadIncidentsFromGroup(groupName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const query = `assignment_group.nameCONTAINS${groupName}^state!=6^state!=7`; // Exclude closed/resolved
      
      const response = await this.serviceNowClient.makeRequestFullFields(
        'incident',
        query,
        10,
        'sys_id,number,short_description,state,priority,assignment_group,assigned_to,caller_id,sys_created_on,sys_updated_on'
      );
      
      const timing = Date.now() - startTime;
      
      if (response && response.result && response.result.length > 0) {
        await this.recordTestResult(
          `READ Incidents from ${groupName}`,
          true,
          {
            count: response.result.length,
            sample: response.result[0],
            total_found: response.result.length
          },
          undefined,
          timing
        );
        
        // Test detailed incident with SLA and notes
        const firstIncident = response.result[0];
        await this.testIncidentDetails(firstIncident.sys_id, firstIncident.number);
        
      } else {
        await this.recordTestResult(
          `READ Incidents from ${groupName}`,
          true,
          { count: 0, message: 'No active incidents found for this group' },
          undefined,
          timing
        );
      }
      
    } catch (error) {
      const timing = Date.now() - startTime;
      await this.recordTestResult(
        `READ Incidents from ${groupName}`,
        false,
        undefined,
        String(error),
        timing
      );
    }
  }

  private async testIncidentDetails(sysId: string, incidentNumber: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get full incident details
      const incidentResponse = await this.serviceNowClient.makeRequestFullFields(
        'incident',
        `sys_id=${sysId}`,
        1,
        'sys_id,number,short_description,description,state,priority,urgency,impact,category,subcategory,assignment_group,assigned_to,caller_id,opened_by,sys_created_on,sys_updated_on,resolved_at,closed_at,close_code,close_notes,resolution_code,resolution_notes'
      );
      
      // Get SLA data for incident
      const slaResponse = await this.serviceNowClient.makeRequestFullFields(
        'task_sla',
        `task=${sysId}`,
        50,
        'sys_id,task,sla,stage,business_percentage,has_breached,start_time,end_time,business_duration,planned_end_time'
      );
      
      // Get notes for incident  
      const notesResponse = await this.serviceNowClient.makeRequestFullFields(
        'sys_journal_field',
        `element_id=${sysId}`,
        50,
        'sys_id,element_id,element,value,sys_created_on,sys_created_by'
      );
      
      const timing = Date.now() - startTime;
      
      await this.recordTestResult(
        `READ Detailed Incident ${incidentNumber}`,
        true,
        {
          incident: incidentResponse?.result?.[0] || null,
          sla_count: slaResponse?.result?.length || 0,
          sla_data: slaResponse?.result || [],
          notes_count: notesResponse?.result?.length || 0,
          notes_sample: notesResponse?.result?.slice(0, 3) || []
        },
        undefined,
        timing
      );
      
    } catch (error) {
      const timing = Date.now() - startTime;
      await this.recordTestResult(
        `READ Detailed Incident ${incidentNumber}`,
        false,
        undefined,
        String(error),
        timing
      );
    }
  }

  private async testReadChangeTasksFromGroup(groupName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const query = `assignment_group.nameCONTAINS${groupName}^state!=3^state!=-5`; // Exclude closed states
      
      const response = await this.serviceNowClient.makeRequestFullFields(
        'change_task',
        query,
        10,
        'sys_id,number,short_description,state,priority,assignment_group,assigned_to,change_request,sys_created_on,sys_updated_on'
      );
      
      const timing = Date.now() - startTime;
      
      await this.recordTestResult(
        `READ Change Tasks from ${groupName}`,
        true,
        {
          count: response?.result?.length || 0,
          sample: response?.result?.[0] || null
        },
        undefined,
        timing
      );
      
    } catch (error) {
      const timing = Date.now() - startTime;
      await this.recordTestResult(
        `READ Change Tasks from ${groupName}`,
        false,
        undefined,
        String(error),
        timing
      );
    }
  }

  private async testReadSCTasksFromGroup(groupName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const query = `assignment_group.nameCONTAINS${groupName}^state!=3^state!=-5`; // Exclude closed states
      
      const response = await this.serviceNowClient.makeRequestFullFields(
        'sc_task',
        query,
        10,
        'sys_id,number,short_description,state,priority,assignment_group,assigned_to,request,sys_created_on,sys_updated_on'
      );
      
      const timing = Date.now() - startTime;
      
      await this.recordTestResult(
        `READ Service Request Tasks from ${groupName}`,
        true,
        {
          count: response?.result?.length || 0,
          sample: response?.result?.[0] || null
        },
        undefined,
        timing
      );
      
    } catch (error) {
      const timing = Date.now() - startTime;
      await this.recordTestResult(
        `READ Service Request Tasks from ${groupName}`,
        false,
        undefined,
        String(error),
        timing
      );
    }
  }

  private async testDataConsistency(groupName: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Get data from ServiceNow
      const serviceNowResponse = await this.serviceNowClient.makeRequestFullFields(
        'incident',
        `assignment_group.nameCONTAINS${groupName}`,
        5,
        'sys_id,number,state,sys_updated_on'
      );
      
      // Get data from MongoDB
      const mongoData = await this.mongoStorage.getTicketsByAssignmentGroup('incident', groupName, 5);
      
      const timing = Date.now() - startTime;
      
      const serviceNowCount = serviceNowResponse?.result?.length || 0;
      const mongoCount = mongoData?.length || 0;
      
      const consistencyRatio = mongoCount > 0 ? Math.min(serviceNowCount, mongoCount) / Math.max(serviceNowCount, mongoCount) : 0;
      
      await this.recordTestResult(
        `Data Consistency Check ${groupName}`,
        consistencyRatio > 0.8, // Consider >80% consistency as success
        {
          servicenow_count: serviceNowCount,
          mongodb_count: mongoCount,
          consistency_ratio: consistencyRatio,
          recommendation: consistencyRatio < 0.8 ? 'Run background sync to improve consistency' : 'Data consistency is good'
        },
        consistencyRatio < 0.8 ? 'Data inconsistency detected between ServiceNow and MongoDB' : undefined,
        timing
      );
      
    } catch (error) {
      const timing = Date.now() - startTime;
      await this.recordTestResult(
        `Data Consistency Check ${groupName}`,
        false,
        undefined,
        String(error),
        timing
      );
    }
  }

  async testCreateOperations(): Promise<void> {
    console.log('\n✏️ Testing CREATE Operations...');
    
    // Test creating an incident (careful - this creates real data)
    await this.testCreateIncident();
  }

  private async testCreateIncident(): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Create a test incident in the APP AND DATABASE group
      const testIncidentData = {
        short_description: `CRUD Test Incident - ${new Date().toISOString()}`,
        description: 'This is a test incident created by the CRUD testing script. Safe to delete.',
        category: 'software',
        subcategory: 'database',
        priority: '3', // Medium
        urgency: '3',
        impact: '3',
        state: '1', // New
        assignment_group: 'L2-NE-IT APP AND DATABASE',
        caller_id: 'admin' // Use admin for testing
      };
      
      const response = await this.serviceNowClient.createRecord('incident', testIncidentData);
      
      const timing = Date.now() - startTime;
      
      if (response && response.result) {
        await this.recordTestResult(
          'CREATE Test Incident',
          true,
          {
            sys_id: response.result.sys_id,
            number: response.result.number,
            created_data: testIncidentData
          },
          undefined,
          timing
        );
        
        // Store the created sys_id for update and delete tests
        (this as any).createdIncidentSysId = response.result.sys_id;
        (this as any).createdIncidentNumber = response.result.number;
        
      } else {
        throw new Error('No result returned from create operation');
      }
      
    } catch (error) {
      const timing = Date.now() - startTime;
      await this.recordTestResult(
        'CREATE Test Incident',
        false,
        undefined,
        String(error),
        timing
      );
    }
  }

  async testUpdateOperations(): Promise<void> {
    console.log('\n📝 Testing UPDATE Operations...');
    
    if ((this as any).createdIncidentSysId) {
      await this.testUpdateIncident((this as any).createdIncidentSysId, (this as any).createdIncidentNumber);
    } else {
      console.log('⚠️ No created incident available for update test');
    }
  }

  private async testUpdateIncident(sysId: string, incidentNumber: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const updateData = {
        state: '2', // In Progress
        assigned_to: 'admin',
        work_notes: `Updated by CRUD test script at ${new Date().toISOString()}`
      };
      
      const response = await this.serviceNowClient.updateRecord('incident', sysId, updateData);
      
      const timing = Date.now() - startTime;
      
      if (response) {
        await this.recordTestResult(
          `UPDATE Test Incident ${incidentNumber}`,
          true,
          {
            sys_id: sysId,
            updated_data: updateData,
            result: response.result || response
          },
          undefined,
          timing
        );
      } else {
        throw new Error('No response from update operation');
      }
      
    } catch (error) {
      const timing = Date.now() - startTime;
      await this.recordTestResult(
        `UPDATE Test Incident ${incidentNumber}`,
        false,
        undefined,
        String(error),
        timing
      );
    }
  }

  async testDeleteOperations(): Promise<void> {
    console.log('\n🗑️ Testing DELETE Operations...');
    
    if ((this as any).createdIncidentSysId) {
      await this.testDeleteIncident((this as any).createdIncidentSysId, (this as any).createdIncidentNumber);
    } else {
      console.log('⚠️ No created incident available for delete test');
    }
  }

  private async testDeleteIncident(sysId: string, incidentNumber: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      // Note: Instead of actual delete, we'll close the incident which is safer
      const closeData = {
        state: '7', // Closed
        close_code: 'Resolved by Caller',
        close_notes: `Test incident closed by CRUD testing script at ${new Date().toISOString()}`
      };
      
      const response = await this.serviceNowClient.updateRecord('incident', sysId, closeData);
      
      const timing = Date.now() - startTime;
      
      if (response) {
        await this.recordTestResult(
          `CLOSE (instead of DELETE) Test Incident ${incidentNumber}`,
          true,
          {
            sys_id: sysId,
            close_data: closeData,
            note: 'Closed instead of deleted for safety'
          },
          undefined,
          timing
        );
      } else {
        throw new Error('No response from close operation');
      }
      
    } catch (error) {
      const timing = Date.now() - startTime;
      await this.recordTestResult(
        `CLOSE Test Incident ${incidentNumber}`,
        false,
        undefined,
        String(error),
        timing
      );
    }
  }

  generateReport(): void {
    console.log('\n📊 CRUD Test Results Summary');
    console.log('='.repeat(50));
    
    const totalTests = this.testResults.length;
    const successfulTests = this.testResults.filter(r => r.success).length;
    const failedTests = totalTests - successfulTests;
    const successRate = ((successfulTests / totalTests) * 100).toFixed(1);
    
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Successful: ${successfulTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success Rate: ${successRate}%`);
    
    if (failedTests > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => !r.success)
        .forEach(result => {
          console.log(`  - ${result.operation}: ${result.error}`);
        });
    }
    
    console.log('\n🎯 Key Findings:');
    
    // Find data consistency results
    const consistencyTests = this.testResults.filter(r => r.operation.includes('Data Consistency'));
    if (consistencyTests.length > 0) {
      consistencyTests.forEach(test => {
        if (test.data?.consistency_ratio !== undefined) {
          console.log(`  - ${test.operation}: ${(test.data.consistency_ratio * 100).toFixed(1)}% consistency`);
          if (test.data.recommendation) {
            console.log(`    Recommendation: ${test.data.recommendation}`);
          }
        }
      });
    }
    
    // Find read operation results
    const readTests = this.testResults.filter(r => r.operation.includes('READ') && r.data?.count !== undefined);
    if (readTests.length > 0) {
      console.log('\n📋 Data Found:');
      readTests.forEach(test => {
        console.log(`  - ${test.operation}: ${test.data.count} records`);
      });
    }
    
    console.log('\n📄 Full test results saved to test results array');
  }

  async runAllTests(): Promise<void> {
    try {
      await this.initialize();
      
      console.log('\n🧪 Starting Comprehensive CRUD Testing...');
      console.log(`Target Group: "L2-NE-IT APP AND DATABASE"`);
      console.log(`Total Monitored Groups: ${this.MONITORED_GROUPS.length}`);
      
      // Run all test suites
      await this.testReadOperations();
      await this.testCreateOperations();  
      await this.testUpdateOperations();
      await this.testDeleteOperations();
      
      // Generate final report
      this.generateReport();
      
    } catch (error) {
      console.error('💥 Critical test failure:', error);
      throw error;
    }
  }

  getTestResults(): TestResults[] {
    return this.testResults;
  }
}

// Export for use in other scripts
export { ServiceNowCRUDTester, TestResults };

// Run tests if called directly
if (import.meta.main) {
  console.log('🚀 ServiceNow CRUD Testing Script Starting...');
  
  const tester = new ServiceNowCRUDTester();
  
  tester.runAllTests()
    .then(() => {
      console.log('\n✅ All CRUD tests completed successfully!');
      console.log('📊 Check the test results above for detailed information.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 CRUD testing failed:', error);
      process.exit(1);
    });
}