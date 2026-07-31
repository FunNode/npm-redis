/* eslint-disable brace-style, camelcase, semi */
/* eslint-env mocha */

var chai = require('chai');
var expect = chai.expect;
var config = require('./helper');
var Redis = require('../../index.js');

function delay (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Redis', () => {
  let redis;

  before(async function () {
    redis = new Redis(config.host, config.port, config.pass);
    await redis.connect();
  });

  after(async function () {
    await redis.disconnect();
  });

  describe('set_nx', () => {
    describe('when the key is available', () => {
      const key = 'lock:available';
      let err = null
      let response;
      let value_after;

      before(async function () {
        try {
          response = await redis.set_nx(key, 'owner-1', 30);
          value_after = await redis.get(key);
        }
        catch (e) {
          err = e;
        }
      });

      it('should not return error', () => {
        return expect(err).to.be.a('null');
      });

      it('should acquire the lock', () => {
        return expect(response).to.equal(true);
      });

      it('should actually set the value', () => {
        return expect(value_after).to.equal('owner-1');
      });
    });

    describe('when the key is already taken', () => {
      const key = 'lock:taken';
      let second_attempt;
      let value_after;

      before(async function () {
        await redis.set_nx(key, 'owner-1', 30);
        second_attempt = await redis.set_nx(key, 'owner-2', 30);
        value_after = await redis.get(key);
      });

      it('should fail to acquire the lock', () => {
        return expect(second_attempt).to.equal(false);
      });

      it('should not overwrite the existing owner', () => {
        return expect(value_after).to.equal('owner-1');
      });
    });

    describe('with a custom unit (PX)', () => {
      const key = 'lock:px';
      let response;
      let value_after_expiry;

      before(async function () {
        response = await redis.set_nx(key, 'owner-1', 200, 'PX');
        await delay(300);
        value_after_expiry = await redis.get(key);
      });

      it('should acquire the lock', () => {
        return expect(response).to.equal(true);
      });

      it('should expire the lock after the millisecond TTL elapses', () => {
        return expect(value_after_expiry).to.equal(null);
      });
    });
  });

  describe('delete_if_equals', () => {
    describe('when the value matches', () => {
      const key = 'lock:release-match';
      let response;
      let value_after;

      before(async function () {
        await redis.set(key, 'owner-1');
        response = await redis.delete_if_equals(key, 'owner-1');
        value_after = await redis.get(key);
      });

      it('should release the lock', () => {
        return expect(response).to.equal(true);
      });

      it('should delete the key', () => {
        return expect(value_after).to.equal(null);
      });
    });

    describe('when the value does not match', () => {
      const key = 'lock:release-mismatch';
      let response;
      let value_after;

      before(async function () {
        await redis.set(key, 'owner-1');
        response = await redis.delete_if_equals(key, 'owner-2');
        value_after = await redis.get(key);
      });

      it('should not release the lock', () => {
        return expect(response).to.equal(false);
      });

      it('should leave the key untouched', () => {
        return expect(value_after).to.equal('owner-1');
      });
    });
  });
});
