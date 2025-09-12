/**
 * Test Groups API endpoints - Verify REST API functionality
 * Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]
 */

async function testGroupsAPI() {
  const baseUrl = 'http://localhost:3000/api/groups';
  
  console.log('🧪 Testing Groups API endpoints...\n');

  try {
    // Test 1: Get all groups
    console.log('1️⃣ Testing GET /api/groups');
    const allGroupsResponse = await fetch(`${baseUrl}`);
    const allGroups = await allGroupsResponse.json();
    
    if (allGroups.success) {
      console.log(`✅ SUCCESS: Retrieved ${allGroups.count} groups`);
      console.log(`📋 Sample group: ${allGroups.data[0]?.nome || 'N/A'}\n`);
    } else {
      console.log(`❌ FAILED: ${allGroups.error}\n`);
    }

    // Test 2: Get groups dropdown
    console.log('2️⃣ Testing GET /api/groups/dropdown');
    const dropdownResponse = await fetch(`${baseUrl}/dropdown`);
    const dropdown = await dropdownResponse.json();
    
    if (dropdown.success) {
      console.log(`✅ SUCCESS: Retrieved ${dropdown.count} dropdown options`);
      console.log(`📋 Sample option: ${dropdown.data[0]?.label || 'N/A'}\n`);
    } else {
      console.log(`❌ FAILED: ${dropdown.error}\n`);
    }

    // Test 3: Get group by ID
    console.log('3️⃣ Testing GET /api/groups/:id');
    const groupResponse = await fetch(`${baseUrl}/49`);
    const group = await groupResponse.json();
    
    if (group.success) {
      console.log(`✅ SUCCESS: Retrieved group ${group.data.data?.nome || group.data.id}`);
      console.log(`🌡️ Temperature: ${group.data.data?.temperatura || 'N/A'}\n`);
    } else {
      console.log(`❌ FAILED: ${group.error}\n`);
    }

    // Test 4: Get groups by tag
    console.log('4️⃣ Testing GET /api/groups/tag/:tag');
    const tagResponse = await fetch(`${baseUrl}/tag/ORACLE`);
    const tagGroups = await tagResponse.json();
    
    if (tagGroups.success) {
      console.log(`✅ SUCCESS: Found ${tagGroups.count} groups with ORACLE tag`);
      console.log(`📋 Groups: ${tagGroups.data.map((g: any) => g.nome).join(', ')}\n`);
    } else {
      console.log(`❌ FAILED: ${tagGroups.error}\n`);
    }

    // Test 5: Get collection statistics
    console.log('5️⃣ Testing GET /api/groups/stats');
    const statsResponse = await fetch(`${baseUrl}/stats`);
    const stats = await statsResponse.json();
    
    if (stats.success) {
      console.log(`✅ SUCCESS: Retrieved collection statistics`);
      console.log(`📊 Total Groups: ${stats.data.totalGroups}`);
      console.log(`🏷️ Total Tags: ${stats.data.totalTags}`);
      console.log(`👥 Responsáveis: ${stats.data.responsaveis?.length || 0}\n`);
    } else {
      console.log(`❌ FAILED: ${stats.error}\n`);
    }

    // Test 6: Test dashboard groups endpoint
    console.log('6️⃣ Testing GET /enhanced/groups-dropdown');
    const dashboardResponse = await fetch('http://localhost:3000/enhanced/groups-dropdown');
    const dashboardGroups = await dashboardResponse.json();
    
    if (dashboardGroups.success) {
      console.log(`✅ SUCCESS: Dashboard endpoint returned ${dashboardGroups.data.length} groups`);
      console.log(`📋 Sample dashboard group: ${dashboardGroups.data[0]?.label || 'N/A'}\n`);
    } else {
      console.log(`❌ FAILED: ${dashboardGroups.error}\n`);
    }

    console.log('🎯 Groups API testing completed!');

  } catch (error) {
    console.error('❌ CRITICAL ERROR during API testing:', error);
  }
}

// Run the tests
testGroupsAPI().catch(console.error);