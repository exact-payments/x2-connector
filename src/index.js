require('whatwg-fetch');
const { EventEmitter } = require('events');
const Storage          = require('@fintechdev/x2-service-storage');
const setTimeout       = require('relign/set-timeout');
const setInterval      = require('relign/set-interval');


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

  get(path, params, auth = true) {
    const url    = `${this._baseUrl}${path}`;
    const config = this._runMiddlewares(this._fetchOptions({ body: params }), auth);

    return fetch(url, config)
    .then(res => this._responseHandler(res));
  }

  post(path, data, auth = true) {
    const url    = `${this._baseUrl}${path}`;
    const config = this._runMiddlewares(this._fetchOptions({ body: data, method: 'POST' }), auth);

    return fetch(url, config)
    .then(res => this._responseHandler(res));
  }

  put(path, data, auth = true) {
    const url    = `${this._baseUrl}${path}`;
    const config = this._runMiddlewares(this._fetchOptions({ body: data, method: 'PUT' }), auth);

    return fetch(url, config)
    .then(res => this._responseHandler(res));
  }

  del(path, auth = true) {
    const url    = `${this._baseUrl}${path}`;
    const config = this._runMiddlewares(this._fetchOptions({ method: 'DELETE' }), auth);

    return fetch(url, config)
    .then(res => this._responseHandler(res));
  }

  watchForInactivity() {
    if (this._watchForPageActivity) { return; }
    window.addEventListener('keydown',   () => { this._pageActivityDetected = true; });
    window.addEventListener('mousemove', () => { this._pageActivityDetected = true; });
    this._watchForPageActivity = true;
  }

  login(email, password) {
    return this.post('/token', { email, password })
    .then((res) => {
      this.isAuthenticated = true;
      this.token           = res.token;
      this.tokenExpiriesAt = res.expiresAt;

      this._storage.set('token', res.token);
      this._storage.set('tokenExpiriesAt', res.expiresAt);

      if (this._watchForPageActivity) { this._startRenewTokenLoop(); }
    });
  }

  logout() {
    this.isAuthenticated = false;
    delete this.token;
    this._storage.remove('token');
    this._storage.remove('tokenExpiriesAt');

    this._stopRenewTokenLoop();
    return Promise.resolve();
  }

  resetPasswordRequest(email) {
    return this.post(`/user/send-password-reset/${email}`)
    .then(res => this._responseHandler(res));
  }

  resetPassword(newPassword, passwordResetToken) {
    return this.post(`/user/reset-password/${passwordResetToken}`, { newPassword })
    .then(res => this._responseHandler(res));
  }

  _restoreExistingSession() {
    this.token = this._storage.get('token') || null;
  }

  _startRenewTokenLoop() {
    const startTokenRenewTimeout = () => {
      if (this._tokenRenewTimeout) {
        this._tokenRenewTimeout.clear();
        this._tokenRenewTimeout = null;
      }

      const renewTokenIn = (new Date(this._tokenExpiriesAt)).getTime() - Date.now();

      this._tokenRenewTimeout = setTimeout(() => this.put('/token')
      .then((res) => {
        this.tokenExpiriesAt = res.expiresAt;
        this._storage.set('tokenExpiriesAt', res.expiresAt);
      }), renewTokenIn);
    };

    const startInactivityTimeout = () => {
      if (this._inactivityTimeout) {
        this._inactivityTimeout.clear();
        this._inactivityTimeout = null;
      }
      this._inactivityTimeout = setTimeout(() => {
        this.delete('/token')
        .then(res => this.emit('session-expired'));
      }, 1000 * 60 * 20); // 20 minutes
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
    const fetchOpts = {
      method : opts.method || 'GET',
      headers: { 'Content-Type': 'application/json' }
    };
    if (this.isAuthenticated) {
      fetchOpts.headers.authorization = this.token;
    }
    if (opts.body) {
      fetchOpts.body = JSON.stringify(opts.body);
    }
    return fetchOpts;
  }

  _responseHandler(response) {
    if (response.ok) { return response.json(); }
    this.emit('http-client:error', {
      status    : response.status,
      statusText: response.statusText
    });
    return Promise.reject(new Error(`${response.status}: ${response.statusText}`));
  }

  _runMiddlewares(config, auth) {
    this._middlewares.forEach(middleware => middleware(config, auth));
    return config;
  }
}

exports = module.exports = new HTTP();
exports.HTTP = HTTP;
