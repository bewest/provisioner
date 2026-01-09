const { MongoMemoryServer } = require('mongodb-memory-server');

async function startDevServer() {
  console.log('Starting MongoDB Memory Server...');
  
  const mongod = await MongoMemoryServer.create({
    instance: {
      dbName: 'foundry-provisioner'
    }
  });
  
  const uri = mongod.getUri();
  console.log('MongoDB Memory Server started at:', uri);
  
  process.env.MONGO_ADMIN_URI = uri;
  
  const env = require('./env');
  const bootevent = require('./lib/bootevent');
  const createServer = require('./server');
  
  bootevent(env).boot(function (ctx) {
    var server = createServer(ctx);
    console.log('Provisioner server booted with in-memory MongoDB');
    server.listen(env.PORT, function () {
      console.log('Listening on', server.address());
    });
  });
  
  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await mongod.stop();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    await mongod.stop();
    process.exit(0);
  });
}

startDevServer().catch(err => {
  console.error('Failed to start dev server:', err);
  process.exit(1);
});
