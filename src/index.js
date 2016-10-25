import 'whatwg-fetch';
import { EventEmitter } from 'events';

class HTTP extends EventEmitter {
  constructor() {
    super();

    this._baseUrl     = '';
    this._middlewares = [];
  }

  static _fetchOptions(opts = {}) {
    return {
      method : opts.method || 'GET',
      body   : opts.data ? JSON.stringify(opts.data) : undefined,
      headers: { 'Content-Type': 'application/json' }
    };
  }

  init(opts = {}) {
    this._baseUrl     = opts.baseURL;
    this._middlewares = opts.middlewares || [];
  }

  async get(path, params, auth = true) {
    try {
      const url    = `${this._baseUrl}${path}`;
      const config = this._runMiddlewares(this.constructor._fetchOptions({ body: params }));

      const res  = await fetch(url, config);
      const body = await res.json();

      return this.constructor.responseHandler(res, body);
    } catch (err) {
      this.emit('http-client:error', err);
      throw err;
    }
  }

  async post(path, data, auth = true) {
    try {
      const url    = `${this._baseUrl}${path}`;
      const config = this._runMiddlewares(this.constructor._fetchOptions({ body: data, method: 'POST' }));

      const res  = await fetch(url, config);
      const body = await res.json();

      return this.constructor.responseHandler(res, body);
    } catch (err) {
      this.emit('http-client:error', err);
      throw err;
    }
  }

  async put(path, data, auth = true) {
    try {
      const url    = `${this._baseUrl}${path}`;
      const config = this._runMiddlewares(this.constructor._fetchOptions({ body: data, method: 'PUT' }));

      const res  = await fetch(url, config);
      const body = await res.json();

      return this.constructor.responseHandler(res, body);
    } catch (err) {
      this.emit('http-client:error', err);
      throw err;
    }
  }

  async del(path, config = {}, auth = true) {
    try {
      const url    = `${this._baseUrl}${path}`;
      const config = this._runMiddlewares(this.constructor._fetchOptions({ method: 'DELETE' }));

      const res  = await fetch(url, config);
      const body = await res.json();

      return this.constructor.responseHandler(res, body);
    } catch (err) {
      this.emit('http-client:error', err);
      throw err;
    }
  }

  static responseHandler(res, body) {
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
