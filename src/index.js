import 'whatwg-fetch';
import { EventEmitter } from 'events';
import Storage          from '@fintechdev/x2-service-storage';
import setTimeout       from 'relign/set-timeout';
import setInterval      from 'relign/set-interval';


class HTTP extends EventEmitter {
  constructor() {
    super();

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

    this.isAuthenticated = this.token !== null;
  }

  init(opts = {}) {
    this._baseUrl     = opts.baseUrl;
    this._middlewares = opts.middlewares || [];
  }

  async get(path, params, auth = true) {
    const url    = `${this._baseUrl}${path}`;
    const config = this._runMiddlewares(this._fetchOptions({ body: params }), auth);

    const response = await fetch(url, config);
    return await this._responseHandler(response);
  }

  async post(path, data, auth = true) {
    const url    = `${this._baseUrl}${path}`;
    const config = this._runMiddlewares(this._fetchOptions({ body: data, method: 'POST' }), auth);

    const response = await fetch(url, config);
    return await this._responseHandler(response);
  }

  async put(path, data, auth = true) {
    const url    = `${this._baseUrl}${path}`;
    const config = this._runMiddlewares(this._fetchOptions({ body: data, method: 'PUT' }), auth);

    const response = await fetch(url, config);
    return await this._responseHandler(response);
  }

  async del(path, auth = true) {
    const url    = `${this._baseUrl}${path}`;
    const config = this._runMiddlewares(this._fetchOptions({ method: 'DELETE' }), auth);

    const response = await fetch(url, config);
    return await this._responseHandler(response);
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
    this.token           = res.token;
    this.tokenExpiriesAt = res.expiresAt;

    this._storage.set('token', res.token);
    this._storage.set('tokenExpiriesAt', res.expiresAt);

    if (this._watchForPageActivity) {
      // this._startRenewTokenLoop();
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
    this.token = this._storage.get('token') || null;
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

        this.tokenExpiriesAt = res.expiresAt;
        this._storage.set('tokenExpiriesAt', res.expiresAt);
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

  _fetchOptions(opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.isAuthenticated) { headers.authorization = this.token; }
    return {
      method : opts.method || 'GET',
      body   : opts.body ? JSON.stringify(opts.body) : undefined,
      headers
    };
  }

  async _responseHandler(response) {
    if (response.ok) { return await response.json(); }
    this.emit('http-client:error', {
      status    : response.status,
      statusText: response.statusText
    });
    throw new Error(`${response.status}: ${response.statusText}`);
  }

  _runMiddlewares(config, auth) {
    this._middlewares.forEach(middleware => middleware(config, auth));
    return config;
  }
}

const http = new HTTP();
http.HTTP = HTTP;
export default http;
