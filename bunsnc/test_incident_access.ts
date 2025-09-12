/**
 * Test direct access to incident INC4504604
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './src/services/ServiceNowAuthClient';

async function testIncidentAccess() {
  const incidentNumber = 'INC4504604';
  const sysId = '8a7b44f58737a690e8f9b91c8bbb35c1';
  
  console.log(`🔍 Testing access to incident ${incidentNumber} (${sysId})`);
  
  try {
    const serviceNowClient = new ServiceNowAuthClient();
    
    // Test 1: Search by number
    console.log('\n📋 Test 1: Searching by incident number...');
    const byNumberResponse = await serviceNowClient.makeRequestFullFields(
      'incident',
      `number=${incidentNumber}`,
      1
    );
    
    if (byNumberResponse?.result?.length > 0) {
      const incident = byNumberResponse.result[0];
      console.log(`✅ Found by number: ${incident.number} (sys_id: ${incident.sys_id})`);
      console.log(`   Description: ${incident.short_description}`);
      console.log(`   State: ${incident.state}`);
    } else {
      console.log('❌ Not found by incident number');
    }
    
    // Test 2: Search by sys_id
    console.log('\n📋 Test 2: Searching by sys_id...');
    const bySysIdResponse = await serviceNowClient.makeRequestFullFields(
      'incident',
      `sys_id=${sysId}`,
      1
    );
    
    if (bySysIdResponse?.result?.length > 0) {
      const incident = bySysIdResponse.result[0];
      console.log(`✅ Found by sys_id: ${incident.number} (sys_id: ${incident.sys_id})`);
      console.log(`   Description: ${incident.short_description}`);
      console.log(`   State: ${incident.state}`);
    } else {
      console.log('❌ Not found by sys_id');
    }
    
    // Test 3: Search with broader criteria
    console.log('\n📋 Test 3: Searching with broader criteria (recent incidents)...');
    const recentResponse = await serviceNowClient.makeRequestFullFields(
      'incident',
      `short_descriptionCONTAINSdatabase^ORnumberSTARTSWITHINC450^ORDERBYDESCsys_created_on`,
      10
    );
    
    console.log(`   Found ${recentResponse?.result?.length || 0} recent incidents`);
    
    if (recentResponse?.result?.length > 0) {
      recentResponse.result.forEach((inc: any, index: number) => {
        console.log(`   [${index + 1}] ${inc.number} - ${inc.short_description?.substring(0, 60)}...`);
        if (inc.number === incidentNumber || inc.sys_id === sysId) {
          console.log(`   ⭐ This is our target incident!`);
        }
      });
    }
    
    // Test 4: Check if incident might be in different state or archived
    console.log('\n📋 Test 4: Searching without state restrictions...');
    const allStatesResponse = await serviceNowClient.makeRequestFullFields(
      'incident',
      `number=${incidentNumber}^ORsys_id=${sysId}`,
      5
    );
    
    if (allStatesResponse?.result?.length > 0) {
      console.log(`✅ Found ${allStatesResponse.result.length} incidents (any state)`);
      allStatesResponse.result.forEach((inc: any) => {
        console.log(`   ${inc.number} - State: ${inc.state} - ${inc.short_description}`);
        console.log(`   sys_id: ${inc.sys_id}`);
        console.log(`   Created: ${inc.sys_created_on}`);
        console.log(`   Updated: ${inc.sys_updated_on}`);
      });
    } else {
      console.log('❌ Still not found with any state');
    }
    
    console.log('\n📋 Test 5: Raw API call to verify connectivity...');
    try {
      const rawUrl = `/api/now/table/incident?sysparm_query=number=${incidentNumber}&sysparm_limit=1`;
      console.log(`   Testing URL: ${rawUrl}`);
      
      // Make raw axios call
      const axios = require('axios');
      const response = await serviceNowClient['axiosClient'].get(rawUrl);
      
      console.log(`   Response status: ${response.status}`);
      console.log(`   Response data length: ${JSON.stringify(response.data).length}`);
      console.log(`   Result count: ${response.data?.result?.length || 0}`);
      
      if (response.data?.result?.length > 0) {
        console.log(`   ✅ Raw API found the incident!`);
        const incident = response.data.result[0];
        console.log(`   Number: ${incident.number}`);
        console.log(`   sys_id: ${incident.sys_id}`);
        console.log(`   Description: ${incident.short_description}`);
      }
      
    } catch (rawError) {
      console.log(`   ❌ Raw API error: ${rawError.message}`);
    }
    
  } catch (error) {
    console.error('❌ Error testing incident access:', error);
  }
}

testIncidentAccess()
  .then(() => {
    console.log('\n✅ Incident access test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  });