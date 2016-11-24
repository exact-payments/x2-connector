const { EventEmitter } = require('events');
const trae             = require('trae');
const setTimeout       = require('relign/set-timeout');
const setInterval      = require('relign/set-interval');
const Storage          = require('@fintechdev/x2-service-storage');

class HTTP extends EventEmitter {
  constructor() {
    super();

    this.token           = null;
    this.tokenExpiriesAt = null;

    this._storage                 = new Storage();
    this._inactivityCheckInterval = null;
    this._tokenRenewTimeout       = null;
    this._inactivityTimeout       = null;
    this._pageActivityDetected    = false;
    this._watchForPageActivity    = false;

    this._restoreExistingSession();

    this.isAuthenticated = this.token !== null;

    this._initMethods();
    this._initMiddlewares();
  }

  init(opts = {}) {
    trae.baseUrl(opts.baseUrl);
  }

  watchForInactivity() {
    if (this._watchForPageActivity) { return; }
    window.addEventListener('keydown',   () => { this._pageActivityDetected = true; });
    window.addEventListener('mousemove', () => { this._pageActivityDetected = true; });
    this._watchForPageActivity = true;
  }

  login(email, password) {
    return trae.post('/token', { email, password })
    .then((res) => {
      this.isAuthenticated = true;
      this.token           = res.data.token;
      this.tokenExpiriesAt = res.data.expiresAt;

      this._storage.set('token', res.data.token);
      this._storage.set('tokenExpiriesAt', res.data.expiresAt);

      if (this._watchForPageActivity) {
        this._startRenewTokenLoop();
      }
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
    return trae.post(`/user/send-password-reset/${email}`);
  }

  resetPassword(newPassword, passwordResetToken) {
    return trae.post(`/user/reset-password/${passwordResetToken}`, { newPassword });
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

      const renewTokenIn = (new Date(this.tokenExpiriesAt)).getTime() - Date.now();

      console.log(renewTokenIn);

      this._tokenRenewTimeout = setTimeout(() => trae.put('/token')
      .then((res) => {
        this.tokenExpiriesAt = res.data.expiresAt;
        this._storage.set('tokenExpiriesAt', res.data.expiresAt);
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

  _initMethods() {
    ['get', 'post', 'put', 'del'].forEach((method) => {
      this[method] = (...args) => trae[method](...args)
      .then(response => response.data);
    });
  }

  _initMiddlewares() {
    trae.use({
      config: (config) => {
        if (this.isAuthenticated) {
          config.headers.authorization = this.token;
        }
        return config;
      }
    });
  }
}

exports = module.exports = new HTTP();
exports.HTTP = HTTP;
