/**
 * Test Helper - Setup utilities for testing the Nightscout Provisioner
 * 
 * This module provides:
 * - In-memory MongoDB setup using mongodb-memory-server
 * - Mock HTTP server for MULTI_ENV_API (compute component)
 * - Server bootstrap utilities
 */

const { MongoMemoryServer } = require('mongodb-memory-server');
const nock = require('nock');

let mongoServer = null;
let serverInstance = null;
let meshServerInstance = null;

/**
 * Start in-memory MongoDB for testing
 * @returns {Promise<string>} MongoDB connection URI
 */
async function startTestMongo() {
  mongoServer = await MongoMemoryServer.create({
    instance: {
      dbName: 'test-provisioner'
    }
  });
  return mongoServer.getUri();
}

/**
 * Stop in-memory MongoDB
 */
async function stopTestMongo() {
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

/**
 * Create a test server instance with mocked dependencies
 * 
 * @param {string} mongoUri - MongoDB connection URI
 * @returns {Promise<{server: Object, ctx: Object}>}
 */
function createTestServer(mongoUri) {
  return new Promise((resolve, reject) => {
    process.env.MONGO_ADMIN_URI = mongoUri;
    process.env.KEY_PREFIX_0 = 'test-encryption-key-32-chars!!!';
    process.env.MULTI_ENV_API = 'http://multienv-mock.local';
    process.env.HOSTED_MONGO_ADDR = 'localhost:27017';
    
    // Clear require cache for fresh env
    delete require.cache[require.resolve('../env')];
    delete require.cache[require.resolve('../lib/bootevent')];
    delete require.cache[require.resolve('../server')];
    
    const env = require('../env');
    const bootevent = require('../lib/bootevent');
    const createServer = require('../server');
    
    bootevent(env).boot(function(ctx) {
      try {
        const server = createServer(ctx);
        serverInstance = server;
        resolve({ server, ctx });
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Close the test server
 */
async function closeTestServer() {
  if (serverInstance) {
    await new Promise((resolve) => {
      serverInstance.close(resolve);
    });
    serverInstance = null;
  }
}

/**
 * Create a mesh router test server instance
 * 
 * @param {string} mongoUri - MongoDB connection URI
 * @param {Object} config - Configuration overrides
 * @returns {Promise<{server: Object, ctx: Object}>}
 */
function createMeshServer(mongoUri, config = {}) {
  return new Promise((resolve, reject) => {
    const meshConfig = {
      mongo_url: mongoUri,
      meshable_spec: config.meshable_spec || 'provisioner-a,provisioner-b',
      uri_template: config.uri_template || 'http://{origin}.internal:5000',
      replace_keyword: config.replace_keyword || '{origin}'
    };
    
    const boot = require('bootevent')();
    const meshable = require('../lib/meshable');
    const createMeshRouter = require('../mesh-router');
    
    const proc = boot.acquire(function(ctx, next) {
      ctx.env = meshConfig;
      next();
    });
    
    meshable(proc).acquire(function(ctx, next) {
      try {
        const server = createMeshRouter(meshConfig, ctx);
        meshServerInstance = server;
        ctx.server = server;
        next();
      } catch (err) {
        reject(err);
      }
    }).boot(function(ctx) {
      resolve({ server: ctx.server, ctx });
    });
  });
}

/**
 * Close the mesh router test server
 */
async function closeMeshServer(ctx) {
  if (meshServerInstance) {
    await new Promise((resolve) => {
      meshServerInstance.close(resolve);
    });
    meshServerInstance = null;
  }
  if (ctx && ctx.db) {
    await ctx.db.close();
  }
}

/**
 * Clean up mesh route data between tests
 * 
 * @param {Object} ctx - server context with db.models
 */
async function cleanupMeshData(ctx) {
  if (ctx && ctx.db && ctx.db.models && ctx.db.models.MeshedRoute) {
    await ctx.db.models.MeshedRoute.deleteMany({});
  }
}

/**
 * Setup compute API mocks using nock
 * 
 * Required mocks for /sites endpoint testing:
 * - POST /environs/:sitename - Returns created environ config
 * - GET /environs/:sitename - Returns environ status
 * - DELETE /environs/:sitename - Returns success
 * 
 * @param {string} baseUrl - The MULTI_ENV_API base URL to mock
 * @returns {Object} nock scope
 */
function mockComputeAPI(baseUrl) {
  return nock(baseUrl)
    .persist()
    .post(/\/environs\/.*/)
    .reply(200, { ok: 1, status: 'created' })
    .get(/\/environs\/.*/)
    .reply(200, { ok: 1, status: 'running' })
    .delete(/\/environs\/.*/)
    .reply(200, { ok: 1, status: 'deleted' });
}

/**
 * Clear all nock mocks and restore HTTP
 */
function clearMocks() {
  nock.cleanAll();
  nock.restore();
  nock.activate();
}

/**
 * Create a test account for use in tests
 * 
 * @param {Object} request - supertest request instance
 * @param {Object} server - server instance
 * @param {Object} accountData - account data to create
 * @returns {Promise<Object>} created account
 */
async function createTestAccount(request, server, accountData = {}) {
  const res = await request(server)
    .post('/accounts')
    .send(accountData)
    .expect(201);
  return res.body;
}

/**
 * Clean up test data between tests
 * 
 * @param {Object} ctx - server context with db.models
 */
async function cleanupTestData(ctx) {
  if (ctx && ctx.db && ctx.db.models) {
    await ctx.db.models.Account.deleteMany({});
    await ctx.db.models.User.deleteMany({});
  }
  nock.cleanAll();
  nock.restore();
  nock.activate();
}

module.exports = {
  startTestMongo,
  stopTestMongo,
  createTestServer,
  closeTestServer,
  createMeshServer,
  closeMeshServer,
  cleanupMeshData,
  mockComputeAPI,
  clearMocks,
  createTestAccount,
  cleanupTestData
};
