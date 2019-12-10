/* eslint-env mocha */

var chai = require('chai');
var expect = chai.expect;
var config = require('./helper');
var Redis = require('../../index.js');

function delay (ms) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms));
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

  describe('Set key value', () => {
    describe('Without expire time', () => {
      const key = 'color';
      const value = 'red';
      let err = null;
      let response;

      before(async function () {
        try {
          response = await redis.set(key, value, false);
        }
        catch (e) {
          err = e;
        }
      });

      it('should not return error', () => {
        return expect(err).to.be.a('null');
      });

      it('should return OK', () => {
        return expect(response).to.equal('OK');
      });
    });

    describe('With expire time', () => {
      const key = 'hobby';
      const value = 'driving';
      let err = null;
      let response;
      let responseAfterDelay;

      before(async function () {
        try {
          response = await redis.set(key, value, 1);
          await delay(1001);
          responseAfterDelay = await redis.get(key);
        }
        catch (e) {
          err = e;
        }
      });

      it('should not return error', () => {
        return expect(err).to.be.a('null');
      });

      it('should return OK', () => {
        return expect(response).to.equal('OK');
      });

      it('should get null value', () => {
        return expect(responseAfterDelay).to.equal(null);
      });
    });

    describe('Object value', () => {
      const key = 'game';
      const value = { name: 'spades' };
      let err = null;
      let response;

      before(async function () {
        try {
          response = await redis.set(key, value, false);
        }
        catch (e) {
          err = e;
        }
      });

      it('should not return error', () => {
        return expect(err).to.be.a('null');
      });

      it('should return OK', () => {
        return expect(response).to.equal('OK');
      });
    });
  });

  describe('Get key value', () => {
    const key = 'color';
    let err = null;
    let response;

    before(async function () {
      try {
        response = await redis.get(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should return value without an error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return value red', () => {
      return expect(response).to.equal('red');
    });
  });

  describe('Delete key', () => {
    const key = 'color';
    let err = null;
    let getResponse, deleteResponse;

    before(async function () {
      try {
        deleteResponse = await redis.delete(key);
        getResponse = await redis.get(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return integer value', () => {
      return expect(deleteResponse).to.be.a('number');
    });

    it('should return null value after deletion', () => {
      return expect(getResponse).to.be.a('null');
    });
  });
});
