/**
 * Account and User API Endpoint Tests
 * 
 * Tests for:
 * - POST /accounts - Create account
 * - GET /accounts - List accounts
 * - GET /accounts/:account - Get account details
 * - DELETE /accounts/:account - Delete account
 * - GET /accounts/:account/users - List users for account
 * - POST /accounts/:account/users - Create user for account
 * - DELETE /accounts/:account/users/:user - Delete user
 */

const { expect } = require('chai');
const request = require('supertest');
const helper = require('./helper');

describe('Account API', function() {
  this.timeout(30000);
  
  let server, ctx;
  
  before(async function() {
    const mongoUri = await helper.startTestMongo();
    const result = await helper.createTestServer(mongoUri);
    server = result.server;
    ctx = result.ctx;
  });
  
  after(async function() {
    await helper.closeTestServer();
    await helper.stopTestMongo();
  });
  
  beforeEach(async function() {
    await helper.cleanupTestData(ctx);
  });

  describe('POST /accounts', function() {
    it('should create a new account with valid input', async function() {
      const res = await request(server)
        .post('/accounts')
        .send({ name: 'test-account-123' })
        .expect(200);
      
      expect(res.body).to.have.property('_id');
      expect(res.body).to.have.property('name', 'test-account-123');
      expect(res.body).to.have.property('db');
    });

    it('should auto-generate account name if not provided', async function() {
      const res = await request(server)
        .post('/accounts')
        .send({})
        .expect(200);
      
      expect(res.body).to.have.property('_id');
      expect(res.body).to.have.property('name');
      expect(res.body.name).to.be.a('string');
      expect(res.body.name.length).to.be.greaterThan(0);
    });

    it('should create account with specified name via URL param', async function() {
      const res = await request(server)
        .post('/accounts/my-custom-account')
        .send({})
        .expect(200);
      
      expect(res.body).to.have.property('name', 'my-custom-account');
    });
  });

  describe('GET /accounts', function() {
    it('should return list of all accounts', async function() {
      await request(server).post('/accounts').send({ name: 'account-1' });
      await request(server).post('/accounts').send({ name: 'account-2' });
      
      const res = await request(server)
        .get('/accounts')
        .expect(200);
      
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.equal(2);
    });

    it('should return empty array when no accounts exist', async function() {
      const res = await request(server)
        .get('/accounts')
        .expect(200);
      
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.equal(0);
    });
  });

  describe('GET /accounts/:account', function() {
    it('should return account details by ID', async function() {
      const createRes = await request(server)
        .post('/accounts')
        .send({ name: 'fetch-test-account' })
        .expect(200);
      
      const accountId = createRes.body._id;
      
      const res = await request(server)
        .get(`/accounts/${accountId}`)
        .expect(200);
      
      expect(res.body).to.have.property('_id', accountId);
      expect(res.body).to.have.property('name', 'fetch-test-account');
    });

    it('should return account details by name', async function() {
      await request(server)
        .post('/accounts')
        .send({ name: 'account-by-name' })
        .expect(200);
      
      const res = await request(server)
        .get('/accounts/account-by-name')
        .expect(200);
      
      expect(res.body).to.have.property('name', 'account-by-name');
    });
  });

  describe('DELETE /accounts/:account', function() {
    it('should delete account and return success', async function() {
      const createRes = await request(server)
        .post('/accounts')
        .send({ name: 'delete-test-account' })
        .expect(200);
      
      const accountId = createRes.body._id;
      
      await request(server)
        .delete(`/accounts/${accountId}`)
        .expect(204);
      
      const listRes = await request(server)
        .get('/accounts')
        .expect(200);
      
      expect(listRes.body).to.be.an('array');
      expect(listRes.body.length).to.equal(0);
    });
  });
});

describe('User API', function() {
  this.timeout(30000);
  
  let server, ctx, testAccount;
  
  before(async function() {
    const mongoUri = await helper.startTestMongo();
    const result = await helper.createTestServer(mongoUri);
    server = result.server;
    ctx = result.ctx;
  });
  
  after(async function() {
    await helper.closeTestServer();
    await helper.stopTestMongo();
  });
  
  beforeEach(async function() {
    await helper.cleanupTestData(ctx);
    const res = await request(server)
      .post('/accounts')
      .send({ name: 'user-test-account' });
    testAccount = res.body;
  });

  describe('POST /accounts/:account/users', function() {
    it('should create user with generated credentials', async function() {
      const res = await request(server)
        .post(`/accounts/${testAccount._id}/users`)
        .send({})
        .expect(200);
      
      expect(res.body).to.have.property('_id');
      expect(res.body).to.have.property('sitename');
      expect(res.body).to.have.property('account');
    });

    it('should associate user with correct account', async function() {
      const res = await request(server)
        .post(`/accounts/${testAccount._id}/users`)
        .send({})
        .expect(200);
      
      expect(res.body.account).to.have.property('id');
    });
  });

  describe('POST /accounts/:account/users/:name', function() {
    it('should create user with specified name', async function() {
      const res = await request(server)
        .post(`/accounts/${testAccount._id}/users/custom-site-name`)
        .send({})
        .expect(200);
      
      expect(res.body).to.have.property('sitename', 'custom-site-name');
    });
  });

  describe('GET /accounts/:account/users', function() {
    it('should list all users for account', async function() {
      await request(server)
        .post(`/accounts/${testAccount._id}/users/user1`)
        .send({});
      await request(server)
        .post(`/accounts/${testAccount._id}/users/user2`)
        .send({});
      
      const res = await request(server)
        .get(`/accounts/${testAccount._id}/users`)
        .expect(200);
      
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.equal(2);
    });

    it('should not include users from other accounts', async function() {
      const otherAccountRes = await request(server)
        .post('/accounts')
        .send({ name: 'other-account' });
      
      await request(server)
        .post(`/accounts/${testAccount._id}/users/user-in-main`)
        .send({});
      await request(server)
        .post(`/accounts/${otherAccountRes.body._id}/users/user-in-other`)
        .send({});
      
      const res = await request(server)
        .get(`/accounts/${testAccount._id}/users`)
        .expect(200);
      
      expect(res.body).to.be.an('array');
      expect(res.body.length).to.equal(1);
      expect(res.body[0].sitename).to.equal('user-in-main');
    });
  });

  describe('DELETE /accounts/:account/users/:user', function() {
    it('should delete user', async function() {
      const createRes = await request(server)
        .post(`/accounts/${testAccount._id}/users/delete-me`)
        .send({})
        .expect(200);
      
      const userId = createRes.body._id;
      
      await request(server)
        .delete(`/accounts/${testAccount._id}/users/${userId}`)
        .expect(204);
      
      const listRes = await request(server)
        .get(`/accounts/${testAccount._id}/users`)
        .expect(200);
      
      expect(listRes.body).to.be.an('array');
      expect(listRes.body.length).to.equal(0);
    });
  });
});

describe('Stats API', function() {
  this.timeout(30000);
  
  let server, ctx;
  
  before(async function() {
    const mongoUri = await helper.startTestMongo();
    const result = await helper.createTestServer(mongoUri);
    server = result.server;
    ctx = result.ctx;
  });
  
  after(async function() {
    await helper.closeTestServer();
    await helper.stopTestMongo();
  });
  
  beforeEach(async function() {
    await helper.cleanupTestData(ctx);
  });

  describe('GET /about/stats', function() {
    it('should return account and user counts', async function() {
      await request(server).post('/accounts').send({ name: 'stats-account-1' });
      const acctRes = await request(server).post('/accounts').send({ name: 'stats-account-2' });
      await request(server).post(`/accounts/${acctRes.body._id}/users/stats-user`).send({});
      
      const res = await request(server)
        .get('/about/stats')
        .expect(200);
      
      expect(res.body).to.have.property('account', 2);
      expect(res.body).to.have.property('user', 1);
    });

    it('should return zero counts when empty', async function() {
      const res = await request(server)
        .get('/about/stats')
        .expect(200);
      
      expect(res.body).to.have.property('account', 0);
      expect(res.body).to.have.property('user', 0);
    });
  });
});
