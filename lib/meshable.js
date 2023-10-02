
var mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

var meshSchema = new mongoose.Schema({
  account: { type: mongoose.Schema.Types.ObjectId, required: true },
  backend: { type: String, required: true },
  tags: { type: String, default: '' },
  created_at: { type: Date, default: Date.now }
});

function models (ctx, next) {
  meshSchema.plugin(mongoosePaginate);
  ctx.db.model('MeshedRoute', meshSchema);
  next( );
}

function monitor (ctx, next) {
  // console.log('mongoose', ctx.db);
  ctx.mongoose.connection.on('error disconnected connected open reconnected connecting', function (ev) {
    console.log('mongoose event', arguments);
  });
  next( );
}

function init (ctx, next) {
  var opts = { };
  ctx.mongoose = mongoose;
  ctx.db = mongoose.createConnection(ctx.env.mongo_url, opts);
  ctx.db.on('connected', function (ev) {
    console.log('mongoose connected');
    next( );
  });
  // next( );
}

function configure (proc) {
  proc = proc.acquire(init).acquire(monitor).acquire(models);
  return proc;
}
exports = module.exports = configure;
