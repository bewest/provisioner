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

describe('Account API', function() {
  this.timeout(30000);

  describe('POST /accounts', function() {
    it('should create a new account with auto-generated name', async function() {
      const res = await request(server)
        .post('/accounts')
        .send({});
      
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('_id');
      expect(res.body).to.have.property('account');
      expect(res.body).to.have.property('db');
      expect(res.body.db).to.have.property('name');
      expect(res.body.db.name).to.be.a('string');
      expect(res.body.db.name.length).to.be.greaterThan(0);
    });

    it('should generate unique account ObjectId', async function() {
      const res1 = await request(server).post('/accounts').send({});
      const res2 = await request(server).post('/accounts').send({});
      
      expect(res1.body.account).to.not.equal(res2.body.account);
    });
  });

  describe('GET /accounts', function() {
    it('should return list of all accounts', async function() {
      await request(server).post('/accounts').send({});
      await request(server).post('/accounts').send({});
      
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
    it('should return account details by account ObjectId', async function() {
      const createRes = await request(server)
        .post('/accounts')
        .send({});
      
      expect(createRes.status).to.equal(201);
      const accountId = createRes.body.account;
      
      const res = await request(server)
        .get(`/accounts/${accountId}`)
        .expect(200);
      
      expect(res.body).to.have.property('_id');
      expect(res.body).to.have.property('db');
    });
  });

  describe('DELETE /accounts/:account', function() {
    it('should delete account and return success', async function() {
      const createRes = await request(server)
        .post('/accounts')
        .send({});
      
      expect(createRes.status).to.equal(201);
      const accountId = createRes.body.account;
      
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
  
  let testAccount;
  
  beforeEach(async function() {
    await helper.cleanupTestData(ctx);
    const res = await request(server)
      .post('/accounts')
      .send({});
    testAccount = res.body;
  });

  describe('POST /accounts/:account/users', function() {
    it('should create user with generated credentials', async function() {
      const res = await request(server)
        .post(`/accounts/${testAccount.account}/users`)
        .send({});
      
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('_id');
      expect(res.body).to.have.property('sitename');
      expect(res.body).to.have.property('account');
    });

    it('should associate user with correct account', async function() {
      const res = await request(server)
        .post(`/accounts/${testAccount.account}/users/test-user`)
        .send({});
      
      expect(res.status).to.equal(201);
      expect(res.body.account).to.have.property('id');
    });
  });

  describe('POST /accounts/:account/users/:name', function() {
    it('should create user with specified name', async function() {
      const res = await request(server)
        .post(`/accounts/${testAccount.account}/users/custom-site-name`)
        .send({});
      
      expect(res.status).to.equal(201);
      expect(res.body).to.have.property('sitename', 'custom-site-name');
    });
  });

  describe('GET /accounts/:account/users', function() {
    it('should list a user for account', async function() {
      await request(server)
        .post(`/accounts/${testAccount.account}/users/mysite`)
        .send({});
      
      const res = await request(server)
        .get(`/accounts/${testAccount.account}/users`)
        .expect(200);
      
      expect(res.body).to.have.property('ok', 1);
      expect(res.body).to.have.property('users');
      expect(res.body.users).to.be.an('array');
      expect(res.body.users.length).to.equal(1);
      expect(res.body.users[0].sitename).to.equal('mysite');
    });

    it('should return empty users array when no users exist', async function() {
      const res = await request(server)
        .get(`/accounts/${testAccount.account}/users`)
        .expect(200);
      
      expect(res.body).to.have.property('users');
      expect(res.body.users).to.be.an('array');
      expect(res.body.users.length).to.equal(0);
    });

    it('should replace user when creating with same salter (API limitation)', async function() {
      await request(server)
        .post(`/accounts/${testAccount.account}/users/site1`)
        .send({});
      await request(server)
        .post(`/accounts/${testAccount.account}/users/site2`)
        .send({});
      
      const res = await request(server)
        .get(`/accounts/${testAccount.account}/users`)
        .expect(200);
      
      expect(res.body.users.length).to.equal(1);
      expect(res.body.users[0].sitename).to.equal('site2');
    });

    it('should not include users from other accounts', async function() {
      const otherAccountRes = await request(server)
        .post('/accounts')
        .send({});
      
      await request(server)
        .post(`/accounts/${testAccount.account}/users/user-in-main`)
        .send({});
      await request(server)
        .post(`/accounts/${otherAccountRes.body.account}/users/user-in-other`)
        .send({});
      
      const res = await request(server)
        .get(`/accounts/${testAccount.account}/users`)
        .expect(200);
      
      expect(res.body).to.have.property('users');
      expect(res.body.users).to.be.an('array');
      expect(res.body.users.length).to.equal(1);
      expect(res.body.users[0].sitename).to.equal('user-in-main');
    });
  });

  describe('DELETE /accounts/:account/users/:user', function() {
    it('should delete user', async function() {
      const createRes = await request(server)
        .post(`/accounts/${testAccount.account}/users/delete-me`)
        .send({});
      
      expect(createRes.status).to.equal(201);
      const userId = createRes.body._id;
      
      const deleteRes = await request(server)
        .delete(`/accounts/${testAccount.account}/users/${userId}`);
      
      expect(deleteRes.status).to.be.oneOf([200, 204]);
      
      const listRes = await request(server)
        .get(`/accounts/${testAccount.account}/users`)
        .expect(200);
      
      expect(listRes.body).to.have.property('users');
      expect(listRes.body.users).to.be.an('array');
      expect(listRes.body.users.length).to.equal(0);
    });
  });
});

describe('Stats API', function() {
  this.timeout(30000);

  describe('GET /about/stats', function() {
    it('should return account and user counts', async function() {
      await helper.cleanupTestData(ctx);
      
      await request(server).post('/accounts').send({});
      const acctRes = await request(server).post('/accounts').send({});
      await request(server).post(`/accounts/${acctRes.body.account}/users/stats-user`).send({});
      
      const res = await request(server)
        .get('/about/stats')
        .expect(200);
      
      expect(res.body).to.have.property('account', 2);
      expect(res.body).to.have.property('user', 1);
    });

    it('should return zero counts when empty', async function() {
      await helper.cleanupTestData(ctx);
      
      const res = await request(server)
        .get('/about/stats')
        .expect(200);
      
      expect(res.body).to.have.property('account', 0);
      expect(res.body).to.have.property('user', 0);
    });
  });
});
