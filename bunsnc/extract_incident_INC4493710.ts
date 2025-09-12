/**
 * Extract all notes and SLA data from incident INC4493710 and save to MongoDB
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './src/services/ServiceNowAuthClient';
import { MongoClient } from 'mongodb';

const INCIDENT_NUMBER = 'INC4493710';
const INCIDENT_SYS_ID = '4c788a541b336a547ee721f0604bcb0f';

function extractValue(field: any): string {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field === 'object' && field.display_value !== undefined) 
    return String(field.display_value);
  if (typeof field === 'object' && field.value !== undefined) 
    return String(field.value);
  return String(field);
}

async function extractIncidentNotes() {
  console.log('🎯 Extracting notes and SLA from incident INC4493710');
  console.log(`   Number: ${INCIDENT_NUMBER}`);
  console.log(`   sys_id: ${INCIDENT_SYS_ID}`);
  console.log('='.repeat(60));

  try {
    // Initialize ServiceNow client
    const serviceNowClient = new ServiceNowAuthClient();
    console.log('🔐 ServiceNow Auth Client initialized');

    // Get main incident data
    console.log('\n📋 1. Getting incident details...');
    const incidentResponse = await serviceNowClient.makeRequestFullFields(
      'incident',
      `sys_id=${INCIDENT_SYS_ID}`,
      1
    );

    if (!incidentResponse?.result?.[0]) {
      console.log('❌ Incident not found');
      process.exit(1);
    }

    const incident = incidentResponse.result[0];
    console.log(`   ✅ Found incident: ${extractValue(incident.number)}`);
    console.log(`   📝 Description: ${extractValue(incident.short_description)}`);
    console.log(`   📊 State: ${extractValue(incident.state)}`);
    console.log(`   ⚡ Priority: ${extractValue(incident.priority)}`);
    console.log(`   👥 Assignment Group: ${extractValue(incident.assignment_group)}`);
    console.log(`   👤 Assigned To: ${extractValue(incident.assigned_to)}`);
    console.log(`   📞 Caller: ${extractValue(incident.caller_id)}`);
    console.log(`   📅 Created: ${extractValue(incident.sys_created_on)}`);
    console.log(`   🔄 Updated: ${extractValue(incident.sys_updated_on)}`);

    // Get work notes from journal field
    console.log('\n📝 2. Getting work notes...');
    const notesResponse = await serviceNowClient.makeRequestFullFields(
      'sys_journal_field',
      `element_id=${INCIDENT_SYS_ID}^element=work_notes^ORDERBYsys_created_on`,
      100
    );

    const workNotes = notesResponse?.result || [];
    console.log(`   ✅ Found ${workNotes.length} work notes`);
    
    workNotes.forEach((note, index) => {
      console.log(`\n   📝 Work Note #${index + 1}:`);
      console.log(`      📅 Created: ${extractValue(note.sys_created_on)}`);
      console.log(`      👤 Author: ${extractValue(note.sys_created_by)}`);
      console.log(`      💬 Content: ${extractValue(note.value)}`);
    });

    // Get comments from journal field
    console.log('\n💬 3. Getting comments...');
    const commentsResponse = await serviceNowClient.makeRequestFullFields(
      'sys_journal_field',
      `element_id=${INCIDENT_SYS_ID}^element=comments^ORDERBYsys_created_on`,
      100
    );

    const comments = commentsResponse?.result || [];
    console.log(`   ✅ Found ${comments.length} comments`);
    
    comments.forEach((comment, index) => {
      console.log(`\n   💬 Comment #${index + 1}:`);
      console.log(`      📅 Created: ${extractValue(comment.sys_created_on)}`);
      console.log(`      👤 Author: ${extractValue(comment.sys_created_by)}`);
      console.log(`      💬 Content: ${extractValue(comment.value)}`);
    });

    // Get SLA data from task_sla table
    console.log('\n⏱️  4. Getting SLA information...');
    const slaResponse = await serviceNowClient.makeRequestFullFields(
      'task_sla',
      `task=${INCIDENT_SYS_ID}`,
      50
    );

    const slaRecords = slaResponse?.result || [];
    console.log(`   ✅ Found ${slaRecords.length} SLA records`);
    
    slaRecords.forEach((sla, index) => {
      console.log(`\n   ⏱️  SLA Record #${index + 1}:`);
      console.log(`      📋 SLA Definition: ${extractValue(sla.sla)}`);
      console.log(`      🏷️  Stage: ${extractValue(sla.stage)}`);
      console.log(`      📊 State: ${extractValue(sla.state)}`);
      console.log(`      🔴 Active: ${extractValue(sla.active) === 'true' ? 'Yes' : 'No'}`);
      console.log(`      💥 Has Breached: ${extractValue(sla.has_breached) === 'true' ? 'Yes' : 'No'}`);
      console.log(`      ⏰ Breach Time: ${extractValue(sla.breach_time)}`);
      console.log(`      📈 Business %: ${extractValue(sla.business_percentage)}%`);
      console.log(`      ⏳ Time Left: ${extractValue(sla.business_time_left)}`);
      console.log(`      ⏲️  Duration: ${extractValue(sla.business_duration)}`);
      console.log(`      🕒 Start Time: ${extractValue(sla.start_time)}`);
      console.log(`      🕕 End Time: ${extractValue(sla.end_time)}`);
      console.log(`      🎯 Planned End: ${extractValue(sla.planned_end_time)}`);
      console.log(`      📅 Created: ${extractValue(sla.sys_created_on)}`);
      console.log(`      🔄 Updated: ${extractValue(sla.sys_updated_on)}`);
    });

    // Generate summary report
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY REPORT');
    console.log('='.repeat(60));
    console.log(`🎯 Incident: ${INCIDENT_NUMBER} (${extractValue(incident.short_description)})`);
    console.log(`📝 Total Work Notes: ${workNotes.length}`);
    console.log(`💬 Total Comments: ${comments.length}`);
    console.log(`⏱️  Total SLA Records: ${slaRecords.length}`);
    console.log(`👥 Assignment Group: ${extractValue(incident.assignment_group)}`);
    console.log(`👤 Assigned To: ${extractValue(incident.assigned_to)}`);
    console.log(`📞 Caller: ${extractValue(incident.caller_id)}`);
    console.log(`📊 Current State: ${extractValue(incident.state)}`);
    console.log(`⚡ Priority: ${extractValue(incident.priority)}`);
    console.log(`📅 Created: ${extractValue(incident.sys_created_on)}`);
    console.log(`🔄 Last Updated: ${extractValue(incident.sys_updated_on)}`);

    // Save detailed data to JSON file
    const detailedData = {
      incident_number: INCIDENT_NUMBER,
      sys_id: INCIDENT_SYS_ID,
      extracted_at: new Date().toISOString(),
      incident_details: {
        sys_id: extractValue(incident.sys_id),
        number: extractValue(incident.number),
        short_description: extractValue(incident.short_description),
        description: extractValue(incident.description),
        state: extractValue(incident.state),
        priority: extractValue(incident.priority),
        urgency: extractValue(incident.urgency),
        impact: extractValue(incident.impact),
        category: extractValue(incident.category),
        subcategory: extractValue(incident.subcategory),
        assignment_group: extractValue(incident.assignment_group),
        assigned_to: extractValue(incident.assigned_to),
        caller_id: extractValue(incident.caller_id),
        opened_by: extractValue(incident.opened_by),
        sys_created_on: extractValue(incident.sys_created_on),
        sys_updated_on: extractValue(incident.sys_updated_on),
        opened_at: extractValue(incident.opened_at),
        resolved_at: extractValue(incident.resolved_at),
        closed_at: extractValue(incident.closed_at)
      },
      work_notes: workNotes.map(note => ({
        sys_id: extractValue(note.sys_id),
        created_on: extractValue(note.sys_created_on),
        created_by: extractValue(note.sys_created_by),
        content: extractValue(note.value)
      })),
      comments: comments.map(comment => ({
        sys_id: extractValue(comment.sys_id),
        created_on: extractValue(comment.sys_created_on),
        created_by: extractValue(comment.sys_created_by),
        content: extractValue(comment.value)
      })),
      sla_records: slaRecords.map(sla => ({
        sys_id: extractValue(sla.sys_id),
        sla_definition: extractValue(sla.sla),
        stage: extractValue(sla.stage),
        state: extractValue(sla.state),
        active: extractValue(sla.active) === 'true',
        has_breached: extractValue(sla.has_breached) === 'true',
        breach_time: extractValue(sla.breach_time),
        business_percentage: parseFloat(extractValue(sla.business_percentage)) || 0,
        business_time_left: extractValue(sla.business_time_left),
        business_duration: extractValue(sla.business_duration),
        calendar_duration: extractValue(sla.calendar_duration),
        schedule: extractValue(sla.schedule),
        start_time: extractValue(sla.start_time),
        end_time: extractValue(sla.end_time),
        planned_end_time: extractValue(sla.planned_end_time),
        original_breach_time: extractValue(sla.original_breach_time),
        created_on: extractValue(sla.sys_created_on),
        updated_on: extractValue(sla.sys_updated_on)
      })),
      summary: {
        total_work_notes: workNotes.length,
        total_comments: comments.length,
        total_sla_records: slaRecords.length,
        total_notes: workNotes.length + comments.length
      }
    };

    const fileName = `incident_${INCIDENT_NUMBER}_complete_analysis.json`;
    await Bun.write(fileName, JSON.stringify(detailedData, null, 2));
    console.log(`\n💾 Complete data saved to: ${fileName}`);

    console.log('\n✅ Extraction completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error during extraction:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the extraction
extractIncidentNotes();