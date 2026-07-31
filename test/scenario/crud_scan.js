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

  describe('scan_keys', () => {
    describe('a single page of results', () => {
      let keys;

      before(async function () {
        await Promise.all([
          redis.set('scan:single:a', '1'),
          redis.set('scan:single:b', '1'),
          redis.set('scan:single:c', '1'),
          redis.set('scan:other:x', '1')
        ]);
        keys = await redis.scan_keys('scan:single:*');
      });

      it('should return exactly the matching keys', () => {
        expect(keys.sort()).to.eql(['scan:single:a', 'scan:single:b', 'scan:single:c']);
      });
    });

    describe('multiple pages of results', () => {
      let keys;
      const expected = [];

      before(async function () {
        const sets = [];
        for (let i = 0; i < 25; i++) {
          const k = `scan:multi:${i}`;
          expected.push(k);
          sets.push(redis.set(k, '1'));
        }
        await Promise.all(sets);
        // COUNT smaller than the number of matching keys forces the SCAN
        // cursor loop inside scan_keys to page across multiple calls.
        keys = await redis.scan_keys('scan:multi:*', 5);
      });

      it('should return every key across all pages', () => {
        expect(keys.sort()).to.eql(expected.sort());
      });
    });

    describe('no matches', () => {
      let keys;

      before(async function () {
        keys = await redis.scan_keys('scan:nonexistent:*');
      });

      it('should return an empty array', () => {
        expect(keys).to.eql([]);
      });
    });
  });
});
