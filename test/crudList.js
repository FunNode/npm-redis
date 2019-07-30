/* eslint-disable brace-style, camelcase, semi */
/* eslint-env mocha */

var chai = require('chai');
var expect = chai.expect;
var redis;

let config = {
  host: 'localhost',
  port: 'root',
  pass: ''
};

redis = new (require('../index.js'))(config.host, config.port, config.pass);

describe('Redis', () => {
  describe('Set list', () => {
    describe('Without maximum length option', () => {
      let key = 'mylist';
      let value1 = 'one';
      let err, response;

      redis.set_list(key, value1, false, (error, value, data) => {
        err = error;
        response = value;
      });

      it('should not return error', done => {
        expect(err).to.be.a('null');
        done();
      });

      it('should return length of the list', done => {
        expect(response).to.be.a('number');
        done();
      });
    });

    describe('With maximum length option', () => {
      let key = 'mylist';
      let value2 = 'two';
      let err, resp;

      redis.set_list(key, value2, 1, (error, value, data) => {
        err = error;
        resp = value;
      });

      it('should not return error', done => {
        expect(err).to.be.a('null');
        done();
      });

      it('should return length of the list', done => {
        expect(resp).to.be.a('number');
        done();
      });

      it('should return length 1', done => {
        expect(resp).to.equal(1);
        done();
      });
    });
  });

  describe('Get list', () => {
    let key = 'mylist';
    let err, response;

    redis.get_list(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return list values', done => {
      expect(response).to.be.an('array');
      done();
    });
  });

  describe('Delete value from list', () => {
    let key = 'mylist';
    let value = 'one';
    let count = 1;
    let err, response;

    redis.delete_list(key, value, count, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return list values', done => {
      expect(response).to.be.a('number');
      done();
    });

    it('should not include one', done => {
      redis.get_list(key, (error, data) => {
        expect(data).to.not.include('one');
        done();
      });
    });
  });
});
