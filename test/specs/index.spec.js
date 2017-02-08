/* eslint-disable max-len */
/* global describe it expect */

const trae        = require('trae');
const fetchMock   = require('fetch-mock');
const x2Connector = require('../../src');

describe('HTTP -> http', () => {

  const baseUrl = 'http://localhost:8080';

  it('extends from EventEmitter class so it should have the "emit" and "on" methods available', () => {
    expect(x2Connector.emit).toBeTruthy();
    expect(x2Connector.on).toBeTruthy();
  });

  it('initialize attributes', () => {
    expect(x2Connector.token).toEqual(null);
    expect(x2Connector.tokenExpiriesAt).toBe(null);
    expect(x2Connector._tokenDuration).toBe(1000 * 60 * 20);

    expect(x2Connector._inactivityCheckInterval).toBe(null);
    expect(x2Connector._inactivityTimeout).toBe(null);
    expect(x2Connector._pageActivityDetected).toBeFalsy();
    expect(x2Connector._watchForPageActivity).toBeFalsy();
  });

  describe('init()', () => {
    it('initialize default attributes', () => {
      const httpConfig = { baseUrl };

      return x2Connector
        .init({ httpConfig })
        .then(() => {
          expect(trae.baseUrl()).toBe(baseUrl);
        });
    });

    it('initialize attributes with config path', () => {
      const configPath = `${baseUrl}/config`;

      fetchMock.mock(configPath, {
        status : 200,
        body   : { env: 'DEV' },
        headers: { 'Content-Type': 'application/json' },
      });

      return x2Connector
        .init({ configPath })
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
        headers: { 'Content-Type': 'application/json' },
      });

      return x2Connector
        .get('/foo')
        .then((res) => {
          expect(res.data).toEqual({ foo: 'bar' });
          fetchMock.restore();
        });
    });
  });

  describe('post()', () => {
    it('makes a POST request to baseURL + path', () => {
      fetchMock.mock(`${baseUrl}/foo`, {
        status : 200,
        body   : { foo: 'bar' },
        headers: { 'Content-Type': 'application/json' },
      }, {
        method: 'POST',
      });

      return x2Connector
        .post('/foo')
        .then((res) => {
          expect(res.data).toEqual({ foo: 'bar' });
          fetchMock.restore();
        });
    });
  });

  describe('put()', () => {
    it('makes a PUT request to baseURL + path', () => {
      fetchMock.mock(`${baseUrl}/foo`, {
        status : 200,
        body   : { foo: 'bar' },
        headers: { 'Content-Type': 'application/json' },
      }, {
        method: 'PUT',
      });

      return x2Connector
        .put('/foo')
        .then((res) => {
          expect(res.data).toEqual({ foo: 'bar' });
          fetchMock.restore();
        });
    });
  });

  describe('delete()', () => {
    it('makes a DEL request to baseURL + path', () => {
      fetchMock.mock(`${baseUrl}/foo`, {
        status : 200,
        body   : { foo: 'bar' },
        headers: { 'Content-Type': 'application/json' },
      }, {
        method: 'DELETE',
      });

      return x2Connector
        .delete('/foo')
        .then((res) => {
          expect(res.data).toEqual({ foo: 'bar' });
          fetchMock.restore();
        });
    });
  });

  describe('login()', () => {
    it('makes a post to /token through X2 API to login', () => {
      fetchMock.mock(`${baseUrl}/token`, {
        status : 200,
        body   : { token: '1234' },
        headers: { 'Content-Type': 'application/json' },
      }, {
        method: 'POST',
      });

      return x2Connector
        .login('user', 'password')
        .then(() => {
          expect(x2Connector.token).toBe('1234');
        });
    });
  });

  describe('logout()', () => {
    it('logout user and clear session data', () => (
      x2Connector.logout()
        .then(() => {
          expect(x2Connector.isAuthenticated).toBe(false);
          expect(x2Connector.token).toBe(undefined);
          expect(x2Connector._storage.get('token')).toBe(null);
        })
    ));
  });

  describe('getSession()', () => {
    it('makes a get to /user/current through X2 API and get session data', () => {
      const body = { _id: 1234, account: 1234 };

      fetchMock.mock(`${baseUrl}/user/current`, {
        body,
        status : 200,
        headers: { 'Content-Type': 'application/json' },
      }, {
        method: 'GET',
      });

      return x2Connector
        .getSession()
        .then((res) => {
          expect(res.data._id).toBe(body._id);
          expect(res.data.account).toBe(body.account);
        });
    });
  });

  describe('watchForInactivity()', () => {
    it('set up event listeners to start watching user inactivity', () => {
      x2Connector.watchForInactivity();
      expect(x2Connector._watchForPageActivity).toBe(true);
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

  describe('_startRenewTokenLoop()', () => {
    it('set up timeouts intervals for token renew', () => {
      x2Connector._startRenewTokenLoop();
      expect(typeof x2Connector._tokenRenewTimeout).toBe('object');
      expect(x2Connector._inactivityTimeout).toBe(null);
      expect(x2Connector._pageActivityDetected).toBe(false);
      x2Connector._stopRenewTokenLoop();
    });
  });

  describe('_stopRenewTokenLoop()', () => {
    it('stop timeouts intervals for token renew', () => {
      x2Connector._startRenewTokenLoop();
      x2Connector._stopRenewTokenLoop();

      expect(x2Connector._tokenRenewTimeout).toBe(null);
      expect(x2Connector._inactivityTimeout).toBe(null);
      expect(x2Connector._inactivityCheckInterval).toBe(null);
    });
  });
});
