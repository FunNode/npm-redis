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
  let evalStub;
  let expire;
  let del;
  let lrange;
  let llen;
  let lpop;
  let rpush;
  let ltrim;
  let lrem;
  let zrange;
  let zrangebyscore;
  let zremrangebyscore;
  let zadd;
  let zrem;
  let sadd;
  let smembers;
  let spop;
  let srem;
  let flushdb;
  let scan;
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
      eval: evalStub,
      expire,
      del,
      lrange,
      llen,
      lpop,
      rpush,
      ltrim,
      lrem,
      zrange,
      zrangebyscore,
      zremrangebyscore,
      zadd,
      zrem,
      sadd,
      smembers,
      spop,
      srem,
      flushdb,
      scan,
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
    evalStub = sandbox.stub().resolves('eval');
    expire = sandbox.stub().resolves('setex');
    del = sandbox.stub().resolves('del');
    lrange = sandbox.stub().resolves('lrange');
    llen = sandbox.stub().resolves('llen');
    lpop = sandbox.stub().resolves('lpop');
    rpush = sandbox.stub().resolves('rpush');
    ltrim = sandbox.stub().resolves('ltrim');
    lrem = sandbox.stub().resolves('lrem');
    zrange = sandbox.stub().resolves('zrange');
    zrangebyscore = sandbox.stub().resolves('zrangebyscore');
    zremrangebyscore = sandbox.stub().resolves('zremrangebyscore');
    zadd = sandbox.stub().resolves('zadd');
    zrem = sandbox.stub().resolves('zrem');
    sadd = sandbox.stub().resolves('sadd');
    smembers = sandbox.stub().resolves('smembers');
    spop = sandbox.stub().resolves('spop');
    srem = sandbox.stub().resolves('srem');
    flushdb = sandbox.stub().resolves('flushdb');
    scan = sandbox.stub().resolves(['0', []]);
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

  it('sets nx when key is available', async function () {
    set = sandbox.stub().resolves('OK');
    inject();
    await redis.connect();
    const res = await redis.set_nx(key, value, expiration);
    expect(res).to.equal(true);
    expect(set).to.have.been.calledWith(key, value, 'EX', expiration, 'NX');
  });

  it('sets nx when key is already taken', async function () {
    set = sandbox.stub().resolves(null);
    inject();
    await redis.connect();
    const res = await redis.set_nx(key, value, expiration);
    expect(res).to.equal(false);
  });

  it('sets nx with a custom unit', async function () {
    set = sandbox.stub().resolves('OK');
    inject();
    await redis.connect();
    await redis.set_nx(key, value, expiration, 'PX');
    expect(set).to.have.been.calledWith(key, value, 'PX', expiration, 'NX');
  });

  it('deletes if equals when value matches', async function () {
    evalStub = sandbox.stub().resolves(1);
    inject();
    await redis.connect();
    const res = await redis.delete_if_equals(key, value);
    expect(res).to.equal(true);
    expect(evalStub).to.have.been.calledWith(sinon.match.string, 1, key, value);
  });

  it('does not delete if equals when value does not match', async function () {
    evalStub = sandbox.stub().resolves(0);
    inject();
    await redis.connect();
    const res = await redis.delete_if_equals(key, value);
    expect(res).to.equal(false);
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
    expect(rpush).to.have.been.calledWith(key, value);
    expect(ltrim).to.not.have.been.called;
  });

  it('sets list with max length', async function () {
    await redis.connect();
    await redis.set_list(key, value, 10);
    expect(rpush).to.have.been.calledWith(key, value);
    expect(ltrim).to.have.been.calledWith(key, -10, -1);
  });

  it('deletes list', async function () {
    await redis.connect();
    await redis.delete_list(key, value, 10);
    expect(lrem).to.have.been.calledWith(key, 10, value);
  });

  it('gets zlist with default full range', async function () {
    await redis.connect();
    const res = await redis.get_zlist(key);
    expect(res).to.eql('zrangebyscore');
    expect(zrangebyscore).to.have.been.calledWith(key, '-inf', '+inf');
  });

  it('gets zlist within a score range', async function () {
    await redis.connect();
    await redis.get_zlist(key, 100, 200);
    expect(zrangebyscore).to.have.been.calledWith(key, 100, 200);
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

  it('scans keys matching a pattern in a single page', async function () {
    scan = sandbox.stub().resolves(['0', ['match:1', 'match:2']]);
    inject();
    await redis.connect();
    const keys = await redis.scan_keys('match:*');
    expect(keys).to.eql(['match:1', 'match:2']);
    expect(scan).to.have.been.calledWith('0', 'MATCH', 'match:*', 'COUNT', 100);
  });

  it('scans keys across multiple pages until the cursor returns to 0', async function () {
    scan = sandbox.stub();
    scan.onCall(0).resolves(['5', ['match:1']]);
    scan.onCall(1).resolves(['0', ['match:2']]);
    inject();
    await redis.connect();
    const keys = await redis.scan_keys('match:*', 50);
    expect(keys).to.eql(['match:1', 'match:2']);
    expect(scan.firstCall).to.have.been.calledWith('0', 'MATCH', 'match:*', 'COUNT', 50);
    expect(scan.secondCall).to.have.been.calledWith('5', 'MATCH', 'match:*', 'COUNT', 50);
  });
});
