/**
 * BunSNC Client SDK Demo
 * Demonstrates usage of the type-safe Eden Treaty client
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { 
  createBunSNCClient, 
  TaskType, 
  TaskPriority,
  BunSNCClient 
} from '../src/client';

async function demonstrateBasicUsage() {
  console.log('🚀 BunSNC Client SDK Demo - Basic Usage\n');

  // Create client instance
  const client = createBunSNCClient({
    baseUrl: 'http://localhost:3008',
    timeout: 30000,
    auth: {
      username: 'admin',
      password: 'admin'
    }
  });

  try {
    // Test connection
    console.log('📡 Testing connection...');
    const isConnected = await client.testConnection();
    console.log(`   Connection status: ${isConnected ? '✅ Connected' : '❌ Failed'}`);

    if (!isConnected) {
      console.log('⚠️  Server not available. Please start the BunSNC server first.');
      return;
    }

    // Get server health
    console.log('\n🔍 Checking server health...');
    const health = await client.getHealth();
    if (health.data) {
      console.log(`   Server healthy: ${health.data.healthy ? '✅ Yes' : '❌ No'}`);
    }

    // Get system statistics
    console.log('\n📊 Fetching system statistics...');
    const stats = await client.getSystemStats();
    if (stats.data?.success) {
      const systemData = stats.data.data.system;
      console.log(`   Running: ${systemData.isRunning ? '✅ Yes' : '❌ No'}`);
      console.log(`   Tasks Created: ${systemData.tasksCreated}`);
      console.log(`   Tasks Completed: ${systemData.tasksCompleted}`);
      console.log(`   Success Rate: ${systemData.successRate}%`);
    }

    // Get incidents
    console.log('\n🎫 Fetching incidents...');
    const incidents = await client.getIncidents({
      state: 'active',
      limit: '5'
    });
    
    if (incidents.data?.success) {
      console.log(`   Found ${incidents.data.data.length} active incidents`);
      incidents.data.data.forEach((incident: any, index: number) => {
        console.log(`   ${index + 1}. ${incident.number}: ${incident.short_description}`);
      });
    }

    console.log('\n✅ Basic usage demonstration completed successfully!');

  } catch (error) {
    console.error('❌ Error in basic usage demo:', error);
  }
}

async function demonstrateTaskManagement() {
  console.log('\n\n🔧 BunSNC Client SDK Demo - Task Management\n');

  const client = createBunSNCClient({
    baseUrl: 'http://localhost:3008',
    auth: { username: 'admin', password: 'admin' }
  });

  try {
    // Create a data sync task
    console.log('📋 Creating data sync task...');
    const task = await client.createTask({
      type: TaskType.DATA_SYNC,
      data: {
        tables: ['incident'],
        incremental: true
      },
      priority: TaskPriority.NORMAL,
      tags: ['demo', 'sync'],
      createdBy: 'demo-script'
    });

    if (task.data?.success) {
      const taskId = task.data.data.taskId;
      console.log(`   ✅ Task created: ${taskId}`);

      // Get task details
      console.log('\n📄 Getting task details...');
      const taskDetails = await client.getTask(taskId);
      if (taskDetails.data?.success) {
        const taskData = taskDetails.data.data.task;
        console.log(`   Status: ${taskData.status}`);
        console.log(`   Progress: ${taskData.progress}%`);
        console.log(`   Type: ${taskData.type}`);
        console.log(`   Priority: ${taskData.priority}`);
      }

      // Get current tasks
      console.log('\n📝 Getting current tasks...');
      const allTasks = await client.getTasks({ limit: '5' });
      if (allTasks.data?.success) {
        console.log(`   Found ${allTasks.data.data.tasks.length} tasks in queue`);
        allTasks.data.data.tasks.forEach((t: any, index: number) => {
          console.log(`   ${index + 1}. ${t.id} [${t.status}] - ${t.type}`);
        });
      }

    } else {
      console.log('❌ Failed to create task');
    }

  } catch (error) {
    console.error('❌ Error in task management demo:', error);
  }
}

async function demonstrateScheduledTasks() {
  console.log('\n\n⏰ BunSNC Client SDK Demo - Scheduled Tasks\n');

  const client = createBunSNCClient({
    baseUrl: 'http://localhost:3008',
    auth: { username: 'admin', password: 'admin' }
  });

  try {
    // Get existing scheduled tasks
    console.log('📅 Getting scheduled tasks...');
    const scheduled = await client.getScheduledTasks();
    if (scheduled.data?.success) {
      console.log(`   Found ${scheduled.data.data.scheduledTasks.length} scheduled tasks`);
      scheduled.data.data.scheduledTasks.forEach((task: any, index: number) => {
        console.log(`   ${index + 1}. ${task.name} - ${task.cronExpression} [${task.enabled ? 'Enabled' : 'Disabled'}]`);
      });
    }

    // Create a new scheduled task
    console.log('\n📝 Creating demo scheduled task...');
    const newScheduled = await client.createScheduledTask({
      name: 'Demo Weekly Report',
      description: 'Generate a weekly demo report',
      cronExpression: '0 9 * * 1', // Every Monday at 9 AM
      taskType: TaskType.REPORT_GENERATION,
      taskData: {
        reportType: 'weekly_demo',
        parameters: {
          includeTrends: true,
          includeMetrics: true
        }
      },
      priority: TaskPriority.LOW,
      tags: ['demo', 'weekly', 'report'],
      createdBy: 'demo-script'
    });

    if (newScheduled.data?.success) {
      const scheduledId = newScheduled.data.data.taskId;
      console.log(`   ✅ Scheduled task created: ${scheduledId}`);
      
      // Disable it immediately (just for demo)
      console.log('   🔧 Disabling demo task...');
      await client.setScheduledTaskEnabled(scheduledId, false);
      console.log('   ✅ Demo task disabled');
    }

  } catch (error) {
    console.error('❌ Error in scheduled tasks demo:', error);
  }
}

async function demonstrateAnalytics() {
  console.log('\n\n📊 BunSNC Client SDK Demo - Analytics\n');

  const client = createBunSNCClient({
    baseUrl: 'http://localhost:3008',
    auth: { username: 'admin', password: 'admin' }
  });

  try {
    // Get performance metrics
    console.log('🏃 Getting performance metrics...');
    const metrics = await client.getPerformanceMetrics();
    if (metrics.data?.success) {
      const data = metrics.data.data;
      console.log('   System Performance:');
      console.log(`     CPU Usage: ${data.system.cpu_usage}%`);
      console.log(`     Memory Usage: ${data.system.memory_usage}%`);
      console.log(`     Disk Usage: ${data.system.disk_usage}%`);
      
      console.log('   Processing Performance:');
      console.log(`     Records/sec: ${data.processing.records_per_second}`);
      console.log(`     Active Streams: ${data.processing.active_streams}`);
      console.log(`     Error Rate: ${data.processing.error_rate}%`);
    }

    // Get incident trends
    console.log('\n📈 Getting incident trends...');
    const trends = await client.getTrendData('incidents', '7');
    if (trends.data?.success) {
      const trendData = trends.data.data;
      console.log(`   Trend data for ${trendData.type} (${trendData.period}):`);
      trendData.labels.forEach((label: string, index: number) => {
        console.log(`     ${label}: ${trendData.values[index]} incidents`);
      });
    }

  } catch (error) {
    console.error('❌ Error in analytics demo:', error);
  }
}

async function demonstrateBatchOperations() {
  console.log('\n\n⚡ BunSNC Client SDK Demo - Batch Operations\n');

  const client = createBunSNCClient({
    baseUrl: 'http://localhost:3008',
    auth: { username: 'admin', password: 'admin' }
  });

  try {
    console.log('🔄 Running batch operations...');

    // Create multiple operations
    const operations = [
      () => client.getHealth(),
      () => client.getSystemStats(),
      () => client.getTaskQueueStats(),
      () => client.getScheduledTasks(),
      () => client.getIncidentStats()
    ];

    // Execute with controlled concurrency
    const results = await client.batchOperation(operations, {
      concurrency: 3,
      failFast: false
    });

    console.log(`   ✅ Completed ${results.length} operations successfully`);
    
    // Count successful operations
    const successful = results.filter((result: any) => 
      result.data?.success !== false
    );
    
    console.log(`   📊 Success rate: ${successful.length}/${results.length} (${Math.round(successful.length / results.length * 100)}%)`);

  } catch (error) {
    console.error('❌ Error in batch operations demo:', error);
  }
}

async function runFullDemo() {
  console.log('🎯 BunSNC Client SDK - Comprehensive Demo');
  console.log('=========================================\n');

  try {
    await demonstrateBasicUsage();
    await demonstrateTaskManagement();
    await demonstrateScheduledTasks();
    await demonstrateAnalytics();
    await demonstrateBatchOperations();
    
    console.log('\n\n🎉 All demonstrations completed successfully!');
    console.log('📖 Check the README.md for more detailed usage examples.');
    
  } catch (error) {
    console.error('\n💥 Demo failed with error:', error);
    process.exit(1);
  }
}

// Run the demo if this file is executed directly
if (import.meta.main) {
  runFullDemo().then(() => {
    console.log('\n👋 Demo completed. Goodbye!');
    process.exit(0);
  }).catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export {
  demonstrateBasicUsage,
  demonstrateTaskManagement,
  demonstrateScheduledTasks,
  demonstrateAnalytics,
  demonstrateBatchOperations,
  runFullDemo
};