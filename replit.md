# Nightscout Provisioner

## Overview
The Nightscout Provisioner is a Node.js REST API service that manages MongoDB database and user credentials for multitenant Nightscout deployments. It works in conjunction with node-multienv to host Nightscout tenants in Kubernetes and other environments.

- **node-multienv**: The "compute" component (manages Nightscout application instances)
- **provisioner**: The "storage" component (manages MongoDB databases and credentials)

The recent architecture enables multiple clusters of MongoDB to act as a unified mesh, with this control plane tracking tenant-to-cluster assignments.

## Current State
- Server runs on port 5000
- Uses restify for REST API
- Uses mongoose for MongoDB connectivity
- Uses bunyan for logging

## Project Structure
```
├── server.js           # Main provisioner server (account/user management)
├── mesh-router.js      # Multi-cluster mesh routing server
├── env.js              # Environment configuration
├── lib/
│   ├── account/        # Account management endpoints
│   ├── admin/          # Admin endpoints
│   ├── sites/          # Site management endpoints
│   ├── user/           # User management endpoints
│   ├── bootevent.js    # Boot sequence
│   ├── meshable.js     # Mesh routing schema/models
│   └── storage.js      # Storage utilities
```

## Environment Variables

### Required for Provisioner Server (server.js)
- `MONGO_ADMIN_URI` - MongoDB connection string for the provisioner database
- `KEY_PREFIX_0` - Encryption key prefix for credentials

### Required for Mesh Router (mesh-router.js)
- `MONGODB_MESHDB` - MongoDB connection string for mesh routing database
- `MESHED_PROVISIONERS` - Comma-separated list of backend provisioner names (e.g., "provisioner-a,provisioner-b")
- `URI_TEMPLATE` - URI template for backend routing (e.g., "http://{origin}.internal:5000")
- `URI_REPLACE_KEYWORD` - Keyword to replace in URI template (default: "origin")

### Optional
- `PORT` - Server port (default: 5000)
- `MULTI_ENV_API` - URL to node-multienv API
- `HOSTED_NAME_PREFIX` - Prefix for hosted database names
- `HOSTED_CRED_PREFIX` - Prefix for credentials
- `HOSTED_MONGO_ADDR` - Address for tenant MongoDB connections
- `HOSTED_MONGO_URI_ARGS` - Additional MongoDB URI arguments

## API Endpoints

### Provisioner Server (server.js)
- `GET /dbs` - List all databases
- `GET /db/:db` - Get database details
- `GET /about/stats` - Get statistics
- `GET /about/search` - Search users
- `POST /accounts` - Create account
- `GET /accounts` - List accounts
- `GET /accounts/:account` - Get account details
- `DELETE /accounts/:account` - Delete account
- `GET /accounts/:account/users` - List users for account
- `POST /accounts/:account/users` - Create user for account
- `POST /accounts/:account/sites` - Create site for account (auto-generates sitename)
- `POST /accounts/:account/sites/:name` - Create site with specific name
- `GET /accounts/:account/sites/:site` - Get site details with compute status
- `DELETE /accounts/:account/sites/:site` - Delete site and compute resources

### Mesh Router (mesh-router.js)
- `GET /routes` - Get route statistics by backend
- `GET /routes/search` - Search routes with pagination
- `POST /routes/mesh` - Create new route assignment
- `GET /routes/mesh/:account` - Get route for account
- `POST /routes/mesh/:account` - Update route
- `POST /routes/mesh/:account/reassign/:backend` - Reassign account to different backend
- `DELETE /routes/mesh/:account` - Delete route
- `GET /storage/assignment/status` - Get mesh assignment status
- `POST /storage/assignment/creation` - Create new storage assignment
- `POST /storage/conductor` - Conductor endpoint for load balancer integration
- `GET /storage/conductor/:account` - Get conductor info for account

## /sites Compute Forwarding

The `/sites` endpoints implement a key integration between the provisioner (storage) and node-multienv (compute) components. When a site is created, the provisioner doesn't just store credentials—it also forwards configuration to the compute component to deploy a Nightscout application instance.

### Site Creation Flow

The actual middleware chain for `POST /accounts/:account/sites/:name`:

```
POST /accounts/:account/sites/:name
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. account.by_account                                               │
│    └── Validate account exists, attach to req.account              │
├─────────────────────────────────────────────────────────────────────┤
│ 2. user.suggest                                                     │
│    └── Generate username/password for MongoDB access               │
├─────────────────────────────────────────────────────────────────────┤
│ 3. user.lookup_prexists                                             │
│    └── Check if user already exists with this sitename             │
├─────────────────────────────────────────────────────────────────────┤
│ 4. admin.adminUser                                                  │
│    └── Attach admin context for credential operations              │
├─────────────────────────────────────────────────────────────────────┤
│ 5. user.remove_by_user                                              │
│    └── If pre-existing user found, remove old record               │
├─────────────────────────────────────────────────────────────────────┤
│ 6. user.create                                                      │
│    └── Create MongoDB user in admin DB, store encrypted creds      │
├─────────────────────────────────────────────────────────────────────┤
│ 7. sites.suggest                                                    │
│    └── Build configuration object (see below)                      │
├─────────────────────────────────────────────────────────────────────┤
│ 8. sites.create                                                     │
│    └── POST to {MULTI_ENV_API}/environs/{sitename}                 │
│        with req.suggested configuration                             │
├─────────────────────────────────────────────────────────────────────┤
│ 9. sites.format                                                     │
│    └── Return user record + proc (compute response)                │
└─────────────────────────────────────────────────────────────────────┘
```

### Configuration Object (req.suggested)

The `sites.suggest` middleware builds this configuration that gets forwarded to the compute component:

```javascript
{
  mongo: "mongodb://user:pass@host/dbname?authSource=admin&args",
  internal_name: "abc123",
  MONGO_COLLECTION: "prefix.abc123.i.entries",
  MONGO_SETTINGS_COLLECTION: "prefix.abc123.i.settings",
  MONGO_TREATMENTS_COLLECTION: "prefix.abc123.i.treatments",
  MONGO_PROFILE_COLLECTION: "prefix.abc123.i.profile",
  MONGO_DEVICESTATUS_COLLECTION: "prefix.abc123.i.devicestatus",
  MQTT_MONITOR: "tcp://uploader:secret@mqtt.domain",
  API_SECRET: "user-provided-secret",
  INSECURE_USE_HTTP: "true",
  DBSIZE_MAX: "1984",
  ADMIN_NOTIFIES_ENABLED: "false"
}
```

### Tenant Isolation via Collection Prefixes

Each site gets unique collection names using the pattern:
```
{COLLECTION_PREFIX}{internal_name}.i.{collection_name}
```

This ensures complete data isolation between tenants sharing the same MongoDB database.

### Site Query with Compute Status

When querying a site via `GET /accounts/:account/sites/:site`, the provisioner:
1. Looks up the User record by sitename
2. Calls `GET {MULTI_ENV_API}/environs/{sitename}` to get live process status
3. Returns both records merged with the compute status in the `proc` field

### Site Deletion

When deleting via `DELETE /accounts/:account/sites/:site`:
1. Calls `DELETE {MULTI_ENV_API}/environs/{sitename}` to stop the compute instance
2. Removes the User record from the provisioner database

Note: The MongoDB credentials created in the admin database are handled via the `removeUser` callback but may require separate administrative cleanup in some configurations.

## Running the Server

### Development Mode (with In-Memory MongoDB)
For local testing without an external MongoDB:
```bash
npm run dev
```
This uses `mongodb-memory-server` to spin up an in-memory MongoDB instance. Data is not persisted between restarts.

### Production Mode (with External MongoDB)
Set the `MONGO_ADMIN_URI` environment variable and run:
```bash
npm start
```

### Mesh Router
```bash
node mesh-router.js
```

## Testing

### Test Suite Structure

```
test/
├── README.md           # Setup instructions and implementation notes
├── helper.js           # Shared utilities (MongoDB setup, mocks, server bootstrap)
├── accounts.test.js    # Account and User API tests (IMPLEMENTED - 16 tests)
├── sites.test.js       # Site creation with compute forwarding tests (IMPLEMENTED - 17 tests)
└── mesh-router.test.js # Mesh routing and load balancing tests (skeleton)
```

### Running Tests

```bash
npm test                # Run all tests
npm run test:accounts   # Account/User tests only (16 passing tests)
npm run test:sites      # Sites tests only (17 passing tests)
npm run test:mesh       # Mesh router tests only
```

### Test Helper Utilities

The `test/helper.js` module provides:
- `startTestMongo()` / `stopTestMongo()` - In-memory MongoDB via mongodb-memory-server
- `createTestServer(mongoUri)` / `closeTestServer()` - Server bootstrap for tests
- `mockComputeAPI(baseUrl)` - Nock-based mocking for MULTI_ENV_API
- `createTestAccount(request, server)` - Helper to create test accounts
- `cleanupTestData(ctx)` - Cleans collections between tests

### Test Implementation Status

| File | Status | Coverage |
|------|--------|----------|
| accounts.test.js | **Implemented** | Account CRUD, User CRUD, Stats API (16 tests) |
| sites.test.js | **Implemented** | Site CRUD, compute forwarding, configuration (17 tests) |
| mesh-router.test.js | Skeleton | Needs separate server setup |

### Known API Quirks

1. **Single user per account limitation**: The API uses a fixed "salter" value when creating users, causing subsequent user creations to replace the previous user. This is documented in the test suite.
2. **Compute API Mocking**: Sites endpoints call `MULTI_ENV_API` - use `nock` to mock
3. **Separate Servers**: `server.js` and `mesh-router.js` need separate test setups

## Recent Changes
- 2026-01-09: Sites test suite implemented (17 tests)
  - Fully implemented test/sites.test.js with compute API mocking via nock
  - Tests cover site creation, GET with compute status, DELETE with cleanup
  - Tests verify compute forwarding configuration (MongoDB connection string, collection prefixes, Nightscout defaults)
  - Fixed application bug in remove_by_site: used req.site instead of req.user for removeUser callback
  - Sitename behavior documented: uses internal_name if provided, otherwise URL param
- 2026-01-09: Test suite implemented for Account and User APIs
  - Fully implemented test/accounts.test.js with 16 passing tests
  - Implemented test/helper.js with working utilities (MongoDB, server bootstrap, mocks)
  - Installed test dependencies: mocha, chai, supertest, nock
  - Documented API quirk: single user per account due to fixed salter value
- 2026-01-09: Test suite skeleton added
  - Created test/ directory with skeleton test files for accounts, sites, and mesh-router
  - Added test helper with setup utilities and implementation guidance
  - Added npm test scripts (test, test:accounts, test:sites, test:mesh)
  - Documented testing approach and known challenges in test/README.md
- 2026-01-09: Documentation improvements
  - Expanded README.md with architecture diagrams and tenant isolation model
  - Updated openapi.yaml /sites endpoints with detailed compute forwarding descriptions
  - Added SiteWithProc schema to openapi.yaml for GET /sites/:site responses
  - Added /sites compute forwarding section to replit.md with middleware chain flow diagrams
- 2026-01-09: Initialized for Replit environment
  - Updated default port from 6060/4343 to 5000
  - Upgraded restify to v11 for Node.js 20 compatibility
  - Created .gitignore for Node.js
  - Added dev-server.js with mongodb-memory-server for local testing
  - Added `npm run dev` script for development mode
