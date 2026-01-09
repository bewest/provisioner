/**
 * Mesh Router API Tests
 * 
 * Tests for mesh-router.js endpoints that manage multi-cluster routing:
 * - GET /routes - Route statistics by backend
 * - GET /routes/search - Search routes with pagination
 * - POST /routes/mesh - Create route assignment
 * - GET /routes/mesh/:account - Get route for account
 * - POST /routes/mesh/:account - Update route
 * - POST /routes/mesh/:account/reassign/:backend - Reassign to different backend
 * - DELETE /routes/mesh/:account - Delete route
 * - GET /storage/assignment/status - Mesh assignment status
 * - POST /storage/assignment/creation - Create storage assignment
 * - POST /storage/conductor - Load balancer conductor endpoint
 * - GET /storage/conductor/:account - Get conductor info
 */

const { expect } = require('chai');
const request = require('supertest');
const helper = require('./helper');

let server, ctx, mongoUri;

before(async function() {
  this.timeout(30000);
  mongoUri = await helper.startTestMongo();
  const result = await helper.createMeshServer(mongoUri);
  server = result.server;
  ctx = result.ctx;
});

after(async function() {
  this.timeout(30000);
  await helper.closeMeshServer(ctx);
  await helper.stopTestMongo();
});

beforeEach(async function() {
  await helper.cleanupMeshData(ctx);
});

describe('Mesh Router - Routes API', function() {
  this.timeout(30000);

  describe('GET /routes', function() {
    it('should return empty peers array when no routes exist', async function() {
      const res = await request(server)
        .get('/routes')
        .expect(200);
      
      expect(res.body).to.have.property('peers');
      expect(res.body.peers).to.be.an('array');
      expect(res.body.peers).to.have.length(0);
    });

    it('should return route statistics grouped by backend', async function() {
      await ctx.db.models.MeshedRoute.create([
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-a' },
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-a' },
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-b' }
      ]);

      const res = await request(server)
        .get('/routes')
        .expect(200);
      
      expect(res.body).to.have.property('peers');
      expect(res.body.peers).to.be.an('array');
      expect(res.body.peers).to.have.length(2);
      
      const peerA = res.body.peers.find(p => p.peer === 'provisioner-a');
      const peerB = res.body.peers.find(p => p.peer === 'provisioner-b');
      expect(peerA.count).to.equal(2);
      expect(peerB.count).to.equal(1);
    });
  });

  describe('GET /routes/search', function() {
    it('should return paginated route results', async function() {
      const routes = [];
      for (let i = 0; i < 15; i++) {
        routes.push({
          account: ctx.mongoose.Types.ObjectId(),
          backend: i % 2 === 0 ? 'provisioner-a' : 'provisioner-b'
        });
      }
      await ctx.db.models.MeshedRoute.create(routes);

      const res = await request(server)
        .get('/routes/search')
        .query({ limit: 10, page: 1 })
        .expect(200);
      
      expect(res.body).to.have.property('routes');
      expect(res.body.routes).to.be.an('array');
      expect(res.body.routes).to.have.length(10);
      expect(res.body).to.have.property('totalDocs', 15);
      expect(res.body).to.have.property('totalPages', 2);
      expect(res.body).to.have.property('page', 1);
    });

    it('should support pagination to second page', async function() {
      const routes = [];
      for (let i = 0; i < 15; i++) {
        routes.push({
          account: ctx.mongoose.Types.ObjectId(),
          backend: 'provisioner-a'
        });
      }
      await ctx.db.models.MeshedRoute.create(routes);

      const res = await request(server)
        .get('/routes/search')
        .query({ limit: 10, page: 2 })
        .expect(200);
      
      expect(res.body.routes).to.have.length(5);
      expect(res.body).to.have.property('page', 2);
    });
  });

  describe('POST /routes/mesh', function() {
    it('should create new route assignment', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      
      const res = await request(server)
        .post('/routes/mesh')
        .send({ account: accountId, backend: 'provisioner-a' })
        .expect(200);
      
      expect(res.body).to.have.property('account', accountId);
      expect(res.body).to.have.property('backend', 'provisioner-a');
      expect(res.body).to.have.property('created_at');
      
      const saved = await ctx.db.models.MeshedRoute.findOne({ account: accountId });
      expect(saved).to.not.be.null;
      expect(saved.backend).to.equal('provisioner-a');
    });

    it('should autogenerate account ID when autogenerate flag is set', async function() {
      const res = await request(server)
        .post('/routes/mesh')
        .query({ autogenerate: true })
        .send({ backend: 'provisioner-a' })
        .expect(200);
      
      expect(res.body).to.have.property('account');
      expect(res.body.account).to.match(/^[0-9a-f]{24}$/);
      expect(res.body).to.have.property('backend', 'provisioner-a');
    });

    it('should reject duplicate account assignments', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      
      await request(server)
        .post('/routes/mesh')
        .send({ account: accountId, backend: 'provisioner-a' })
        .expect(200);
      
      const res = await request(server)
        .post('/routes/mesh')
        .send({ account: accountId, backend: 'provisioner-b' })
        .expect(500);
      
      expect(res.body).to.have.property('message');
    });
  });

  describe('GET /routes/mesh/:account', function() {
    it('should return route for specific account', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-a'
      });

      const res = await request(server)
        .get(`/routes/mesh/${accountId}`)
        .expect(200);
      
      expect(res.body).to.have.property('account', accountId);
      expect(res.body).to.have.property('backend', 'provisioner-a');
    });

    it('should return null body for non-existent account', async function() {
      const nonExistentId = ctx.mongoose.Types.ObjectId().toString();
      
      const res = await request(server)
        .get(`/routes/mesh/${nonExistentId}`)
        .expect(200);
      
      expect(res.body).to.be.null;
    });
  });

  describe('POST /routes/mesh/:account', function() {
    it('should update route tags for an account', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-a'
      });

      const res = await request(server)
        .post(`/routes/mesh/${accountId}`)
        .send({ tags: 'premium,priority' })
        .expect(200);
      
      expect(res.body).to.have.property('account', accountId);
      expect(res.body).to.have.property('tags', 'premium,priority');
    });
  });

  describe('POST /routes/mesh/:account/reassign/:backend', function() {
    it('should reassign account to different backend', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-a'
      });

      const res = await request(server)
        .post(`/routes/mesh/${accountId}/reassign/provisioner-b`)
        .expect(200);
      
      expect(res.body).to.have.property('account', accountId);
      expect(res.body).to.have.property('backend', 'provisioner-b');
      
      const updated = await ctx.db.models.MeshedRoute.findOne({ account: accountId });
      expect(updated.backend).to.equal('provisioner-b');
    });

    it('should handle reassignment to same backend', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-a'
      });

      const res = await request(server)
        .post(`/routes/mesh/${accountId}/reassign/provisioner-a`)
        .expect(200);
      
      expect(res.body).to.have.property('backend', 'provisioner-a');
    });
  });

  describe('DELETE /routes/mesh/:account', function() {
    it('should remove route assignment', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-a'
      });

      await request(server)
        .delete(`/routes/mesh/${accountId}`)
        .expect(204);
      
      const deleted = await ctx.db.models.MeshedRoute.findOne({ account: accountId });
      expect(deleted).to.be.null;
    });

    it('should return 204 even for non-existent account', async function() {
      const nonExistentId = ctx.mongoose.Types.ObjectId().toString();
      
      await request(server)
        .delete(`/routes/mesh/${nonExistentId}`)
        .expect(204);
    });
  });
});

describe('Mesh Router - Storage Assignment API', function() {
  this.timeout(30000);

  describe('GET /storage/assignment/status', function() {
    it('should return first backend when no routes exist', async function() {
      const res = await request(server)
        .get('/storage/assignment/status')
        .expect(200);
      
      expect(res.body).to.have.property('candidates');
      expect(res.body.candidates).to.be.an('array');
      expect(res.body.candidates).to.have.length(1);
      expect(res.body.candidates[0]).to.have.property('peer', 'provisioner-a');
      expect(res.body.candidates[0]).to.have.property('count', 0);
    });

    it('should return candidates sorted by count (least loaded first)', async function() {
      await ctx.db.models.MeshedRoute.create([
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-a' },
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-a' },
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-a' },
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-b' }
      ]);

      const res = await request(server)
        .get('/storage/assignment/status')
        .expect(200);
      
      expect(res.body.candidates).to.have.length(2);
      expect(res.body.candidates[0].peer).to.equal('provisioner-b');
      expect(res.body.candidates[0].count).to.equal(1);
      expect(res.body.candidates[1].peer).to.equal('provisioner-a');
      expect(res.body.candidates[1].count).to.equal(3);
    });
  });

  describe('POST /storage/assignment/creation', function() {
    it('should create new assignment with least-loaded backend', async function() {
      await ctx.db.models.MeshedRoute.create([
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-a' },
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-a' },
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-a' },
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-b' }
      ]);

      const res = await request(server)
        .post('/storage/assignment/creation')
        .expect(200);
      
      expect(res.body).to.have.property('account');
      expect(res.body).to.have.property('backend', 'provisioner-b');
      expect(res.headers).to.have.property('x-provisioner-account');
      expect(res.headers).to.have.property('x-provisioner-backend', 'provisioner-b');
      expect(res.headers).to.have.property('x-provisioner-uri');
    });

    it('should assign to first backend when all are empty', async function() {
      const res = await request(server)
        .post('/storage/assignment/creation')
        .expect(200);
      
      expect(res.body).to.have.property('backend', 'provisioner-a');
    });

    it('should set x-provisioner-uri header with expanded template', async function() {
      const res = await request(server)
        .post('/storage/assignment/creation')
        .expect(200);
      
      expect(res.headers['x-provisioner-uri']).to.equal('http://provisioner-a.internal:5000');
    });
  });
});

describe('Mesh Router - Conductor API', function() {
  this.timeout(30000);

  describe('POST /storage/conductor', function() {
    it('should route request based on account header', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-a'
      });

      const res = await request(server)
        .post('/storage/conductor')
        .set('x-provisioner-account', accountId)
        .expect(200);
      
      expect(res.headers).to.have.property('x-provisioner-account', accountId);
      expect(res.headers).to.have.property('x-provisioner-backend', 'provisioner-a');
      expect(res.headers['x-provisioner-uri']).to.equal('http://provisioner-a.internal:5000');
    });

    it('should delete route when x-request-method is DELETE', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-a'
      });

      await request(server)
        .post('/storage/conductor')
        .set('x-provisioner-account', accountId)
        .set('x-request-method', 'DELETE')
        .expect(200);
      
      const deleted = await ctx.db.models.MeshedRoute.findOne({ account: accountId });
      expect(deleted).to.be.null;
    });
  });

  describe('GET /storage/conductor/:account', function() {
    it('should return conductor info for account', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-b'
      });

      const res = await request(server)
        .get(`/storage/conductor/${accountId}`)
        .expect(200);
      
      expect(res.headers).to.have.property('x-provisioner-account', accountId);
      expect(res.headers).to.have.property('x-provisioner-backend', 'provisioner-b');
      expect(res.headers['x-provisioner-uri']).to.equal('http://provisioner-b.internal:5000');
      expect(res.body).to.have.property('account', accountId);
      expect(res.body).to.have.property('backend', 'provisioner-b');
    });
  });
});

describe('Mesh Router - Backend Selection Logic', function() {
  this.timeout(30000);

  describe('Least-loaded backend selection', function() {
    it('should select backend with fewest routes', async function() {
      for (let i = 0; i < 10; i++) {
        await ctx.db.models.MeshedRoute.create({
          account: ctx.mongoose.Types.ObjectId(),
          backend: 'provisioner-a'
        });
      }
      for (let i = 0; i < 3; i++) {
        await ctx.db.models.MeshedRoute.create({
          account: ctx.mongoose.Types.ObjectId(),
          backend: 'provisioner-b'
        });
      }

      const res = await request(server)
        .post('/storage/assignment/creation')
        .expect(200);
      
      expect(res.body.backend).to.equal('provisioner-b');
    });

    it('should handle all backends having equal load', async function() {
      await ctx.db.models.MeshedRoute.create([
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-a' },
        { account: ctx.mongoose.Types.ObjectId(), backend: 'provisioner-b' }
      ]);

      const res = await request(server)
        .post('/storage/assignment/creation')
        .expect(200);
      
      expect(['provisioner-a', 'provisioner-b']).to.include(res.body.backend);
    });
  });

  describe('URI Template expansion', function() {
    it('should expand URI template with backend name', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-a'
      });

      const res = await request(server)
        .get(`/storage/conductor/${accountId}`)
        .expect(200);
      
      expect(res.headers['x-provisioner-uri']).to.equal('http://provisioner-a.internal:5000');
    });

    it('should expand template correctly for provisioner-b', async function() {
      const accountId = ctx.mongoose.Types.ObjectId().toString();
      await ctx.db.models.MeshedRoute.create({
        account: accountId,
        backend: 'provisioner-b'
      });

      const res = await request(server)
        .get(`/storage/conductor/${accountId}`)
        .expect(200);
      
      expect(res.headers['x-provisioner-uri']).to.equal('http://provisioner-b.internal:5000');
    });
  });
});
