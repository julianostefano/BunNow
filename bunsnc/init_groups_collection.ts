/**
 * Initialize sn_groups collection with Neoenergia groups data
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient } from 'mongodb';
import { GroupDocument, GroupData, COLLECTION_NAMES } from './src/config/mongodb-collections';

// Raw data provided by user
const rawGroupsData = [
  {
    "id": 49,
    "data": "{\"nome\":\"L2-NE-IT APP AND DATABASE\",\"tags\":[\"ORACLE\",\"SQLSERVER\",\"POSTGRES\",\"BIGDATA\",\"INTEGRATION\",\"MIGRATION\",\"BI\",\"DW\",\"VECTOR STORE\",\"MACHINE LEARNING\",\"ML\",\"PYTHON\",\"REALTIME\",\"DATA LAKE\"],\"descricao\":\"Grupo de Suporte a Banco de Dados Relacionais, Vetoriais, NOSQL & AI/ MLOps\",\"responsavel\":\"Cássio Luiz Soares Dias\",\"temperatura\":7}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 50,
    "data": "{\"nome\":\"L2-NE-IT SAP BASIS\",\"tags\":[\"SAP\",\"ABAP\",\"INTEGRATION\",\"SOABUS\",\"HANA\",\"ERP\",\"AUTOMATION\",\"CLOUD\"],\"descricao\":\"Grupo de Suporte SAP Basis\",\"responsavel\":\"Antonio Helio Nonato de Morais\",\"temperatura\":7}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 51,
    "data": "{\"nome\":\"L2-NE-IT APP AND SERVICES\",\"tags\":[\"WINDOWS SERVER\",\"IIS\",\"ACTIVE DIRECTORY\",\"AZURE\",\"POWERSHELL\",\"HYBRID\",\"SECURITY\"],\"descricao\":\"Grupo de Suporte a Servidores e Aplicações baseadas em Tecnologias Microsoft\",\"responsavel\":\"Denis Alberto de Paula\",\"temperatura\":5}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 52,
    "data": "{\"nome\":\"L2-NE-IT PROCESSING\",\"tags\":[\"BIGDATA\",\"REALTIME\",\"SPARK\",\"KAFKA\",\"EDGE\",\"STREAMING\",\"ANALYTICS\"],\"descricao\":\"Grupo de Processamento de Dados\",\"responsavel\":\"Natalia Maria De Oliveira Mota\",\"temperatura\":7}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 53,
    "data": "{\"nome\":\"L2-NE-IT NETWORK SECURITY\",\"tags\":[\"FIREWALL\",\"IDS/IPS\",\"ZERO TRUST\",\"SOC\",\"CYBER\",\"ENCRYPTION\"],\"descricao\":\"Proteção de infraestrutura crítica contra ameaças cibernéticas em redes de distribuição de energia\",\"responsavel\":\"Philippe de Araujo Chagas\",\"temperatura\":7}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 54,
    "data": "{\"nome\":\"L2-NE-IT NETWORK\",\"tags\":[\"SDN\",\"MPLS\",\"5G\",\"IOT\",\"LATENCY\",\"BGP\",\"QOS\"],\"descricao\":\"Gestão de infraestrutura de rede de alta disponibilidade para sistemas de transmissão e distribuição\",\"responsavel\":\"Philippe de Araujo Chagas\",\"temperatura\":7}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 55,
    "data": "{\"nome\":\"L2-NE-CLOUDSERVICES\",\"tags\":[\"AWS\",\"AZURE\",\"HYBRID_CLOUD\",\"DISASTER_RECOVERY\",\"COST_OPTIMIZATION\",\"ENERGY_CLOUD\",\"IaaS\"],\"descricao\":\"Gerenciamento de ambientes cloud para aplicações críticas do setor energético\",\"responsavel\":\"Denis Alberto de Paula\",\"temperatura\":5}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 56,
    "data": "{\"nome\":\"L2-NE-IT MONITORY\",\"tags\":[\"ZABBIX\",\"TRUESIGHT\",\"MONITORING\",\"REPORTING\",\"OBSERVABILITY\",\"AI OPS\",\"ALERTING\",\"PREDICTIVE\"],\"descricao\":\"Grupo de Monitoramento de Ativos de Infraestrutura\",\"responsavel\":\"Allen Saldanha Araujo\",\"temperatura\":6}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 57,
    "data": "{\"nome\":\"L2-NE-IT SO UNIX\",\"tags\":[\"AIX\",\"SOLARIS\",\"LINUX\",\"RHEL\",\"KUBERNETES\",\"SCRIPTING\",\"HA\"],\"descricao\":\"Grupo de Suporte a Sistemas Operacionais Unix\",\"responsavel\":\"Natalia Maria De Oliveira Mota\",\"temperatura\":6}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 58,
    "data": "{\"nome\":\"L2-NE-IT BOC\",\"tags\":[\"COMUNICACAO\",\"MONITORAMENTO\",\"ENCAMINHAMENTO\",\"INCIDENT\",\"CRISIS\",\"SLAS\",\"COMMS\"],\"descricao\":\"Business Operations Center\",\"responsavel\":\"Fabiano Paula da Silva\",\"temperatura\":4}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 59,
    "data": "{\"nome\":\"L2-NE-IT MIDDLEWARE\",\"tags\":[\"WEBLOGIC\",\"TOMCAT\",\"FORMS\",\"REPORTS\",\"APIS\",\"MICROSERVICES\",\"DEVOPS\",\"SCALABILITY\"],\"descricao\":\"Grupo de Suporte a Middlewares\",\"responsavel\":\"Allen Saldanha Araujo\",\"temperatura\":5}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 60,
    "data": "{\"nome\":\"L2-NE-IT BACKUP\",\"tags\":[\"BACKUP\",\"RESTORE\",\"LAN\",\"COMMVAULT\",\"CATALOG\",\"DISASTER\",\"ENCRYPTION\",\"REPLICATION\"],\"descricao\":\"Grupo de Suporte a Backup de Servidores e Database\",\"responsavel\":\"Valdir Alves da Silva\",\"temperatura\":6}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 61,
    "data": "{\"nome\":\"L2-NE-IT STORAGE\",\"tags\":[\"STORAGE\",\"RAID\",\"VIRTUALIZACAO\",\"SAN\",\"ISCSI\",\"BENCHMARKING\",\"NAS\",\"OBJECT\",\"TIERING\"],\"descricao\":\"Grupo de suporte a Storages e SANS\",\"responsavel\":\"Valdir Alves da Silva\",\"temperatura\":6}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 62,
    "data": "{\"nome\":\"L2-NE-IT NOC\",\"tags\":[\"MONITORAMENTO\",\"COMUNICACAO\",\"ENCAMINHAMENTO\",\"CONECTIVIDADE\",\"OFFICE\",\"BGP\",\"QOS\",\"NETWORK\",\"CAPACITY\"],\"descricao\":\"Grupo de Network Operations Center\",\"responsavel\":\"Fabiano Paula da Silva\",\"temperatura\":6}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 63,
    "data": "{\"nome\":\"L2-NE-IT VOIP\",\"tags\":[\"VOIP\",\"NETWORKING\",\"SIP\",\"UC\",\"QOS\",\"VIDEO\"],\"descricao\":\"Grupo de suporte Tecnologias VOIP\",\"responsavel\":\"Philippe de Araujo Chagas\",\"temperatura\":4}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  },
  {
    "id": 64,
    "data": "{\"nome\":\"L2-NE-IT PCP PRODUCTION\",\"tags\":[\"CONTROL-M\",\"OFFICE\",\"COMUNICACAO\",\"SCADA\",\"AUTOMATION\",\"IIOT\",\"SCHEDULING\"],\"descricao\":\"Grupo de Operacionalização e Monitoramento de Processos Core Business\",\"responsavel\":\"Samuel Gomes Ferreira\",\"temperatura\":7}",
    "created_at": "2025-06-05 14:21:53.358-03:00",
    "updated_at": "2025-06-05 14:21:53.358-03:00"
  }
];

async function initializeGroupsCollection() {
  console.log('🏷️ Initializing sn_groups collection...');
  
  const client = new MongoClient('mongodb://admin:Logica2011_@10.219.8.210:27018/bunsnc?authSource=admin');
  
  try {
    await client.connect();
    console.log('🔗 Connected to MongoDB');
    
    const db = client.db('bunsnc');
    const collection = db.collection<GroupDocument>(COLLECTION_NAMES.GROUPS);
    
    // Check if collection exists and has data
    const existingCount = await collection.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️ Collection already has ${existingCount} documents. Clearing for fresh import...`);
      await collection.deleteMany({});
    }
    
    // Transform and insert data
    const documents: GroupDocument[] = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const rawGroup of rawGroupsData) {
      try {
        // Parse the JSON string from data field
        const parsedData: GroupData = JSON.parse(rawGroup.data);
        
        // Create document
        const document: GroupDocument = {
          id: rawGroup.id,
          data: parsedData,
          raw_data: rawGroup.data, // Keep original JSON string
          created_at: new Date(rawGroup.created_at),
          updated_at: new Date(rawGroup.updated_at)
        };
        
        documents.push(document);
        successCount++;
        
        console.log(`✅ Processed group: ${parsedData.nome} (ID: ${rawGroup.id})`);
      } catch (error) {
        console.error(`❌ Failed to process group ID ${rawGroup.id}:`, error);
        errorCount++;
      }
    }
    
    // Insert all documents
    if (documents.length > 0) {
      console.log(`📋 Inserting ${documents.length} groups...`);
      const result = await collection.insertMany(documents);
      console.log(`✅ Successfully inserted ${result.insertedCount} groups`);
    }
    
    // Create indexes
    console.log('🔍 Creating indexes...');
    await collection.createIndex({ id: 1 }, { unique: true });
    await collection.createIndex({ 'data.nome': 1 });
    await collection.createIndex({ 'data.tags': 1 });
    await collection.createIndex({ 'data.responsavel': 1 });
    await collection.createIndex({ 'data.temperatura': 1 });
    await collection.createIndex({ created_at: -1 });
    await collection.createIndex({ updated_at: -1 });
    console.log('✅ Indexes created successfully');
    
    // Verify data
    console.log('\n📊 Verification:');
    const finalCount = await collection.countDocuments();
    console.log(`Total documents: ${finalCount}`);
    
    // Get sample data
    const sampleGroup = await collection.findOne({}, { sort: { 'data.nome': 1 } });
    if (sampleGroup) {
      console.log('\n📋 Sample group:');
      console.log(`- ID: ${sampleGroup.id}`);
      console.log(`- Nome: ${sampleGroup.data.nome}`);
      console.log(`- Tags: ${sampleGroup.data.tags.join(', ')}`);
      console.log(`- Responsável: ${sampleGroup.data.responsavel}`);
      console.log(`- Temperatura: ${sampleGroup.data.temperatura}`);
    }
    
    // Get stats by responsible person
    const pipeline = [
      {
        $group: {
          _id: '$data.responsavel',
          count: { $sum: 1 },
          groups: { $push: '$data.nome' }
        }
      },
      { $sort: { count: -1 } }
    ];
    
    const responsavelStats = await collection.aggregate(pipeline).toArray();
    console.log('\n👥 Groups by responsible person:');
    responsavelStats.forEach((stat: any) => {
      console.log(`- ${stat._id}: ${stat.count} group(s)`);
    });
    
    // Get temperature distribution
    const tempPipeline = [
      {
        $group: {
          _id: '$data.temperatura',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ];
    
    const tempStats = await collection.aggregate(tempPipeline).toArray();
    console.log('\n🌡️ Temperature distribution:');
    tempStats.forEach((stat: any) => {
      console.log(`- Level ${stat._id}: ${stat.count} group(s)`);
    });
    
    console.log(`\n🎯 Summary:`);
    console.log(`✅ Successfully processed: ${successCount} groups`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📋 Total in database: ${finalCount}`);
    console.log(`\n🚀 Collection '${COLLECTION_NAMES.GROUPS}' is ready for use!`);
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔐 MongoDB connection closed');
  }
}

// Run initialization
initializeGroupsCollection().catch(console.error);