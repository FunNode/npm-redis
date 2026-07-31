/* eslint-disable brace-style, camelcase, semi */
/* eslint-env mocha */

var chai = require('chai');
var expect = chai.expect;
var config = require('./helper');
var Redis = require('../../index.js');

describe('Redis', () => {
  let redis;

  before(async function () {
    redis = new Redis(config.host, config.port, config.pass);
    await redis.connect();
  });

  after(async function () {
    await redis.disconnect();
  });

  describe('batch', () => {
    describe('mixed get/set/del operations', () => {
      let results;
      let value_after;

      before(async function () {
        await redis.set('batch:existing', 'before');
        results = await redis.batch([
          { command: 'set', key: 'batch:existing', value: 'after' },
          { command: 'get', key: 'batch:existing' },
          { command: 'del', key: 'batch:existing' }
        ]);
        value_after = await redis.get('batch:existing');
      });

      it('should return one result per queued command, in order', () => {
        expect(results).to.eql(['OK', 'after', 1]);
      });

      it('should have actually applied the delete', () => {
        expect(value_after).to.equal(null);
      });
    });

    describe('sorted-set operations (zadd/zrem/zrange)', () => {
      let results;
      let members_after;

      before(async function () {
        await redis.set_zlist('batch:zset', 'keep', 1);
        await redis.set_zlist('batch:zset', 'remove-me', 2);
        results = await redis.batch([
          { command: 'zadd', key: 'batch:zset', score: 3, value: 'added' },
          { command: 'zrem', key: 'batch:zset', value: 'remove-me' },
          { command: 'zrange', key: 'batch:zset', start: 0, stop: -1 }
        ]);
        members_after = await redis.get_zlist('batch:zset');
      });

      it('should apply the zadd and zrem', () => {
        expect(members_after.sort()).to.eql(['added', 'keep']);
      });

      it('should return the zrange result reflecting the mutations queued earlier in the same batch', () => {
        expect(results[2]).to.include('added');
        expect(results[2]).to.not.include('remove-me');
      });
    });

    describe('ttl/expire operations', () => {
      let results;
      let ttl_after;

      before(async function () {
        await redis.set('batch:ttl', 'value');
        results = await redis.batch([
          { command: 'expire', key: 'batch:ttl', seconds: 100 },
          { command: 'ttl', key: 'batch:ttl' }
        ]);
        ttl_after = await redis.get_ttl('batch:ttl');
      });

      it('should apply the expire and report a positive ttl', () => {
        expect(results[0]).to.equal(1);
        expect(results[1]).to.be.a('number');
        expect(results[1]).to.be.above(0);
        expect(ttl_after).to.be.above(0);
      });
    });

    describe('an empty batch', () => {
      let results;

      before(async function () {
        results = await redis.batch([]);
      });

      it('should return an empty array without touching Redis', () => {
        expect(results).to.eql([]);
      });
    });
  });
});
