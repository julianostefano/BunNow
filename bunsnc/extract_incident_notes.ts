/**
 * Extract all notes from ServiceNow incident INC4504604
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

import { ServiceNowAuthClient } from './src/services/ServiceNowAuthClient';
import { ServiceNowNotesService } from './src/services/ServiceNowNotesService';

async function extractIncidentNotes() {
  const incidentNumber = 'INC4504604';
  const sysId = '8a7b44f58737a690e8f9b91c8bbb35c1';
  
  console.log(`🔍 Extracting ALL notes for incident ${incidentNumber} (${sysId})`);
  
  try {
    // Initialize ServiceNow client
    const serviceNowClient = new ServiceNowAuthClient();
    const notesService = new ServiceNowNotesService(serviceNowClient);
    
    // 1. First, get the full incident record to check for work_notes and comments fields
    console.log('\n📋 Step 1: Fetching incident record with all fields...');
    const incidentResponse = await serviceNowClient.makeRequestFullFields(
      'incident', 
      `sys_id=${sysId}`, 
      1
    );
    
    const incident = incidentResponse?.result?.[0];
    
    if (!incident) {
      console.error('❌ Incident not found');
      return;
    }
    
    console.log(`✅ Found incident: ${incident.number}`);
    console.log(`   Short Description: ${incident.short_description}`);
    console.log(`   State: ${incident.state}`);
    console.log(`   Opened: ${incident.opened_at}`);
    
    // Extract work_notes and comments from the main incident record
    const mainWorkNotes = incident.work_notes;
    const mainComments = incident.comments;
    
    console.log('\n📝 Main incident record fields:');
    if (mainWorkNotes) {
      console.log(`   work_notes: ${mainWorkNotes}`);
    } else {
      console.log('   work_notes: (empty)');
    }
    
    if (mainComments) {
      console.log(`   comments: ${mainComments}`);
    } else {
      console.log('   comments: (empty)');
    }
    
    // 2. Now get all journal entries from sys_journal_field
    console.log('\n📋 Step 2: Fetching all journal entries from sys_journal_field...');
    const allNotes = await notesService.getTicketNotes('incident', sysId);
    
    console.log(`✅ Found ${allNotes.length} journal entries`);
    
    // 3. Also query sys_journal_field directly with more detailed query
    console.log('\n📋 Step 3: Direct query to sys_journal_field for comprehensive results...');
    const journalResponse = await serviceNowClient.makeRequestFullFields(
      'sys_journal_field',
      `element_id=${sysId}^ORDERBYsys_created_on`,
      100
    );
    
    const journalEntries = journalResponse?.result || [];
    console.log(`✅ Found ${journalEntries.length} direct journal entries`);
    
    // 4. Check for activity entries in sys_audit table
    console.log('\n📋 Step 4: Checking sys_audit for activity entries...');
    try {
      const auditResponse = await serviceNowClient.makeRequestFullFields(
        'sys_audit',
        `documentkey=${sysId}^ORDERBYsys_created_on`,
        50
      );
      
      const auditEntries = auditResponse?.result || [];
      console.log(`✅ Found ${auditEntries.length} audit entries`);
      
      // Filter audit entries that might contain notes
      const noteAuditEntries = auditEntries.filter(entry => 
        entry.fieldname === 'work_notes' || 
        entry.fieldname === 'comments' ||
        entry.fieldname === 'additional_comments'
      );
      
      console.log(`   → ${noteAuditEntries.length} audit entries related to notes`);
    } catch (error) {
      console.log('   ⚠️  Could not access sys_audit table (permissions may be restricted)');
    }
    
    // 5. Create comprehensive report
    console.log('\n📊 COMPREHENSIVE REPORT - ALL NOTES AND COMMENTS');
    console.log('=' .repeat(80));
    console.log(`Incident: ${incidentNumber} (${sysId})`);
    console.log(`Short Description: ${incident.short_description}`);
    console.log(`State: ${incident.state} | Priority: ${incident.priority}`);
    console.log(`Opened: ${incident.opened_at}`);
    console.log(`Last Updated: ${incident.sys_updated_on}`);
    console.log('=' .repeat(80));
    
    // Sort all entries chronologically
    const allEntries: any[] = [];
    
    // Add main record notes if they exist
    if (mainWorkNotes) {
      allEntries.push({
        type: 'MAIN_WORK_NOTES',
        content: mainWorkNotes,
        timestamp: incident.sys_updated_on,
        author: 'From main incident record',
        source: 'incident.work_notes'
      });
    }
    
    if (mainComments) {
      allEntries.push({
        type: 'MAIN_COMMENTS',
        content: mainComments,
        timestamp: incident.sys_updated_on,
        author: 'From main incident record',
        source: 'incident.comments'
      });
    }
    
    // Add journal entries
    journalEntries.forEach(entry => {
      if (entry.value && entry.value.trim()) {
        const author = entry.sys_created_by?.display_value || entry.sys_created_by?.value || entry.sys_created_by || 'System';
        const isWorkNote = entry.element === 'work_notes';
        const isComment = entry.element === 'comments';
        
        allEntries.push({
          type: isWorkNote ? 'WORK_NOTES' : isComment ? 'COMMENTS' : 'JOURNAL_ENTRY',
          content: entry.value,
          timestamp: entry.sys_created_on,
          author: author,
          source: `sys_journal_field.${entry.element}`,
          element: entry.element
        });
      }
    });
    
    // Sort by timestamp
    allEntries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    if (allEntries.length === 0) {
      console.log('\n❌ No notes or comments found for this incident');
      return;
    }
    
    console.log(`\n📝 CHRONOLOGICAL LISTING (${allEntries.length} entries):`);
    console.log('-' .repeat(80));
    
    allEntries.forEach((entry, index) => {
      const timestamp = new Date(entry.timestamp).toLocaleString('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      console.log(`\n[${index + 1}] ${entry.type} - ${timestamp}`);
      console.log(`    Author: ${entry.author}`);
      console.log(`    Source: ${entry.source}`);
      if (entry.element) {
        console.log(`    Field: ${entry.element}`);
      }
      console.log(`    Content:`);
      console.log(`    ${entry.content}`);
      console.log('-' .repeat(40));
    });
    
    // Summary
    console.log(`\n📊 SUMMARY:`);
    console.log(`   Total entries: ${allEntries.length}`);
    console.log(`   Work Notes: ${allEntries.filter(e => e.type.includes('WORK')).length}`);
    console.log(`   Comments: ${allEntries.filter(e => e.type.includes('COMMENT')).length}`);
    console.log(`   Other entries: ${allEntries.filter(e => !e.type.includes('WORK') && !e.type.includes('COMMENT')).length}`);
    
    // Save to file for reference
    const reportData = {
      incident: {
        number: incidentNumber,
        sys_id: sysId,
        short_description: incident.short_description,
        state: incident.state,
        priority: incident.priority,
        opened_at: incident.opened_at,
        sys_updated_on: incident.sys_updated_on
      },
      entries: allEntries,
      summary: {
        total_entries: allEntries.length,
        work_notes: allEntries.filter(e => e.type.includes('WORK')).length,
        comments: allEntries.filter(e => e.type.includes('COMMENT')).length,
        extraction_timestamp: new Date().toISOString()
      }
    };
    
    await Bun.write(`incident_${incidentNumber}_notes_extract.json`, JSON.stringify(reportData, null, 2));
    console.log(`\n💾 Full report saved to: incident_${incidentNumber}_notes_extract.json`);
    
  } catch (error) {
    console.error('❌ Error extracting incident notes:', error);
    throw error;
  }
}

// Run the extraction
extractIncidentNotes()
  .then(() => {
    console.log('\n✅ Incident notes extraction completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Extraction failed:', error);
    process.exit(1);
  });