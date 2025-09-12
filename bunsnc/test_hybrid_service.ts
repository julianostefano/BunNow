/**
 * Test Hybrid Service with corrected MongoDB queries
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient } from 'mongodb';

async function testHybridServiceQueries() {
  const client = new MongoClient('mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin');
  
  try {
    await client.connect();
    console.log('🔗 Connected to MongoDB');
    
    const db = client.db('bunsnc');
    
    // Test corrected query structure
    console.log('\n🔍 Testing corrected MongoDB queries:');
    
    // Test state=3 (awaiting) query
    console.log('\n1. Testing state="awaiting" (value=3):');
    const filter1 = { 'raw_data.state.value': '3' };
    console.log('Filter:', JSON.stringify(filter1));
    
    const awaitingIncidents = await db.collection('incidents_complete').find(filter1).limit(3).toArray();
    console.log(`Found ${awaitingIncidents.length} incidents with state=3`);
    
    if (awaitingIncidents.length > 0) {
      console.log('Sample result:', {
        sys_id: awaitingIncidents[0].sys_id,
        number: awaitingIncidents[0].number,
        state: awaitingIncidents[0].raw_data?.state,
        assignment_group: awaitingIncidents[0].raw_data?.assignment_group
      });
    }
    
    // Test specific group filter
    console.log('\n2. Testing assignment group filter:');
    const filter2 = { 
      'raw_data.state.value': '3',
      'raw_data.assignment_group.display_value': 'L2-NE-IT APP AND DATABASE'
    };
    console.log('Filter:', JSON.stringify(filter2));
    
    const groupIncidents = await db.collection('incidents_complete').find(filter2).limit(3).toArray();
    console.log(`Found ${groupIncidents.length} incidents for L2-NE-IT APP AND DATABASE group`);
    
    // Test active states
    console.log('\n3. Testing active states:');
    const filter3 = { 'raw_data.state.value': { $in: ['1', '2', '3', '18', '-5'] } };
    console.log('Filter:', JSON.stringify(filter3));
    
    const activeIncidents = await db.collection('incidents_complete').find(filter3).limit(5).toArray();
    console.log(`Found ${activeIncidents.length} active incidents`);
    
    // Test change_tasks
    console.log('\n4. Testing change_tasks:');
    const filter4 = { 'raw_data.state.value': '3' };
    
    const awaitingChangeTasks = await db.collection('change_tasks_complete').find(filter4).limit(3).toArray();
    console.log(`Found ${awaitingChangeTasks.length} change_tasks with state=3`);
    
    // Test sc_tasks
    console.log('\n5. Testing sc_tasks:');
    const filter5 = { 'raw_data.state.value': '3' };
    
    const awaitingSCTasks = await db.collection('sc_tasks_complete').find(filter5).limit(3).toArray();
    console.log(`Found ${awaitingSCTasks.length} sc_tasks with state=3`);
    
    // Summary
    console.log('\n📊 Summary:');
    console.log(`✅ incidents_complete: ${awaitingIncidents.length > 0 ? 'WORKS' : 'NO DATA'}`);
    console.log(`✅ change_tasks_complete: ${awaitingChangeTasks.length > 0 ? 'WORKS' : 'NO DATA'}`);
    console.log(`✅ sc_tasks_complete: ${awaitingSCTasks.length > 0 ? 'WORKS' : 'NO DATA'}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

testHybridServiceQueries().catch(console.error);