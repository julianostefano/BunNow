# Groups System Documentation

## Overview

The Groups System provides comprehensive management of ServiceNow assignment groups through a MongoDB collection (`sn_groups`) with full CRUD operations, dynamic filtering, and frontend integration.

**Author**: Juliano Stefano <jsdealencar@ayesa.com> [2025]

## Architecture

### Components

1. **MongoDB Collection**: `sn_groups` - stores 16 Neoenergia IT groups
2. **GroupService**: Complete CRUD service with caching
3. **REST API**: `/api/groups/*` endpoints
4. **Frontend Integration**: Dynamic group loading in dashboard
5. **HybridTicketService**: Group validation and filtering

### Data Structure

```typescript
interface GroupData {
  nome: string;           // Group name (e.g., "L2-NE-IT APP AND DATABASE")
  tags: string[];         // Technology tags (e.g., ["ORACLE", "POSTGRES"])
  descricao: string;      // Group description
  responsavel: string;    // Responsible person
  temperatura: number;    // Complexity level (1-10)
}

interface GroupDocument {
  id: number;             // Unique identifier
  data: GroupData;        // Parsed JSON data
  raw_data: string;       // Original JSON string
  created_at: Date;       // Creation timestamp
  updated_at: Date;       // Last update timestamp
}
```

## Available Groups

| ID | Name | Responsible | Temperature | Key Tags |
|----|------|-------------|-------------|----------|
| 49 | L2-NE-IT APP AND DATABASE | Cássio Luiz Soares Dias | 7 | ORACLE, POSTGRES, ML |
| 50 | L2-NE-IT SAP BASIS | Antonio Helio Nonato de Morais | 7 | SAP, ABAP, HANA |
| 51 | L2-NE-IT APP AND SERVICES | Denis Alberto de Paula | 5 | WINDOWS, AZURE, SECURITY |
| 52 | L2-NE-IT PROCESSING | Natalia Maria De Oliveira Mota | 7 | BIGDATA, KAFKA, SPARK |
| 53 | L2-NE-IT NETWORK SECURITY | Philippe de Araujo Chagas | 7 | FIREWALL, ZERO TRUST |
| 54 | L2-NE-IT NETWORK | Philippe de Araujo Chagas | 7 | SDN, MPLS, 5G |
| 55 | L2-NE-CLOUDSERVICES | Denis Alberto de Paula | 5 | AWS, AZURE, HYBRID |
| 56 | L2-NE-IT MONITORY | Allen Saldanha Araujo | 6 | ZABBIX, OBSERVABILITY |
| 57 | L2-NE-IT SO UNIX | Natalia Maria De Oliveira Mota | 6 | LINUX, KUBERNETES |
| 58 | L2-NE-IT BOC | Fabiano Paula da Silva | 4 | COMMS, INCIDENT |
| 59 | L2-NE-IT MIDDLEWARE | Allen Saldanha Araujo | 5 | WEBLOGIC, MICROSERVICES |
| 60 | L2-NE-IT BACKUP | Valdir Alves da Silva | 6 | BACKUP, COMMVAULT |
| 61 | L2-NE-IT STORAGE | Valdir Alves da Silva | 6 | STORAGE, SAN, NAS |
| 62 | L2-NE-IT NOC | Fabiano Paula da Silva | 6 | MONITORING, BGP |
| 63 | L2-NE-IT VOIP | Philippe de Araujo Chagas | 4 | VOIP, SIP, UC |
| 64 | L2-NE-IT PCP PRODUCTION | Samuel Gomes Ferreira | 7 | CONTROL-M, SCADA |

## API Endpoints

### Core CRUD Operations

#### Get All Groups
```http
GET /api/groups
```

**Query Parameters:**
- `nome` (optional): Filter by group name (regex)
- `responsavel` (optional): Filter by responsible person (regex)
- `temperatura` (optional): Filter by exact temperature level
- `temperaturaMin` (optional): Filter by minimum temperature
- `temperaturaMax` (optional): Filter by maximum temperature
- `tags` (optional): Filter by tags (array)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 49,
      "nome": "L2-NE-IT APP AND DATABASE",
      "descricao": "Grupo de Suporte a Banco de Dados...",
      "responsavel": "Cássio Luiz Soares Dias",
      "temperatura": 7,
      "tags": ["ORACLE", "POSTGRES", "ML"]
    }
  ],
  "count": 16,
  "filter": {}
}
```

#### Get Group by ID
```http
GET /api/groups/:id
```

#### Get Group by Name
```http
GET /api/groups/name/:name
```

#### Get Groups by Tag
```http
GET /api/groups/tag/:tag
```

#### Get Groups by Responsible
```http
GET /api/groups/responsavel/:responsavel
```

### Dropdown and Statistics

#### Get Dropdown Options
```http
GET /api/groups/dropdown
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "value": "L2-NE-IT APP AND DATABASE",
      "label": "L2-NE-IT APP AND DATABASE",
      "emoji": "💾"
    }
  ],
  "count": 16
}
```

#### Get Collection Statistics
```http
GET /api/groups/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalGroups": 16,
    "totalTags": 45,
    "responsaveis": ["Cássio Luiz", "Antonio Helio", "..."],
    "temperaturaDistribution": {
      "4": 2,
      "5": 3,
      "6": 5,
      "7": 6
    }
  }
}
```

### Dashboard Integration

#### Dynamic Groups for Frontend
```http
GET /enhanced/groups-dropdown
```

Used by the dashboard to populate the group filter dropdown dynamically.

## GroupService Methods

### Core Operations
```typescript
// Initialize service
await groupService.initialize();

// Get all groups with optional filtering
const groups = await groupService.getAllGroups({ temperatura: 7 });

// Get specific group
const group = await groupService.getGroupById(49);
const group = await groupService.getGroupByName('L2-NE-IT APP AND DATABASE');

// Create new group
const newGroup = await groupService.createGroup(groupData);

// Update existing group
await groupService.updateGroup(49, { temperatura: 8 });

// Delete group
await groupService.deleteGroup(49);

// Get statistics
const stats = await groupService.getStats();

// Get dropdown options
const options = await groupService.getGroupNamesForDropdown();
```

### Advanced Queries
```typescript
// Groups by tag
const oracleGroups = await groupService.getGroupsByTag('ORACLE');

// Groups by responsible person
const philippeGroups = await groupService.getGroupsByResponsavel('Philippe');

// Complex filtering
const filteredGroups = await groupService.getAllGroups({
  temperaturaMin: 6,
  tags: ['SECURITY', 'NETWORK']
});
```

## HybridTicketService Integration

The HybridTicketService now includes group management methods:

```typescript
// Get available groups for filters
const groups = await hybridService.getAvailableGroups();

// Validate group existence
const isValid = await hybridService.validateGroup('L2-NE-IT NETWORK');

// Get group details
const details = await hybridService.getGroupDetails('L2-NE-IT SAP BASIS');

// Get group statistics
const stats = await hybridService.getGroupStats();
```

## Frontend Integration

### Dashboard Dynamic Loading

The enhanced dashboard now loads groups dynamically from MongoDB:

```javascript
// Load groups on initialization
async loadGroups() {
  const response = await fetch('/enhanced/groups-dropdown');
  const data = await response.json();
  
  if (data.success) {
    this.availableGroups = [
      { value: 'all', label: '🌐 Todos os Grupos', emoji: '🌐' },
      ...data.data
    ];
  }
}
```

### Group Filter Dropdown

```html
<select x-model="group" @change="updateFilters()">
  <template x-if="groupsLoaded" x-for="groupOption in availableGroups">
    <option :value="groupOption.value" 
            x-text="`${groupOption.emoji} ${groupOption.label.replace(/^[^\s]*\s/, '')}`">
    </option>
  </template>
</select>
```

## Database Setup

### Initialization Script
```bash
# Initialize collection with data
mongosh bunsnc < insert_groups_cli.js

# Verify data
bun run test_groups_collection.ts
```

### Indexes Created
- `id` (unique)
- `data.nome`
- `data.tags`
- `data.responsavel`
- `data.temperatura`
- `created_at`
- `updated_at`

## Testing

### Collection Test
```bash
bun run test_groups_collection.ts
```

### API Test
```bash
# Start server
bun src/index.ts

# Run API tests
bun run test_groups_api.ts
```

### Manual Testing
```bash
# Test specific endpoints
curl http://localhost:3000/api/groups
curl http://localhost:3000/api/groups/dropdown
curl http://localhost:3000/api/groups/49
curl http://localhost:3000/api/groups/tag/ORACLE
curl http://localhost:3000/enhanced/groups-dropdown
```

## Error Handling

### Service Level
- MongoDB connection errors
- Document not found
- Validation errors
- Index creation failures

### API Level
- Invalid parameters
- Missing groups
- Service unavailable
- Malformed requests

### Frontend Level
- Network failures
- Fallback to static groups
- Loading states
- User feedback

## Performance Considerations

### Caching Strategy
- 5-minute in-memory cache
- Automatic cache invalidation on updates
- Cached dropdown options

### Database Optimization
- Compound indexes for complex queries
- Projection queries for large datasets
- Aggregation pipelines for statistics

### Frontend Optimization
- Lazy loading of groups
- Debounced filter updates
- Efficient template rendering

## Maintenance

### Regular Tasks
- Monitor collection size
- Review index performance
- Update group information
- Clean old cache entries

### Monitoring
- API response times
- Cache hit rates
- Error frequencies
- Group usage statistics

## Future Enhancements

1. **Group Hierarchies**: Parent-child relationships
2. **Role-based Access**: Permission-based group filtering
3. **Group Analytics**: Usage patterns and metrics
4. **Dynamic Routing**: Automatic group assignment
5. **Integration APIs**: External system synchronization
6. **Bulk Operations**: Multi-group management
7. **Audit Trail**: Change history tracking
8. **Custom Fields**: Extensible group attributes

---

**Note**: This system replaces hardcoded group filters with dynamic MongoDB-driven group management, providing better maintainability, scalability, and data consistency across the BunSNC platform.