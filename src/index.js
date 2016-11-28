const { EventEmitter } = require('events');
const trae             = require('trae');
const setTimeout       = require('relign/set-timeout');
const setInterval      = require('relign/set-interval');
const Storage          = require('@fintechdev/x2-service-storage');

const EVENT_PREFIX = 'x2-connector';

class HTTP extends EventEmitter {
  constructor() {
    super();

    this._env     = 'DEV';
    this._baseUrl = 'http://localhost:8080';

    this.token           = null;
    this.tokenExpiriesAt = null;
    this._tokenDuration   = 1000 * 60 * 20; // 20 minutes

    this._storage                 = new Storage();
    this._inactivityCheckInterval = null;
    this._tokenRenewTimeout       = null;
    this._inactivityTimeout       = null;
    this._pageActivityDetected    = false;
    this._watchForPageActivity    = false;

    this._restoreExistingSession();

    this.isAuthenticated = this.token !== null;

    this._initMiddlewares();
    this._initMethods();
  }

  init(opts = {}) {
    this._setUpMiddlewares(opts.middlewares);

    if (!opts.configPath) {
      opts.baseUrl && (this._baseUrl = opts.baseUrl);
      trae.baseUrl(this._baseUrl);
      return Promise.resolve();
    }

    return trae.get(opts.configPath)
    .then((res) => {
      res.data.env && (this._env = res.data.env);
      res.data.tokenDuration && (this._tokenDuration = res.data.tokenDuration);

      const baseUrl = res.data.api && res.data.api.url;
      trae.baseUrl(baseUrl || this._baseUrl);
    });
  }

  getEnvironment() {
    return this._env;
  }

  isProd() {
    return this._env === 'PROD';
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
    return trae.post(`/user/send-password-reset/${email}`)
    .then(response => response.data);
  }

  resetPassword(newPassword, passwordResetToken) {
    return trae.post(`/user/reset-password/${passwordResetToken}`, { newPassword })
    .then(response => response.data);
  }

  watchForInactivity() {
    if (this._watchForPageActivity) { return; }
    window.addEventListener('keydown',   () => { this._pageActivityDetected = true; });
    window.addEventListener('mousemove', () => { this._pageActivityDetected = true; });
    this._watchForPageActivity = true;
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
        .then(res => this.emit(`${EVENT_PREFIX}:session-expired`));
      }, this._tokenDuration); // 20 minutes
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
    ['get', 'post', 'put', 'delete'].forEach((method) => {
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

    trae.use({
      reject: (err) => {
        this.emit(`${EVENT_PREFIX}:error`, err);
        return Promise.reject(err);
      }
    });
  }

  _setUpMiddlewares(middlewares) {
    if (middlewares) {
      if (middlewares.config && middlewares.config.length) {
        middlewares.config.forEach(config => trae.use({ config }));
      }

      if (middlewares.fullfill && middlewares.fullfill.length) {
        middlewares.fullfill.forEach(fullfill => trae.use({ fullfill }));
      }

      if (middlewares.reject && middlewares.reject.length) {
        middlewares.reject.forEach(reject => trae.use({ reject }));
      }
    }
  }
}

exports = module.exports = new HTTP();
exports.HTTP = HTTP;
