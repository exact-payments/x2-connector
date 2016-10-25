/* global describe it */

import fetchMock from 'fetch-mock';
import assert    from 'assert';
import http      from '../../src';

describe('HTTP -> http', () => {

  it('extends from EventEmitter class so it should have the "emit" and "on" methods available', () => {
    assert.ok(http.emit);
    assert.ok(http.on);
  });

  describe('init', () => {
    it('Initilize default attributes', () => {
      const baseURL = 'http://localhost:8080';

      http.init({ middlewares: [() => {}], baseURL });

      assert.equal(http._middlewares.length, 1);
      assert.equal(http._baseUrl, baseURL);
    });
  });

  describe('get', async () => {
    it('makes a GET request to baseURL + path', async () => {
      fetchMock.mock('http://localhost:8080/foo', {
        status: 200,
        body  : { foo: 'bar' }
      });

      const res = await http.get('/foo');

      assert.deepEqual(res, { foo: 'bar' });
      fetchMock.restore();
    });
  });

  describe('post', () => {
    it('call the axios POST method', async () => {
      fetchMock.mock('http://localhost:8080/foo', {
        status: 200,
        body  : { foo: 'bar' }
      }, {
        method: 'POST'
      });

      const res = await http.post('/foo');

      assert.deepEqual(res, { foo: 'bar' });
      fetchMock.restore();
    });
  });

  describe('put', () => {
    it('call the axios PUT method', async () => {
      fetchMock.mock('http://localhost:8080/foo', {
        status: 200,
        body  : { foo: 'bar' }
      }, {
        method: 'PUT'
      });

      const res = await http.put('/foo');

      assert.deepEqual(res, { foo: 'bar' });
      fetchMock.restore();
    });
  });

  describe('del', () => {
    it('call the axios DELETE method', async () => {
      fetchMock.mock('http://localhost:8080/foo', {
        status: 200,
        body  : { foo: 'bar' }
      }, {
        method: 'DELETE'
      });

      const res = await http.del('/foo');

      assert.deepEqual(res, { foo: 'bar' });
      fetchMock.restore();
    });
  });

  describe('_runMiddlewares', () => {
    it('runs a provided middleware', () => {
      const config     = { headers: { foo: 'foo' } };
      const newConfig  = { headers: { foo: 'bar' } };
      const middleware = (config) => { config.headers.foo = 'bar'; };

      http._middlewares.push(middleware);

      assert.deepEqual(http._runMiddlewares(config), newConfig);
    });
  });
});
