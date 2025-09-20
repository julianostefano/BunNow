# Manual Testing Guide - BunSNC ServiceNow Integration

**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

## Overview

This guide provides comprehensive instructions for manually testing the BunSNC ServiceNow integration system, including CRUD operations, background sync, and monitored groups query functionality.

## Prerequisites

### Required Services
- **ServiceNow Instance**: Active connection to Iberdrola ServiceNow
- **MongoDB**: Database server at 10.219.8.210:27018
- **Redis**: Cache and streams server 
- **BunSNC Server**: Running on port 3008

### Authentication Setup
Ensure the following environment variables are configured:
```bash
SNC_INSTANCE_URL=https://iberdrola.service-now.com
SNC_AUTH_TOKEN=<valid_token>
SERVICENOW_INSTANCE_URL=https://iberdrola.service-now.com
AUTH_SERVICE_URL=http://10.219.8.210:8000/auth
```

## Test Categories

### 1. Background Sync Service Tests

#### 1.1 Check Background Sync Status
```bash
curl -s -m 5 http://localhost:3008/sync/status | python3 -m json.tool
```

**Expected Results:**
- `"initialized": true`
- `"running": true` or `false`
- Configuration details showing enabled ticket types
- MongoDB collections statistics

#### 1.2 Start Background Sync
```bash
curl -s -X POST -m 5 http://localhost:3008/sync/start | python3 -m json.tool
```

**Expected Results:**
```json
{
    "success": true,
    "message": "Background sync started"
}
```

#### 1.3 Stop Background Sync
```bash
curl -s -X POST -m 5 http://localhost:3008/sync/stop | python3 -m json.tool
```

**Expected Results:**
```json
{
    "success": true,
    "message": "Background sync stopped"
}
```

#### 1.4 Force Manual Sync
```bash
curl -s -X POST -H "Content-Type: application/json" -d '{"ticketTypes":["incident"]}' http://localhost:3008/sync/force | python3 -m json.tool
```

**Expected Results:**
```json
{
    "success": true,
    "message": "Force sync completed"
}
```

### 2. Monitored Groups Query Tests

#### 2.1 Execute Monitored Groups Query Script
```bash
cd /storage/enviroments/integrations/nex/BunNow/bunsnc
bun run query_monitored_groups.ts
```

**What This Tests:**
- Connection to ServiceNow API
- Authentication with ServiceNow
- Query of all 16 monitored groups
- Detailed ticket information retrieval
- SLA data collection
- Notes/annotations collection

**Expected Output:**
- Initialization messages for ServiceNow Auth Client
- MongoDB connection and indexes creation
- Primary focus group query: "L2-NE-IT APP AND DATABASE"
- Detailed ticket reports with SLA and notes information
- Summary of all monitored groups with ticket counts

#### 2.2 Verify Target Group Details
The script should find tickets from these monitored groups:
```
L2-NE-IT APP AND DATABASE (Primary focus)
L2-NE-IT SAP BASIS
L2-NE-IT APP AND SERVICES
L2-NE-IT PROCESSING
L2-NE-IT NETWORK SECURITY
L2-NE-IT NETWORK
L2-NE-CLOUDSERVICES
L2-NE-IT MONITORY
L2-NE-IT SO UNIX
L2-NE-IT BOC
L2-NE-IT MIDDLEWARE
L2-NE-IT BACKUP
L2-NE-IT STORAGE
L2-NE-IT VOIP
L2-NE-IT NOC
L2-NE-IT PCP PRODUCTION
```

### 3. CRUD Operations Tests

#### 3.1 Execute CRUD Test Script
```bash
cd /storage/enviroments/integrations/nex/BunNow/bunsnc
bun run test_servicenow_crud.ts
```

**What This Tests:**
- **CREATE**: Creates a test incident in "L2-NE-IT APP AND DATABASE" group
- **READ**: Reads tickets from monitored groups with full details
- **UPDATE**: Updates the created incident with work notes
- **DELETE**: Closes the incident (safer than actual deletion)
- **Data Consistency**: Compares MongoDB vs ServiceNow data

**Expected Output:**
- ServiceNow authentication success
- MongoDB initialization
- Test results summary showing success/failure rates
- Detailed ticket information including SLA and notes
- Data consistency analysis

#### 3.2 Manual CREATE Test
```bash
# Example POST request to create incident
curl -s -X POST -H "Content-Type: application/json" \
  -d '{
    "short_description": "Manual Test Incident",
    "category": "software",
    "priority": "3",
    "assignment_group": "L2-NE-IT APP AND DATABASE"
  }' \
  http://localhost:3008/record/incident
```

### 4. API Endpoint Tests

#### 4.1 Health Check
```bash
curl -s -m 5 http://localhost:3008/health | python3 -m json.tool
```

**Expected Results:**
- Status: "healthy"
- All services: "ready" or "running"
- Background sync status

#### 4.2 API Information
```bash
curl -s -m 5 http://localhost:3008/api | python3 -m json.tool
```

**Expected Results:**
- Complete API endpoint documentation
- Background sync endpoints
- Dashboard URLs

### 5. Dashboard Access Tests

#### 5.1 Enhanced Dashboard
```bash
# Open in browser or test with curl
curl -s -m 5 http://localhost:3008/enhanced/
```

#### 5.2 Clean Dashboard
```bash
curl -s -m 5 http://localhost:3008/clean/
```

## Expected Results Summary

### Successful Test Indicators

#### Background Sync
- ✅ Background sync initializes without errors
- ✅ All MongoDB collections show document counts > 0
- ✅ ServiceNow authentication successful (8 cookies)
- ✅ Redis streams initialized successfully
- ✅ All 9 ticket types are being monitored

#### Monitored Groups Query
- ✅ Finds active tickets in "L2-NE-IT APP AND DATABASE" group
- ✅ Retrieves complete ticket details (state, priority, assignee, caller)
- ✅ Collects SLA information with breach status and percentages
- ✅ Collects notes/annotations with timestamps and authors
- ✅ Reports on all 16 monitored groups

#### CRUD Operations  
- ✅ CREATE: Successfully creates test incident
- ✅ READ: Retrieves tickets with full details from correct groups
- ✅ UPDATE: Updates tickets with work notes and status changes
- ✅ DELETE: Safely closes tickets instead of hard deletion
- ✅ Data consistency > 80% between MongoDB and ServiceNow

## Troubleshooting Guide

### Common Issues and Solutions

#### 1. Modal HTMX Not Opening (CRÍTICO)
**Symptoms:**
- Botão "Ver Detalhes" não responde
- Modal não abre ao clicar nos tickets

**Solutions:**
- Debugar rota `/enhanced/ticket-details/:sysId/:table` no browser DevTools
- Verificar resposta HTMX no Network tab
- Testar endpoint diretamente via curl
- Validar Alpine.js event binding no console

#### 2. Dados Mock em vez de Reais
**Symptoms:**
- Dashboard mostra INC001, INC002 (dados fixos)
- Contadores não refletem dados reais

**Solutions:**
- Verificar integração ServiceNow → dashboard
- Testar endpoints de dados reais: `/api/v1/mongodb/tickets/incident`
- Validar pipeline de dados MongoDB ← ServiceNow
- Confirmar background sync está populando dados

#### 3. Workflows de Movimentação Não Testados
**Symptoms:**
- Dropdowns de status implementados mas não validados
- Ações de resolver/fechar/atribuir não testadas

**Solutions:**
- Após modal funcionar, testar cada dropdown
- Validar persistência das mudanças de status
- Confirmar integração com ServiceNow API
- Testar fluxos completos de movimentação

#### ✅ PROBLEMAS REMOVIDOS (Já Resolvidos)
- ~~Authentication Failures~~ - NORMALIZADA pelo usuário
- ~~Background Sync Not Starting~~ - FUNCIONAL (startAutoSync implementado)
- ~~MongoDB Connection Issues~~ - TOTALMENTE IMPLEMENTADA (commit 6aa50a9)
- ~~No Tickets Found~~ - Sistema conectado, problema é dados mock vs reais

#### 4. SLA Data Not Found
**Symptoms:**
- "Nenhum SLA encontrado" in ticket reports
- Empty SLA arrays in responses

**Solutions:**
- Check if SLAs are configured in ServiceNow for the ticket types
- Verify task_sla table access permissions
- Confirm SLA collection is enabled in background sync

## Performance Benchmarks

### Expected Response Times
- **HTMX Modal Response**: < 500ms (CURRENT ISSUE)
- **ServiceNow API Requests**: < 2000ms per request
- **MongoDB Queries**: < 100ms per query
- **Dashboard Load**: < 1000ms ✅ WORKING
- **Background Sync Status**: < 500ms ✅ WORKING

### Data Volume Expectations (Updated)
- **System Status**: 90% FUNCIONAL - Architecture Sólida
- **Mock Data**: INC001, INC002 (need replacement with real data)
- **Real Data Expected**: 100-500+ tickets from ServiceNow
- **SLA Records**: Available through consolidated services
- **Storage**: MongoDB fully implemented (3→1 services)

## Test Execution Checklist

### Pre-Test Setup
- [ ] Verify all required services are running
- [ ] Check environment variables are configured
- [ ] Confirm network connectivity to ServiceNow and databases
- [ ] Start BunSNC server (`bun run start`)

### Core Functionality Tests
- [ ] Background sync status check
- [ ] Background sync start/stop operations
- [ ] Monitored groups query execution
- [ ] CRUD operations test script
- [ ] API endpoint health checks

### Data Validation
- [ ] Verify ticket data completeness (all required fields)
- [ ] Check SLA data accuracy (percentages, breach status)
- [ ] Validate notes/annotations content and timestamps
- [ ] Confirm group assignment matching

### Performance Tests
- [ ] Monitor ServiceNow API response times
- [ ] Check MongoDB query performance
- [ ] Verify memory usage stays within reasonable bounds
- [ ] Test concurrent request handling

### Error Handling Tests
- [ ] Test behavior with invalid credentials
- [ ] Verify graceful handling of network timeouts
- [ ] Check error logging and reporting
- [ ] Test recovery from service interruptions

## Test Report Template

### Test Execution Report
**Date**: ___________  
**Tester**: ___________  
**Environment**: Production/Development

#### Test Results Summary
- **Background Sync Tests**: ✅/❌ (___/__ passed)
- **Monitored Groups Query**: ✅/❌ (___/__ passed)  
- **CRUD Operations**: ✅/❌ (___/__ passed)
- **API Endpoints**: ✅/❌ (___/__ passed)

#### Key Findings
- **Tickets Found**: ___ incidents, ___ change tasks, ___ service tasks
- **Groups with Active Tickets**: ___/16 groups
- **SLA Coverage**: ___% of tickets have SLA data
- **Notes Coverage**: ___% of tickets have notes

#### Issues Identified
1. ________________________________
2. ________________________________  
3. ________________________________

#### Performance Metrics
- **Average API Response Time**: ___ms
- **MongoDB Query Time**: ___ms
- **Overall System Response**: ___ms

#### Recommendations
1. ________________________________
2. ________________________________
3. ________________________________

---

## Conclusion

This manual testing guide provides comprehensive coverage of the BunSNC ServiceNow integration system. Following these procedures ensures that all critical functionality is working correctly and that the system meets performance requirements.

For additional support or questions about testing procedures, contact the development team.

**Last Updated**: September 2025