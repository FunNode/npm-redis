/* eslint-disable camelcase */
/* global R5 */

module.exports = Redis;

if (!global.R5) {
  global.R5 = {
    out: console
  };
}

const redis = require('redis');
const {
  ClientClosedError,
  ClientOfflineError,
  SocketClosedUnexpectedlyError,
  ConnectionTimeoutError,
  SocketTimeoutError,
  TimeoutError
} = redis;

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

  // Single-flight: concurrent callers join the in-flight connect attempt
  // instead of each racing to create (and immediately discard) their own
  // client, which previously could churn indefinitely under concurrent load.
  if (this._connecting) {
    return this._connecting;
  }

  this.reconnecting = true;
  this._connecting = this._connect_once().finally(() => {
    this.reconnecting = false;
    this._connecting = null;
  });

  return this._connecting;
};

Redis.prototype._connect_once = async function () {
  const connectOptions = {
    socket: {
      host: this.host,
      port: this.port,
      reconnectStrategy: (retries, cause) => {
        if (cause && cause.code === 'ECONNREFUSED') {
          R5.out.error('Redis server refused connection');
        }
        if (retries >= this.options.retryAttempts) {
          return new Error('Max retry attempts exceeded');
        }
        return Math.min((retries + 1) * this.options.retryDelay, 3000);
      }
    },
    password: this.pass,
    database: this.db
  };

  if (this.client) {
    try {
      await this.client.close().catch(() => {});
    } catch (e) {
      // Ignore errors when closing old client
    }
  }

  this.client = redis.createClient(connectOptions);

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

  // Fire-and-forget: v6's client.connect() promise doesn't settle until the
  // connection succeeds or reconnectStrategy gives up, which can take up to
  // ~retryAttempts * retryDelay ms. Awaiting it here would make connect()
  // block callers at boot instead of returning immediately and tracking
  // readiness via the 'ready'/'reconnecting' events plus ensure_connected()'s
  // short poll, as today.
  this.client.connect().catch((err) => {
    R5.out.error(`Redis initial connect failed: ${err.message}`);
  });
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
  return this.client.close();
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
    promise = this.client.set(key, value, { EX: key_expiration });
  }
  else {
    promise = this.client.expire(key, key_expiration);
  }

  return this.execute_with_retry(() => promise);
};

Redis.prototype.set_nx = async function (key, value, ttl, unit = 'EX') {
  this.metrics.operations++;
  await this.ensure_connected();
  const result = await this.execute_with_retry(() => this.client.set(key, value, { [unit]: ttl, NX: true }));
  return result === 'OK';
};

Redis.prototype.delete_if_equals = async function (key, value) {
  await this.ensure_connected();
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  const result = await this.execute_with_retry(() => this.client.eval(script, { keys: [key], arguments: [value] }));
  return result === 1;
};

Redis.prototype.delete = async function (key) {
  await this.ensure_connected();
  return this.handle_client_oper_action('del', key);
};

Redis.prototype.get_list = async function (key) {
  return this.handle_get_list('lRange', key);
};

Redis.prototype.set_list = async function (key, value, max_length) {
  await this.ensure_connected();
  const setList = async () => {
    const data = await this.client.rPush(key, value);
    if (max_length) {
      await this.client.lTrim(key, -max_length, -1);
    }
    return data;
  };
  return this.execute_with_retry(() => setList());
};

Redis.prototype.delete_list = async function (key, value, count) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.lRem(key, count, value));
};

Redis.prototype.get_zlist = async function (key, min_score, max_score) {
  await this.ensure_connected();
  if (min_score === undefined) { min_score = '-inf'; }
  if (max_score === undefined) { max_score = '+inf'; }
  return this.execute_with_retry(() => this.client.zRangeByScore(key, min_score, max_score));
};

Redis.prototype.handle_get_list = async function (list_func, key, min_score, max_score) {
  await this.ensure_connected();
  if (min_score === undefined) { min_score = 0; }
  if (max_score === undefined) { max_score = -1; }
  return this.execute_with_retry(() => this.client[list_func](key, min_score, max_score));
};

Redis.prototype.rem_from_zlist = async function (key, min_score, max_score) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.zRemRangeByScore(key, min_score, max_score));
};

Redis.prototype.set_zlist = async function (key, value, score) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.zAdd(key, { score, value }));
};

Redis.prototype.get_zscore = async function (key, value) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.zScore(key, value));
};

Redis.prototype.delete_zlist = async function (key, value) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.zRem(key, value));
};

Redis.prototype.set_set = async function (key, value) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.sAdd(key, value));
};

Redis.prototype.get_set = async function (key) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.sMembers(key));
};

Redis.prototype.pop_set = async function (key) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.sPop(key));
};

Redis.prototype.delete_set = async function (key, value) {
  await this.ensure_connected();
  return this.execute_with_retry(() => this.client.sRem(key, value));
};

Redis.prototype.delete_all = async function () {
  await this.ensure_connected();
  await this.execute_with_retry(() => this.client.flushDb());
  R5.out.log('Redis flushed');
};

Redis.prototype.scan_keys = async function (pattern, count = 100) {
  await this.ensure_connected();
  let cursor = '0';
  let keys = [];
  do {
    const { cursor: next_cursor, keys: batch } = await this.execute_with_retry(() => this.client.scan(cursor, { MATCH: pattern, COUNT: count }));
    cursor = next_cursor;
    keys = keys.concat(batch);
  } while (cursor !== '0');
  return keys;
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

// Pipeline batching for better performance using multi()
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

  if (!operations || operations.length === 0) {
    return [];
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
          multi.set(op.key, op.value, { EX: op.expiry });
        } else {
          multi.set(op.key, op.value);
        }
        break;
      case 'del':
        multi.del(op.key);
        break;
      case 'zadd':
        multi.zAdd(op.key, { score: op.score, value: op.value });
        break;
      case 'zrem':
        multi.zRem(op.key, op.value);
        break;
      case 'zrange':
        multi.zRange(op.key, op.start || 0, op.stop || -1);
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

  try {
    return await multi.exec();
  } catch (err) {
    this.metrics.errors++;
    R5.out.error(`Multi batch execution failed: ${err.message}`);
    throw err;
  }
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

      // Check if it's a connection-related error. node-redis v6 has its own
      // error classes (e.g. ClientClosedError: "The client is closed") that
      // don't all contain the substring "connection", so classify by
      // instanceof first and fall back to substring matching for raw OS-level
      // errors (ECONNREFUSED/ENOTFOUND/etc) that don't originate from
      // node-redis's own error hierarchy.
      const message = (err.message || '').toLowerCase();
      const is_known_error_class = (
        err instanceof ClientClosedError ||
        err instanceof ClientOfflineError ||
        err instanceof SocketClosedUnexpectedlyError ||
        err instanceof ConnectionTimeoutError ||
        err instanceof SocketTimeoutError ||
        err instanceof TimeoutError
      );
      const is_connection_error = is_known_error_class || (message && (
        message.includes('connection') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('etimedout') ||
        message.includes('broken pipe') ||
        message.includes('write epipe')
      ));

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
