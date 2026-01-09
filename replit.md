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
- `POST /accounts/:account/sites/:name` - Create site for account

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

## Running the Server

### Provisioner Server
```bash
node server.js
```

### Mesh Router
```bash
node mesh-router.js
```

## Recent Changes
- 2026-01-09: Initialized for Replit environment
  - Updated default port from 6060/4343 to 5000
  - Upgraded restify to v11 for Node.js 20 compatibility
  - Created .gitignore for Node.js
