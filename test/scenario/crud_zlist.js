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

  // Regression test for a bug where get_zlist used a rank-based ZRANGE instead
  // of a score-based query, so it always returned every member of the sorted
  // set regardless of min/max, ignoring score filtering entirely.
  describe('Get zlist filtered by score', () => {
    const key = 'zlist_score_range';
    let past_due;
    let not_yet_due;

    before(async function () {
      await redis.set_zlist(key, 'past-due', 100);
      await redis.set_zlist(key, 'not-yet-due', 999999999999);

      past_due = await redis.get_zlist(key, 0, Date.now());
      not_yet_due = await redis.get_zlist(key, Date.now(), '+inf');
    });

    it('only returns members whose score has already passed', () => {
      expect(past_due).to.include('past-due');
      expect(past_due).to.not.include('not-yet-due');
    });

    it('only returns members whose score is still in the future', () => {
      expect(not_yet_due).to.include('not-yet-due');
      expect(not_yet_due).to.not.include('past-due');
    });
  });
});
