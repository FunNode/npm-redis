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

function check_no_error (err, callback) {
  expect(err).to.be.a('null');
  callback();
}

describe('Redis', () => {
  describe('Connect', () => {
    it('should connect and return no object', done => {
      const connect = redis.connect();
      expect(connect).to.be.an('undefined');
      done();
    });
  });

  describe('Set key value', () => {
    describe('Without expire time', () => {
      const key = 'color';
      const value = 'red';
      let err, response;

      redis.set(key, value, false, (error, data) => {
        err = error;
        response = data;
      });

      it('should not return error', done => {
        check_no_error(err, done);
      });

      it('should return OK', done => {
        expect(response).to.equal('OK');
        done();
      });
    });

    describe('With expire time', () => {
      const key = 'hobby';
      const value = 'driving';
      let err, response;

      redis.set(key, value, 100, (error, data) => {
        err = error;
        response = data;
      });

      it('should not return error', done => {
        expect(err).to.be.a('null');
        done();
      });

      it('should return OK', done => {
        expect(response).to.equal('OK');
        done();
      });

      it('should get null value', done => {
        setTimeout(() => {
          redis.get(key, (error, data) => {
            expect(data).to.equal(null);
            done();
          });
        }, 105);
      });
    });

    describe('Object value', () => {
      const key = 'game';
      const value = { name: 'spades' };
      let err, response;

      redis.set(key, value, false, (error, data) => {
        err = error;
        response = data;
      });

      it('should not return error', done => {
        expect(err).to.be.a('null');
        done();
      });

      it('should return OK', done => {
        expect(response).to.equal('OK');
        done();
      });
    });
  });

  describe('Get key value', () => {
    const key = 'color';
    let err, response;

    redis.get(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should return value without an error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return value red', done => {
      expect(response).to.equal('red');
      done();
    });
  });

  describe('Delete key', () => {
    const key = 'color';
    let err, getResponse, deleteResponse;

    redis.delete(key, (error, data) => {
      err = error;
      deleteResponse = data;
    });

    it('should not return error', done => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return integer value', done => {
      expect(deleteResponse).to.be.a('number');
      done();
    });

    redis.get(key, (error, data) => {
      err = error;
      getResponse = data;
    });

    it('should return null value after deletion', done => {
      expect(getResponse).to.be.a('null');
      done();
    });
  });
});
