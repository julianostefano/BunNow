// MongoDB CLI Script to insert groups data
// Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]

// Raw groups data
const rawGroupsData = [
  {"id":49,"data":"{\"nome\":\"L2-NE-IT APP AND DATABASE\",\"tags\":[\"ORACLE\",\"SQLSERVER\",\"POSTGRES\",\"BIGDATA\",\"INTEGRATION\",\"MIGRATION\",\"BI\",\"DW\",\"VECTOR STORE\",\"MACHINE LEARNING\",\"ML\",\"PYTHON\",\"REALTIME\",\"DATA LAKE\"],\"descricao\":\"Grupo de Suporte a Banco de Dados Relacionais, Vetoriais, NOSQL & AI/ MLOps\",\"responsavel\":\"Cássio Luiz Soares Dias\",\"temperatura\":7}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":50,"data":"{\"nome\":\"L2-NE-IT SAP BASIS\",\"tags\":[\"SAP\",\"ABAP\",\"INTEGRATION\",\"SOABUS\",\"HANA\",\"ERP\",\"AUTOMATION\",\"CLOUD\"],\"descricao\":\"Grupo de Suporte SAP Basis\",\"responsavel\":\"Antonio Helio Nonato de Morais\",\"temperatura\":7}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":51,"data":"{\"nome\":\"L2-NE-IT APP AND SERVICES\",\"tags\":[\"WINDOWS SERVER\",\"IIS\",\"ACTIVE DIRECTORY\",\"AZURE\",\"POWERSHELL\",\"HYBRID\",\"SECURITY\"],\"descricao\":\"Grupo de Suporte a Servidores e Aplicações baseadas em Tecnologias Microsoft\",\"responsavel\":\"Denis Alberto de Paula\",\"temperatura\":5}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":52,"data":"{\"nome\":\"L2-NE-IT PROCESSING\",\"tags\":[\"BIGDATA\",\"REALTIME\",\"SPARK\",\"KAFKA\",\"EDGE\",\"STREAMING\",\"ANALYTICS\"],\"descricao\":\"Grupo de Processamento de Dados\",\"responsavel\":\"Natalia Maria De Oliveira Mota\",\"temperatura\":7}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":53,"data":"{\"nome\":\"L2-NE-IT NETWORK SECURITY\",\"tags\":[\"FIREWALL\",\"IDS/IPS\",\"ZERO TRUST\",\"SOC\",\"CYBER\",\"ENCRYPTION\"],\"descricao\":\"Proteção de infraestrutura crítica contra ameaças cibernéticas em redes de distribuição de energia\",\"responsavel\":\"Philippe de Araujo Chagas\",\"temperatura\":7}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":54,"data":"{\"nome\":\"L2-NE-IT NETWORK\",\"tags\":[\"SDN\",\"MPLS\",\"5G\",\"IOT\",\"LATENCY\",\"BGP\",\"QOS\"],\"descricao\":\"Gestão de infraestrutura de rede de alta disponibilidade para sistemas de transmissão e distribuição\",\"responsavel\":\"Philippe de Araujo Chagas\",\"temperatura\":7}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":55,"data":"{\"nome\":\"L2-NE-CLOUDSERVICES\",\"tags\":[\"AWS\",\"AZURE\",\"HYBRID_CLOUD\",\"DISASTER_RECOVERY\",\"COST_OPTIMIZATION\",\"ENERGY_CLOUD\",\"IaaS\"],\"descricao\":\"Gerenciamento de ambientes cloud para aplicações críticas do setor energético\",\"responsavel\":\"Denis Alberto de Paula\",\"temperatura\":5}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":56,"data":"{\"nome\":\"L2-NE-IT MONITORY\",\"tags\":[\"ZABBIX\",\"TRUESIGHT\",\"MONITORING\",\"REPORTING\",\"OBSERVABILITY\",\"AI OPS\",\"ALERTING\",\"PREDICTIVE\"],\"descricao\":\"Grupo de Monitoramento de Ativos de Infraestrutura\",\"responsavel\":\"Allen Saldanha Araujo\",\"temperatura\":6}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":57,"data":"{\"nome\":\"L2-NE-IT SO UNIX\",\"tags\":[\"AIX\",\"SOLARIS\",\"LINUX\",\"RHEL\",\"KUBERNETES\",\"SCRIPTING\",\"HA\"],\"descricao\":\"Grupo de Suporte a Sistemas Operacionais Unix\",\"responsavel\":\"Natalia Maria De Oliveira Mota\",\"temperatura\":6}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":58,"data":"{\"nome\":\"L2-NE-IT BOC\",\"tags\":[\"COMUNICACAO\",\"MONITORAMENTO\",\"ENCAMINHAMENTO\",\"INCIDENT\",\"CRISIS\",\"SLAS\",\"COMMS\"],\"descricao\":\"Business Operations Center\",\"responsavel\":\"Fabiano Paula da Silva\",\"temperatura\":4}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":59,"data":"{\"nome\":\"L2-NE-IT MIDDLEWARE\",\"tags\":[\"WEBLOGIC\",\"TOMCAT\",\"FORMS\",\"REPORTS\",\"APIS\",\"MICROSERVICES\",\"DEVOPS\",\"SCALABILITY\"],\"descricao\":\"Grupo de Suporte a Middlewares\",\"responsavel\":\"Allen Saldanha Araujo\",\"temperatura\":5}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":60,"data":"{\"nome\":\"L2-NE-IT BACKUP\",\"tags\":[\"BACKUP\",\"RESTORE\",\"LAN\",\"COMMVAULT\",\"CATALOG\",\"DISASTER\",\"ENCRYPTION\",\"REPLICATION\"],\"descricao\":\"Grupo de Suporte a Backup de Servidores e Database\",\"responsavel\":\"Valdir Alves da Silva\",\"temperatura\":6}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":61,"data":"{\"nome\":\"L2-NE-IT STORAGE\",\"tags\":[\"STORAGE\",\"RAID\",\"VIRTUALIZACAO\",\"SAN\",\"ISCSI\",\"BENCHMARKING\",\"NAS\",\"OBJECT\",\"TIERING\"],\"descricao\":\"Grupo de suporte a Storages e SANS\",\"responsavel\":\"Valdir Alves da Silva\",\"temperatura\":6}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":62,"data":"{\"nome\":\"L2-NE-IT NOC\",\"tags\":[\"MONITORAMENTO\",\"COMUNICACAO\",\"ENCAMINHAMENTO\",\"CONECTIVIDADE\",\"OFFICE\",\"BGP\",\"QOS\",\"NETWORK\",\"CAPACITY\"],\"descricao\":\"Grupo de Network Operations Center\",\"responsavel\":\"Fabiano Paula da Silva\",\"temperatura\":6}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":63,"data":"{\"nome\":\"L2-NE-IT VOIP\",\"tags\":[\"VOIP\",\"NETWORKING\",\"SIP\",\"UC\",\"QOS\",\"VIDEO\"],\"descricao\":\"Grupo de suporte Tecnologias VOIP\",\"responsavel\":\"Philippe de Araujo Chagas\",\"temperatura\":4}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"},
  {"id":64,"data":"{\"nome\":\"L2-NE-IT PCP PRODUCTION\",\"tags\":[\"CONTROL-M\",\"OFFICE\",\"COMUNICACAO\",\"SCADA\",\"AUTOMATION\",\"IIOT\",\"SCHEDULING\"],\"descricao\":\"Grupo de Operacionalização e Monitoramento de Processos Core Business\",\"responsavel\":\"Samuel Gomes Ferreira\",\"temperatura\":7}","created_at":"2025-06-05 14:21:53.358-03:00","updated_at":"2025-06-05 14:21:53.358-03:00"}
];

console.log('🏷️ Inserting sn_groups data...');

// Switch to bunsnc database
use('bunsnc');

// Clear existing data
print('📋 Clearing existing sn_groups collection...');
db.sn_groups.deleteMany({});

// Transform and insert data
const documents = [];
let successCount = 0;
let errorCount = 0;

for (const rawGroup of rawGroupsData) {
  try {
    // Parse the JSON string from data field
    const parsedData = JSON.parse(rawGroup.data);
    
    // Create document
    const document = {
      id: rawGroup.id,
      data: parsedData,
      raw_data: rawGroup.data, // Keep original JSON string
      created_at: new Date(rawGroup.created_at),
      updated_at: new Date(rawGroup.updated_at)
    };
    
    documents.push(document);
    successCount++;
    
    print(`✅ Processed group: ${parsedData.nome} (ID: ${rawGroup.id})`);
  } catch (error) {
    print(`❌ Failed to process group ID ${rawGroup.id}: ${error}`);
    errorCount++;
  }
}

// Insert all documents
if (documents.length > 0) {
  print(`📋 Inserting ${documents.length} groups...`);
  const result = db.sn_groups.insertMany(documents);
  print(`✅ Successfully inserted ${result.insertedIds.length} groups`);
}

// Create indexes
print('🔍 Creating indexes...');
db.sn_groups.createIndex({ id: 1 }, { unique: true });
db.sn_groups.createIndex({ "data.nome": 1 });
db.sn_groups.createIndex({ "data.tags": 1 });
db.sn_groups.createIndex({ "data.responsavel": 1 });
db.sn_groups.createIndex({ "data.temperatura": 1 });
db.sn_groups.createIndex({ created_at: -1 });
db.sn_groups.createIndex({ updated_at: -1 });
print('✅ Indexes created successfully');

// Verify data
print('\n📊 Verification:');
const finalCount = db.sn_groups.countDocuments();
print(`Total documents: ${finalCount}`);

// Get sample data
const sampleGroup = db.sn_groups.findOne({}, { sort: { "data.nome": 1 } });
if (sampleGroup) {
  print('\n📋 Sample group:');
  print(`- ID: ${sampleGroup.id}`);
  print(`- Nome: ${sampleGroup.data.nome}`);
  print(`- Tags: ${sampleGroup.data.tags.join(', ')}`);
  print(`- Responsável: ${sampleGroup.data.responsavel}`);
  print(`- Temperatura: ${sampleGroup.data.temperatura}`);
}

// Get stats by responsible person
const responsavelStats = db.sn_groups.aggregate([
  {
    $group: {
      _id: '$data.responsavel',
      count: { $sum: 1 },
      groups: { $push: '$data.nome' }
    }
  },
  { $sort: { count: -1 } }
]).toArray();

print('\n👥 Groups by responsible person:');
responsavelStats.forEach((stat) => {
  print(`- ${stat._id}: ${stat.count} group(s)`);
});

// Get temperature distribution
const tempStats = db.sn_groups.aggregate([
  {
    $group: {
      _id: '$data.temperatura',
      count: { $sum: 1 }
    }
  },
  { $sort: { _id: 1 } }
]).toArray();

print('\n🌡️ Temperature distribution:');
tempStats.forEach((stat) => {
  print(`- Level ${stat._id}: ${stat.count} group(s)`);
});

print(`\n🎯 Summary:`);
print(`✅ Successfully processed: ${successCount} groups`);
print(`❌ Errors: ${errorCount}`);
print(`📋 Total in database: ${finalCount}`);
print(`\n🚀 Collection 'sn_groups' is ready for use!`);