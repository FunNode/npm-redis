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

  describe('Set list', () => {
    describe('Without maximum length option', async () => {
      const key = 'mylist_1';
      const value1 = 'one';
      let err = null;
      let response;

      before(async function () {
        try {
          response = await redis.set_list(key, value1, false);
        }
        catch (e) {
          err = e;
        }
      });

      it('should not return error', () => {
        return expect(err).to.be.a('null');
      });

      it('should return length of the list', () => {
        return expect(response).to.be.a('number');
      });
    });

    describe('With maximum length option', async () => {
      const key = 'mylist_2';
      const value1 = 'one';
      let err = null;
      let response;

      before(async function () {
        try {
          response = await redis.set_list(key, value1, 1);
        }
        catch (e) {
          err = e;
        }
      });

      it('should not return error', () => {
        return expect(err).to.be.a('null');
      });

      it('should return length of the list', () => {
        return expect(response).to.be.a('number');
      });

      it('should return length 1', async () => {
        const data = await redis.get_list(key);
        return expect(data.length).to.equal(1);
      });
    });
  });

  describe('Get list', async () => {
    const key = 'mylist_1';
    let err = null;
    let response;

    before(async function () {
      try {
        response = await redis.get_list(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      expect(err).to.be.a('null');
    });

    it('should return list values', () => {
      expect(response).to.be.an('array');
    });
  });

  describe('Delete value from list', async () => {
    const key = 'mylist_1';
    const value = 'one';
    const count = 1;
    let err = null;
    let response, responseList;

    before(async function () {
      try {
        response = await redis.delete_list(key, value, count);
        responseList = await redis.get_list(key);
      }
      catch (e) {
        err = e;
      }
    });

    it('should not return error', () => {
      return expect(err).to.be.a('null');
    });

    it('should return list values', () => {
      return expect(response).to.be.a('number');
    });

    it('should not include one', () => {
      return expect(responseList).to.not.include('one');
    });
  });
});
