/**
 * Sites API Endpoint Tests
 * 
 * Tests for the /sites endpoints that handle compute forwarding:
 * - POST /accounts/:account/sites - Create site (auto-generate name)
 * - POST /accounts/:account/sites/:name - Create site with specific name
 * - GET /accounts/:account/sites/:site - Get site with compute status
 * - DELETE /accounts/:account/sites/:site - Delete site and compute resources
 */

const { expect } = require('chai');
const request = require('supertest');
const nock = require('nock');
const helper = require('./helper');

const MOCK_MULTI_ENV_API = 'http://multienv-mock.local';

let server, ctx;

before(async function() {
  this.timeout(60000);
  const mongoUri = await helper.startTestMongo();
  const result = await helper.createTestServer(mongoUri);
  server = result.server;
  ctx = result.ctx;
});

after(async function() {
  this.timeout(60000);
  await helper.closeTestServer();
  await helper.stopTestMongo();
});

beforeEach(async function() {
  await helper.cleanupTestData(ctx);
});

describe('Sites API', function() {
  this.timeout(30000);
  
  let testAccount;
  
  beforeEach(async function() {
    nock.cleanAll();
    
    const res = await request(server)
      .post('/accounts')
      .send({});
    testAccount = res.body;
  });

  describe('POST /accounts/:account/sites/:name', function() {
    it('should create site with MongoDB credentials', async function() {
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/)
        .reply(200, { ok: 1, status: 'created', pid: 12345 });

      const res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/mysite`)
        .send({ internal_name: 'mysite-int', api_secret: 'test-secret' });
      
      expect(res.status).to.be.oneOf([200, 201]);
      expect(res.body).to.have.property('sitename', 'mysite-int');
      expect(res.body).to.have.property('proc');
      expect(res.body.proc).to.have.property('ok', 1);
    });

    it('should forward configuration to compute component', async function() {
      let capturedBody = null;
      
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/, body => { 
          capturedBody = body; 
          return true; 
        })
        .reply(200, { ok: 1, status: 'created' });

      const res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/forwardtest`)
        .send({ internal_name: 'testint', api_secret: 'secret123' });
      
      expect(res.status).to.be.oneOf([200, 201]);
      expect(capturedBody).to.have.property('mongo');
      expect(capturedBody.mongo).to.include('authSource=admin');
      expect(capturedBody).to.have.property('internal_name', 'testint');
      expect(capturedBody).to.have.property('API_SECRET', 'secret123');
    });

    it('should generate unique collection prefixes', async function() {
      let capturedBody = null;
      
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/, body => { 
          capturedBody = body; 
          return true; 
        })
        .reply(200, { ok: 1 });

      const res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/prefixtest`)
        .send({ internal_name: 'uniqueint', api_secret: 'secret' });
      
      expect(res.status).to.be.oneOf([200, 201]);
      
      expect(capturedBody).to.have.property('MONGO_COLLECTION');
      expect(capturedBody).to.have.property('MONGO_SETTINGS_COLLECTION');
      expect(capturedBody).to.have.property('MONGO_TREATMENTS_COLLECTION');
      expect(capturedBody).to.have.property('MONGO_PROFILE_COLLECTION');
      expect(capturedBody).to.have.property('MONGO_DEVICESTATUS_COLLECTION');
      
      expect(capturedBody.MONGO_COLLECTION).to.include('uniqueint');
      expect(capturedBody.MONGO_COLLECTION).to.include('entries');
      expect(capturedBody.MONGO_SETTINGS_COLLECTION).to.include('settings');
      expect(capturedBody.MONGO_TREATMENTS_COLLECTION).to.include('treatments');
      expect(capturedBody.MONGO_PROFILE_COLLECTION).to.include('profile');
      expect(capturedBody.MONGO_DEVICESTATUS_COLLECTION).to.include('devicestatus');
    });

    it('should replace existing site with same salter (API limitation)', async function() {
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .persist()
        .post(/\/environs\/.*/)
        .reply(200, { ok: 1, status: 'created' });

      let res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/site1`)
        .send({ internal_name: 'first', api_secret: 'secret1' });
      expect(res.status).to.be.oneOf([200, 201]);
      expect(res.body).to.have.property('sitename', 'first');

      res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/site2`)
        .send({ internal_name: 'second', api_secret: 'secret2' });
      expect(res.status).to.be.oneOf([200, 201]);
      expect(res.body).to.have.property('sitename', 'second');

      const listRes = await request(server)
        .get(`/accounts/${testAccount.account}/users`)
        .expect(200);
      
      expect(listRes.body.users).to.be.an('array');
      expect(listRes.body.users.length).to.equal(1);
      expect(listRes.body.users[0].sitename).to.equal('second');
      
      nock.cleanAll();
    });

    it('should fail if internal_name is missing', async function() {
      const res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/mysite`)
        .send({ api_secret: 'secret' });
      
      expect(res.status).to.be.oneOf([400, 500]);
    });

    it('should fail if api_secret is missing', async function() {
      const res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/mysite`)
        .send({ internal_name: 'testint' });
      
      expect(res.status).to.be.oneOf([400, 500]);
    });

    it('should set Nightscout-specific defaults', async function() {
      let capturedBody = null;
      
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/, body => { 
          capturedBody = body; 
          return true; 
        })
        .reply(200, { ok: 1 });

      const res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/defaultstest`)
        .send({ internal_name: 'defaults', api_secret: 'secret' });
      
      expect(res.status).to.be.oneOf([200, 201]);
      
      expect(capturedBody).to.have.property('INSECURE_USE_HTTP', 'true');
      expect(capturedBody).to.have.property('DBSIZE_MAX', '1984');
      expect(capturedBody).to.have.property('ADMIN_NOTIFIES_ENABLED', 'false');
    });
  });

  describe('POST /accounts/:account/sites', function() {
    it('should auto-generate sitename when not in URL', async function() {
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/)
        .reply(200, { ok: 1, status: 'created' });

      const res = await request(server)
        .post(`/accounts/${testAccount.account}/sites`)
        .send({ internal_name: 'autogen', api_secret: 'secret' });
      
      expect(res.status).to.be.oneOf([200, 201]);
      expect(res.body).to.have.property('sitename', 'autogen');
    });
  });

  describe('GET /accounts/:account/sites/:site', function() {
    it('should return site with compute process status', async function() {
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/)
        .reply(200, { ok: 1, status: 'created' });

      const createRes = await request(server)
        .post(`/accounts/${testAccount.account}/sites/querysite`)
        .send({ internal_name: 'querysite', api_secret: 'secret' });
      expect(createRes.status).to.be.oneOf([200, 201]);

      nock(MOCK_MULTI_ENV_API)
        .get('/environs/querysite')
        .reply(200, { ok: 1, status: 'running', pid: 99999, uptime: 3600 });

      const res = await request(server)
        .get(`/accounts/${testAccount.account}/sites/querysite`)
        .expect(200);
      
      expect(res.body).to.have.property('sitename', 'querysite');
      expect(res.body).to.have.property('proc');
      expect(res.body.proc).to.have.property('status', 'running');
      expect(res.body.proc).to.have.property('uptime', 3600);
    });

    it('should query compute component for live status', async function() {
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/)
        .reply(200, { ok: 1, status: 'created' });

      const createRes = await request(server)
        .post(`/accounts/${testAccount.account}/sites/livesite`)
        .send({ internal_name: 'livesite', api_secret: 'secret' });
      expect(createRes.status).to.be.oneOf([200, 201]);

      const computeScope = nock(MOCK_MULTI_ENV_API)
        .get('/environs/livesite')
        .reply(200, { ok: 1, status: 'running' });

      await request(server)
        .get(`/accounts/${testAccount.account}/sites/livesite`)
        .expect(200);
      
      expect(computeScope.isDone()).to.be.true;
    });

    it('should handle compute component being unavailable', async function() {
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/)
        .reply(200, { ok: 1, status: 'created' });

      const createRes = await request(server)
        .post(`/accounts/${testAccount.account}/sites/unavailsite`)
        .send({ internal_name: 'unavailsite', api_secret: 'secret' });
      expect(createRes.status).to.be.oneOf([200, 201]);

      nock(MOCK_MULTI_ENV_API)
        .get('/environs/unavailsite')
        .replyWithError('Connection refused');

      const res = await request(server)
        .get(`/accounts/${testAccount.account}/sites/unavailsite`);
      
      expect(res.status).to.be.oneOf([500, 502, 503]);
    });

    it('should return error for non-existent site', async function() {
      const res = await request(server)
        .get(`/accounts/${testAccount.account}/sites/nonexistent`);
      
      expect(res.status).to.be.oneOf([404, 500]);
    });
  });

  describe('DELETE /accounts/:account/sites/:site', function() {
    it('should delete site from both provisioner and compute', async function() {
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/)
        .reply(200, { ok: 1, status: 'created' });

      const createRes = await request(server)
        .post(`/accounts/${testAccount.account}/sites/deletesite`)
        .send({ internal_name: 'deletesite', api_secret: 'secret' });
      expect(createRes.status).to.be.oneOf([200, 201]);

      nock(MOCK_MULTI_ENV_API)
        .get('/environs/deletesite')
        .reply(200, { ok: 1, status: 'running' });
      
      const beforeGet = await request(server)
        .get(`/accounts/${testAccount.account}/sites/deletesite`)
        .expect(200);
      expect(beforeGet.body).to.have.property('sitename', 'deletesite');

      nock(MOCK_MULTI_ENV_API)
        .delete('/environs/deletesite')
        .reply(200, { ok: 1, status: 'deleted' });

      await request(server)
        .delete(`/accounts/${testAccount.account}/sites/deletesite`)
        .expect(204);

      const listRes = await request(server)
        .get(`/accounts/${testAccount.account}/users`)
        .expect(200);
      
      expect(listRes.body.users).to.be.an('array');
      expect(listRes.body.users.length).to.equal(0);
    });

    it('should call compute DELETE endpoint', async function() {
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/)
        .reply(200, { ok: 1, status: 'created' });

      const createRes = await request(server)
        .post(`/accounts/${testAccount.account}/sites/delcall`)
        .send({ internal_name: 'delcall', api_secret: 'secret' });
      expect(createRes.status).to.be.oneOf([200, 201]);

      const computeScope = nock(MOCK_MULTI_ENV_API)
        .delete('/environs/delcall')
        .reply(200, { ok: 1, status: 'deleted' });

      await request(server)
        .delete(`/accounts/${testAccount.account}/sites/delcall`)
        .expect(204);
      
      expect(computeScope.isDone()).to.be.true;
    });

    it('should handle compute DELETE failure gracefully', async function() {
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/)
        .reply(200, { ok: 1, status: 'created' });

      const createRes = await request(server)
        .post(`/accounts/${testAccount.account}/sites/failsite`)
        .send({ internal_name: 'failsite', api_secret: 'secret' });
      expect(createRes.status).to.be.oneOf([200, 201]);

      nock(MOCK_MULTI_ENV_API)
        .delete('/environs/failsite')
        .replyWithError('Connection refused');

      const res = await request(server)
        .delete(`/accounts/${testAccount.account}/sites/failsite`);
      
      expect(res.status).to.be.oneOf([500, 502, 503]);
    });
  });
});

describe('Sites Configuration', function() {
  this.timeout(30000);
  
  let testAccount;
  
  before(async function() {
    this.timeout(60000);
  });

  beforeEach(async function() {
    await helper.cleanupTestData(ctx);
    nock.cleanAll();
    
    const res = await request(server)
      .post('/accounts')
      .send({});
    testAccount = res.body;
  });

  describe('sites.suggest middleware', function() {
    it('should build MongoDB connection string with credentials', async function() {
      let capturedBody = null;
      
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/, body => { 
          capturedBody = body; 
          return true; 
        })
        .reply(200, { ok: 1 });

      const res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/mongotest`)
        .send({ internal_name: 'mongotest', api_secret: 'secret' });
      expect(res.status).to.be.oneOf([200, 201]);
      
      expect(capturedBody).to.have.property('mongo');
      expect(capturedBody.mongo).to.match(/^mongodb:\/\/.+:.+@/);
      expect(capturedBody.mongo).to.include('authSource=admin');
      expect(capturedBody.mongo).to.include(testAccount.db.name);
    });

    it('should include internal_name in configuration', async function() {
      let capturedBody = null;
      
      nock.cleanAll();
      nock(MOCK_MULTI_ENV_API)
        .post(/\/environs\/.*/, body => { 
          capturedBody = body; 
          return true; 
        })
        .reply(200, { ok: 1 });

      const res = await request(server)
        .post(`/accounts/${testAccount.account}/sites/intnametest`)
        .send({ internal_name: 'my-internal-name', api_secret: 'secret' });
      expect(res.status).to.be.oneOf([200, 201]);
      
      expect(capturedBody).to.have.property('internal_name', 'my-internal-name');
    });
  });
});
