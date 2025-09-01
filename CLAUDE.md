# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a refactoring project converting **PySNC** (Python ServiceNow client library) to **bunsnc** (Bun + Elysia implementation). The project maintains dual implementations during migration:

- **pysnc/** - Original Python library using Poetry, pytest, and Sphinx documentation
- **bunsnc/** - New Bun/TypeScript implementation providing both CLI and HTTP API interfaces

## Architecture

### bunsnc Structure (Primary Development Focus)
```
bunsnc/
├── src/
│   ├── index.ts              # Entry point with CLI/HTTP auto-detection  
│   ├── cli.ts                # CLI commands using commander
│   ├── controllers/          # Business logic controllers
│   ├── routes/               # Elysia HTTP route definitions
│   ├── services/             # Core services (ServiceNow, Auth, Batch, Attachments)
│   └── types/
│       ├── servicenow.ts     # ServiceNow API type definitions
│       └── schemaRegistry.ts # Dynamic validation schemas
├── package.json
└── tsconfig.json
```

### Service Layer Architecture
- **ServiceNowService**: Core CRUD operations for ServiceNow tables
- **AuthService**: Authentication and token management  
- **BatchService**: Multi-operation batch processing
- **AttachmentService**: File upload/download functionality

### Dynamic Schema System
The project uses a registry-based validation system in `types/schemaRegistry.ts`:
- Each ServiceNow table can have a custom validation schema using Elysia's `t.Object()`
- Schemas are automatically applied to API routes for type-safe validation
- Add new schemas by extending the `schemaRegistry` object

## Development Commands

### Bun/TypeScript (bunsnc) - Primary Development
```bash
# Install dependencies
bun install

# Development server (HTTP API on port 3000)
bun run start

# CLI usage
bun src/cli.ts <command>
bun src/cli.ts login -u username -p password
bun src/cli.ts record incident -d '{"short_description":"Test"}'
bun src/cli.ts batch -o '[{"op":"create","table":"incident","data":{...}}]'

# Build and compile
bun compile src/cli/index.ts --out dist/bunsnc

# Testing
bun test
```

### Python (PySNC) - Legacy Reference
```bash
# Install dependencies
poetry install

# Run tests and linting
make test                    # Runs pytest + mypy
poetry run pytest
poetry run mypy

# Documentation
make docs                    # Builds Sphinx docs
cd docs && make clean html
```

## Environment Configuration
Create `.env` file based on `sample.env`:
```env
SNC_INSTANCE_URL=https://your-instance.service-now.com
SNC_AUTH_TOKEN=Bearer your-token
```

## Entry Point Behavior
`bunsnc/src/index.ts` automatically detects execution mode:
- **CLI Mode**: When command-line arguments are provided
- **HTTP Server Mode**: When no arguments provided (starts Elysia server)

## API Endpoints (bunsnc)
- `POST /record/:table` - Create records with dynamic schema validation
- `GET /record/:table/:sys_id` - Read records
- `PUT /record/:table/:sys_id` - Update records  
- `DELETE /record/:table/:sys_id` - Delete records
- `POST /batch` - Execute multiple operations
- `POST /attachment/:table/:sys_id` - Upload attachments
- `GET /attachment/:attachment_id` - Download attachments

## Eden Client Integration
The project supports type-safe API consumption using Eden:
- Export Elysia app type: `export type App = typeof app`
- Use Treaty client: `treaty<App>('http://localhost:3000')`
- Automatic type inference for all API endpoints

## Development Guidelines

### When working on bunsnc:
- Follow the Controller → Service → ServiceNow API pattern
- Add schemas to `schemaRegistry.ts` for new ServiceNow tables
- Ensure both CLI and HTTP API expose the same functionality
- Use Elysia's type system (`t.Object()`, `t.String()`, etc.) for validation
- Maintain service/controller separation for reusability

### Migration Reference:
Check `PLANO_REFATORACAO_BUNSNC.md` for the complete feature mapping between Python and TypeScript implementations.