/* eslint-env mocha */
const chai = require('chai');
const { expect } = chai;
const sinon = require('sinon');
const proxyquire = require('proxyquire');

chai.use(require('sinon-chai'));
chai.use(require('chai-as-promised'));

describe('Redis', function () {
  const host = 'host';
  const port = 'port';
  const pass = 'pass';
  const db = 'db';
  const key = 'key';
  const value = 'value';
  const expiration = 60;

  let sandbox;
  let on;
  let quit;
  let get;
  let set;
  let expire;
  let del;
  let lrange;
  let llen;
  let lpop;
  let rpush;
  let lrem;
  let zrange;
  let zremrangebyscore;
  let zadd;
  let zrem;
  let sadd;
  let smembers;
  let spop;
  let srem;
  let flushdb;
  let incr;
  let decr;
  let ttl;
  let createClient;
  let redislib;
  let Redis;
  let redis;

  function inject () {
    createClient = sandbox.stub().resolves({
      on,
      quit,
      get,
      set,
      expire,
      del,
      lrange,
      llen,
      lpop,
      rpush,
      lrem,
      zrange,
      zremrangebyscore,
      zadd,
      zrem,
      sadd,
      smembers,
      spop,
      srem,
      flushdb,
      incr,
      decr,
      ttl
    });
    redislib = { createClient };
    Redis = proxyquire('../../index', {
      'async-redis': redislib
    });
    redis = new Redis(host, port, pass, db);
  }

  beforeEach(async function () {
    sandbox = sinon.createSandbox();
    on = sandbox.stub();
    quit = sandbox.stub().resolves();
    get = sandbox.stub().resolves('get');
    set = sandbox.stub().resolves('set');
    expire = sandbox.stub().resolves('setex');
    del = sandbox.stub().resolves('del');
    lrange = sandbox.stub().resolves('lrange');
    llen = sandbox.stub().resolves('llen');
    lpop = sandbox.stub().resolves('lpop');
    rpush = sandbox.stub().resolves('rpush');
    lrem = sandbox.stub().resolves('lrem');
    zrange = sandbox.stub().resolves('zrange');
    zremrangebyscore = sandbox.stub().resolves('zremrangebyscore');
    zadd = sandbox.stub().resolves('zadd');
    zrem = sandbox.stub().resolves('zrem');
    sadd = sandbox.stub().resolves('sadd');
    smembers = sandbox.stub().resolves('smembers');
    spop = sandbox.stub().resolves('spop');
    srem = sandbox.stub().resolves('srem');
    flushdb = sandbox.stub().resolves('flushdb');
    incr = sandbox.stub().resolves('incr');
    decr = sandbox.stub().resolves('decr');
    ttl = sandbox.stub().resolves('ttl');
    inject();
  });

  afterEach(function () {
    sandbox.restore();
  });

  it('constructs', function () {
    Object.entries({
      host,
      port,
      pass,
      db,
      ready: false
    }).forEach(([k, v]) => expect(redis[k]).to.eql(v));
  });

  it('constructs with default vhost', function () {
    redis = new Redis(host, port, pass);
    expect(redis.db).to.eql(0);
  });

  it('connects', async function () {
    await redis.connect();
    expect(createClient).to.have.been.calledWith(sinon.match({
      host,
      port,
      password: pass,
      db
    }));
  });

  it('does not connect if already connected', async function () {
    redis.ready = true;
    await redis.connect();
    expect(createClient).to.not.have.been.called;
  });

  it('connects and sets ready', async function () {
    await redis.connect();
    const readyCallback = on.args[0][1];
    readyCallback();
    expect(redis.ready).to.be.true;
  });

  it('reconnects on connection lost', async function () {
    await redis.connect();
    const errorCallback = on.args[1][1];
    // Trigger error callback which sets ready to false but doesn't auto-reconnect anymore
    await errorCallback({});
    expect(redis.ready).to.be.false;
    expect(createClient).to.have.been.calledOnce;
  });

  it('disconnects', async function () {
    await redis.connect();
    await redis.disconnect();
    expect(createClient).to.have.been.calledOnce;
    expect(quit).to.have.been.calledOnce;
  });

  it('gets', async function () {
    await redis.connect();
    const res = await redis.get(key);
    expect(res).to.eql('get');
    expect(get).to.have.been.calledWith(key);
  });

  it('fails to get', async function () {
    get = sandbox.stub().rejects({ error: 'error' });
    inject();
    await redis.connect();
    return redis.get(key)
      .then(() => expect.fail())
      .catch((err) => expect(err).to.eql({ error: 'error' }));
  });

  it('sets', async function () {
    await redis.connect();
    await redis.set(key, value);
    expect(set).to.have.been.calledWith(key, value);
  });

  it('sets with object', async function () {
    await redis.connect();
    await redis.set(key, { value });
    expect(set).to.have.been.calledWith(key, JSON.stringify({ value }));
  });

  it('sets to undefined if object cannot be stringified', async function () {
    const oriStringify = JSON.stringify;
    JSON.stringify = () => {
      throw new Error();
    };
    await redis.connect();
    await redis.set(key, { value });
    expect(set).to.have.been.calledWith(key, undefined);
    JSON.stringify = oriStringify; // eslint-disable-line require-atomic-updates
  });

  it('sets with expiration', async function () {
    await redis.connect();
    await redis.set(key, value, expiration);
    expect(set).to.have.been.calledWith(key, value, 'EX', expiration);
  });

  it('sets ignoring not numeric expiration', async function () {
    await redis.connect();
    await redis.set(key, value, '');
    expect(set).to.have.been.calledWith(key, value);
  });

  it('sets expiration', async function () {
    await redis.connect();
    await redis.set(key, undefined, expiration);
    expect(expire).to.have.been.calledWith(key, expiration);
  });

  it('deletes', async function () {
    await redis.connect();
    await redis.delete(key);
    expect(del).to.have.been.calledWith(key);
  });

  it('gets list', async function () {
    await redis.connect();
    const res = await redis.get_list(key);
    expect(res).to.eql('lrange');
    expect(lrange).to.have.been.calledWith(key);
  });

  it('sets list', async function () {
    await redis.connect();
    await redis.set_list(key, value, false);
    expect(llen).to.not.have.been.called;
    expect(lpop).to.not.have.been.called;
    expect(rpush).to.have.been.calledWith(key, value);
  });

  it('sets list with max length not exceeded', async function () {
    llen = sandbox.stub().resolves(9);
    inject();
    await redis.connect();
    await redis.set_list(key, value, 10);
    expect(llen).to.have.been.calledWith(key);
    expect(lpop).to.not.have.been.called;
    expect(rpush).to.have.been.calledWith(key, value);
  });

  it('sets list with max length exceeded', async function () {
    llen = sandbox.stub().resolves(10);
    inject();
    await redis.connect();
    await redis.set_list(key, value, 10);
    expect(llen).to.have.been.calledWith(key);
    expect(lpop).to.have.been.calledWith(key);
    expect(rpush).to.have.been.calledWith(key, value);
  });

  it('deletes list', async function () {
    await redis.connect();
    await redis.delete_list(key, value, 10);
    expect(lrem).to.have.been.calledWith(key, 10, value);
  });

  it('gets zlist', async function () {
    await redis.connect();
    const res = await redis.get_zlist(key);
    expect(res).to.eql('zrange');
    expect(zrange).to.have.been.calledWith(key);
  });

  it('remove from zlist', async function () {
    await redis.connect();
    await redis.rem_from_zlist(key, 'min', 'max');
    expect(zremrangebyscore).to.have.been.calledWith(key, 'min', 'max');
  });

  it('sets zlist', async function () {
    await redis.connect();
    await redis.set_zlist(key, value, 'score');
    expect(zadd).to.have.been.calledWith(key, 'score', value);
  });

  it('deletes zlist', async function () {
    await redis.connect();
    await redis.delete_zlist(key, value);
    expect(zrem).to.have.been.calledWith(key, value);
  });

  it('sets set', async function () {
    await redis.connect();
    await redis.set_set(key, value);
    expect(sadd).to.have.been.calledWith(key, value);
  });

  it('gets set', async function () {
    await redis.connect();
    const res = await redis.get_set(key);
    expect(res).to.eql('smembers');
    expect(smembers).to.have.been.calledWith(key);
  });

  it('pops set', async function () {
    await redis.connect();
    const res = await redis.pop_set(key);
    expect(res).to.eql('spop');
    expect(spop).to.have.been.calledWith(key);
  });

  it('deletes set', async function () {
    await redis.connect();
    await redis.delete_set(key, value);
    expect(srem).to.have.been.calledWith(key, value);
  });

  it('increments', async function () {
    await redis.connect();
    const res = await redis.increment(key);
    expect(res).to.eql('incr');
    expect(incr).to.have.been.calledWith(key);
  });

  it('decrements', async function () {
    await redis.connect();
    const res = await redis.decrement(key);
    expect(res).to.eql('decr');
    expect(decr).to.have.been.calledWith(key);
  });

  it('gets ttl', async function () {
    await redis.connect();
    const res = await redis.get_ttl(key);
    expect(res).to.eql('ttl');
    expect(ttl).to.have.been.calledWith(key);
  });

  it('deletes all', async function () {
    await redis.connect();
    await redis.delete_all();
    expect(flushdb).to.have.been.called;
  });
});
