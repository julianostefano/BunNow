/**
 * Test MongoDB Structure - Debug data format
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient } from 'mongodb';

async function testMongoDBStructure() {
  const client = new MongoClient('mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin');
  
  try {
    await client.connect();
    console.log('🔗 Connected to MongoDB');
    
    const db = client.db('bunsnc');
    
    // Test collections
    const collections = await db.listCollections().toArray();
    console.log('\n📋 Available collections:');
    collections.forEach(col => console.log(`  - ${col.name}`));
    
    // Test incident structure
    console.log('\n🔍 Testing incidents_complete structure:');
    const incidentSample = await db.collection('incidents_complete').findOne();
    if (incidentSample) {
      console.log('Sample incident keys:', Object.keys(incidentSample));
      if (incidentSample.raw_data) {
        console.log('raw_data keys:', Object.keys(incidentSample.raw_data));
        if (incidentSample.raw_data.state) {
          console.log('State structure:', incidentSample.raw_data.state);
        }
        if (incidentSample.raw_data.assignment_group) {
          console.log('Assignment group structure:', incidentSample.raw_data.assignment_group);
        }
      }
      if (incidentSample.data) {
        console.log('data keys:', Object.keys(incidentSample.data));
      }
    } else {
      console.log('No incident documents found');
    }
    
    // Test change_task structure
    console.log('\n🔍 Testing change_tasks_complete structure:');
    const changeTaskSample = await db.collection('change_tasks_complete').findOne();
    if (changeTaskSample) {
      console.log('Sample change_task keys:', Object.keys(changeTaskSample));
    } else {
      console.log('No change_task documents found');
    }
    
    // Test sc_task structure
    console.log('\n🔍 Testing sc_tasks_complete structure:');
    const scTaskSample = await db.collection('sc_tasks_complete').findOne();
    if (scTaskSample) {
      console.log('Sample sc_task keys:', Object.keys(scTaskSample));
    } else {
      console.log('No sc_task documents found');
    }
    
    // Count documents
    console.log('\n📊 Document counts:');
    const incidentCount = await db.collection('incidents_complete').countDocuments();
    const changeTaskCount = await db.collection('change_tasks_complete').countDocuments();
    const scTaskCount = await db.collection('sc_tasks_complete').countDocuments();
    
    console.log(`  - incidents_complete: ${incidentCount}`);
    console.log(`  - change_tasks_complete: ${changeTaskCount}`);
    console.log(`  - sc_tasks_complete: ${scTaskCount}`);
    
    // Test specific state query
    console.log('\n🔍 Testing state=3 (awaiting) query:');
    const awaitingIncidents = await db.collection('incidents_complete').find({
      'raw_data.state.value': '3'
    }).limit(1).toArray();
    
    if (awaitingIncidents.length > 0) {
      console.log('✅ Found incidents with state=3');
      console.log('Sample:', {
        sys_id: awaitingIncidents[0].sys_id,
        number: awaitingIncidents[0].number,
        state: awaitingIncidents[0].raw_data?.state,
        assignment_group: awaitingIncidents[0].raw_data?.assignment_group
      });
    } else {
      console.log('❌ No incidents found with state=3');
      
      // Try numeric search
      const awaitingIncidentsNumeric = await db.collection('incidents_complete').find({
        'raw_data.state.value': 3
      }).limit(1).toArray();
      
      if (awaitingIncidentsNumeric.length > 0) {
        console.log('✅ Found incidents with numeric state=3');
      } else {
        console.log('❌ No incidents found with numeric state=3 either');
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

testMongoDBStructure().catch(console.error);