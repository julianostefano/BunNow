/**
 * Simple MongoDB Upsert Test 
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ticketCollectionService } from '../services/TicketCollectionService';

async function simpleUpsertTest() {
  console.log('🧪 Simple Upsert Test...\n');
  
  try {
    // Simple test data
    const sampleIncident = {
      sys_id: 'test_incident_simple_001',
      number: 'INC0000999',
      short_description: 'Simple Test',
      state: '1',
      assignment_group: {
        display_value: 'Test Group',
        value: 'test_group_001'
      },
      sys_created_on: new Date().toISOString(),
      sys_updated_on: new Date().toISOString()
    };

    console.log('Sample incident data:', JSON.stringify(sampleIncident, null, 2));
    
    const result = await ticketCollectionService.upsertIncident(sampleIncident, []);
    console.log('✅ Result:', result);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

simpleUpsertTest();