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
  describe('Increment value', () => {
    const key = 'age';
    const value = 23;
    let err, response;

    redis.set(key, value, false, (error, data) => {
      err = error;
      response = data;
    });
    redis.increment(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return incremented value', done => {
      expect(response).to.be.a('number');
      expect(response).to.equal(value + 1);
      done();
    });
  });

  describe('Decrement value', () => {
    const key = 'age';
    const value = 24;
    let err, response;

    redis.set(key, value, false, (error, data) => {
      err = error;
      response = data;
    });

    redis.decrement(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return decremented value', done => {
      expect(response).to.be.a('number');
      expect(response).to.equal(23);
      done();
    });
  });

  describe('Delete all keys of current DB', () => {
    redis.delete_all();

    it('should delete all the keys', done => {
      done();
    });
  });
});
