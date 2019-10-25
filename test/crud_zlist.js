/* eslint-disable brace-style, camelcase, semi */
/* eslint-env mocha */

var chai = require('chai');
var expect = chai.expect;
var redis;

const config = {
  host: 'localhost',
  port: 'root',
  pass: ''
};

redis = new (require('../index.js'))(config.host, config.port, config.pass);

describe('Redis', () => {
  describe('Set zlist', () => {
    describe('With 1 element', () => {
      const key = 'myzlist';
      const value1 = 'one';
      const score = 1;

      let err, response;

      redis.set_zlist(key, value1, score, (error, value) => {
        err = error;
        response = value;
      });

      it('should not return error', done => {
        expect(err).to.be.a('null');
        done();
      });

      it('should return length of the zlist', done => {
        expect(response).to.be.a('number');
        done();
      });
    });
  });

  describe('Delete value from zlist', () => {
    const key = 'myzlist';
    const value = 'one';
    let err, response;

    redis.delete_zlist(key, value, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return a number', done => {
      expect(response).to.be.a('number');
      done();
    });

    it('should not include one', done => {
      redis.get_zlist(key, (err, data) => {
        expect(err).to.be.a('null');
        expect(data).to.not.include('one');
        done();
      });
    });
  });
});
