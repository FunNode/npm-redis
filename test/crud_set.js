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
  describe('Add values to set', () => {
    const key = 'myset';
    const value = 'one';
    let err, response;

    redis.set_set(key, value, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return number of elements added to the set', done => {
      expect(response).to.be.a('number');
      expect(response).to.equal(1);
      done();
    });
  });

  describe('Get set values', () => {
    const key = 'myset';
    let err, response;

    redis.get_set(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return all the values of set', done => {
      expect(response).to.be.an('array');
      expect(response).to.eql(['one']);
      done();
    });
  });

  describe('Remove random value from set', () => {
    const key = 'myset';
    let err, response;

    redis.pop_set(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should remove one or more random values', done => {
      expect(response).to.exist;
      done();
    });
  });

  describe('Delete key based value from set', () => {
    const key = 'myset';
    const value = 'one';
    let err, response;

    redis.delete_set(key, value, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return number of values removed from the set', done => {
      expect(response).to.be.a('number');
      done();
    });
  });
});
