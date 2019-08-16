/* eslint-disable camelcase, semi */
/* global R5 */

module.exports = Redis;

if (!global.R5) {
  global.R5 = {
    out: console
  };
}

// Constructors

function Redis (host, port, pass, db = 0) {
  this.host = host;
  this.port = port;
  this.pass = pass;
  this.db = db;
  this.ready = false;
  this.connect();
}

// Public Methods
// TODO: check if this.ready, else reconnect and/or queue?

Redis.prototype.connect = function () {
  if (this.ready) {
    return;
  }

  this.client = require('redis').createClient({
    host: this.host,
    port: this.port,
    password: this.pass,
    db: this.db
  });

  const _this = this;
  this.client.on('ready', () => {
    R5.out.log(`Connected to Redis (db: ${this.db})`);
    _this.ready = true;
  });

  this.client.on('error', (err) => {
    R5.out.error(`Redis error: ${err}`);
    _this.ready = false;
    _this.connect();
  });
};

Redis.prototype.handle_client_oper_action = function (action, key, callback) {
  callback = does_callback_exist(callback);

  this.client[action](key, (err, data) => {
    handle_err_log(err);
    callback(err, data);
  });
};

Redis.prototype.get = function (key, callback) {
  this.handle_client_oper_action('get', key, callback);
};

Redis.prototype.set = function (key, value, key_expiration, callback) {
  callback = does_callback_exist(callback);

  if (typeof value === 'object') {
    R5.out.log(
      'Passing a string into set is recommended (currently passed in object)'
    );
    value = stringify(value);
  }

  if (!key_expiration) {
    this.client.set(key, value, handle_data);
  } else if (value) {
    this.client.set(key, value, 'EX', key_expiration, handle_data);
  }
  else {
    this.client.setex(key, key_expiration, 'EX', handle_data);
  }

  function handle_data (err, data) {
    handle_err_log(err);
    callback(err, data);
  }
};

Redis.prototype.delete = function (key, callback) {
  this.handle_client_oper_action('del', key, callback);
};

Redis.prototype.get_list = function (key, callback) {
  this.handle_get_list('lrange', key, callback);
};

Redis.prototype.set_list = function (key, value, max_length, callback) {
  const _this = this;

  _this.client.llen(key, (err, res, body) => {
    if (err) {
      return callback(err, res, body);
    }

    if (max_length !== false && res >= max_length) {
      _this.client.lpop(key, callback(err, res, body));
    }

    _this.client.rpush(key, value, callback(err, res, body));
  });
};

Redis.prototype.delete_list = function (key, value, count, callback) {
  this.client.lrem(key, count, value, callback);
};

Redis.prototype.get_zlist = function (key, callback) {
  this.handle_get_list('zrange', key, callback);
};

Redis.prototype.handle_get_list = function (list_func, key, callback) {
  this.client[list_func](key, 0, -1, (err, res) => {
    handle_err_log(err);
    callback(err, res);
  });
}

Redis.prototype.rem_from_zlist = function (key, min_score, max_score, callback) {
  this.client.zremrangebyscore(key, min_score, max_score, (err, res) => {
    handle_err_log(err);
    callback(err, res);
  });
};

Redis.prototype.set_zlist = function (key, value, score, callback) {
  this.client.zadd(key, score, value, callback);
};

Redis.prototype.delete_zlist = function (key, value, callback) {
  this.client.zrem(key, value, callback);
};

Redis.prototype.set_set = function (key, value, callback) {
  this.client.sadd(key, value, callback);
};

Redis.prototype.get_set = function (key, callback) {
  this.client.smembers(key, callback);
};

Redis.prototype.pop_set = function (key, callback) {
  this.client.spop(key, callback);
};

Redis.prototype.delete_set = function (key, value, callback) {
  this.client.srem(key, value, callback);
};

Redis.prototype.delete_all = function () {
  this.client.flushdb(() => {
    R5.out.log('Redis flushed');
  });
};

Redis.prototype.increment = function (key, callback) {
  this.handle_client_oper_action('incr', key, callback);
};

Redis.prototype.decrement = function (key, callback) {
  this.handle_client_oper_action('decr', key, callback);
};

Redis.prototype.get_ttl = function (key, callback) {
  this.handle_client_oper_action('ttl', key, callback);
};

// Private Methods

function stringify (value) {
  try {
    JSON.stringify(value);
  }
  catch (e) {
    R5.out.error(
      `stringify failed at value: \n${value} \n\n with exception: \n${e}`
    );
  }
}

function does_callback_exist (callback) {
  return callback || function () {};
}

function handle_err_log (err) {
  if (err) {
    R5.out.error(err);
  }
}
