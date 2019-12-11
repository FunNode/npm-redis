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

  describe('Set zlist', () => {
    describe('With 1 element', () => {
      const key = 'zlist';
      const value1 = 'one';
      const score = 1;

      let err = null
      let response;

      before(async function () {
        try {
          response = await redis.set_zlist(key, value1, score);
        }
        catch (e) {
          err = e;
        }
      });

      it('should not return error', () => {
        return expect(err).to.be.a('null');
      });

      it('should return length of the zlist', () => {
        return expect(response).to.be.a('number');
      });
    });
  });

  describe('Delete value from zlist', () => {
    const key = 'zlist';
    const value = 'one';
    let err = null
    let response;
    let responseAfterDelete;

    before(async function () {
      try {
        response = await redis.delete_zlist(key, value);
        responseAfterDelete = await redis.get_zlist(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return a number', () => {
      return expect(response).to.be.a('number');
    });

    it('should not include one', () => {
      return expect(responseAfterDelete).to.not.include('one');
    });
  });
});
