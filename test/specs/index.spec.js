/* global describe it expect */

import fetchMock   from 'fetch-mock';
import trae        from 'trae';
import x2Connector from '../../src';

describe('HTTP -> http', () => {

  const baseUrl = 'http://localhost:8080';

  it('extends from EventEmitter class so it should have the "emit" and "on" methods available', () => {
    expect(x2Connector.emit).toBeTruthy();
    expect(x2Connector.on).toBeTruthy();
  });

  it('Initialize attributes', () => {
    expect(x2Connector.token).toEqual(null);
    expect(x2Connector.tokenExpiriesAt).toBe(null);
    expect(x2Connector._tokenDuration).toBe(1000 * 60 * 20);

    expect(x2Connector._inactivityCheckInterval).toBe(null);
    expect(x2Connector._inactivityTimeout).toBe(null);
    expect(x2Connector._pageActivityDetected).toBeFalsy();
    expect(x2Connector._watchForPageActivity).toBeFalsy();
  });

  describe('init()', () => {
    it('Initilize default attributes', () => {
      const httpConfig = { baseUrl };

      return x2Connector.init({ httpConfig })
      .then(() => {
        expect(trae.baseUrl()).toBe(baseUrl);
      });
    });
  });

  describe('get()', () => {
    it('makes a GET request to baseURL + path and responds 200 status code', () => {
      fetchMock.mock(`${baseUrl}/foo`, {
        status : 200,
        body   : { foo: 'bar' },
        headers: { 'Content-Type': 'application/json' }
      });

      return x2Connector.get('/foo')
      .then((res) => {
        expect(res).toEqual({ foo: 'bar' });
        fetchMock.restore();
      });
    });
  });

  describe('post()', () => {
    it('makes a POST request to baseURL + path', () => {
      fetchMock.mock(`${baseUrl}/foo`, {
        status : 200,
        body   : { foo: 'bar' },
        headers: { 'Content-Type': 'application/json' }
      }, {
        method: 'POST'
      });

      return x2Connector.post('/foo')
      .then((res) => {
        expect(res).toEqual({ foo: 'bar' });
        fetchMock.restore();
      });
    });
  });

  describe('put()', () => {
    it('makes a PUT request to baseURL + path', () => {
      fetchMock.mock(`${baseUrl}/foo`, {
        status : 200,
        body   : { foo: 'bar' },
        headers: { 'Content-Type': 'application/json' }
      }, {
        method: 'PUT'
      });

      return x2Connector.put('/foo')
      .then((res) => {
        expect(res).toEqual({ foo: 'bar' });
        fetchMock.restore();
      });
    });
  });

  describe('delete()', () => {
    it('makes a DEL request to baseURL + path', () => {
      fetchMock.mock(`${baseUrl}/foo`, {
        status: 200,
        body   : { foo: 'bar' },
        headers: { 'Content-Type': 'application/json' }
      }, {
        method: 'DELETE'
      });

      return x2Connector.delete('/foo')
      .then((res) => {
        expect(res).toEqual({ foo: 'bar' });
        fetchMock.restore();
      });
    });
  });

  describe('login()', () => {
    it('makes a post to /token through X2 API to login', () => {
      fetchMock.mock(`${baseUrl}/token`, {
        status : 200,
        body   : { token: '1234' },
        headers: { 'Content-Type': 'application/json' }
      }, {
        method: 'POST'
      });

      return x2Connector.login('user', 'password')
      .then((res) => {
        expect(x2Connector.token).toBe('1234');
      });
    });
  });

  describe('getEnvironment()', () => {
    it('returns the current environment', () => {
      expect(x2Connector.getEnvironment()).toBe('DEV');
    });
  });

  describe('isProd()', () => {
    it('returns false if current environment is not PROD', () => {
      expect(x2Connector.isProd()).toBe(false);
    });
  });
});
