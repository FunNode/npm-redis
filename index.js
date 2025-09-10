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

function Redis (host, port, pass, db = 0, options = {}) {
  this.host = host;
  this.port = port;
  this.pass = pass;
  this.db = db;
  this.ready = false;

  // Performance optimization options
  this.options = {
    enablePipeline: options.enablePipeline !== false,
    pipelineTimeout: options.pipelineTimeout || 10,
    maxPipelineOps: options.maxPipelineOps || 100,
    connectionPoolSize: options.connectionPoolSize || 1,
    retryAttempts: options.retryAttempts || 3,
    retryDelay: options.retryDelay || 1000
  };

  // Pipeline management
  this.pendingPipeline = [];
  this.pipelineTimer = null;
  this.connectionPool = [];
  this.metrics = {
    operations: 0,
    pipeline_operations: 0,
    pipeline_batches: 0,
    errors: 0
  };
}

// Public Methods
// TODO: check if this.ready, else reconnect and/or queue?

Redis.prototype.connect = async function () {
  if (this.ready) {
    return;
  }

  const connectOptions = {
    host: this.host,
    port: this.port,
    password: this.pass,
    db: this.db,
    retry_strategy: (options) => {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        R5.out.error('Redis server refused connection');
      }
      if (options.total_retry_time > 1000 * 60 * 60) {
        return new Error('Retry time exhausted');
      }
      if (options.attempt > this.options.retryAttempts) {
        return new Error('Max retry attempts exceeded');
      }
      return Math.min(options.attempt * this.options.retryDelay, 3000);
    }
  };

  this.client = await redis.createClient(connectOptions);

  const _this = this;
  this.client.on('ready', () => {
    R5.out.log(`Redis connected (host: ${this.host}, db: ${this.db})`);
    _this.ready = true;
  });

  this.client.on('error', (err) => {
    R5.out.error(`Redis error: ${err}`);
    _this.ready = false;
    _this.metrics.errors++;
  });

  this.client.on('reconnecting', () => {
    R5.out.log('Redis reconnecting...');
    _this.ready = false;
  });
};

Redis.prototype.disconnect = async function () {
  return this.client.quit();
};

Redis.prototype.handle_client_oper_action = async function (action, key) {
  return try_execute_and_log_error(this.client[action](key));
};

Redis.prototype.get = async function (key) {
  this.metrics.operations++;
  return this.handle_client_oper_action('get', key);
};

Redis.prototype.set = async function (key, value, key_expiration) {
  this.metrics.operations++;

  if (typeof value === 'object') {
    R5.out.warn(
      'Redis: passing a string into set is recommended (currently passed in object)'
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

Redis.prototype.get_zlist = async function (key, min_score, max_score) {
  return this.handle_get_list('zrange', key, min_score, max_score);
};

Redis.prototype.handle_get_list = async function (list_func, key, min_score, max_score) {
  if (min_score === undefined) { min_score = 0; }
  if (max_score === undefined) { max_score = -1; }
  return try_execute_and_log_error(this.client[list_func](key, min_score, max_score));
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

// Pipeline batching for better performance using multi() for async-redis compatibility
Redis.prototype.batch = function (operations) {
  return new Promise((resolve, reject) => {
    if (!this.ready) {
      reject(new Error('Redis not ready'));
      return;
    }

    if (!operations || operations.length === 0) {
      resolve([]);
      return;
    }

    this.metrics.pipeline_batches++;
    this.metrics.pipeline_operations += operations.length;

    const multi = this.client.multi();

    operations.forEach(op => {
      switch (op.command) {
        case 'get':
          multi.get(op.key);
          break;
        case 'set':
          if (op.expiry) {
            multi.set(op.key, op.value, 'EX', op.expiry);
          } else {
            multi.set(op.key, op.value);
          }
          break;
        case 'del':
          multi.del(op.key);
          break;
        case 'zadd':
          multi.zadd(op.key, op.score, op.value);
          break;
        case 'zrem':
          multi.zrem(op.key, op.value);
          break;
        case 'zrange':
          multi.zrange(op.key, op.start || 0, op.stop || -1);
          break;
        case 'ttl':
          multi.ttl(op.key);
          break;
        case 'expire':
          multi.expire(op.key, op.seconds);
          break;
        default:
          R5.out.warn(`Unsupported batch operation: ${op.command}`);
      }
    });

    multi.exec((err, results) => {
      if (err) {
        this.metrics.errors++;
        R5.out.error(`Multi batch execution failed: ${err.message}`);
        reject(err);
        return;
      }

      // async-redis multi.exec() returns results directly
      resolve(results);
    });
  });
};

// Enhanced bulk operations for common patterns
Redis.prototype.mget = async function (keys) {
  if (!keys || keys.length === 0) return [];

  const operations = keys.map(key => ({ command: 'get', key }));
  return this.batch(operations);
};

Redis.prototype.mset = async function (keyValuePairs, expiry) {
  if (!keyValuePairs || keyValuePairs.length === 0) return [];

  const operations = keyValuePairs.map(pair => ({
    command: 'set',
    key: pair.key,
    value: pair.value,
    expiry: expiry
  }));

  return this.batch(operations);
};

Redis.prototype.mdel = async function (keys) {
  if (!keys || keys.length === 0) return [];

  const operations = keys.map(key => ({ command: 'del', key }));
  return this.batch(operations);
};

// Performance metrics
Redis.prototype.getMetrics = function () {
  return {
    ...this.metrics,
    ready: this.ready,
    error_rate: this.metrics.operations > 0 ?
      (this.metrics.errors / this.metrics.operations * 100).toFixed(2) + '%' : '0%',
    pipeline_efficiency: this.metrics.pipeline_batches > 0 ?
      (this.metrics.pipeline_operations / this.metrics.pipeline_batches).toFixed(1) : '0'
  };
};

Redis.prototype.resetMetrics = function () {
  this.metrics = {
    operations: 0,
    pipeline_operations: 0,
    pipeline_batches: 0,
    errors: 0
  };
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
