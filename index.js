/* eslint-disable camelcase */
/* global R5 */

module.exports = Redis;

if (!global.R5) {
  global.R5 = {
    out: console
  };
}

const redis = require('async-redis');

// Constructors

function Redis (host, port, pass, db = 0) {
  this.host = host;
  this.port = port;
  this.pass = pass;
  this.db = db;
  this.ready = false;
}

// Public Methods
// TODO: check if this.ready, else reconnect and/or queue?

Redis.prototype.connect = async function () {
  if (this.ready) {
    return;
  }

  this.client = await redis.createClient({
    host: this.host,
    port: this.port,
    password: this.pass,
    db: this.db
  });

  const _this = this;
  this.client.on('ready', () => {
    R5.out.log(`Redis connected (db: ${this.db})`);
    _this.ready = true;
  });

  this.client.on('error', (err) => {
    R5.out.error(`Redis error: ${err}`);
    _this.ready = false;
    _this.connect();
  });
};

Redis.prototype.disconnect = async function () {
  return this.client.quit();
};

Redis.prototype.handle_client_oper_action = async function (action, key) {
  return try_execute_and_log_error(this.client[action](key));
};

Redis.prototype.get = async function (key) {
  return this.handle_client_oper_action('get', key);
};

Redis.prototype.set = async function (key, value, key_expiration) {
  if (typeof value === 'object') {
    R5.out.log(
      'Passing a string into set is recommended (currently passed in object)'
    );
    value = stringify(value);
  }

  let promise;
  if (!key_expiration || typeof (key_expiration) !== 'number') {
    promise = this.client.set(key, value);
  }
  else if (value) {
    promise = this.client.set(key, value, 'EX', key_expiration);
  }
  else {
    promise = this.client.expire(key, key_expiration);
  }

  return try_execute_and_log_error(promise);
};

Redis.prototype.delete = async function (key) {
  return this.handle_client_oper_action('del', key);
};

Redis.prototype.get_list = async function (key) {
  return this.handle_get_list('lrange', key);
};

Redis.prototype.set_list = async function (key, value, max_length) {
  const setList = async () => {
    if (max_length) {
      const length = await this.client.llen(key);
      if (length >= max_length) {
        await this.client.lpop(key);
      }
    }
    const data = await this.client.rpush(key, value);
    return data;
  };
  return try_execute_and_log_error(setList());
};

Redis.prototype.delete_list = async function (key, value, count) {
  return this.client.lrem(key, count, value);
};

Redis.prototype.get_zlist = async function (key) {
  return this.handle_get_list('zrange', key);
};

Redis.prototype.handle_get_list = async function (list_func, key) {
  return try_execute_and_log_error(this.client[list_func](key, 0, -1));
};

Redis.prototype.rem_from_zlist = async function (key, min_score, max_score) {
  return try_execute_and_log_error(this.client.zremrangebyscore(key, min_score, max_score));
};

Redis.prototype.set_zlist = async function (key, value, score) {
  return this.client.zadd(key, score, value);
};

Redis.prototype.delete_zlist = async function (key, value) {
  return this.client.zrem(key, value);
};

Redis.prototype.set_set = async function (key, value) {
  return this.client.sadd(key, value);
};

Redis.prototype.get_set = async function (key) {
  return this.client.smembers(key);
};

Redis.prototype.pop_set = async function (key) {
  return this.client.spop(key);
};

Redis.prototype.delete_set = async function (key, value) {
  return this.client.srem(key, value);
};

Redis.prototype.delete_all = async function () {
  await this.client.flushdb();
  R5.out.log('Redis flushed');
};

Redis.prototype.increment = async function (key) {
  return this.handle_client_oper_action('incr', key);
};

Redis.prototype.decrement = async function (key) {
  return this.handle_client_oper_action('decr', key);
};

Redis.prototype.get_ttl = async function (key) {
  return this.handle_client_oper_action('ttl', key);
};

// Private Methods

function stringify (value) {
  try {
    return JSON.stringify(value);
  }
  catch (e) {
    R5.out.error(
      `stringify failed at value: \n${value} \n\n with exception: \n${e}`
    );
  }
}

async function try_execute_and_log_error (promise) {
  try {
    const res = await promise;
    return res;
  }
  catch (err) {
    R5.out.error(err);
    throw err;
  }
}
