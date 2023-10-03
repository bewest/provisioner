

var restify = require('restify');
var url = require('url');
const qs = require('querystring');
const { PaginationParameters } = require('mongoose-paginate-v2');

function configureServer (opts, ctx) {
  var server = restify.createServer(opts);

  server.use(restify.plugins.bodyParser({mapParams: true }));


  server.use(restify.plugins.dateParser());
  server.use(restify.plugins.queryParser());
  server.use(restify.plugins.jsonp());
  server.use(restify.plugins.gzipResponse());
  server.use(restify.plugins.bodyParser());


  server.use(function (req, res, next) {
    res.locals = { };
    next( );
  });

  function generate_uri (backend) {
    return ctx.env.uri_template.replace(ctx.env.replace_keyword, backend);
  }

  function format_locals (req, res, next) {
    res.send(res.locals);
    next( );
  }

  function find_assigned_account (req, res, next) {
  }

  function create_storage_assignment (req, res, next) {
  }

  server.get('/routes', function (req, res, next) {
    ctx.db.models.MeshedRoute.aggregate( [
      { $group: { _id: '$backend', count: { $sum: 1 } } },
      { $project: { peer: "$_id", _id: 0, count: 1 } },
      { $sort: { count: 1 } }

    ])
    .exec( ).then(function (result) {
      res.send({ peers: result });
    }).catch(next);
  });

  server.get('/routes/search', function (req, res, next) {
    var pagination = new PaginationParameters(req);
    console.log('searching', req.query, pagination.get( ));
    var [query, options] = pagination.get();
    options.customLabels = { docs: 'routes' };
    if (!options.sort) {
      options.sort = { created_at: -1 };
    }
    ctx.db.models.MeshedRoute.paginate(req.query.find, options).then(function (results) {
      res.send(results);
    }).catch(next);
  });

  // create a new route
  server.post('/routes/mesh', function (req, res, next) {
    var { account, backend, tags, ...inputs } = { ...req.body, ...req.query };
    if (req.query.autogenerate && !account) {
      account = ctx.mongoose.Types.ObjectId();
    }
    var new_route = { account, backend, tags };
    ctx.db.models.MeshedRoute.create(new_route, function (err, results) {
      console.log("CREATE ROUTE", err, new_route, inputs);
      if (err) { return next(err); }
      res.send(results);
      next( );
    });
  });

  // get route details for an account
  server.get('/routes/mesh/:account', function (req, res, next) {
    ctx.db.models.MeshedRoute.findOne({ account: req.params.account }, function (err, results) {

      if (err) { return next(err); }
      res.send(results);
      next( );
    });
  });

  // update route details for an account
  server.post('/routes/mesh/:account', function (req, res, next) {
    var account = req.params.account;
    var { backend, tags, ...inputs } = { ...req.body, ...req.query };
    var q = { account };
    var update = { tags : tags ? tags : null };
    console.log("UPDATING", q, update);
    ctx.db.models.MeshedRoute.findOneAndUpdate(q, update, { new: true }, function (err, route) {
      if (err) { return next(err); }
      res.send(route);
      next( );
    });
  });

  // delete a route
  server.del('/routes/mesh/:account', function (req, res, next) {
    ctx.db.models.MeshedRoute.remove({ account: req.params.account }, function (err, results) {
      if (err) { return next(err); }
      res.send(204);
      next( );
    });
  });



  server.get('/storage/assignment/status', function (req, res, next) {
    var spec = ctx.env.meshable_spec.split(',');
    ctx.db.models.MeshedRoute.aggregate( [
      { $match: { backend: { $in: spec } } },
      { $group: { _id: '$backend', count: { $sum: 1 } } },
      { $project: { peer: "$_id", _id: 0, count: 1 } },
      { $sort: { count: 1 } }

    ])
    .exec( ).then(function (result) {
      res.send({ peers: result });
    }).catch(next);
  });


  /*
  * The following endpoints are intended to interact with a loadbalancer as
  * middleware.
  * These endpoints should respond with a header: x-provisioner-backend.  The
  * value of the header should be the absolute URI prefix that NGINX should use
  * to proxy the request.  NGINX will use auth_request to handle these
  * endpoints.
  */
  server.post('/storage/assignment/creation', function (req, res, next) {
    var spec = ctx.env.meshable_spec.split(',');
    ctx.db.models.MeshedRoute.aggregate( [
      { $match: { backend: { $in: spec } } },
      { $group: { _id: '$backend', count: { $sum: 1 } } },
      { $project: { peer: "$_id", _id: 0, count: 1 } },
      { $sort: { count: 1 } }

    ])
    .exec( ).then(function (candidates) {
      res.locals = { candidates };
      next( );
    }).catch(next);
  }, function (req, res, next) {
    var account = ctx.mongoose.Types.ObjectId();
    var backend = res.locals.candidates[0].peer;
    var new_route = { account, backend };
    ctx.db.models.MeshedRoute.create(new_route, function (err, result) {
      console.log("CREATE ROUTE", err, new_route, result);
      if (err) { return next(err); }
      res.header('x-provisioner-account', result.account);
      res.header('x-provisioner-backend', result.backend);
      res.header('x-provisioner-uri', generate_uri(result.backend));
      res.send(result);
      next( );
    });
  });

  server.get('/storage/conductor/:account', function (req, res, next) {
    ctx.db.models.MeshedRoute.findOne({ account: req.params.account }, function (err, result) {

      if (err) { return next(err); }
      res.header('x-provisioner-account', result.account);
      res.header('x-provisioner-backend', result.backend);
      res.header('x-provisioner-uri', generate_uri(result.backend));
      res.send(result);
      next( );
    });
  });


  return server;
}



if (!module.parent) {
  var port = parseInt(process.env.PORT || '4343')
  var config = {
    mongo_url: process.env.MONGODB_MESHDB
  , meshable_spec: process.env.MESHED_PROVISIONERS || 'provisioner,provisioner-mesh-b'
  , uri_template: process.env.URI_TEMPLATE || 'http://origin'
  , replace_keyword: process.env.URI_REPLACE_KEYWORD || 'origin'

  };
  var boot = require('bootevent')( );
  // var env = require('./lib/env');
  var meshable = require('./lib/meshable');
  var proc = boot.acquire(function (ctx, next) {
    ctx.env = config;
    next( );
  });
  meshable(proc).acquire(function server_env (ctx, next) {
    ctx.server = configureServer(config, ctx);
    next( );
  }).boot(function (ctx) {
    ctx.server.listen(port, function ( ) {
      console.log('listening on', this.address( ));
    });
  });
}

