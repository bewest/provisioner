
var crypto = require('crypto');
const { PaginationParameters } = require('mongoose-paginate-v2');

function api (ctx) {
  var PREFIX = ctx.env.PREFIX;
  var mongo_suite = ctx.env.mongo_suite;


  function search (req, res, next) {
    var pagination = new PaginationParameters(req);
    console.log('searching', req.query, pagination.get( ));
    var [query, options] = pagination.get();
    options.customLabels = { docs: 'users' };
    if (!options.sort) {
      options.sort = { created_at: -1 };
    }
    options.select = 'account.id created_at sitename tags';
    options.populate = 'account.id';
    req.db.models.User.paginate(req.query.find, options).then(function (results) {
      res.send(results);
      next( );
    }).catch(next);
  }

  function annotate (req, res, next) {
    var { tags, ...inputs } = { ...req.body, ...req.query };
    // var query = { account: { id: req.params.account } };
    var query = { "account.id": req.account._id };
    var update = { tags };
    req.db.models.User
      .updateMany(query, update)
      .exec(function (err, result) {
        if (err) { return next(err); }
        res.send(result);
        next( );
      })
    ;
  }

  function list (req, res, next) {
    req.db.models.User.find({ "account.id": req.account._id }, function (err, docs) {
      if (err) { return next(err); }
      res.results = docs ? { ok: 1, users: docs } : err;
      res.users = docs;
      next( );
    });
  }

  function by_user (req, res, next) {
    // req.db.models.User.find({account: req.params.user}, function (err, docs) { });
    req.db.models.User.findOne({account: req.params.user}, function (err, docs) {
      if (err) { return next(err); }
      res.results = docs || err;
      req.user = docs;
      next( );
    });
  }

  function by_id (req, res, next) {
    var q = {_id: req.params.user || req.params.id};
    req.db.models.User.findOne(q, function (err, docs) {
      if (err) { return next(err); }
      res.results = docs || err;
      req.user = docs;
      next( );
    });
  }

  function format (req, res, next) {
    res.send(res.results);
    next( );
  }

  function suggest (req, res, next) {
    var key = crypto.randomBytes(6).toString('hex');
    var name = req.params.name;
    var salter = req.params.salter || "pepper";
    req.suggested = {
      account: {
        id: req.account._id
      , salter: salter
      }
      , sitename: req.params.internal_name || name
      , creds: {
        user: PREFIX.CRED + salter + '.' + name
      , pass: null
      }
    };
    var shasum = crypto.createHash('sha1');
    shasum.update(key);
    shasum.update(JSON.stringify(req.suggested));
    shasum.update(key);
    var pass = shasum.digest('hex');
    req.suggested.creds.pass = pass;
    var mongo_auth = [req.suggested.creds.user, pass].join(':');
    var mongo = 'mongodb://' + mongo_auth + '@' + mongo_suite.ADDR + '/' + req.account.db.name + '?authSource=admin' + mongo_suite.MONGO_URI_ARGS;
    req.suggested.mongo_uri = mongo;
    next( );
  }

  function preview (req, res, next) {
    if (req.suggested) {
      res.results = req.suggested;
    }
    next( );
  }

  function lookup_prexists (req, res, next) {
    console.log("LOOKUP", req.suggested);
    if (req.suggested && req.suggested.creds) {
      var q = {
        "account.id": req.account._id
      , "account.salter": req.suggested.account.salter
      };
      req.db.models.User.findOne(q, function (err, doc) {
        if (err) { return next(err); }
        if (doc) {
          req.user = doc;
          res.results = doc.toJSON( );
        }
        return next( );
      });
      return;
    }
    next( );
  }

  function create (req, res, next) {
    console.log("CREATE", req.suggested, req.user);
    if (req.user) {
      return next( );
    }
    if (req.suggested && req.suggested.creds) {
      var q = {
        "account.id": req.account._id
      , "account.salter": req.suggested.account.salter
      };
      req.db.models.User.findOneAndUpdate(q, req.suggested, {upsert: true, "new": true}).populate('account.id').exec(function (err, doc) {
        if (err) { return next(err); }
        res.status(201);
        req.user = doc;
        res.results = doc.toJSON( );
        req.addUser(req.user, function (err, info) {
          console.log("ADMIN CREATED USER", err == null, err, info);
          if (err) { return next(err); }
          res.results.created = info;
          res.results.inputs = req.suggested;
          next( );
        });
      });
      return;
    }
    next( );
  }

  function remove_by_user (req, res, next) {
    console.log("REMOVING", req.user);
    if (!req.user) { return next( ); }
    req.db.models.User.deleteOne({_id: req.user._id }, function (err, users) {
      if (err) {
        console.log("could not delete model, will try admin credentials", err);
      // if (err) { return next(err); }
      }
      res.results = users || err;
      req.removeUser(req.user, function (err, info) {
        // if (err) { }
        // if (err) { return next(err); }
        // res.status(204);
        console.log("removed", err, req.user);
        res.results = info;
        delete req.user;
        next( );
      });
    });
  }

  var api = {
    search
  , annotate
  , list: list
  , format: format
  , suggest: suggest
  , by_id: by_id
  , by_user: by_user
  , preview: preview
  , lookup_prexists: lookup_prexists
  , refresh_user: [ lookup_prexists,  remove_by_user]
  , create: create
  , remove_by_user: remove_by_user
  };
  return api;

}
exports = module.exports = api;
