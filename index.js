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
  this.reconnecting = false;
  this.metrics = {
    operations: 0,
    pipeline_operations: 0,
    pipeline_batches: 0,
    errors: 0
  };
}

// Public Methods

Redis.prototype.connect = async function () {
  if (this.ready) {
    return;
  }

  if (this.reconnecting) {
    let attempts = 0;
    while (this.reconnecting && attempts < 50) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (this.ready) {
      return;
    }
  }

  this.reconnecting = true;

  try {
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

    if (this.client) {
      try {
        await this.client.quit().catch(() => {});
      } catch (e) {
        // Ignore errors when closing old client
      }
    }

    this.client = await redis.createClient(connectOptions);

    const _this = this;
    this.client.on('ready', () => {
      R5.out.log(`Redis connected (host: ${this.host}, db: ${this.db})`);
      _this.ready = true;
      _this.reconnecting = false;
    });

    this.client.on('error', (err) => {
      R5.out.error(`Redis error: ${err}`);
      _this.ready = false;
      _this.metrics.errors++;
      _this.reconnecting = false;
    });

    this.client.on('reconnecting', () => {
      R5.out.log('Redis reconnecting...');
      _this.ready = false;
      _this.reconnecting = true;
    });

    this.client.on('end', () => {
      R5.out.log('Redis connection ended');
      _this.ready = false;
      _this.reconnecting = false;
    });

    // Don't wait for ready event here - operations will handle connection state
    // via ensure_connected() and execute_with_retry()
  } finally {
    this.reconnecting = false;
  }
};

Redis.prototype.ensure_connected = async function () {
  if (this.ready && this.client) {
    return;
  }

  // If we have a client but ready isn't set, wait briefly for it
  // This handles cases where connect() just finished but ready event hasn't fired yet
  if (this.client && !this.ready && !this.reconnecting) {
    let attempts = 0;
    while (!this.ready && attempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }
    if (this.ready) {
      return;
    }
  }

  await this.connect();
};

Redis.prototype.disconnect = async function () {
  return this.client.quit();
};

Redis.prototype.handle_client_oper_action = async function (action, key) {
  return this.execute_with_retry(() => this.client[action](key));
};

Redis.prototype.get = async function (key) {
  this.metrics.operations++;
  await this.ensure_connected();
  return this.handle_client_oper_action('get', key);
};

Redis.prototype.set = async function (key, value, key_expiration) {
  this.metrics.operations++;
  await this.ensure_connected();

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

  return this.execute_with_retry(() => promise);
};

Redis.prototype.delete = async function (key) {
  await this.ensure_connected();
  return this.handle_client_oper_action('del', key);
};

Redis.prototype.get_list = async function (key) {
  return this.handle_get_list('lrange', key);
};

Redis.prototype.set_list = async function (key, value, max_length) {
  await this.ensure_connected();
  const setList = async () => {
    const data = await this.client.rpush(key, value);
    if (max_length) {
      await this.client.ltrim(key, -max_length, -1);
    }
    return data;
  };
  return this.execute_with_retry(() => setList());
};

Redis.prototype.delete_list = async function (key, value, count) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.lrem(key, count, value));
};

Redis.prototype.get_zlist = async function (key, min_score, max_score) {
  return this.handle_get_list('zrange', key, min_score, max_score);
};

Redis.prototype.handle_get_list = async function (list_func, key, min_score, max_score) {
  await this.ensure_connected();
  if (min_score === undefined) { min_score = 0; }
  if (max_score === undefined) { max_score = -1; }
  return this.execute_with_retry(() => this.client[list_func](key, min_score, max_score));
};

Redis.prototype.rem_from_zlist = async function (key, min_score, max_score) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.zremrangebyscore(key, min_score, max_score));
};

Redis.prototype.set_zlist = async function (key, value, score) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.zadd(key, score, value));
};

Redis.prototype.delete_zlist = async function (key, value) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.zrem(key, value));
};

Redis.prototype.set_set = async function (key, value) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.sadd(key, value));
};

Redis.prototype.get_set = async function (key) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.smembers(key));
};

Redis.prototype.pop_set = async function (key) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.spop(key));
};

Redis.prototype.delete_set = async function (key, value) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.srem(key, value));
};

Redis.prototype.delete_all = async function () {
  await this.ensure_connected();
  await this.execute_with_retry(() => this.client.flushdb());
  R5.out.log('Redis flushed');
};

Redis.prototype.increment = async function (key) {
  await this.ensure_connected();
  return this.handle_client_oper_action('incr', key);
};

Redis.prototype.decrement = async function (key) {
  await this.ensure_connected();
  return this.handle_client_oper_action('decr', key);
};

Redis.prototype.get_ttl = async function (key) {
  await this.ensure_connected();
  return this.handle_client_oper_action('ttl', key);
};

// Pipeline batching for better performance using multi() for async-redis compatibility
Redis.prototype.batch = async function (operations) {
  if (!this.ready) {
    // Try to ensure connection if no client exists
    if (!this.client) {
      await this.ensure_connected();
    }
    // If still not ready after attempting connection, reject
    if (!this.ready) {
      throw new Error('Redis not ready');
    }
  }

  return new Promise((resolve, reject) => {
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

Redis.prototype.execute_with_retry = async function (operation, max_retries = 3) {
  let last_error;

  for (let attempt = 0; attempt < max_retries; attempt++) {
    try {
      if (!this.ready || !this.client) {
        await this.ensure_connected();
      }

      const result = await operation();
      return result;
    } catch (err) {
      last_error = err;

      // Check if it's a connection-related error
      const is_connection_error = err.message && (
        err.message.includes('Connection') ||
        err.message.includes('ECONNREFUSED') ||
        err.message.includes('ENOTFOUND') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('Broken pipe') ||
        err.message.includes('write EPIPE')
      );

      if (is_connection_error && attempt < max_retries - 1) {
        this.ready = false;
        R5.out.warn(`Redis connection error, attempting reconnect (attempt ${attempt + 1}/${max_retries}): ${err.message}`);

        await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));

        try {
          await this.connect();
        } catch (connect_err) {
          // Continue to next retry attempt
        }
      } else {
        break;
      }
    }
  }

  R5.out.error(`Redis operation failed after ${max_retries} attempts: ${last_error}`);
  throw last_error;
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
