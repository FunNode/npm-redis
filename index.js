/* eslint-disable brace-style, camelcase, semi */
/* global R5 */

module.exports = Redis;

if (!global.R5) {
  global.R5 = {
    out: console
  };
}

// Constructors

function Redis(host, port, pass, db = 0) {
  this.host = host;
  this.port = port;
  this.pass = pass;
  this.db = db;
  this.ready = false;
  this.connect();
}

// Public Methods
// TODO: check if this.ready, else reconnect and/or queue?
// create callback func if doesn't exist
function callbackHandler(callback) {
  callback ? callback : function() {};
}

function handleErrlog(err) {
  if (err) {
    R5.out.error(err);
  }
}

Redis.prototype.connect = function() {
  if (this.ready) {
    return;
  }

  this.client = require('redis').createClient({
    host: this.host,
    port: this.port,
    password: this.pass,
    db: this.db
  });

  let _this = this;
  this.client.on('ready', function() {
    R5.out.log(`Connected to Redis (db: ${this.db})`);
    _this.ready = true;
  });

  this.client.on('error', function(err) {
    R5.out.error(`Redis error: ${err}`);
    _this.ready = false;
    _this.connect();
  });
};

Redis.prototype.get = function(key, callback) {
  callbackHandler(callback);
  this.client.get(key, function(err, data) {
    handleErrlog(err);
    callback(err, data);
  });
};

Redis.prototype.set = function(key, value, key_expiration, callback) {
  callbackHandler(callback);

  if (typeof value === 'object') {
    R5.out.log(
      'Passing a string into set is recommended (currently passed in object)'
    );
    value = stringify(value);
  }

  if (key_expiration) {
    if (value) {
      this.client.set(key, value, 'EX', key_expiration, handle_data);
    } else {
      this.client.setex(key, key_expiration, 'EX', handle_data);
    }
  } else {
    this.client.set(key, value, handle_data);
  }

  function handle_data(err, data) {
    handleErrlog(err);
    callback(err, data);
  }
};

Redis.prototype.delete = function(key, callback) {
  callbackHandler(callback);

  this.client.del(key, function(err, data) {
    handleErrlog(err);
    callback(err, data);
  });
};

Redis.prototype.get_list = function(key, callback) {
  this.client.lrange(key, 0, -1, function(err, res) {
    handleErrlog(err);
    callback(err, res);
  });
};

Redis.prototype.set_list = function(key, value, max_length, callback) {
  let _this = this;

  _this.client.llen(key, function(err, res, body) {
    if (err) {
      return callback(err, res, body);
    }

    if (max_length !== false && res >= max_length) {
      _this.client.lpop(key, callback(err, res, body));
    }

    _this.client.rpush(key, value, callback(err, res, body));
  });
};

Redis.prototype.delete_list = function(key, value, count, callback) {
  this.client.lrem(key, count, value, callback);
};

Redis.prototype.set_set = function(key, value, callback) {
  this.client.sadd(key, value, callback);
};

Redis.prototype.get_set = function(key, callback) {
  this.client.smembers(key, callback);
};

Redis.prototype.pop_set = function(key, callback) {
  this.client.spop(key, callback);
};

Redis.prototype.delete_set = function(key, value, callback) {
  this.client.srem(key, value, callback);
};

Redis.prototype.delete_all = function() {
  this.client.flushdb(function() {
    R5.out.log('Redis flushed');
  });
};

Redis.prototype.increment = function(key, callback) {
  callbackHandler(callback);

  this.client.incr(key, function(err, data) {
    handleErrlog(err);
    callback(err, data);
  });
};

Redis.prototype.decrement = function(key, callback) {
  callbackHandler(callback);

  this.client.decr(key, function(err, data) {
    handleErrlog(err);
    callback(err, data);
  });
};

Redis.prototype.get_ttl = function(key, callback) {
  callbackHandler(callback);

  this.client.ttl(key, function(err, data) {
    handleErrlog(err);
    callback(err, data);
  });
};

// Private Methods

function stringify(value) {
  try {
    JSON.stringify(value);
  } catch (e) {
    R5.out.error(
      `stringify failed at value: \n${value} \n\n with exception: \n${e}`
    );
  }
}
