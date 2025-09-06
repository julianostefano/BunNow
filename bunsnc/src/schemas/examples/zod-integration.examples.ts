/**
 * Zod Integration Examples - Practical usage examples and tests
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 * 
 * Following MVC Guidelines:
 * - ≤ 500 lines per file
 * - Practical usage examples
 * - Integration testing examples
 */

import { z } from 'zod';
import { 
  unifiedRegistry,
  CommonSchemas,
  ElysiaSchemas,
  validateSchema,
  safeValidateSchema
} from '../utils/schema-registry';

import { 
  IncidentSchema,
  IncidentCreationSchema,
  IncidentResolutionSchema
} from '../tickets/incident.schemas';

import {
  ChangeTaskSchema,
  ChangeTaskCreationSchema
} from '../tickets/change-task.schemas';

import {
  ServiceCatalogTaskSchema,
  ServiceTaskCreationSchema
} from '../tickets/sc-task.schemas';

import {
  SLAValidationSchema,
  IncidentEscalationValidationSchema,
  ServiceRequestValidationSchema
} from '../validations/advanced.validations';

// ===== BASIC USAGE EXAMPLES =====

/**
 * Example: Creating and validating an incident
 */
export function exampleCreateIncident() {
  console.log('=== Incident Creation Example ===');
  
  const incidentData = {
    short_description: "Email service is down for multiple users",
    description: "Multiple users reporting inability to access email service. Error message indicates server connection timeout.",
    priority: "2", // High priority
    urgency: "2",
    impact: "2",
    category: "email",
    subcategory: "service_outage",
    assignment_group: "IT Support Team", // Would be sys_id in real scenario
    state: "1", // New
    caller_id: "user123_sys_id",
    opened_by: "user123_sys_id",
    contact_type: "email"
  };

  try {
    // Using unified registry
    const validationResult = validateSchema('incident-creation', incidentData);
    
    if (validationResult.success) {
      console.log('✅ Incident validation successful:', validationResult.data?.short_description);
    } else {
      console.log('❌ Incident validation failed:', validationResult.errors);
    }
    
    // Using direct Zod schema
    const zodValidation = IncidentCreationSchema.safeParse(incidentData);
    console.log('Direct Zod validation:', zodValidation.success ? '✅ Success' : '❌ Failed');
    
  } catch (error) {
    console.error('Validation error:', error);
  }
}

/**
 * Example: Creating and validating a change task
 */
export function exampleCreateChangeTask() {
  console.log('=== Change Task Creation Example ===');
  
  const changeTaskData = {
    short_description: "Update database schema for new user fields",
    description: "Add new user profile fields to support enhanced user management features",
    change_request: "CHG001234_sys_id", // Parent change request
    type: "implementation",
    planned_start_date: "2025-01-10 09:00:00",
    planned_end_date: "2025-01-10 12:00:00",
    implementation_plan: "1. Backup database\n2. Execute schema changes\n3. Verify data integrity\n4. Update application configuration",
    assignment_group: "database_team_sys_id",
    priority: "3",
    state: "1", // Open
    order: "2" // Second task in sequence
  };

  try {
    const validationResult = validateSchema('change-task-creation', changeTaskData);
    
    if (validationResult.success) {
      console.log('✅ Change task validation successful:', validationResult.data?.short_description);
    } else {
      console.log('❌ Change task validation failed:', validationResult.errors);
    }
    
  } catch (error) {
    console.error('Change task validation error:', error);
  }
}

/**
 * Example: Creating and validating a service catalog task
 */
export function exampleCreateServiceTask() {
  console.log('=== Service Catalog Task Creation Example ===');
  
  const serviceTaskData = {
    short_description: "Provision new laptop for employee",
    description: "Configure and deploy new laptop with standard software package",
    request: "REQ001234_sys_id", // Parent service request
    task_type: "provision",
    cat_item: "laptop_standard_sys_id",
    assignment_group: "hardware_provisioning_sys_id",
    planned_start_date: "2025-01-08 08:00:00",
    planned_end_date: "2025-01-08 17:00:00",
    delivery_plan: "1. Order hardware from vendor\n2. Install standard software image\n3. Configure user accounts\n4. Ship to employee location",
    variables: {
      employee_name: "John Doe",
      location: "New York Office",
      department: "Sales",
      manager_approval: "MGR123_sys_id",
      laptop_model: "Dell Latitude 7420",
      additional_software: ["Office 365", "Salesforce Desktop"]
    },
    priority: "3",
    state: "2" // Assigned
  };

  try {
    const validationResult = validateSchema('service-task-creation', serviceTaskData);
    
    if (validationResult.success) {
      console.log('✅ Service task validation successful:', validationResult.data?.short_description);
    } else {
      console.log('❌ Service task validation failed:', validationResult.errors);
    }
    
  } catch (error) {
    console.error('Service task validation error:', error);
  }
}

// ===== ADVANCED VALIDATION EXAMPLES =====

/**
 * Example: SLA validation with business rules
 */
export function exampleSLAValidation() {
  console.log('=== SLA Validation Example ===');
  
  const slaData = {
    priority: "1" as const, // Critical priority
    created_on: "2025-01-06 14:00:00",
    resolved_at: "2025-01-06 16:30:00", // Resolved in 2.5 hours
    business_service: "email_service_sys_id",
    assignment_group: "l1_support_sys_id"
  };

  try {
    const validation = SLAValidationSchema.safeParse(slaData);
    
    if (validation.success) {
      console.log('✅ SLA compliance check passed');
      // Calculate actual resolution time
      const created = new Date(slaData.created_on);
      const resolved = new Date(slaData.resolved_at);
      const resolutionHours = (resolved.getTime() - created.getTime()) / (1000 * 60 * 60);
      console.log(`Resolution time: ${resolutionHours.toFixed(1)} hours (Target: 4 hours for Critical)`);
    } else {
      console.log('❌ SLA compliance check failed:', validation.error.errors);
    }
    
  } catch (error) {
    console.error('SLA validation error:', error);
  }
}

/**
 * Example: Service request validation with complex dependencies
 */
export function exampleServiceRequestValidation() {
  console.log('=== Service Request Validation Example ===');
  
  const serviceRequestData = {
    requested_for: "employee123_sys_id",
    requester: "manager456_sys_id", // Manager requesting for employee
    catalog_item: "software_license_sys_id",
    variables: {
      category: "software",
      software_name: "Adobe Creative Suite",
      version: "2024",
      license_type: "annual",
      business_justification: "Required for marketing campaign design and multimedia content creation for Q1 2025 product launch",
      estimated_cost: 7500 // High-value item requiring approval
    },
    quantity: 5,
    business_justification: "Team needs design software for upcoming marketing campaigns",
    cost_center: "MARKETING-001",
    manager_approval: {
      required: true,
      approver: "director789_sys_id",
      approved_at: "2025-01-06 10:30:00"
    }
  };

  try {
    const validation = ServiceRequestValidationSchema.safeParse(serviceRequestData);
    
    if (validation.success) {
      console.log('✅ Service request validation passed');
      console.log('Request for:', serviceRequestData.variables.software_name);
      console.log('Estimated cost:', `$${serviceRequestData.variables.estimated_cost}`);
      console.log('Manager approval:', serviceRequestData.manager_approval?.approved_at ? '✅ Approved' : '⏳ Pending');
    } else {
      console.log('❌ Service request validation failed:', validation.error.errors);
    }
    
  } catch (error) {
    console.error('Service request validation error:', error);
  }
}

/**
 * Example: Incident escalation validation
 */
export function exampleIncidentEscalation() {
  console.log('=== Incident Escalation Validation Example ===');
  
  const currentTime = new Date();
  const createdTime = new Date(currentTime.getTime() - (5 * 60 * 60 * 1000)); // 5 hours ago
  
  const escalationData = {
    priority: "2" as const, // High priority
    state: "3" as const, // In Progress
    created_on: createdTime.toISOString(),
    assigned_to: "technician123_sys_id",
    assignment_group: "l2_support_sys_id",
    escalation: 1, // Current escalation level
    business_service: "crm_service_sys_id",
    vip: false,
    last_activity: new Date(currentTime.getTime() - (1 * 60 * 60 * 1000)).toISOString() // 1 hour ago
  };

  try {
    const validation = IncidentEscalationValidationSchema.safeParse(escalationData);
    
    if (validation.success) {
      console.log('✅ Incident escalation level is appropriate');
      const ageHours = (currentTime.getTime() - createdTime.getTime()) / (1000 * 60 * 60);
      console.log(`Incident age: ${ageHours.toFixed(1)} hours, Escalation level: ${escalationData.escalation}`);
    } else {
      console.log('❌ Incident requires escalation:', validation.error.errors);
    }
    
  } catch (error) {
    console.error('Escalation validation error:', error);
  }
}

// ===== SCHEMA REGISTRY EXAMPLES =====

/**
 * Example: Working with the unified schema registry
 */
export function exampleSchemaRegistry() {
  console.log('=== Schema Registry Examples ===');
  
  // List all available schemas
  console.log('Available schemas:', unifiedRegistry.listSchemas().length);
  
  // Get schemas by category
  const ticketSchemas = unifiedRegistry.getSchemasByCategory('tickets' as any);
  console.log('Ticket schemas:', ticketSchemas);
  
  // Get schema statistics
  const stats = unifiedRegistry.getStatistics();
  console.log('Registry statistics:', {
    total: stats.total,
    byCategory: Object.keys(stats.byCategory),
    byTags: Object.keys(stats.byTags).slice(0, 5) // Show first 5 tags
  });
  
  // Access common schemas
  const incidentSchema = CommonSchemas.Incident();
  console.log('Incident schema available:', !!incidentSchema);
  
  // Access Elysia-compatible schemas
  const incidentTypeBox = ElysiaSchemas.Incident();
  console.log('Incident TypeBox schema available:', !!incidentTypeBox);
}

/**
 * Example: TypeBox to Zod conversion validation
 */
export function exampleHybridValidation() {
  console.log('=== Hybrid Validation Example ===');
  
  const testData = {
    short_description: "Test incident",
    priority: "3",
    state: "1",
    caller_id: "test_user_sys_id"
  };
  
  // Validate with Zod
  const zodResult = safeValidateSchema('incident', testData);
  console.log('Zod validation:', zodResult.success ? '✅ Success' : '❌ Failed');
  
  // Get TypeBox version for Elysia
  const typeboxSchema = unifiedRegistry.getTypeBoxSchema('incident');
  console.log('TypeBox schema available:', !!typeboxSchema);
  
  // Demonstrate schema metadata
  const metadata = unifiedRegistry.getMetadata('incident');
  console.log('Schema metadata:', {
    category: metadata?.category,
    version: metadata?.version,
    table: metadata?.table,
    tags: metadata?.tags
  });
}

// ===== ERROR HANDLING EXAMPLES =====

/**
 * Example: Error handling and validation feedback
 */
export function exampleErrorHandling() {
  console.log('=== Error Handling Examples ===');
  
  // Test with invalid data
  const invalidIncidentData = {
    short_description: "Too short", // Fails minimum length
    priority: "invalid", // Invalid enum value
    state: "999", // Invalid state
    caller_id: "invalid_sys_id" // Invalid sys_id format
  };
  
  const validation = safeValidateSchema('incident', invalidIncidentData);
  
  if (!validation.success) {
    console.log('❌ Validation failed as expected:');
    validation.errors?.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }
  
  // Test with missing required fields
  const incompleteData = {
    description: "Missing required fields"
    // Missing short_description, caller_id, etc.
  };
  
  const incompleteValidation = safeValidateSchema('incident-creation', incompleteData);
  if (!incompleteValidation.success) {
    console.log('\n❌ Incomplete data validation failed as expected:');
    incompleteValidation.errors?.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
  }
}

// ===== EXPORT ALL EXAMPLES =====

export function runAllExamples() {
  console.log('🚀 Running Zod Integration Examples\n');
  
  try {
    exampleCreateIncident();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleCreateChangeTask();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleCreateServiceTask();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleSLAValidation();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleServiceRequestValidation();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleIncidentEscalation();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleSchemaRegistry();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleHybridValidation();
    console.log('\n' + '='.repeat(50) + '\n');
    
    exampleErrorHandling();
    
    console.log('\n✅ All examples completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Example execution error:', error);
  }
}

// Export individual examples for selective testing
export {
  exampleCreateIncident,
  exampleCreateChangeTask,
  exampleCreateServiceTask,
  exampleSLAValidation,
  exampleServiceRequestValidation,
  exampleIncidentEscalation,
  exampleSchemaRegistry,
  exampleHybridValidation,
  exampleErrorHandling
};