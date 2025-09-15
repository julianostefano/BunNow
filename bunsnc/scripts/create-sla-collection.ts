/**
 * Script to create and populate sn_sla_contratado collection with contractual SLA data
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { MongoClient } from 'mongodb';

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.MONGODB_DATABASE || 'bunsnc';

const contractualSLAData = [
  {
    "id": 1,
    "ticket_type": "incident",
    "metric_type": "response_time",
    "priority": "Severidade 1",
    "sla_hours": 0.25,
    "penalty_percentage": 0.50,
    "description": "Resposta em até 15 minutos para incidentes Severidade 1 - relacionados à segurança sobre valor financeiro",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 2,
    "ticket_type": "incident",
    "metric_type": "response_time",
    "priority": "Severidade 2",
    "sla_hours": 1.00,
    "penalty_percentage": 0.50,
    "description": "Resposta em até 1 hora para incidentes Severidade 2 - sobre valor financeiro",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 3,
    "ticket_type": "incident",
    "metric_type": "response_time",
    "priority": "Severidade 3",
    "sla_hours": 4.00,
    "penalty_percentage": 0.50,
    "description": "Resposta em até 4 horas para incidentes Severidade 3",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 4,
    "ticket_type": "incident",
    "metric_type": "resolution_time",
    "priority": "Severidade 1",
    "sla_hours": 2.00,
    "penalty_percentage": 0.50,
    "description": "Resolução em até 2 horas para incidentes Severidade 1 - relacionados à segurança",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 5,
    "ticket_type": "incident",
    "metric_type": "resolution_time",
    "priority": "Severidade 2",
    "sla_hours": 8.00,
    "penalty_percentage": 0.50,
    "description": "Resolução em até 8 horas para incidentes Severidade 2",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 6,
    "ticket_type": "incident",
    "metric_type": "resolution_time",
    "priority": "Severidade 3",
    "sla_hours": 24.00,
    "penalty_percentage": 0.50,
    "description": "Resolução em até 24 horas para incidentes Severidade 3",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 7,
    "ticket_type": "incident",
    "metric_type": "response_time",
    "priority": "P1",
    "sla_hours": 0.25,
    "penalty_percentage": 1.00,
    "description": "Penalização de 1% sobre o valor financeiro total da prestação de serviços mensal para descumprimento SLA P1",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 8,
    "ticket_type": "incident",
    "metric_type": "response_time",
    "priority": "P2",
    "sla_hours": 1.00,
    "penalty_percentage": 0.50,
    "description": "Penalização de 0,5% sobre o valor financeiro para descumprimento SLA P2",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 9,
    "ticket_type": "incident",
    "metric_type": "response_time",
    "priority": "P3",
    "sla_hours": 4.00,
    "penalty_percentage": 0.25,
    "description": "Penalização de 0,25% sobre o valor financeiro para descumprimento SLA P3",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 10,
    "ticket_type": "incident",
    "metric_type": "resolution_time",
    "priority": "P1",
    "sla_hours": 2.00,
    "penalty_percentage": 1.00,
    "description": "Aplicação 1,0% de penalidade sobre o valor financeiro total da prestação de serviços mensal para não cumprimento do Nível de Serviço",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 11,
    "ticket_type": "incident",
    "metric_type": "resolution_time",
    "priority": "P2",
    "sla_hours": 8.00,
    "penalty_percentage": 0.50,
    "description": "Aplicação 0,5% de penalidade sobre o valor financeiro total da prestação de serviços mensal para não cumprimento do Nível de Serviço",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 12,
    "ticket_type": "incident",
    "metric_type": "resolution_time",
    "priority": "P3",
    "sla_hours": 24.00,
    "penalty_percentage": 0.25,
    "description": "Aplicação 0,25% de penalidade sobre o valor financeiro total da prestação de serviços mensal para não cumprimento do Nível de Serviço",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 13,
    "ticket_type": "incident",
    "metric_type": "resolution_time",
    "priority": "P4",
    "sla_hours": 72.00,
    "penalty_percentage": 0.10,
    "description": "Aplicação 0,1% de penalidade sobre o valor financeiro total da prestação de serviços mensal para não cumprimento do Nível de Serviço",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.798Z"),
    "updated_at": new Date("2025-07-05T23:13:12.798Z")
  },
  {
    "id": 14,
    "ticket_type": "ctask",
    "metric_type": "response_time",
    "priority": "P1",
    "sla_hours": 1.00,
    "penalty_percentage": 0.50,
    "description": "Resposta em até 1 hora para Change Tasks Prioridade 1",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 15,
    "ticket_type": "ctask",
    "metric_type": "response_time",
    "priority": "P2",
    "sla_hours": 4.00,
    "penalty_percentage": 0.25,
    "description": "Resposta em até 4 horas para Change Tasks Prioridade 2",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 16,
    "ticket_type": "ctask",
    "metric_type": "response_time",
    "priority": "P3",
    "sla_hours": 8.00,
    "penalty_percentage": 0.10,
    "description": "Resposta em até 8 horas para Change Tasks Prioridade 3",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 17,
    "ticket_type": "ctask",
    "metric_type": "response_time",
    "priority": "P4",
    "sla_hours": 24.00,
    "penalty_percentage": 0.05,
    "description": "Resposta em até 24 horas para Change Tasks Prioridade 4",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 18,
    "ticket_type": "ctask",
    "metric_type": "resolution_time",
    "priority": "P1",
    "sla_hours": 8.00,
    "penalty_percentage": 1.00,
    "description": "Resolução em até 8 horas para Change Tasks Prioridade 1",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 19,
    "ticket_type": "ctask",
    "metric_type": "resolution_time",
    "priority": "P2",
    "sla_hours": 24.00,
    "penalty_percentage": 0.50,
    "description": "Resolução em até 24 horas para Change Tasks Prioridade 2",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 20,
    "ticket_type": "ctask",
    "metric_type": "resolution_time",
    "priority": "P3",
    "sla_hours": 72.00,
    "penalty_percentage": 0.25,
    "description": "Resolução em até 72 horas para Change Tasks Prioridade 3",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 21,
    "ticket_type": "ctask",
    "metric_type": "resolution_time",
    "priority": "P4",
    "sla_hours": 168.00,
    "penalty_percentage": 0.10,
    "description": "Resolução em até 168 horas (7 dias) para Change Tasks Prioridade 4",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 22,
    "ticket_type": "sctask",
    "metric_type": "response_time",
    "priority": "Normal",
    "sla_hours": 8.00,
    "penalty_percentage": 0.10,
    "description": "Resposta em até 8 horas para Standard Change Tasks - 100% das solicitações em até 8 dias úteis",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 23,
    "ticket_type": "sctask",
    "metric_type": "resolution_time",
    "priority": "Normal",
    "sla_hours": 192.00,
    "penalty_percentage": 0.50,
    "description": "Resolução em até 192 horas (8 dias úteis) para Standard Change Tasks",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 24,
    "ticket_type": "sctask",
    "metric_type": "response_time",
    "priority": "Standard",
    "sla_hours": 8.00,
    "penalty_percentage": 0.10,
    "description": "Tempo de resposta padrão para solicitações standard",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 25,
    "ticket_type": "sctask",
    "metric_type": "resolution_time",
    "priority": "Standard",
    "sla_hours": 192.00,
    "penalty_percentage": 0.25,
    "description": "Tempo de resolução padrão para solicitações standard - 8 dias úteis",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 26,
    "ticket_type": "sctask",
    "metric_type": "resolution_time",
    "priority": "P1",
    "sla_hours": 24.00,
    "penalty_percentage": 0.50,
    "description": "Resolução prioritária em até 24 horas com penalização 0,5%",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 27,
    "ticket_type": "sctask",
    "metric_type": "resolution_time",
    "priority": "P2",
    "sla_hours": 72.00,
    "penalty_percentage": 0.25,
    "description": "Resolução em até 72 horas com penalização 0,25%",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  },
  {
    "id": 28,
    "ticket_type": "sctask",
    "metric_type": "resolution_time",
    "priority": "P3",
    "sla_hours": 120.00,
    "penalty_percentage": 0.10,
    "description": "Resolução em até 120 horas com penalização 0,1%",
    "business_hours_only": true,
    "created_at": new Date("2025-07-05T23:13:12.804Z"),
    "updated_at": new Date("2025-07-05T23:13:12.804Z")
  }
];

async function createSLACollection() {
  const client = new MongoClient(MONGODB_URL);

  try {
    console.log('🔌 Connecting to MongoDB...');
    await client.connect();

    const db = client.db(DATABASE_NAME);
    const collection = db.collection('sn_sla_contratado');

    // Drop existing collection if it exists
    try {
      await collection.drop();
      console.log('🗑️ Existing collection dropped');
    } catch (error) {
      console.log('ℹ️ Collection does not exist, creating new one');
    }

    // Insert contractual SLA data
    console.log('📝 Inserting 28 contractual SLA records...');
    const result = await collection.insertMany(contractualSLAData);
    console.log(`✅ Inserted ${result.insertedCount} SLA records`);

    // Create indexes for optimal query performance
    console.log('🔍 Creating indexes...');
    await Promise.all([
      collection.createIndex({ ticket_type: 1, priority: 1, metric_type: 1 }, { name: 'sla_lookup_idx' }),
      collection.createIndex({ ticket_type: 1 }, { name: 'ticket_type_idx' }),
      collection.createIndex({ metric_type: 1 }, { name: 'metric_type_idx' }),
      collection.createIndex({ priority: 1 }, { name: 'priority_idx' }),
      collection.createIndex({ id: 1 }, { unique: true, name: 'id_unique_idx' })
    ]);

    console.log('✅ All indexes created successfully');

    // Verify data
    const count = await collection.countDocuments();
    console.log(`📊 Collection now contains ${count} documents`);

    // Display some sample data
    const samples = await collection.find({}).limit(3).toArray();
    console.log('📋 Sample records:');
    samples.forEach((sample, index) => {
      console.log(`  ${index + 1}. ${sample.ticket_type} - ${sample.metric_type} - ${sample.priority} (${sample.sla_hours}h)`);
    });

    console.log('🎉 SLA collection created successfully!');

  } catch (error) {
    console.error('❌ Error creating SLA collection:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run the script
createSLACollection().catch(console.error);