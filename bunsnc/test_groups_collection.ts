/**
 * Test Groups Collection - Verify insertion and structure
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient } from 'mongodb';

async function testGroupsCollection() {
  const client = new MongoClient('mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin');
  
  try {
    await client.connect();
    console.log('🔗 Connected to MongoDB');
    
    const db = client.db('bunsnc');
    const collection = db.collection('sn_groups');
    
    // Check count
    const count = await collection.countDocuments();
    console.log(`\n📊 Total documents: ${count}`);
    
    if (count === 0) {
      console.log('❌ No documents found. Collection needs to be populated.');
      return;
    }
    
    // Get sample documents
    console.log('\n🔍 Sample documents:');
    const samples = await collection.find({}).limit(3).toArray();
    samples.forEach((doc, index) => {
      console.log(`${index + 1}. ID: ${doc.id} | Nome: ${doc.data?.nome}`);
      console.log(`   Responsável: ${doc.data?.responsavel}`);
      console.log(`   Tags: ${doc.data?.tags?.join(', ')}`);
      console.log(`   Temperatura: ${doc.data?.temperatura}`);
      console.log('');
    });
    
    // Get all group names sorted
    console.log('📋 All available groups for dropdown:');
    const allGroups = await collection.find({}, {projection: {'data.nome': 1, id: 1}})
                                     .sort({'data.nome': 1})
                                     .toArray();
    
    allGroups.forEach(doc => {
      console.log(`  - ${doc.data?.nome} (ID: ${doc.id})`);
    });
    
    // Test specific searches
    console.log('\n🔍 Testing specific searches:');
    
    // Find by temperature
    const highTemp = await collection.find({'data.temperatura': {$gte: 7}}).toArray();
    console.log(`Groups with temperature >= 7: ${highTemp.length}`);
    
    // Find by tag
    const dbGroups = await collection.find({'data.tags': 'ORACLE'}).toArray();
    console.log(`Groups with ORACLE tag: ${dbGroups.length}`);
    
    // Find by responsible person
    const resp = await collection.find({'data.responsavel': /Philippe/i}).toArray();
    console.log(`Groups managed by Philippe: ${resp.length}`);
    
    console.log('\n✅ Groups collection is working correctly!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

testGroupsCollection().catch(console.error);