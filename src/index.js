import axios            from 'axios';
import { EventEmitter } from 'events';


class HTTP extends EventEmitter {
  constructor() {
    super();
    this._middlewares = [];
    this._timeout     = 10000;
  }

  init(opts = {}) {
    if (!opts.baseURL) { throw new Error('Unable to init http service, missing baseURL attribute'); }
    if (opts.timeout) { this._timeout = opts.timeout; }
    if (opts.middlewares) {
      this._middlewares = opts.middlewares;
      delete opts.middlewares;
    }
    this._axios = axios.create(opts);
  }

  async get(path, params, config = {}, auth = true) {
    if (!this._axios) { throw new Error('Library has not being initialized'); }

    config.params = params;
    try {
      return await this._axios.get(path, this._runMiddlewares(config, auth));
    } catch (err) {
      const message = this.constructor.errorHandler(err);
      this.emit('http-error', message);
      throw (message);
    }
  }

  async post(path, data, config = {}, auth = true) {
    if (!this._axios) { throw new Error('Library has not being initialized'); }
    try {
      return await this._axios.post(path, data, this._runMiddlewares(config, auth));
    } catch (err) {
      const message = this.constructor.errorHandler(err);
      this.emit('http-error', message);
      throw (message);
    }
  }

  async put(path, data, config = {}, auth = true) {
    if (!this._axios) { throw new Error('Library has not being initialized'); }
    try {
      return await this._axios.put(path, data, this._runMiddlewares(config, auth));
    } catch (err) {
      const message = this.constructor.errorHandler(err);
      this.emit('http-error', message);
      throw (message);
    }
  }

  async del(path, config = {}, auth = true) {
    if (!this._axios) { throw new Error('Library has not being initialized'); }
    try {
      return await this._axios.delete(path, this._runMiddlewares(config, auth));
    } catch (err) {
      const message = this.constructor.errorHandler(err);
      this.emit('http-error', message);
      throw (message);
    }
  }

  static errorHandler(response) {
    if (response instanceof Error) { return `Unknown Error: ${response}`; }
    if (!response.status) { return 'Unknown Error'; }

    switch (response.status) {
      case 400:
        return response.data || response;
      case 401:
        if (response.data && response.data.length > 0) { return response.data[0].message; }
        break;
      case 402:
        return 'Error 402: You must upgrade your account to do that';
      case 403:
        return 'Error 403: You are not authorized to access that';
      case 404:
        return 'Requested Resource Not Found';
      case 429:
        return 'Rate Limited';
      case 500:
      case 502:
      case 503:
        return `API Server Error ${response.status}`;
      default:
        return `API Request Error ${response.status}`;
    }
  }

  _runMiddlewares(config, auth) {
    this._middlewares.forEach(middleware => middleware());
    return config;
  }
}

const http = new HTTP();
http.HTTP = HTTP;
export default http;
