import 'whatwg-fetch';
import { EventEmitter } from 'events';
import Storage          from '@fintechdev/x2-service-storage';
import setTimeout       from 'relign/set-timeout';
import setInterval      from 'relign/set-interval';


class HTTP extends EventEmitter {
  constructor() {
    super();

    this.isAuthenticated = false;
    this.token           = null;
    this.tokenExpiriesAt = null;

    this._baseUrl     = '';
    this._middlewares = [];

    this._storage                 = new Storage();
    this._inactivityCheckInterval = null;
    this._tokenRenewTimeout       = null;
    this._inactivityTimeout       = null;
    this._pageActivityDetected    = false;
    this._watchForPageActivity    = false;

    this._restoreExistingSession();
  }

  init(opts = {}) {
    this._baseUrl     = opts.baseURL;
    this._middlewares = opts.middlewares || [];
  }

  async get(path, params, auth = true) {
    try {
      const url    = `${this._baseUrl}${path}`;
      const config = this._runMiddlewares(this.constructor._fetchOptions({ body: params }), auth);

      const res  = await fetch(url, config);
      const body = await res.json();

      return this.constructor._responseHandler(res, body);
    } catch (err) {
      this.emit('http-client:error', err);
      throw err;
    }
  }

  async post(path, data, auth = true) {
    try {
      const url    = `${this._baseUrl}${path}`;
      const config = this._runMiddlewares(this.constructor._fetchOptions({ body: data, method: 'POST' }), auth);

      const res  = await fetch(url, config);
      const body = await res.json();

      return this.constructor._responseHandler(res, body);
    } catch (err) {
      this.emit('http-client:error', err);
      throw err;
    }
  }

  async put(path, data, auth = true) {
    try {
      const url    = `${this._baseUrl}${path}`;
      const config = this._runMiddlewares(this.constructor._fetchOptions({ body: data, method: 'PUT' }), auth);

      const res  = await fetch(url, config);
      const body = await res.json();

      return this.constructor._responseHandler(res, body);
    } catch (err) {
      this.emit('http-client:error', err);
      throw err;
    }
  }

  async del(path, auth = true) {
    try {
      const url    = `${this._baseUrl}${path}`;
      const config = this._runMiddlewares(this.constructor._fetchOptions({ method: 'DELETE' }), auth);

      const res  = await fetch(url, config);
      const body = await res.json();

      return this.constructor._responseHandler(res, body);
    } catch (err) {
      this.emit('http-client:error', err);
      throw err;
    }
  }

  watchForInactivity() {
    if (this._watchForPageActivity) { return; }
    window.addEventListener('keydown',   () => { this._pageActivityDetected = true; });
    window.addEventListener('mousemove', () => { this._pageActivityDetected = true; });
    this._watchForPageActivity = true;
  }

  async login(email, password) {
    const res = await this.post('/token', { email, password });

    this.isAuthenticated = true;
    this.token           = res.data.token;
    this.tokenExpiriesAt = res.data.expiresAt;

    this._storage.set('token', res.data.token);
    this._storage.set('tokenExpiriesAt', res.data.expiresAt);

    if (this._watchForPageActivity) {
      this._startRenewTokenLoop();
    }
  }

  async logout() {
    this.isAuthenticated = false;
    delete this.token;
    this._storage.remove('token');
    this._storage.remove('tokenExpiriesAt');

    this._stopRenewTokenLoop();
  }

  async requestPasswordReset(email) {
    await this.post(`/user/send-password-reset/${email}`);
  }

  async passwordReset(newPassword, passwordResetToken) {
    await this.post(`/user/reset-password/${passwordResetToken}`, { newPassword });
  }

  _restoreExistingSession() {
    this._token = this._storage.get('token');
  }

  _startRenewTokenLoop() {
    const startTokenRenewTimeout = async () => {
      if (this._tokenRenewTimeout) {
        this._tokenRenewTimeout.clear();
        this._tokenRenewTimeout = null;
      }

      const renewTokenIn = (new Date(this._tokenExpiriesAt)).getTime() - Date.now();

      this._tokenRenewTimeout = setTimeout(async () => {
        const res = await this.put('/token');

        this.tokenExpiriesAt = res.data.expiresAt;
        this._storage.set('tokenExpiriesAt', res.data.expiresAt);
      }, renewTokenIn);
    };

    const startInactivityTimeout = async () => {
      if (this._inactivityTimeout) {
        this._inactivityTimeout.clear();
        this._inactivityTimeout = null;
      }
      this._inactivityTimeout = setTimeout(() => {
        this.delete('/token');
        this.emit('session-expired');
      }, 1000 * 20); // 20 minutes
    };

    const inactivityCheck = () => {
      if (this._pageActivityDetected) {
        this._pageActivityDetected = false;
        return;
      }
      startInactivityTimeout();
    };

    this._inactivityCheckInterval = setInterval(inactivityCheck, 500);
    startTokenRenewTimeout();
  }

  _stopRenewTokenLoop() {
    if (this._tokenRenewTimeout) {
      this._tokenRenewTimeout.clear();
      this._tokenRenewTimeout = null;
    }
    if (this._inactivityTimeout) {
      this._inactivityTimeout.clear();
      this._inactivityTimeout = null;
    }
    if (this._inactivityCheckInterval) {
      this._inactivityCheckInterval.clear();
      this._inactivityCheckInterval = null;
    }
  }

  static _fetchOptions(opts = {}) {
    return {
      method : opts.method || 'GET',
      body   : opts.data ? JSON.stringify(opts.data) : undefined,
      headers: { 'Content-Type': 'application/json' }
    };
  }

  static _responseHandler(res, body) {
    if (res.status > 500) { throw new Error(`API Server Error ${res.status}`); }
    if (res.status > 300) { throw new Error(body || res.statusText); }
    return body;
  }

  _runMiddlewares(config, auth) {
    this._middlewares.forEach(middleware => middleware(config, auth));
    return config;
  }
}

const http = new HTTP();
http.HTTP = HTTP;
export default http;
