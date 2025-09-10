/* eslint-disable camelcase */
/* Performance tests for Redis enhancements */

const chai = require('chai');
const { expect } = chai;
const Redis = require('../../index.js');

// Mock R5.out for testing
global.R5 = {
  out: {
    log: () => {},
    warn: () => {},
    error: () => {}
  }
};

describe('Redis Performance Enhancements', function() {
  let redis;

  beforeEach(function() {
    redis = new Redis('localhost', 6379, null, 0, {
      enablePipeline: true,
      retryAttempts: 2
    });

    // Mock the client for testing with dynamic operation counting
    let operationCount = 0;
    const multiMock = {
      get: () => { operationCount++; return multiMock; },
      set: () => { operationCount++; return multiMock; },
      del: () => { operationCount++; return multiMock; },
      zadd: () => { operationCount++; return multiMock; },
      zrem: () => { operationCount++; return multiMock; },
      zrange: () => { operationCount++; return multiMock; },
      ttl: () => { operationCount++; return multiMock; },
      expire: () => { operationCount++; return multiMock; },
      exec: (callback) => {
        // Generate results based on operation count
        const results = [];
        for (let i = 0; i < operationCount; i++) {
          results.push(i === 0 ? 'value1' : (i === 1 ? 'OK' : 1));
        }
        operationCount = 0; // Reset for next batch
        callback(null, results);
      }
    };

    redis.client = {
      multi: () => multiMock,
      pipeline: () => ({
        get: () => {},
        set: () => {},
        del: () => {},
        zadd: () => {},
        zrem: () => {},
        zrange: () => {},
        ttl: () => {},
        expire: () => {},
        exec: (callback) => {
          // Simulate successful pipeline execution based on operation count
          const resultCount = 3; // Default for most tests
          const results = [];
          for (let i = 0; i < resultCount; i++) {
            results.push([null, i === 0 ? 'value1' : (i === 1 ? 'OK' : 1)]);
          }
          callback(null, results);
        }
      })
    };
    redis.ready = true;
    redis.resetMetrics();
  });

  describe('Performance Options', function() {
    it('should initialize with default performance options', function() {
      const redis2 = new Redis('localhost', 6379);
      expect(redis2.options.enablePipeline).to.be.true;
      expect(redis2.options.maxPipelineOps).to.equal(100);
      expect(redis2.options.retryAttempts).to.equal(3);
    });

    it('should allow custom performance options', function() {
      const redis2 = new Redis('localhost', 6379, null, 0, {
        enablePipeline: false,
        maxPipelineOps: 50,
        retryAttempts: 5
      });
      expect(redis2.options.enablePipeline).to.be.false;
      expect(redis2.options.maxPipelineOps).to.equal(50);
      expect(redis2.options.retryAttempts).to.equal(5);
    });
  });

  describe('Pipeline Batching', function() {
    it('should execute batch operations successfully', async function() {
      const operations = [
        { command: 'get', key: 'test1' },
        { command: 'set', key: 'test2', value: 'value2' },
        { command: 'del', key: 'test3' }
      ];

      const results = await redis.batch(operations);
      expect(results).to.be.an('array');
      expect(results).to.have.length(3);
      expect(results[0]).to.equal('value1');
      expect(results[1]).to.equal('OK');
      expect(results[2]).to.equal(1);
    });

    it('should handle empty batch operations', async function() {
      const results = await redis.batch([]);
      expect(results).to.be.an('array');
      expect(results).to.have.length(0);
    });

    it('should reject when Redis is not ready', async function() {
      redis.ready = false;

      try {
        await redis.batch([{ command: 'get', key: 'test' }]);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('Redis not ready');
      }
    });
  });

  describe('Bulk Operations', function() {
    it('should support mget for multiple keys', async function() {
      const keys = ['key1', 'key2', 'key3'];
      const results = await redis.mget(keys);

      expect(results).to.be.an('array');
      expect(results).to.have.length(3);
    });

    it('should support mset for multiple key-value pairs', async function() {
      // Create a custom mock for this test
      const mockPipeline = {
        set: () => {},
        exec: (callback) => {
          callback(null, [[null, 'OK'], [null, 'OK']]);
        }
      };
      redis.client.pipeline = () => mockPipeline;

      const pairs = [
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' }
      ];

      const results = await redis.mset(pairs, 300);
      expect(results).to.be.an('array');
      expect(results).to.have.length(2);
    });

    it('should support mdel for multiple keys', async function() {
      // Create a custom mock for this test
      const mockPipeline = {
        del: () => {},
        exec: (callback) => {
          callback(null, [[null, 1], [null, 1]]);
        }
      };
      redis.client.pipeline = () => mockPipeline;

      const keys = ['key1', 'key2'];
      const results = await redis.mdel(keys);

      expect(results).to.be.an('array');
      expect(results).to.have.length(2);
    });
  });

  describe('Performance Metrics', function() {
    it('should track operation metrics', function() {
      redis.metrics.operations = 100;
      redis.metrics.errors = 5;
      redis.metrics.pipeline_operations = 50;
      redis.metrics.pipeline_batches = 5;

      const metrics = redis.getMetrics();

      expect(metrics.operations).to.equal(100);
      expect(metrics.errors).to.equal(5);
      expect(metrics.error_rate).to.equal('5.00%');
      expect(metrics.pipeline_efficiency).to.equal('10.0');
      expect(metrics.ready).to.be.true;
    });

    it('should reset metrics', function() {
      redis.metrics.operations = 100;
      redis.metrics.errors = 5;

      redis.resetMetrics();

      expect(redis.metrics.operations).to.equal(0);
      expect(redis.metrics.errors).to.equal(0);
      expect(redis.metrics.pipeline_operations).to.equal(0);
      expect(redis.metrics.pipeline_batches).to.equal(0);
    });

    it('should handle zero operations gracefully', function() {
      const metrics = redis.getMetrics();
      expect(metrics.error_rate).to.equal('0%');
      expect(metrics.pipeline_efficiency).to.equal('0');
    });
  });

  describe('Supported Batch Operations', function() {
    it('should support all common Redis operations in batch', async function() {
      // Create a custom mock for this test with 8 operations
      const mockPipeline = {
        get: () => {},
        set: () => {},
        del: () => {},
        zadd: () => {},
        zrem: () => {},
        zrange: () => {},
        ttl: () => {},
        expire: () => {},
        exec: (callback) => {
          const results = [];
          for (let i = 0; i < 8; i++) {
            results.push([null, i === 0 ? 'value1' : 'OK']);
          }
          callback(null, results);
        }
      };
      redis.client.pipeline = () => mockPipeline;

      const operations = [
        { command: 'get', key: 'test1' },
        { command: 'set', key: 'test2', value: 'value2', expiry: 300 },
        { command: 'del', key: 'test3' },
        { command: 'zadd', key: 'zset1', score: 100, value: 'member1' },
        { command: 'zrem', key: 'zset1', value: 'member2' },
        { command: 'zrange', key: 'zset1', start: 0, stop: -1 },
        { command: 'ttl', key: 'test1' },
        { command: 'expire', key: 'test1', seconds: 600 }
      ];

      const results = await redis.batch(operations);
      expect(results).to.be.an('array');
      expect(results).to.have.length(8);
    });
  });
});