# Test Suite for Nightscout Provisioner

This directory contains skeleton test files with implementation guidance for testing the provisioner API.

## Status: SKELETON ONLY

These test files are **not yet implemented**. They contain:
- Test structure and organization
- Detailed TODO comments explaining what each test should verify
- Implementation hints and issues to resolve
- Code examples for reference

## Getting Started

### 1. Install Test Dependencies

```bash
npm install --save-dev mocha chai supertest nock
```

### 2. Uncomment Test Code

Each test file has commented-out code that needs to be uncommented and completed:
- Import statements at the top
- Setup/teardown hooks (before, after, beforeEach)
- Individual test implementations

### 3. Implement Helper Functions

Start with `test/helper.js` which provides shared utilities:
- `startTestMongo()` - Starts mongodb-memory-server
- `stopTestMongo()` - Cleanup
- `createTestServer()` - Boots provisioner with test config
- `mockComputeAPI()` - Sets up nock mocks for MULTI_ENV_API

### 4. Run Tests

```bash
npm test
```

## Test Files

| File | Description |
|------|-------------|
| `helper.js` | Shared test utilities and setup functions |
| `accounts.test.js` | Account and User CRUD API tests |
| `sites.test.js` | Site creation with compute forwarding tests |
| `mesh-router.test.js` | Mesh routing and load balancing tests |

## Key Testing Challenges

### 1. Compute Component Mocking

The `/sites` endpoints make HTTP calls to `MULTI_ENV_API` (node-multienv). You **must** mock these with `nock`:

```javascript
const nock = require('nock');

nock('http://multienv-mock.local')
  .post(/\/environs\/.*/)
  .reply(200, { ok: 1, status: 'created' });
```

### 2. Encryption Keys

User credentials are encrypted with `mongoose-encrypt`. Set `KEY_PREFIX_0` in your test environment:

```javascript
process.env.KEY_PREFIX_0 = 'test-encryption-key-32-chars!!!';
```

### 3. Admin Context

Many endpoints use `admin.adminUser` middleware which attaches `req.removeUser` callback. This callback is used for revoking MongoDB credentials. Tests may need to verify this callback is properly invoked.

### 4. Separate Servers

- `server.js` - Main provisioner (accounts, users, sites)
- `mesh-router.js` - Mesh routing (routes, conductor)

These are separate servers with separate databases. Test them independently.

## Environment Variables for Testing

```bash
# Required for provisioner tests
export MONGO_ADMIN_URI="mongodb://localhost:27017/test"  # Or use memory server
export KEY_PREFIX_0="test-encryption-key-32-chars!!!"
export MULTI_ENV_API="http://multienv-mock.local"
export HOSTED_MONGO_ADDR="localhost:27017"

# Required for mesh-router tests
export MONGODB_MESHDB="mongodb://localhost:27017/mesh-test"
export MESHED_PROVISIONERS="provisioner-a,provisioner-b"
export URI_TEMPLATE="http://{origin}.internal:5000"
```

## Reference Implementation

See `dev-server.js` for an example of:
- Starting mongodb-memory-server
- Bootstrapping the server with the bootevent pattern
- Setting up the environment for local development

## Known Issues to Address

1. **204-with-body quirk**: DELETE /sites sets status 204 but format middleware may send body
2. **MQTT dependency**: sites.suggest requires `ctx.env.MQTT.domain` - may error if not set
3. **Credential cleanup**: `req.removeUser` callback behavior needs verification
4. **Pagination consistency**: Verify pagination across different endpoints uses same format

## Contributing

When implementing tests:
1. Follow the existing test structure
2. Add descriptive test names that explain what's being verified
3. Document any new issues discovered
4. Keep mocks minimal - only mock what's necessary
