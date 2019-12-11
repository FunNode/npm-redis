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

  describe('Add values to set', () => {
    const key = 'myset';
    const value = 'one';
    let err = null;
    let response;

    before(async function () {
      try {
        response = await redis.set_set(key, value);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return number of elements added to the set', () => {
      expect(response).to.be.a('number');
      return expect(response).to.equal(1);
    });
  });

  describe('Get set values', () => {
    const key = 'myset';
    let err = null;
    let response;

    before(async function () {
      try {
        response = await redis.get_set(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return all the values of set', () => {
      expect(response).to.be.an('array');
      return expect(response).to.eql(['one']);
    });
  });

  describe('Remove random value from set', () => {
    const key = 'myset';
    let err = null;
    let response;

    before(async function () {
      try {
        response = redis.pop_set(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should remove one or more random values', () => {
      return expect(response).to.exist;
    });
  });

  describe('Delete key based value from set', () => {
    const key = 'myset';
    const value = 'one';
    let err = null;
    let response;

    before(async function () {
      try {
        response = await redis.delete_set(key, value);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return number of values removed from the set', () => {
      return expect(response).to.be.a('number');
    });
  });
});
