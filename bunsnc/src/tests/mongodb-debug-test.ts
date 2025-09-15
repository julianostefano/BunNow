/**
 * MongoDB Debug Test - Simple MongoDB Connection Test
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient } from 'mongodb';

async function debugMongoDBConnection() {
  console.log(' Debug MongoDB Connection...');
  
  const connectionString = `mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin`;
  
  let client: MongoClient | null = null;
  
  try {
    console.log('📡 Connecting to MongoDB...');
    client = new MongoClient(connectionString, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      family: 4
    });
    
    await client.connect();
    const db = client.db('bunsnc');
    
    console.log(' Connected to MongoDB');
    
    // Test collection creation
    console.log('🗂️ Testing collection creation...');
    const testCollection = db.collection('test_collection');
    
    // Insert a simple document
    console.log(' Testing document insertion...');
    const testDoc = {
      _id: 'test_001',
      name: 'Test Document',
      created: new Date()
    };
    
    const insertResult = await testCollection.insertOne(testDoc);
    console.log(' Document inserted:', insertResult.acknowledged);
    console.log('📄 Inserted ID:', insertResult.insertedId);
    
    // Read the document back
    console.log(' Testing document retrieval...');
    const retrievedDoc = await testCollection.findOne({ _id: 'test_001' });
    console.log(' Document retrieved:', retrievedDoc ? 'Success' : 'Failed');
    
    if (retrievedDoc) {
      console.log('📄 Retrieved document:', JSON.stringify(retrievedDoc, null, 2));
    }
    
    // Test upsert operation
    console.log(' Testing upsert operation...');
    const upsertDoc = {
      _id: 'test_002',
      name: 'Upsert Test Document',
      updated: new Date()
    };
    
    const upsertResult = await testCollection.replaceOne(
      { _id: 'test_002' },
      upsertDoc,
      { upsert: true }
    );
    
    console.log(' Upsert result:');
    console.log('   - Acknowledged:', upsertResult.acknowledged);
    console.log('   - Matched count:', upsertResult.matchedCount);
    console.log('   - Modified count:', upsertResult.modifiedCount);
    console.log('   - Upserted count:', upsertResult.upsertedCount);
    console.log('   - Upserted ID:', upsertResult.upsertedId);
    
    // List collections
    console.log('📋 Listing collections...');
    const collections = await db.listCollections().toArray();
    console.log('📂 Collections found:', collections.map(c => c.name));
    
    // Clean up test data
    console.log('🧹 Cleaning up test data...');
    await testCollection.deleteMany({ _id: { $in: ['test_001', 'test_002'] } });
    console.log(' Test data cleaned up');
    
    console.log('\n MongoDB Debug Test completed successfully!');
    
  } catch (error) {
    console.error(' MongoDB Debug Test failed:', error);
    console.error('Stack trace:', error.stack);
  } finally {
    if (client) {
      await client.close();
      console.log('🔌 MongoDB connection closed');
    }
  }
}

debugMongoDBConnection();