/* eslint-disable brace-style, camelcase, semi */
/* eslint-env mocha */
require('dotenv').config();

var chai = require('chai');
var expect = chai.expect;
var redis;

redis = new (require('./index.js'))();

function check_no_error (err, callback) {
  expect(err).to.be.a('null');
  callback();
}

describe('Redis', () => {
  describe('Connect', () => {
    it('should connect and return no object', (done) => {
      let connect = redis.connect();
      expect(connect).to.be.an('undefined');
      done();
    });
  });

  describe('Set key value', () => {
    describe('Set key value without expire time', () => {
      let key = 'color';
      let value = 'red';
      let err, response;
      redis.set(key, value, false, (error, data) => {
        err = error;
        response = data;
      });

      it('should not return error', (done) => {
        check_no_error(err, done);
      });

      it('should return OK', (done) => {
        expect(response).to.equal('OK');
        done();
      });
    });

    describe('Set key value with expire time', () => {
      let key = 'hobby';
      let value = 'driving';
      let err, response;
      redis.set(key, value, 100, (error, data) => {
        err = error;
        response = data;
      });

      it('should not return error', (done) => {
        expect(err).to.be.a('null');
        done();
      });

      it('should return OK', (done) => {
        expect(response).to.equal('OK');
        done();
      });

      it('should get null value', (done) => {
        setTimeout(() => {
          redis.get(key, (error, data) => {
            expect(data).to.equal(null);
            done();
          });
        }, 105);
      });
    });

    describe('Set key and object value', () => {
      let key = 'game';
      let value = {
        'name': 'spades'
      };
      let err, response;
      redis.set(key, value, false, (error, data) => {
        err = error;
        response = data;
      });

      it('should not return error', (done) => {
        expect(err).to.be.a('null');
        done();
      });

      it('should return OK', (done) => {
        expect(response).to.equal('OK');
        done();
      });
    });
  });

  describe('Get key value', () => {
    let key = 'color';
    let err, response;
    redis.get(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should return value without an error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return value red', (done) => {
      expect(response).to.equal('red');
      done();
    });
  });

  describe('Delete key', () => {
    let key = 'color';
    let err, getResponse, deleteResponse;
    redis.delete(key, (error, data) => {
      err = error;
      deleteResponse = data;
    });

    it('should not return error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return integer value', (done) => {
      expect(deleteResponse).to.be.a('number');
      done();
    });

    redis.get(key, (error, data) => {
      err = error;
      getResponse = data;
    });

    it('should return null value after deletion', (done) => {
      expect(getResponse).to.be.a('null');
      done();
    });
  });

  describe('Set list', () => {
    describe('Set list without maximum length option', () => {
      let key = 'mylist';
      let value1 = 'one';
      let err, response;
      redis.set_list(key, value1, false, (error, value, data) => {
        err = error;
        response = value;
      });

      it('should not return error', (done) => {
        expect(err).to.be.a('null');
        done();
      });

      it('should return length of the list', (done) => {
        expect(response).to.be.a('number');
        done();
      });
    });

    describe('Set list with maximum length option', () => {
      let key = 'mylist';
      let value2 = 'two';
      let err, resp;
      redis.set_list(key, value2, 1, (error, value, data) => {
        err = error;
        resp = value;
      });

      it('should not return error', (done) => {
        expect(err).to.be.a('null');
        done();
      });

      it('should return length of the list', (done) => {
        expect(resp).to.be.a('number');
        done();
      });

      it('should return length 1', (done) => {
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

    it('should not return error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return list values', (done) => {
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

    it('should not return error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return list values', (done) => {
      expect(response).to.be.a('number');
      done();
    });

    it('should not include one', (done) => {
      redis.get_list(key, (error, data) => {
        expect(data).to.not.include('one');
        done();
      });
    });
  });

  describe('Add values to set', () => {
    let key = 'myset';
    let value = 'one';
    let err, response;
    redis.set_set(key, value, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return number of elements added to the set', (done) => {
      expect(response).to.be.a('number');
      expect(response).to.equal(1);
      done();
    });
  });

  describe('Get set values', () => {
    let key = 'myset';
    let err, response;
    redis.get_set(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return all the values of set', (done) => {
      expect(response).to.be.an('array');
      expect(response).to.eql(['one']);
      done();
    });
  });

  describe('Remove random value from set', () => {
    let key = 'myset';
    let err, response;
    redis.pop_set(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should remove one or more random values', (done) => {
      expect(response).to.exist;
      done();
    });
  });

  describe('Delete key based value from set', () => {
    let key = 'myset';
    let value = 'one';
    let err, response;
    redis.delete_set(key, value, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return number of values removed from the set', (done) => {
      expect(response).to.be.a('number');
      done();
    });
  });

  describe('Increment value', () => {
    let key = 'age';
    let value = 23;
    let err, response;
    redis.set(key, value, false, (error, data) => {
      err = error;
      response = data;
    });
    redis.increment(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return incremented value', (done) => {
      expect(response).to.be.a('number');
      expect(response).to.equal(value + 1);
      done();
    });
  });

  describe('Decrement value', () => {
    let key = 'age';
    let value = 24;
    let err, response;

    redis.set(key, value, false, (error, data) => {
    });

    redis.decrement(key, (error, data) => {
      err = error;
      response = data;
    });

    it('should not return error', (done) => {
      expect(err).to.be.a('null');
      done();
    });

    it('should return decremented value', (done) => {
      expect(response).to.be.a('number');
      expect(response).to.equal(23);
      done();
    });
  });

  describe('Delete all keys of current DB', () => {
    redis.delete_all();

    it('should delete all the keys', (done) => {
      done();
    });
  });
});
