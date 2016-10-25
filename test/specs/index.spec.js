/* global describe it sinon */

import assert from 'assert';
import http   from '../../src';

describe('HTTP -> http', () => {

  it('extends from EventEmitter class so it should have the "emit" and "on" methods available', () => {
    assert.ok(http.emit);
    assert.ok(http.on);
  });

  it('GET request creates an error when lib has not being initialized', async () => {
    try {
      await http.get('foo');
    } catch (err) {
      assert.equal(err.message, 'Library has not being initialized');
    }
  });

  it('POST request creates an error when lib has not being initialized', async () => {
    try {
      await http.post('foo', { foo: 'bar' });
    } catch (err) {
      assert.equal(err.message, 'Library has not being initialized');
    }
  });

  it('PUT request creates an error when lib has not being initialized', async () => {
    try {
      await http.put('foo');
    } catch (err) {
      assert.equal(err.message, 'Library has not being initialized');
    }
  });

  it('DEL request creates an error when lib has not being initialized', async () => {
    try {
      await http.del('foo');
    } catch (err) {
      assert.equal(err.message, 'Library has not being initialized');
    }
  });

  describe('init', () => {
    it('Initilize http attributes', () => {
      const baseURL = 'http://localhost:8080';
      const timeout = 5000;

      http.init({
        middlewares: [() => {}],
        timeout,
        baseURL
      });

      assert.equal(http._middlewares.length, 1);
      assert.equal(typeof http._axios, 'function');
    });
  });

  describe('get', () => {
    it('call the axios GET method', async () => {
      const resolved = new Promise(r => r({ data: {} }));
      sinon.stub(http._axios, 'get').returns(resolved);

      await http.get('/foo');
      sinon.assert.calledOnce(http._axios.get);
    });
  });

  describe('post', () => {
    it('call the axios POST method', async () => {
      const resolved = new Promise(r => r({ data: {} }));
      sinon.stub(http._axios, 'post').returns(resolved);

      await http.post('/foo');
      sinon.assert.calledOnce(http._axios.post);
    });
  });

  describe('put', () => {
    it('call the axios PUT method', async () => {
      const resolved = new Promise(r => r({ data: {} }));
      sinon.stub(http._axios, 'put').returns(resolved);

      await http.put('/foo');
      sinon.assert.calledOnce(http._axios.put);
    });
  });

  describe('del', () => {
    it('call the axios DELETE method', async () => {
      const resolved = new Promise(r => r({ data: {} }));
      sinon.stub(http._axios, 'delete').returns(resolved);

      await http.del('/foo');
      sinon.assert.calledOnce(http._axios.delete);
    });
  });

  describe('errorHandler', () => {
    it('returns the error, when response is an instance of error', () => {
      const err = new Error('foo');
      assert.equal(http.HTTP.errorHandler(err), `Unknown Error: ${err}`);
    });

    it('returns "Unknown Error" when response is not an instance of error and does not have a status', () => {
      assert.equal(http.HTTP.errorHandler('foo'), 'Unknown Error');
    });

    it('returns API Server Error when response status is within 500', () => {
      [500, 502, 503].forEach((status) => {
        assert.equal(http.HTTP.errorHandler({ status }), `API Server Error ${status}`);
      });
    });

    it('returns API Request Error when response status is not defined in errorHandler', () => {
      const status = 1000;
      assert.equal(http.HTTP.errorHandler({ status }), `API Request Error ${status}`);
    });

    it('returns 400x related response when status is within 400', () => {
      assert.equal(http.HTTP.errorHandler({
        status: 400,
        data  : 'foo'
      }), 'foo');

      assert.equal(http.HTTP.errorHandler({ status: 402 }), 'Error 402: You must upgrade your account to do that');
      assert.equal(http.HTTP.errorHandler({ status: 403 }), 'Error 403: You are not authorized to access that');
      assert.equal(http.HTTP.errorHandler({ status: 404 }), 'Requested Resource Not Found');
      assert.equal(http.HTTP.errorHandler({ status: 429 }), 'Rate Limited');
    });
  });
});
