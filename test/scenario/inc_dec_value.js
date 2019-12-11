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

  describe('Increment value', () => {
    const key = 'age';
    const value = 23;
    let err = null;
    let response;

    before(async function () {
      try {
        response = await redis.set(key, value, false);
        response = await redis.increment(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return incremented value', () => {
      expect(response).to.be.a('number');
      return expect(response).to.equal(value + 1);
    });
  });

  describe('Decrement value', () => {
    const key = 'age';
    const value = 24;
    let err = null;
    let response;

    before(async function () {
      try {
        response = await redis.set(key, value, false);
        response = await redis.decrement(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return decremented value', () => {
      expect(response).to.be.a('number');
      return expect(response).to.equal(23);
    });
  });

  describe('Get ttl', () => {
    const key = 'ttl';
    const value = 10;
    let err = null;
    let response;

    before(async function () {
      try {
        response = await redis.set(key, value, false);
        response = await redis.get_ttl(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return time to live equals -1', () => {
      expect(response).to.be.a('number');
      return expect(response).to.equal(-1);
    });
  });

  describe('Delete all keys of current DB', () => {
    before(async function () {
      await redis.delete_all();
    });

    it('should delete all the keys', () => {});
  });
});
