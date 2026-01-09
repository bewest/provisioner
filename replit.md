# Nightscout Provisioner

## Overview
The Nightscout Provisioner is a Node.js REST API service designed to manage MongoDB databases and user credentials for multitenant Nightscout deployments. It acts as the "storage" component, working in conjunction with `node-multienv` (the "compute" component) to host Nightscout tenants. The system supports a unified mesh of multiple MongoDB clusters, with the Provisioner tracking tenant-to-cluster assignments. Its primary purpose is to automate the provisioning and management of resources for individual Nightscout instances, ensuring data isolation and efficient resource allocation in a multitenant environment.

## User Preferences
The user prefers clear and concise information. They want to be informed about the high-level architecture and key functionalities without getting bogged down in excessive implementation details or historical logs. When developing, the user prefers that the agent focuses on completing the task and provides updates on progress and any significant design decisions.

## System Architecture
The Nightscout Provisioner is a Node.js REST API service built with `restify` for API handling, `mongoose` for MongoDB ORM, and `bunyan` for logging. It operates on port 5000 by default.

The system is logically divided into two main components:
1.  **Provisioner Server (`server.js`)**: Manages core account, user, and site provisioning, including database and credential management.
2.  **Mesh Router (`mesh-router.js`)**: Handles multi-cluster mesh routing, assigning tenants to specific backend provisioners/MongoDB clusters, and managing route assignments.

**Core Functionality and Design Decisions:**

*   **Multitenancy and Isolation**: Each Nightscout "site" (tenant) is provisioned with unique collection names using a `{COLLECTION_PREFIX}{internal_name}.i.{collection_name}` pattern within shared MongoDB databases, ensuring complete data isolation.
*   **Compute Integration**: The `/sites` endpoints integrate directly with `node-multienv` (the "compute" component). When a site is created, the Provisioner forwards a detailed configuration object to `node-multienv` to deploy a Nightscout application instance. Site queries also fetch live process status from `node-multienv`.
*   **API Structure**: The API provides distinct endpoints for account management, user management, site (tenant) creation and management, and mesh routing operations.
*   **Credential Management**: User credentials for MongoDB access are generated, stored encrypted, and managed by the Provisioner.
*   **Dynamic Configuration**: The system uses environment variables for flexible configuration, including MongoDB connection strings, API URLs for `node-multienv`, and naming prefixes for hosted databases and credentials.

## External Dependencies
*   **MongoDB**: Used as the primary data store for both provisioner metadata and tenant data.
*   **node-multienv**: An external API service that acts as the "compute" component, responsible for deploying and managing Nightscout application instances based on configurations provided by the Provisioner.
*   **restify**: Node.js framework for building REST APIs.
*   **mongoose**: MongoDB object modeling tool for Node.js.
*   **bunyan**: A simple and fast JSON logging library.
*   **mongodb-memory-server**: (For development/testing only) Provides an in-memory MongoDB instance.
*   **nock**: (For testing only) HTTP mocking library for `node-multienv` API calls.

## Testing

### Test Suite Structure

```
test/
├── README.md           # Setup instructions and implementation notes
├── helper.js           # Shared utilities (MongoDB setup, mocks, server bootstrap)
├── accounts.test.js    # Account and User API tests (IMPLEMENTED - 16 tests)
├── sites.test.js       # Site creation with compute forwarding tests (IMPLEMENTED - 18 tests)
└── mesh-router.test.js # Mesh routing and load balancing tests (IMPLEMENTED - 26 tests)
```

### Running Tests

```bash
npm test                # Run all tests (60 tests)
npm run test:accounts   # Account/User tests only (16 tests)
npm run test:sites      # Sites tests only (18 tests)
npm run test:mesh       # Mesh router tests only (26 tests)
```

### Test Helper Utilities

The `test/helper.js` module provides:
- `startTestMongo()` / `stopTestMongo()` - In-memory MongoDB via mongodb-memory-server
- `createTestServer(mongoUri)` / `closeTestServer()` - Server bootstrap for provisioner tests
- `createMeshServer(mongoUri)` / `closeMeshServer(ctx)` - Server bootstrap for mesh router tests
- `cleanupMeshData(ctx)` - Cleans MeshedRoute collection between tests
- `mockComputeAPI(baseUrl)` - Nock-based mocking for MULTI_ENV_API
- `createTestAccount(request, server)` - Helper to create test accounts
- `cleanupTestData(ctx)` - Cleans collections between tests

### Test Implementation Status

| File | Status | Coverage |
|------|--------|----------|
| accounts.test.js | **Implemented** | Account CRUD, User CRUD, Stats API (16 tests) |
| sites.test.js | **Implemented** | Site CRUD, compute forwarding, configuration (18 tests) |
| mesh-router.test.js | **Implemented** | Routes CRUD, search/pagination, storage assignment, conductor API, backend selection (26 tests) |

### Known API Quirks

1. **Single user per account limitation**: The API uses a fixed "salter" value when creating users, causing subsequent user creations to replace the previous user. This is documented in the test suite.
2. **Compute API Mocking**: Sites endpoints call `MULTI_ENV_API` - use `nock` to mock
3. **Separate Servers**: `server.js` and `mesh-router.js` need separate test setups

## Recent Changes
- 2026-01-09: Mesh router test suite implemented (26 tests)
  - Fully implemented test/mesh-router.test.js with comprehensive endpoint coverage
  - Tests cover Routes API (CRUD, search, pagination, reassignment)
  - Tests cover Storage Assignment API (status, least-loaded backend selection)
  - Tests cover Conductor API (routing, DELETE via x-request-method header)
  - Tests verify URI template expansion for backend routing
  - Fixed application bug in conductor DELETE: Mongoose double-execution error
  - Added mesh router helpers to test/helper.js
  - Added module.exports to mesh-router.js for testability
- 2026-01-09: Sites test suite implemented (18 tests)
  - Fully implemented test/sites.test.js with compute API mocking via nock
  - Tests cover site creation, GET with compute status, DELETE with cleanup
  - Tests verify compute forwarding configuration
  - Fixed application bug in remove_by_site
- 2026-01-09: Test suite implemented for Account and User APIs (16 tests)
  - Fully implemented test/accounts.test.js
  - Implemented test/helper.js with working utilities
  - Installed test dependencies: mocha, chai, supertest, nock
- 2026-01-09: Initialized for Replit environment
  - Updated default port from 6060/4343 to 5000
  - Upgraded restify to v11 for Node.js 20 compatibility
  - Added dev-server.js with mongodb-memory-server for local testing
