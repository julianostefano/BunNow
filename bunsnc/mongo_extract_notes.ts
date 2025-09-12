/**
 * Extract incident notes from MongoDB and direct ServiceNow API
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient } from 'mongodb';

async function extractFromMongoDB() {
  const incidentNumber = 'INC4504604';
  const sysId = '8a7b44f58737a690e8f9b91c8bbb35c1';
  
  console.log(`🔍 Searching MongoDB for incident ${incidentNumber} (${sysId})`);
  
  try {
    // Connect to MongoDB
    const mongoUrl = 'mongodb://10.219.8.210:27018/bunsnc';
    console.log(`📡 Connecting to MongoDB: ${mongoUrl}`);
    
    const client = new MongoClient(mongoUrl);
    await client.connect();
    
    const db = client.db('bunsnc');
    
    // 1. Search in tickets collection
    console.log('\n📋 Searching tickets collection...');
    const ticketsCollection = db.collection('tickets');
    
    const ticketByNumber = await ticketsCollection.findOne({ 
      'data.ticket.number': incidentNumber 
    });
    
    const ticketBySysId = await ticketsCollection.findOne({ 
      'data.ticket.sys_id': sysId 
    });
    
    let ticketDoc = ticketByNumber || ticketBySysId;
    
    if (ticketDoc) {
      console.log(`✅ Found ticket in MongoDB!`);
      console.log(`   Number: ${ticketDoc.data.ticket.number}`);
      console.log(`   sys_id: ${ticketDoc.data.ticket.sys_id}`);
      console.log(`   State: ${ticketDoc.data.ticket.state}`);
      console.log(`   Description: ${ticketDoc.data.ticket.short_description}`);
      
      // Check for notes in the ticket data
      const ticket = ticketDoc.data.ticket;
      
      console.log('\n📝 Checking for notes in ticket data:');
      if (ticket.work_notes) {
        console.log(`   work_notes: ${ticket.work_notes}`);
      }
      if (ticket.comments) {
        console.log(`   comments: ${ticket.comments}`);
      }
      if (ticket.additional_comments) {
        console.log(`   additional_comments: ${ticket.additional_comments}`);
      }
      if (ticket.close_notes) {
        console.log(`   close_notes: ${ticket.close_notes}`);
      }
      
      // Check for extended data
      if (ticketDoc.data.extended_data) {
        console.log('\n📋 Checking extended data...');
        const extended = ticketDoc.data.extended_data;
        
        if (extended.notes) {
          console.log(`   Found notes array: ${extended.notes.length} entries`);
          extended.notes.forEach((note: any, index: number) => {
            console.log(`   [${index + 1}] ${note.timestamp} - ${note.author}: ${note.content}`);
          });
        }
        
        if (extended.journal_entries) {
          console.log(`   Found journal entries: ${extended.journal_entries.length} entries`);
        }
      }
      
      // Save the full ticket data for analysis
      await Bun.write(`mongodb_ticket_${incidentNumber}_data.json`, JSON.stringify(ticketDoc, null, 2));
      console.log(`\n💾 Full MongoDB ticket data saved to: mongodb_ticket_${incidentNumber}_data.json`);
      
    } else {
      console.log('❌ Ticket not found in MongoDB tickets collection');
      
      // Try to find in any collection containing the sys_id
      console.log('\n🔍 Searching all collections for sys_id...');
      const collections = await db.listCollections().toArray();
      
      for (const collection of collections) {
        const coll = db.collection(collection.name);
        const found = await coll.findOne({ $text: { $search: sysId } });
        if (found) {
          console.log(`   Found in collection: ${collection.name}`);
        }
      }
    }
    
    // 2. Try incidents collection specifically
    console.log('\n📋 Checking incidents collection...');
    const incidentsCollection = db.collection('incidents');
    
    const incidentDoc = await incidentsCollection.findOne({
      $or: [
        { sys_id: sysId },
        { number: incidentNumber },
        { 'incident.sys_id': sysId },
        { 'incident.number': incidentNumber }
      ]
    });
    
    if (incidentDoc) {
      console.log(`✅ Found in incidents collection!`);
      console.log(JSON.stringify(incidentDoc, null, 2));
    }
    
    await client.close();
    
  } catch (error) {
    console.error('❌ MongoDB error:', error);
  }
}

async function extractFromAPI() {
  console.log('\n🌐 Trying direct API call...');
  
  try {
    const response = await fetch('http://localhost:3008/api/tickets/8a7b44f58737a690e8f9b91c8bbb35c1/incident', {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log(`API Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API response received!');
      console.log(JSON.stringify(data, null, 2));
    } else {
      const text = await response.text();
      console.log(`❌ API error: ${text}`);
    }
  } catch (error) {
    console.error('❌ API fetch error:', error);
  }
}

async function main() {
  console.log('🔍 EXTRACTING INCIDENT NOTES FROM MULTIPLE SOURCES');
  console.log('=' .repeat(60));
  
  await extractFromMongoDB();
  await extractFromAPI();
  
  console.log('\n✅ Multi-source extraction completed');
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Extraction failed:', error);
    process.exit(1);
  });