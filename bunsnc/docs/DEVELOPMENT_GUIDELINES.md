# Development Guidelines
**Author: Juliano Stefano <jsdealencar@ayesa.com> [2025]**

## Core Principles

These guidelines establish professional development standards for the BunSNC project, ensuring maintainable, scalable, and production-ready code.

## Modular Architecture (MVC Pattern)

### Directory Structure
```
src/
├── controllers/     # Business logic, request validation
├── services/       # External integrations, ServiceNow API
├── models/         # TypeScript interfaces, data types
├── routes/         # HTTP endpoint definitions
├── views/          # HTMX templates, UI components
└── utils/          # Helper functions, utilities
```

### Separation of Concerns
- **Controllers**: Handle HTTP requests, validate input, coordinate services
- **Services**: Implement business logic, external API calls
- **Models**: Define data structures, TypeScript interfaces
- **Views**: Generate HTML templates, UI components
- **Routes**: Define endpoint mappings, middleware

## Code Standards

### File Size Limits
- **Maximum 300-500 lines per file**
- Break large files into smaller, focused modules
- Use composition over large monolithic files

### TypeScript Requirements
- All functions must have explicit return types
- Use interfaces for all data structures
- Avoid `any` type - use proper typing
- Export types for reusability

### Template Handling
- Keep Elysia templates simple and small
- Avoid complex template literals in endpoints
- Extract HTML generation to separate functions
- Use proper content-type headers

### Error Handling
```typescript
// Required pattern for all service methods
try {
  const result = await externalService.call();
  return result;
} catch (error) {
  console.error('Service call failed:', error);
  throw new ServiceError('Operation failed', error);
}
```

## Elysia Best Practices

### Simple Endpoint Pattern
```typescript
// CORRECT - Simple, maintainable
.get('/endpoint/:id', async ({ params, set }) => {
  try {
    const data = await service.getData(params.id);
    set.headers['content-type'] = 'text/html';
    return generateHTML(data);
  } catch (error) {
    return handleError(error, set);
  }
})

// AVOID - Complex template literals
.get('/complex', ({ set }) => {
  return `<!-- Large HTML template inline -->`;
})
```

### Template Extraction
```typescript
// Extract templates to separate functions
function generateTicketModal(ticket: TicketData): string {
  return `
    <div class="modal">
      <h2>${ticket.number}</h2>
      <p>${ticket.description}</p>
    </div>
  `;
}
```

## Performance Guidelines

### API Optimization
- Implement proper rate limiting
- Use caching for frequently accessed data
- Batch API calls when possible
- Implement retry logic with exponential backoff

### Database Patterns
- Use proper indexing strategies
- Implement connection pooling
- Cache query results appropriately
- Use transactions for related operations

### Memory Management
- Stream large datasets instead of loading into memory
- Implement proper cleanup for resources
- Use WeakMap for caching when appropriate

## Testing Standards

### Required Test Coverage
- Unit tests for all service methods
- Integration tests for API endpoints
- Error handling test scenarios
- Performance benchmarks for critical paths

### CLI Testing Tools
- Use existing CLI tools for validation
- Create test scenarios for new features
- Document test procedures
- Implement automated testing where possible

## Documentation Requirements

### Code Documentation
- JSDoc comments for all public methods
- README files for each major component
- Architecture decision records (ADRs)
- API documentation with examples

### Comment Standards
```typescript
/**
 * Retrieves ServiceNow ticket data with SLA information
 * @param ticketId - ServiceNow ticket identifier
 * @param includeHistory - Whether to include change history
 * @returns Promise resolving to ticket with SLA data
 * @throws ServiceNowError when API call fails
 */
async getTicketWithSLA(ticketId: string, includeHistory: boolean = false): Promise<TicketWithSLA> {
  // Implementation
}
```

## Git and Version Control

### Commit Standards
- Use conventional commit format
- Include detailed descriptions of changes
- Reference issue numbers when applicable
- Follow established commit message templates

### Branch Strategy
- Feature branches for new development
- Main branch always deployable
- Code review required for all merges
- Automated testing on pull requests

## Security Guidelines

### Data Handling
- Never log sensitive information
- Use environment variables for configuration
- Implement proper input validation
- Follow principle of least privilege

### API Security
- Validate all input parameters
- Implement proper authentication
- Use HTTPS for all communications
- Rate limit to prevent abuse

## Monitoring and Logging

### Logging Standards
```typescript
// Structured logging pattern
console.log(`Operation completed: ${operationName}`, {
  duration: Date.now() - startTime,
  recordCount: results.length,
  userId: context.userId
});
```

### Error Reporting
- Log errors with context information
- Include stack traces for debugging
- Implement error aggregation
- Set up alerts for critical errors

## Development Workflow

### Code Review Checklist
- [ ] File size under 500 lines?
- [ ] MVC separation maintained?
- [ ] TypeScript interfaces defined?
- [ ] Error handling implemented?
- [ ] Tests included?
- [ ] Documentation updated?
- [ ] Performance considerations addressed?

### Quality Gates
- Code must pass linting
- All tests must pass
- Type checking must succeed
- No security vulnerabilities
- Performance benchmarks met

## Deployment Standards

### Environment Configuration
- Use environment-specific configs
- Never commit secrets or credentials
- Implement proper health checks
- Set up monitoring and alerting

### Release Process
- Version tagging with semantic versioning
- Change log maintenance
- Database migration procedures
- Rollback strategies

## Legacy Code Migration

### Refactoring Approach
- Maintain backward compatibility during migration
- Update documentation as code changes
- Implement tests before refactoring
- Use feature flags for gradual rollout

### Python to TypeScript Migration
- Follow established patterns from Python reference
- Maintain data structure compatibility
- Preserve business logic accuracy
- Document migration decisions

## Continuous Improvement

### Regular Reviews
- Quarterly architecture reviews
- Performance monitoring and optimization
- Security audit procedures
- Documentation updates

### Knowledge Sharing
- Code review discussions
- Architecture decision documentation
- Best practice sharing sessions
- Mentoring for new team members

## Tools and Libraries

### Approved Technology Stack
- **Runtime**: Bun (primary), Node.js (compatibility)
- **Framework**: Elysia for HTTP APIs
- **Database**: MongoDB with proper indexing
- **Caching**: Redis for session and data caching
- **Frontend**: HTMX with Tailwind CSS
- **Testing**: Bun test runner with custom CLI tools

### Library Standards
- Evaluate all new dependencies carefully
- Prefer lightweight, well-maintained libraries
- Document architectural decisions for library choices
- Regular dependency updates and security reviews

## Progress Tracking

### Implementation Status
This document establishes the framework for professional development practices in the BunSNC project. All future development must adhere to these guidelines.

### Compliance Monitoring
- Regular code audits against these standards
- Automated tooling for guideline enforcement
- Team training on established practices
- Continuous refinement of guidelines based on experience

---

These guidelines ensure consistent, maintainable, and professional code development across the BunSNC project. All team members must follow these standards for optimal project success.

*Last Updated: January 2025*