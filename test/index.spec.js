/* global describe it expect */

const fetchMock = require('fetch-mock');
const http      = require('../src');

describe('HTTP -> http', () => {

  it('extends from EventEmitter class so it should have the "emit" and "on" methods available', () => {
    expect(http.emit).toBeTruthy();
    expect(http.on).toBeTruthy();
  });

  it('Initilizes attributes', () => {
    expect(http.token).toBe(null);
    expect(http.tokenExpiriesAt).toBe(null);

    expect(http._baseUrl).toEqual('');
    expect(http._middlewares).toEqual([]);

    expect(http._inactivityCheckInterval).toBe(null);
    expect(http._inactivityTimeout).toBe(null);
    expect(http._pageActivityDetected).toBeFalsy();
    expect(http._watchForPageActivity).toBeFalsy();
  });

  describe('init', () => {
    it('Initilize default attributes', () => {
      const baseUrl = 'http://localhost:8080';

      http.init({ middlewares: [() => {}], baseUrl });

      expect(http._middlewares.length).toBe(1);
      expect(http._baseUrl).toBe(baseUrl);
    });
  });

  describe('get', () => {
    it('makes a GET request to baseURL + path', () => {
      fetchMock.mock('http://localhost:8080/foo', {
        status: 200,
        body  : { foo: 'bar' }
      });

      http.get('/foo')
      .then((res) => {
        expect(res).toBe({ foo: 'bar' });
        fetchMock.restore();
      });
    });
  });

  describe('post', () => {
    it('makes a POST request to baseURL + path', () => {
      fetchMock.mock('http://localhost:8080/foo', {
        status: 200,
        body  : { foo: 'bar' }
      }, {
        method: 'POST'
      });

      http.post('/foo')
      .then((res) => {
        expect(res).toBe({ foo: 'bar' });
        fetchMock.restore();
      });
    });
  });

  describe('put', () => {
    it('makes a PUT request to baseURL + path', () => {
      fetchMock.mock('http://localhost:8080/foo', {
        status: 200,
        body  : { foo: 'bar' }
      }, {
        method: 'PUT'
      });

      http.put('/foo')
      .then((res) => {
        expect(res).toBe({ foo: 'bar' });
        fetchMock.restore();
      });
    });
  });

  describe('del', () => {
    it('makes a DEL request to baseURL + path', () => {
      fetchMock.mock('http://localhost:8080/foo', {
        status: 200,
        body  : { foo: 'bar' }
      }, {
        method: 'DELETE'
      });

      http.del('/foo')
      .then((res) => {
        expect(res).toBe({ foo: 'bar' });
        fetchMock.restore();
      });
    });
  });

  describe('_runMiddlewares', () => {
    it('runs provided middlewares', () => {
      const config     = { headers: { foo: 'foo' } };
      const newConfig  = { headers: { foo: 'bar' } };
      const middleware = (config) => { config.headers.foo = 'bar'; };

      http._middlewares.push(middleware);

      expect(http._runMiddlewares(config)).toEqual(newConfig);
    });
  });
});
