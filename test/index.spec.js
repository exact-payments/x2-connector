/* global describe it expect */

const fetchMock   = require('fetch-mock');
const x2Connector = require('../src');

describe('HTTP -> http', () => {

  it('extends from EventEmitter class so it should have the "emit" and "on" methods available', () => {
    expect(x2Connector.emit).toBeTruthy();
    expect(x2Connector.on).toBeTruthy();
  });

  it('Initialize attributes', () => {
    expect(x2Connector.token).toBe(null);
    expect(x2Connector.tokenExpiriesAt).toBe(null);
    expect(x2Connector.tokenDuration).toBe(1000 * 60 * 20);

    expect(x2Connector._baseUrl).toEqual('http://localhost:8080');
    expect(x2Connector._middlewares).toEqual({});

    expect(x2Connector._inactivityCheckInterval).toBe(null);
    expect(x2Connector._inactivityTimeout).toBe(null);
    expect(x2Connector._pageActivityDetected).toBeFalsy();
    expect(x2Connector._watchForPageActivity).toBeFalsy();
  });

  describe('init', () => {
    it('Initilize default attributes', () => {
      const baseUrl = 'http://localhost:8080';

      x2Connector.init({ middlewares: [() => {}], baseUrl });

      expect(x2Connector._baseUrl).toBe(baseUrl);
    });
  });

  describe('get', () => {
    it('makes a GET request to baseURL + path', () => {
      fetchMock.mock('http://localhost:8080/foo', {
        status: 200,
        body  : { foo: 'bar' }
      });

      x2Connector.get('/foo')
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

      x2Connector.post('/foo')
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

      x2Connector.put('/foo')
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

      x2Connector.delete('/foo')
      .then((res) => {
        expect(res).toBe({ foo: 'bar' });
        fetchMock.restore();
      });
    });
  });
});
