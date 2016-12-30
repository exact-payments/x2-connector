/**
 * HTTP Connector to communicate with x2 services
 *
 * @version: 0.3.6
 * @authors: Nicolas Del Valle <nicolas@fintechdev.net>, Ignacio Anaya <ignacio@fintechdev.net>, Robert Hurst <robert@fintechdev.net>
 */
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
	typeof define === 'function' && define.amd ? define('x2-connector', factory) :
	(global['x2-connector'] = factory());
}(this, (function () { 'use strict';

var domain;

// This constructor is used to store event handlers. Instantiating this is
// faster than explicitly calling `Object.create(null)` to get a "clean" empty
// object (tested with v8 v4.9).
function EventHandlers() {}
EventHandlers.prototype = Object.create(null);

function EventEmitter() {
  EventEmitter.init.call(this);
}
EventEmitter.usingDomains = false;

EventEmitter.prototype.domain = undefined;
EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

EventEmitter.init = function () {
  this.domain = null;
  if (EventEmitter.usingDomains) {
    // if there is an active domain, then attach to it.
    if (domain.active && !(this instanceof domain.Domain)) {
      this.domain = domain.active;
    }
  }

  if (!this._events || this._events === Object.getPrototypeOf(this)._events) {
    this._events = new EventHandlers();
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
};

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n)) throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined) return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn) handler.call(self);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].call(self);
    }
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn) handler.call(self, arg1);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].call(self, arg1);
    }
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn) handler.call(self, arg1, arg2);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].call(self, arg1, arg2);
    }
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn) handler.call(self, arg1, arg2, arg3);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].call(self, arg1, arg2, arg3);
    }
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn) handler.apply(self, args);else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i) {
      listeners[i].apply(self, args);
    }
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events, domain;
  var needDomainExit = false;
  var doError = type === 'error';

  events = this._events;
  if (events) doError = doError && events.error == null;else if (!doError) return false;

  domain = this.domain;

  // If there is no 'error' event listener then throw.
  if (doError) {
    er = arguments[1];
    if (domain) {
      if (!er) er = new Error('Uncaught, unspecified "error" event');
      er.domainEmitter = this;
      er.domain = domain;
      er.domainThrown = false;
      domain.emit('error', er);
    } else if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
    return false;
  }

  handler = events[type];

  if (!handler) return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
    // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
    // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++) {
        args[i - 1] = arguments[i];
      }emitMany(handler, isFn, this, args);
  }

  if (needDomainExit) domain.exit();

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = new EventHandlers();
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type, listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] = prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' + existing.length + ' ' + type + ' listeners added. ' + 'Use emitter.setMaxListeners() to increase limit');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        emitWarning(w);
      }
    }
  }

  return target;
}
function emitWarning(e) {
  typeof console.warn === 'function' ? console.warn(e) : console.log(e);
}
EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener = function prependListener(type, listener) {
  return _addListener(this, type, listener, true);
};

function _onceWrap(target, type, listener) {
  var fired = false;
  function g() {
    target.removeListener(type, g);
    if (!fired) {
      fired = true;
      listener.apply(target, arguments);
    }
  }
  g.listener = listener;
  return g;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener = function prependOnceListener(type, listener) {
  if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function');
  this.prependListener(type, _onceWrap(this, type, listener));
  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function removeListener(type, listener) {
  var list, events, position, i, originalListener;

  if (typeof listener !== 'function') throw new TypeError('"listener" argument must be a function');

  events = this._events;
  if (!events) return this;

  list = events[type];
  if (!list) return this;

  if (list === listener || list.listener && list.listener === listener) {
    if (--this._eventsCount === 0) this._events = new EventHandlers();else {
      delete events[type];
      if (events.removeListener) this.emit('removeListener', type, list.listener || listener);
    }
  } else if (typeof list !== 'function') {
    position = -1;

    for (i = list.length; i-- > 0;) {
      if (list[i] === listener || list[i].listener && list[i].listener === listener) {
        originalListener = list[i].listener;
        position = i;
        break;
      }
    }

    if (position < 0) return this;

    if (list.length === 1) {
      list[0] = undefined;
      if (--this._eventsCount === 0) {
        this._events = new EventHandlers();
        return this;
      } else {
        delete events[type];
      }
    } else {
      spliceOne(list, position);
    }

    if (events.removeListener) this.emit('removeListener', type, originalListener || listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function removeAllListeners(type) {
  var listeners, events;

  events = this._events;
  if (!events) return this;

  // not listening for removeListener, no need to emit
  if (!events.removeListener) {
    if (arguments.length === 0) {
      this._events = new EventHandlers();
      this._eventsCount = 0;
    } else if (events[type]) {
      if (--this._eventsCount === 0) this._events = new EventHandlers();else delete events[type];
    }
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    var keys = Object.keys(events);
    for (var i = 0, key; i < keys.length; ++i) {
      key = keys[i];
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = new EventHandlers();
    this._eventsCount = 0;
    return this;
  }

  listeners = events[type];

  if (typeof listeners === 'function') {
    this.removeListener(type, listeners);
  } else if (listeners) {
    // LIFO order
    do {
      this.removeListener(type, listeners[listeners.length - 1]);
    } while (listeners[0]);
  }

  return this;
};

EventEmitter.prototype.listeners = function listeners(type) {
  var evlistener;
  var ret;
  var events = this._events;

  if (!events) ret = [];else {
    evlistener = events[type];
    if (!evlistener) ret = [];else if (typeof evlistener === 'function') ret = [evlistener.listener || evlistener];else ret = unwrapListeners(evlistener);
  }

  return ret;
};

EventEmitter.listenerCount = function (emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1) {
    list[i] = list[k];
  }list.pop();
}

function arrayClone(arr, i) {
  var copy = new Array(i);
  while (i--) {
    copy[i] = arr[i];
  }return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};



function unwrapExports (x) {
	return x && x.__esModule ? x['default'] : x;
}

function createCommonjsModule(fn, module) {
	return module = { exports: {} }, fn(module, module.exports), module.exports;
}

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) {
  return typeof obj;
} : function (obj) {
  return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
};











var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();







var get = function get(object, property, receiver) {
  if (object === null) object = Function.prototype;
  var desc = Object.getOwnPropertyDescriptor(object, property);

  if (desc === undefined) {
    var parent = Object.getPrototypeOf(object);

    if (parent === null) {
      return undefined;
    } else {
      return get(parent, property, receiver);
    }
  } else if ("value" in desc) {
    return desc.value;
  } else {
    var getter = desc.get;

    if (getter === undefined) {
      return undefined;
    }

    return getter.call(receiver);
  }
};

var inherits = function (subClass, superClass) {
  if (typeof superClass !== "function" && superClass !== null) {
    throw new TypeError("Super expression must either be null or a function, not " + typeof superClass);
  }

  subClass.prototype = Object.create(superClass && superClass.prototype, {
    constructor: {
      value: subClass,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
  if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass;
};











var possibleConstructorReturn = function (self, call) {
  if (!self) {
    throw new ReferenceError("this hasn't been initialised - super() hasn't been called");
  }

  return call && (typeof call === "object" || typeof call === "function") ? call : self;
};

var trae_min = createCommonjsModule(function (module, exports) {
  /**
   * Trae, the fetch library!
   *
   * @version: 0.0.10
   * @authors: gillchristian <gillchristiang@gmail.com> | ndelvalle <nicolas.delvalle@gmail.com>
   */
  !function (e, t) {
    module.exports = t();
  }(commonjsGlobal, function () {
    "use strict";
    function e() {
      var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
          t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
          r = Object.keys(t);return 0 === r.length ? e : e + encodeURI(r.reduce(function (e, r) {
        return e + "&" + r + "=" + (t[r] || "");
      }, "?").replace("?&", "?"));
    }function t() {
      var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "";if (!e.includes("?")) return {};var t = {},
          n = decodeURI(e).split("?"),
          o = y(n, 2),
          i = o[1],
          s = i.split("&");return s.forEach(function (e) {
        var n = e.split("="),
            o = y(n, 2),
            i = o[0],
            s = o[1];t[i] = r(s);
      }), t;
    }function r(e) {
      if ("" !== e) {
        if ("true" === e) return !0;if ("false" === e) return !1;var t = parseFloat(e);return Number.isNaN(t) || t != e ? e : t;
      }
    }function n(e, t) {
      return t = { exports: {} }, e(t, t.exports), t.exports;
    }function o() {
      for (var e = arguments.length, t = Array(e), r = 0; r < e; r++) {
        t[r] = arguments[r];
      }return g.recursive.apply(g, [!0].concat(t));
    }function i(e, t) {
      var r = {};return Object.keys(e).forEach(function (n) {
        t.indexOf(n) === -1 && (r[n] = e[n]);
      }), r;
    }function s(e, t) {
      return e.replace(/\/+$/, "") + "/" + t.replace(/^\/+/, "");
    }function a(e) {
      return (/^([a-z][a-z\d\+\-\.]*:)?\/\//i.test(e)
      );
    }function u(e, t) {
      return !e || a(t) ? t : s(e, t);
    }function f(e, t) {
      return e[t]().then(function (t) {
        return { headers: e.headers, status: e.status, statusText: e.statusText, data: t };
      });
    }function c(e, t) {
      if (!e.ok) {
        var r = new Error(e.statusText);return r.status = e.status, r.statusText = e.statusText, r.headers = e.headers, Promise.reject(r);
      }if (t) return f(e, t);var n = e.headers.get("Content-Type");return n && n.includes("application/json") ? f(e, "json") : f(e, "text");
    }!function (e) {
      function t(e) {
        if ("string" != typeof e && (e = String(e)), /[^a-z0-9\-#$%&'*+.\^_`|~]/i.test(e)) throw new TypeError("Invalid character in header field name");return e.toLowerCase();
      }function r(e) {
        return "string" != typeof e && (e = String(e)), e;
      }function n(e) {
        var t = { next: function next() {
            var t = e.shift();return { done: void 0 === t, value: t };
          } };return y.iterable && (t[Symbol.iterator] = function () {
          return t;
        }), t;
      }function o(e) {
        this.map = {}, e instanceof o ? e.forEach(function (e, t) {
          this.append(t, e);
        }, this) : e && Object.getOwnPropertyNames(e).forEach(function (t) {
          this.append(t, e[t]);
        }, this);
      }function i(e) {
        return e.bodyUsed ? Promise.reject(new TypeError("Already read")) : void (e.bodyUsed = !0);
      }function s(e) {
        return new Promise(function (t, r) {
          e.onload = function () {
            t(e.result);
          }, e.onerror = function () {
            r(e.error);
          };
        });
      }function a(e) {
        var t = new FileReader();return t.readAsArrayBuffer(e), s(t);
      }function u(e) {
        var t = new FileReader();return t.readAsText(e), s(t);
      }function f() {
        return this.bodyUsed = !1, this._initBody = function (e) {
          if (this._bodyInit = e, "string" == typeof e) this._bodyText = e;else if (y.blob && Blob.prototype.isPrototypeOf(e)) this._bodyBlob = e;else if (y.formData && FormData.prototype.isPrototypeOf(e)) this._bodyFormData = e;else if (y.searchParams && URLSearchParams.prototype.isPrototypeOf(e)) this._bodyText = e.toString();else if (e) {
            if (!y.arrayBuffer || !ArrayBuffer.prototype.isPrototypeOf(e)) throw new Error("unsupported BodyInit type");
          } else this._bodyText = "";this.headers.get("content-type") || ("string" == typeof e ? this.headers.set("content-type", "text/plain;charset=UTF-8") : this._bodyBlob && this._bodyBlob.type ? this.headers.set("content-type", this._bodyBlob.type) : y.searchParams && URLSearchParams.prototype.isPrototypeOf(e) && this.headers.set("content-type", "application/x-www-form-urlencoded;charset=UTF-8"));
        }, y.blob ? (this.blob = function () {
          var e = i(this);if (e) return e;if (this._bodyBlob) return Promise.resolve(this._bodyBlob);if (this._bodyFormData) throw new Error("could not read FormData body as blob");return Promise.resolve(new Blob([this._bodyText]));
        }, this.arrayBuffer = function () {
          return this.blob().then(a);
        }, this.text = function () {
          var e = i(this);if (e) return e;if (this._bodyBlob) return u(this._bodyBlob);if (this._bodyFormData) throw new Error("could not read FormData body as text");return Promise.resolve(this._bodyText);
        }) : this.text = function () {
          var e = i(this);return e ? e : Promise.resolve(this._bodyText);
        }, y.formData && (this.formData = function () {
          return this.text().then(l);
        }), this.json = function () {
          return this.text().then(JSON.parse);
        }, this;
      }function c(e) {
        var t = e.toUpperCase();return b.indexOf(t) > -1 ? t : e;
      }function h(e, t) {
        t = t || {};var r = t.body;if (h.prototype.isPrototypeOf(e)) {
          if (e.bodyUsed) throw new TypeError("Already read");this.url = e.url, this.credentials = e.credentials, t.headers || (this.headers = new o(e.headers)), this.method = e.method, this.mode = e.mode, r || (r = e._bodyInit, e.bodyUsed = !0);
        } else this.url = e;if (this.credentials = t.credentials || this.credentials || "omit", !t.headers && this.headers || (this.headers = new o(t.headers)), this.method = c(t.method || this.method || "GET"), this.mode = t.mode || this.mode || null, this.referrer = null, ("GET" === this.method || "HEAD" === this.method) && r) throw new TypeError("Body not allowed for GET or HEAD requests");this._initBody(r);
      }function l(e) {
        var t = new FormData();return e.trim().split("&").forEach(function (e) {
          if (e) {
            var r = e.split("="),
                n = r.shift().replace(/\+/g, " "),
                o = r.join("=").replace(/\+/g, " ");t.append(decodeURIComponent(n), decodeURIComponent(o));
          }
        }), t;
      }function d(e) {
        var t = new o(),
            r = (e.getAllResponseHeaders() || "").trim().split("\n");return r.forEach(function (e) {
          var r = e.trim().split(":"),
              n = r.shift().trim(),
              o = r.join(":").trim();t.append(n, o);
        }), t;
      }function p(e, t) {
        t || (t = {}), this.type = "default", this.status = t.status, this.ok = this.status >= 200 && this.status < 300, this.statusText = t.statusText, this.headers = t.headers instanceof o ? t.headers : new o(t.headers), this.url = t.url || "", this._initBody(e);
      }if (!e.fetch) {
        var y = { searchParams: "URLSearchParams" in e, iterable: "Symbol" in e && "iterator" in Symbol, blob: "FileReader" in e && "Blob" in e && function () {
            try {
              return new Blob(), !0;
            } catch (e) {
              return !1;
            }
          }(), formData: "FormData" in e, arrayBuffer: "ArrayBuffer" in e };o.prototype.append = function (e, n) {
          e = t(e), n = r(n);var o = this.map[e];o || (o = [], this.map[e] = o), o.push(n);
        }, o.prototype.delete = function (e) {
          delete this.map[t(e)];
        }, o.prototype.get = function (e) {
          var r = this.map[t(e)];return r ? r[0] : null;
        }, o.prototype.getAll = function (e) {
          return this.map[t(e)] || [];
        }, o.prototype.has = function (e) {
          return this.map.hasOwnProperty(t(e));
        }, o.prototype.set = function (e, n) {
          this.map[t(e)] = [r(n)];
        }, o.prototype.forEach = function (e, t) {
          Object.getOwnPropertyNames(this.map).forEach(function (r) {
            this.map[r].forEach(function (n) {
              e.call(t, n, r, this);
            }, this);
          }, this);
        }, o.prototype.keys = function () {
          var e = [];return this.forEach(function (t, r) {
            e.push(r);
          }), n(e);
        }, o.prototype.values = function () {
          var e = [];return this.forEach(function (t) {
            e.push(t);
          }), n(e);
        }, o.prototype.entries = function () {
          var e = [];return this.forEach(function (t, r) {
            e.push([r, t]);
          }), n(e);
        }, y.iterable && (o.prototype[Symbol.iterator] = o.prototype.entries);var b = ["DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT"];h.prototype.clone = function () {
          return new h(this);
        }, f.call(h.prototype), f.call(p.prototype), p.prototype.clone = function () {
          return new p(this._bodyInit, { status: this.status, statusText: this.statusText, headers: new o(this.headers), url: this.url });
        }, p.error = function () {
          var e = new p(null, { status: 0, statusText: "" });return e.type = "error", e;
        };var v = [301, 302, 303, 307, 308];p.redirect = function (e, t) {
          if (v.indexOf(t) === -1) throw new RangeError("Invalid status code");return new p(null, { status: t, headers: { location: e } });
        }, e.Headers = o, e.Request = h, e.Response = p, e.fetch = function (e, t) {
          return new Promise(function (r, n) {
            function o() {
              return "responseURL" in s ? s.responseURL : /^X-Request-URL:/m.test(s.getAllResponseHeaders()) ? s.getResponseHeader("X-Request-URL") : void 0;
            }var i;i = h.prototype.isPrototypeOf(e) && !t ? e : new h(e, t);var s = new XMLHttpRequest();s.onload = function () {
              var e = { status: s.status, statusText: s.statusText, headers: d(s), url: o() },
                  t = "response" in s ? s.response : s.responseText;r(new p(t, e));
            }, s.onerror = function () {
              n(new TypeError("Network request failed"));
            }, s.ontimeout = function () {
              n(new TypeError("Network request failed"));
            }, s.open(i.method, i.url, !0), "include" === i.credentials && (s.withCredentials = !0), "responseType" in s && y.blob && (s.responseType = "blob"), i.headers.forEach(function (e, t) {
              s.setRequestHeader(t, e);
            }), s.send("undefined" == typeof i._bodyInit ? null : i._bodyInit);
          });
        }, e.fetch.polyfill = !0;
      }
    }("undefined" != typeof self ? self : window);var h = e,
        l = "function" == typeof Symbol && "symbol" == _typeof(Symbol.iterator) ? function (e) {
      return typeof e === 'undefined' ? 'undefined' : _typeof(e);
    } : function (e) {
      return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e === 'undefined' ? 'undefined' : _typeof(e);
    },
        d = function d(e, t) {
      if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function");
    },
        p = function () {
      function e(e, t) {
        for (var r = 0; r < t.length; r++) {
          var n = t[r];n.enumerable = n.enumerable || !1, n.configurable = !0, "value" in n && (n.writable = !0), Object.defineProperty(e, n.key, n);
        }
      }return function (t, r, n) {
        return r && e(t.prototype, r), n && e(t, n), t;
      };
    }(),
        y = function () {
      function e(e, t) {
        var r = [],
            n = !0,
            o = !1,
            i = void 0;try {
          for (var s, a = e[Symbol.iterator](); !(n = (s = a.next()).done) && (r.push(s.value), !t || r.length !== t); n = !0) {}
        } catch (e) {
          o = !0, i = e;
        } finally {
          try {
            !n && a.return && a.return();
          } finally {
            if (o) throw i;
          }
        }return r;
      }return function (t, r) {
        if (Array.isArray(t)) return t;if (Symbol.iterator in Object(t)) return e(t, r);throw new TypeError("Invalid attempt to destructure non-iterable instance");
      };
    }(),
        b = t,
        v = h,
        m = b,
        _ = { buildQuery: v, parseQuery: m },
        w = function () {
      function e() {
        d(this, e), this._before = [], this._success = [], this._error = [], this._after = [];
      }return p(e, [{ key: "before", value: function value(e) {
          return this._before.push(e), this._before.length - 1;
        } }, { key: "success", value: function value() {
          var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : function (e) {
            return e;
          };return this._success.push(e), this._success.length - 1;
        } }, { key: "error", value: function value(e) {
          return this._error.push(e), this._error.length - 1;
        } }, { key: "after", value: function value(e) {
          return this._after.push(e), this._after.length - 1;
        } }, { key: "resolveBefore", value: function value(e) {
          return this._before.reduce(function (e, t) {
            return e = e.then(t);
          }, Promise.resolve(e));
        } }, { key: "resolveSuccess", value: function value(e) {
          return this._success.reduce(function (e, t) {
            return e = e.then(t);
          }, Promise.resolve(e));
        } }, { key: "resolveError", value: function value(e) {
          return this._error.forEach(function (t) {
            return t && t.call && t(e);
          }), Promise.reject(e);
        } }, { key: "resolveAfter", value: function value(e) {
          return this._after.reduce(function (e, t) {
            return e = e.then(t);
          }, Promise.resolve(e));
        } }]), e;
    }(),
        g = n(function (e) {
      !function (t) {
        function r(e, t) {
          if ("object" !== o(e)) return t;for (var n in t) {
            "object" === o(e[n]) && "object" === o(t[n]) ? e[n] = r(e[n], t[n]) : e[n] = t[n];
          }return e;
        }function n(e, t, n) {
          var s = n[0],
              a = n.length;(e || "object" !== o(s)) && (s = {});for (var u = 0; u < a; ++u) {
            var f = n[u],
                c = o(f);if ("object" === c) for (var h in f) {
              var l = e ? i.clone(f[h]) : f[h];t ? s[h] = r(s[h], l) : s[h] = l;
            }
          }return s;
        }function o(e) {
          return {}.toString.call(e).slice(8, -1).toLowerCase();
        }var i = function i(e) {
          return n(e === !0, !1, arguments);
        },
            s = "merge";i.recursive = function (e) {
          return n(e === !0, !0, arguments);
        }, i.clone = function (e) {
          var t,
              r,
              n = e,
              s = o(e);if ("array" === s) for (n = [], r = e.length, t = 0; t < r; ++t) {
            n[t] = i.clone(e[t]);
          } else if ("object" === s) {
            n = {};for (t in e) {
              n[t] = i.clone(e[t]);
            }
          }return n;
        }, t ? e.exports = i : window[s] = i;
      }("object" === ("undefined" == typeof e ? "undefined" : l(e)) && e && "object" === l(e.exports) && e.exports);
    }),
        T = { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
        x = { xsrfCookieName: "XSRF-TOKEN", xsrfHeaderName: "X-XSRF-TOKEN" },
        E = function () {
      function e() {
        var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};d(this, e), this._defaults = o(x, { headers: T }), this._config = {}, this.set(t);
      }return p(e, [{ key: "mergeWithDefaults", value: function value() {
          for (var e = arguments.length, t = Array(e), r = 0; r < e; r++) {
            t[r] = arguments[r];
          }var n = o.apply(void 0, [this._defaults, this._config].concat(t));return "object" === l(n.body) && n.headers && "application/json" === n.headers["Content-Type"] && (n.body = JSON.stringify(n.body)), n;
        } }, { key: "set", value: function value(e) {
          this._config = o(this._config, e);
        } }, { key: "get", value: function value() {
          return o(this._defaults, this._config);
        } }]), e;
    }(),
        U = function () {
      function e() {
        var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};d(this, e), this._middleware = new w(), this._config = new E(i(t, ["baseUrl"])), this.baseUrl(t.baseUrl || ""), this._initMethodsWithBody(), this._initMethodsWithNoBody();
      }return p(e, [{ key: "create", value: function value(e) {
          return new this.constructor(e);
        } }, { key: "use", value: function value() {
          var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};e.before && this._middleware.before(e.before), e.success && this._middleware.success(e.success), e.error && this._middleware.error(e.error), e.after && this._middleware.after(e.after);
        } }, { key: "defaults", value: function value(e) {
          return "undefined" == typeof e ? this._config.get() : (this._config.set(i(e, ["baseUrl"])), e.baseUrl && this.baseUrl(e.baseUrl), this._config.get());
        } }, { key: "baseUrl", value: function value(e) {
          return "undefined" == typeof e ? this._baseUrl : (this._baseUrl = e, this._baseUrl);
        } }, { key: "request", value: function value() {
          var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {};e.method || (e.method = "get");var t = this._config.mergeWithDefaults(e),
              r = _.buildQuery(u(this._baseUrl, e.url), e.params);return this._fetch(r, t);
        } }, { key: "_fetch", value: function value(e, t) {
          var r = this,
              n = !0;return this._middleware.resolveBefore(t).then(function (t) {
            return fetch(e, t);
          }).then(function (e) {
            return c(e, t.bodyType);
          }).then(function (e) {
            return r._middleware.resolveSuccess(e);
          }).then(function (e) {
            return n = !1, r._middleware.resolveAfter(e);
          }).catch(function (e) {
            return r._middleware.resolveError(e), n ? r._middleware.resolveAfter(e) : Promise.reject(e);
          });
        } }, { key: "_initMethodsWithNoBody", value: function value() {
          var e = this;["get", "delete", "head"].forEach(function (t) {
            e[t] = function (r) {
              var n = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {},
                  o = e._config.mergeWithDefaults(n, { method: t }),
                  i = _.buildQuery(u(e._baseUrl, r), n.params);return e._fetch(i, o);
            };
          });
        } }, { key: "_initMethodsWithBody", value: function value() {
          var e = this;["post", "put", "patch"].forEach(function (t) {
            e[t] = function (r, n, o) {
              var i = e._config.mergeWithDefaults(o, { body: n, method: t }),
                  s = u(e._baseUrl, r);return e._fetch(s, i);
            };
          });
        } }]), e;
    }(),
        P = new U();return P;
  });
});

var exec = function exec(fn) {
  try {
    var val = typeof fn === 'function' ? fn() : fn;
    if (!val || (typeof val === 'undefined' ? 'undefined' : _typeof(val)) !== 'object' || typeof val.then !== 'function') {
      return Promise.resolve(val);
    }
    return val;
  } catch (err) {
    return Promise.reject(err);
  }
};

var exec_1 = exec;

var setTimeout_1 = createCommonjsModule(function (module, exports) {
  var exec = exec_1;

  var TimeoutPromise = function (_Promise) {
    inherits(TimeoutPromise, _Promise);

    function TimeoutPromise(fn, duration) {
      classCallCheck(this, TimeoutPromise);

      if (typeof fn === 'number') {
        duration = fn;
        fn = undefined;
      }
      var timeoutData = null;

      var _this = possibleConstructorReturn(this, (TimeoutPromise.__proto__ || Object.getPrototypeOf(TimeoutPromise)).call(this, function (resolve, reject) {
        timeoutData = { resolve: resolve, reject: reject, fn: fn, duration: duration };
        if (typeof duration === 'number') {
          timeoutData.timeoutId = commonjsGlobal.setTimeout(function () {
            exec(fn).then(resolve).catch(reject);
          }, duration);
        } else {
          fn(resolve, reject);
        }
      }));

      _this._parent = null;
      _this._timeoutData = timeoutData;
      return _this;
    }

    createClass(TimeoutPromise, [{
      key: 'then',
      value: function then(fn) {
        var promise = get(TimeoutPromise.prototype.__proto__ || Object.getPrototypeOf(TimeoutPromise.prototype), 'then', this).call(this, fn);
        promise._parent = this;
        return promise;
      }
    }, {
      key: 'clear',
      value: function clear(val) {
        var timeoutData = this._timeoutData;
        commonjsGlobal.clearTimeout(timeoutData.timeoutId);
        timeoutData.resolve(val);
      }
    }, {
      key: 'reset',
      value: function reset() {
        var timeoutData = this._timeoutData;
        commonjsGlobal.clearTimeout(timeoutData.timeoutId);
        timeoutData.timeoutId = commonjsGlobal.setTimeout(function () {
          exec(timeoutData.fn).then(timeoutData.resolve).catch(timeoutData.reject);
        }, timeoutData.duration);
      }
    }, {
      key: '_timeoutData',
      get: function get$$1() {
        return this._parent ? this._parent._timeoutData : this.__timeoutData;
      },
      set: function set$$1(timeoutData) {
        this.__timeoutData = timeoutData;
      }
    }]);
    return TimeoutPromise;
  }(Promise);

  var setTimeout = function setTimeout(fn) {
    var d = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

    return new TimeoutPromise(fn, d);
  };

  exports = module.exports = setTimeout;
  exports.TimeoutPromise = TimeoutPromise;
});

var setInterval_1 = createCommonjsModule(function (module, exports) {
  var exec = exec_1;

  var IntervalPromise = function (_Promise) {
    inherits(IntervalPromise, _Promise);

    function IntervalPromise(fn, duration) {
      classCallCheck(this, IntervalPromise);

      var _resolve = void 0,
          _intervalId = void 0;

      var _this = possibleConstructorReturn(this, (IntervalPromise.__proto__ || Object.getPrototypeOf(IntervalPromise)).call(this, function (resolve, reject) {
        _resolve = resolve;
        if (typeof duration === 'number') {
          _intervalId = commonjsGlobal.setInterval(function () {
            exec(fn).catch(function (err) {
              clearInterval(_intervalId);
              reject(err);
            });
          }, duration);
        } else {
          fn(resolve, reject);
        }
      }));

      _this._intervalId = _intervalId;
      _this._resolve = _resolve;
      return _this;
    }

    createClass(IntervalPromise, [{
      key: 'then',
      value: function then(fn) {
        var promise = get(IntervalPromise.prototype.__proto__ || Object.getPrototypeOf(IntervalPromise.prototype), 'then', this).call(this, fn);
        promise._intervalId = this._intervalId;
        promise._resolve = this._resolve;
        return promise;
      }
    }, {
      key: 'clear',
      value: function clear(val) {
        clearInterval(this._intervalId);
        this._resolve(val);
      }
    }]);
    return IntervalPromise;
  }(Promise);

  var setInterval = function setInterval(fn) {
    var d = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;

    return new IntervalPromise(fn, d);
  };

  exports = module.exports = setInterval;
  exports.IntervalPromise = IntervalPromise;
});

var x2ServiceStorage_min = createCommonjsModule(function (module, exports) {
  !function (e, t) {
    module.exports = t();
  }(commonjsGlobal, function () {
    return function (e) {
      function t(r) {
        if (o[r]) return o[r].exports;var n = o[r] = { exports: {}, id: r, loaded: !1 };return e[r].call(n.exports, n, n.exports, t), n.loaded = !0, n.exports;
      }var o = {};return t.m = e, t.c = o, t.p = "", t(0);
    }([function (e, t) {
      "use strict";
      function o(e, t) {
        if (!(e instanceof t)) throw new TypeError("Cannot call a class as a function");
      }Object.defineProperty(t, "__esModule", { value: !0 });var r = "function" == typeof Symbol && "symbol" == _typeof(Symbol.iterator) ? function (e) {
        return typeof e === 'undefined' ? 'undefined' : _typeof(e);
      } : function (e) {
        return e && "function" == typeof Symbol && e.constructor === Symbol ? "symbol" : typeof e === 'undefined' ? 'undefined' : _typeof(e);
      },
          n = function () {
        function e(e, t) {
          for (var o = 0; o < t.length; o++) {
            var r = t[o];r.enumerable = r.enumerable || !1, r.configurable = !0, "value" in r && (r.writable = !0), Object.defineProperty(e, r.key, r);
          }
        }return function (t, o, r) {
          return o && e(t.prototype, o), r && e(t, r), t;
        };
      }();if (!window) throw new Error("Missing window object.");if (!window.localStorage) throw new Error("localStorage is not supported.");if (!window.sessionStorage) throw new Error("sessionStorage is not supported.");var i = function () {
        function e(t) {
          o(this, e), this.storage = t && "session" === t.toLowerCase() ? window.sessionStorage : window.localStorage;
        }return n(e, [{ key: "get", value: function value(e) {
            var t = this.storage.getItem(e);if ("string" != typeof t) return t;try {
              return JSON.parse(t);
            } catch (o) {
              return t || void 0;
            }
          } }, { key: "getAll", value: function value() {
            var e = this;return Array.apply(0, new Array(this.storage.length)).map(function (t, o) {
              return e.storage.key(o);
            });
          } }, { key: "set", value: function value(e, t) {
            if (e) return t = "object" === ("undefined" == typeof t ? "undefined" : r(t)) ? JSON.stringify(t) : t, this.storage.setItem(e, t), t;
          } }, { key: "remove", value: function value(e) {
            this.storage.removeItem(e);
          } }, { key: "clear", value: function value() {
            this.storage.clear();
          } }]), e;
      }();t["default"] = i, e.exports = t["default"];
    }]);
  });
  
});

var Storage = unwrapExports(x2ServiceStorage_min);

var HTTP = function (_EventEmitter) {
  inherits(HTTP, _EventEmitter);

  function HTTP() {
    classCallCheck(this, HTTP);

    var _this = possibleConstructorReturn(this, (HTTP.__proto__ || Object.getPrototypeOf(HTTP)).call(this));

    _this._env = 'DEV';

    _this.token = null;
    _this.tokenExpiriesAt = null;
    _this._tokenDuration = 1000 * 60 * 20; // 20 minutes

    _this._storage = new Storage();
    _this._inactivityCheckInterval = null;
    _this._tokenRenewTimeout = null;
    _this._inactivityTimeout = null;
    _this._pageActivityDetected = false;
    _this._watchForPageActivity = false;

    _this.session = {};

    _this._restoreExistingSession();

    _this.isAuthenticated = _this.token !== null;

    _this._initMiddlewares();
    _this._initMethods();
    return _this;
  }

  createClass(HTTP, [{
    key: 'init',
    value: function init() {
      var _this2 = this;

      var opts = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      this._setUpMiddlewares(opts.middlewares);

      if (!opts.configPath) {
        opts.httpConfig || (opts.httpConfig = {});
        opts.httpConfig.baseUrl || (opts.httpConfig.baseUrl = 'http://localhost:8080');
        trae_min.defaults(opts.httpConfig);
        return Promise.resolve();
      }

      return trae_min.get(opts.configPath).then(function (res) {
        res.data.env && (_this2._env = res.data.env);
        res.data.tokenDuration && (_this2._tokenDuration = res.data.tokenDuration);

        var getBaseUrl = function getBaseUrl() {
          var apiUrl = res.data.api && res.data.api.url;
          return apiUrl || 'http://localhost:8080';
        };

        res.data.httpConfig || (res.data.httpConfig = {});
        res.data.httpConfig.baseUrl || (res.data.httpConfig.baseUrl = getBaseUrl());

        trae_min.defaults(res.data.httpConfig);
      });
    }
  }, {
    key: 'getEnvironment',
    value: function getEnvironment() {
      return this._env;
    }
  }, {
    key: 'isProd',
    value: function isProd() {
      return this._env === 'PROD';
    }
  }, {
    key: 'login',
    value: function login(email, password) {
      var _this3 = this;

      return trae_min.post('/token', { email: email, password: password }).then(function (res) {
        _this3.isAuthenticated = true;
        _this3.token = res.data.token;
        _this3.tokenExpiriesAt = res.data.expiresAt;

        _this3._storage.set('token', res.data.token);
        _this3._storage.set('tokenExpiriesAt', res.data.expiresAt);

        if (_this3._watchForPageActivity) {
          _this3._startRenewTokenLoop();
        }
      });
    }
  }, {
    key: 'getSession',
    value: function getSession() {
      var _this4 = this;

      return trae_min.get('/user/current').then(function (res) {
        _this4.session = res.data;
        _this4._storage.set('session', res.data);

        return Promise.resolve(res);
      });
    }
  }, {
    key: 'logout',
    value: function logout() {
      this.isAuthenticated = false;
      delete this.token;
      this._storage.remove('token');
      this._storage.remove('tokenExpiriesAt');

      this._stopRenewTokenLoop();
      return Promise.resolve();
    }
  }, {
    key: 'resetPasswordRequest',
    value: function resetPasswordRequest(email) {
      return trae_min.post('/user/send-password-reset/' + email).then(function (response) {
        return response.data;
      });
    }
  }, {
    key: 'resetPassword',
    value: function resetPassword(newPassword, passwordResetToken) {
      return trae_min.post('/user/reset-password/' + passwordResetToken, { newPassword: newPassword }).then(function (response) {
        return response.data;
      });
    }
  }, {
    key: 'watchForInactivity',
    value: function watchForInactivity() {
      var _this5 = this;

      if (this._watchForPageActivity) {
        return;
      }
      window.addEventListener('keydown', function () {
        _this5._pageActivityDetected = true;
      });
      window.addEventListener('mousemove', function () {
        _this5._pageActivityDetected = true;
      });
      this._watchForPageActivity = true;
    }
  }, {
    key: '_restoreExistingSession',
    value: function _restoreExistingSession() {
      this.token = this._storage.get('token') || null;
    }
  }, {
    key: '_startRenewTokenLoop',
    value: function _startRenewTokenLoop() {
      var _this6 = this;

      var startTokenRenewTimeout = function startTokenRenewTimeout() {
        if (_this6._tokenRenewTimeout) {
          _this6._tokenRenewTimeout.clear();
          _this6._tokenRenewTimeout = null;
        }

        var renewTokenIn = new Date(_this6.tokenExpiriesAt).getTime() - Date.now();

        _this6._tokenRenewTimeout = setTimeout_1(function () {
          return trae_min.put('/token').then(function (res) {
            _this6.tokenExpiriesAt = res.data.expiresAt;
            _this6._storage.set('tokenExpiriesAt', res.data.expiresAt);
          });
        }, renewTokenIn);
      };

      var startInactivityTimeout = function startInactivityTimeout() {
        if (_this6._inactivityTimeout) {
          _this6._inactivityTimeout.clear();
          _this6._inactivityTimeout = null;
        }

        _this6._inactivityTimeout = setTimeout_1(function () {
          _this6.delete('/token').then(function (res) {
            return _this6.emit('session-expired');
          });
        }, _this6._tokenDuration);
      };

      var inactivityCheck = function inactivityCheck() {
        if (_this6._pageActivityDetected) {
          _this6._pageActivityDetected = false;
          return;
        }
        startInactivityTimeout();
      };

      this._inactivityCheckInterval = setInterval_1(inactivityCheck, 500);
      startTokenRenewTimeout();
    }
  }, {
    key: '_stopRenewTokenLoop',
    value: function _stopRenewTokenLoop() {
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
  }, {
    key: '_initMethods',
    value: function _initMethods() {
      var _this7 = this;

      ['get', 'post', 'put', 'delete'].forEach(function (method) {
        _this7[method] = function () {
          return trae_min[method].apply(trae_min, arguments).then(function (response) {
            return response.data;
          });
        };
      });
    }
  }, {
    key: '_initMiddlewares',
    value: function _initMiddlewares() {
      var _this8 = this;

      trae_min.use({
        before: function before(_before) {
          _this8.emit('before', _before);

          if (_this8.isAuthenticated) {
            _before.headers.authorization = _this8.token;
          }

          return _before;
        }
      });

      trae_min.use({
        error: function error(err) {
          _this8.emit('error', err);
          return Promise.reject(err);
        }
      });

      trae_min.use({
        success: function success(res) {
          _this8.emit('success', res);
          return Promise.resolve(res);
        }
      });

      trae_min.use({
        after: function after(res) {
          _this8.emit('after', res);
          return Promise.resolve(res);
        }
      });
    }
  }, {
    key: '_setUpMiddlewares',
    value: function _setUpMiddlewares(middlewares) {
      if (!middlewares) {
        return;
      }
      if (middlewares.before && middlewares.before.length) {
        middlewares.before.forEach(function (before) {
          return trae_min.use({ before: before });
        });
      }

      if (middlewares.success && middlewares.success.length) {
        middlewares.success.forEach(function (success) {
          return trae_min.use({ success: success });
        });
      }

      if (middlewares.error && middlewares.error.length) {
        middlewares.error.forEach(function (error) {
          return trae_min.use({ error: error });
        });
      }

      if (middlewares.after && middlewares.after.length) {
        middlewares.after.forEach(function (after) {
          return trae_min.use({ after: after });
        });
      }
    }
  }]);
  return HTTP;
}(EventEmitter);

var http = new HTTP();
http.HTTP = HTTP;

return http;

})));
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjpudWxsLCJzb3VyY2VzIjpbIi4uL25vZGVfbW9kdWxlcy9yb2xsdXAtcGx1Z2luLW5vZGUtYnVpbHRpbnMvc3JjL2VzNi9ldmVudHMuanMiLCIuLi9ub2RlX21vZHVsZXMvdHJhZS9kaXN0L3RyYWUubWluLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3JlbGlnbi9leGVjLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3JlbGlnbi9zZXQtdGltZW91dC5qcyIsIi4uL25vZGVfbW9kdWxlcy9yZWxpZ24vc2V0LWludGVydmFsLmpzIiwiLi4vbm9kZV9tb2R1bGVzL0BmaW50ZWNoZGV2L3gyLXNlcnZpY2Utc3RvcmFnZS9saWIveDItc2VydmljZS1zdG9yYWdlLm1pbi5qcyIsIi4uL3NyYy9pbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIndXNlIHN0cmljdCc7XG5cbnZhciBkb21haW47XG5cbi8vIFRoaXMgY29uc3RydWN0b3IgaXMgdXNlZCB0byBzdG9yZSBldmVudCBoYW5kbGVycy4gSW5zdGFudGlhdGluZyB0aGlzIGlzXG4vLyBmYXN0ZXIgdGhhbiBleHBsaWNpdGx5IGNhbGxpbmcgYE9iamVjdC5jcmVhdGUobnVsbClgIHRvIGdldCBhIFwiY2xlYW5cIiBlbXB0eVxuLy8gb2JqZWN0ICh0ZXN0ZWQgd2l0aCB2OCB2NC45KS5cbmZ1bmN0aW9uIEV2ZW50SGFuZGxlcnMoKSB7fVxuRXZlbnRIYW5kbGVycy5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gIEV2ZW50RW1pdHRlci5pbml0LmNhbGwodGhpcyk7XG59XG5leHBvcnQgZGVmYXVsdCBFdmVudEVtaXR0ZXI7XG5leHBvcnQge0V2ZW50RW1pdHRlcn07XG5cbkV2ZW50RW1pdHRlci51c2luZ0RvbWFpbnMgPSBmYWxzZTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5kb21haW4gPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9ldmVudHMgPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYXhMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cbi8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW4gMTAgbGlzdGVuZXJzIGFyZVxuLy8gYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaCBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cbkV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XG5cbkV2ZW50RW1pdHRlci5pbml0ID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZG9tYWluID0gbnVsbDtcbiAgaWYgKEV2ZW50RW1pdHRlci51c2luZ0RvbWFpbnMpIHtcbiAgICAvLyBpZiB0aGVyZSBpcyBhbiBhY3RpdmUgZG9tYWluLCB0aGVuIGF0dGFjaCB0byBpdC5cbiAgICBpZiAoZG9tYWluLmFjdGl2ZSAmJiAhKHRoaXMgaW5zdGFuY2VvZiBkb21haW4uRG9tYWluKSkge1xuICAgICAgdGhpcy5kb21haW4gPSBkb21haW4uYWN0aXZlO1xuICAgIH1cbiAgfVxuXG4gIGlmICghdGhpcy5fZXZlbnRzIHx8IHRoaXMuX2V2ZW50cyA9PT0gT2JqZWN0LmdldFByb3RvdHlwZU9mKHRoaXMpLl9ldmVudHMpIHtcbiAgICB0aGlzLl9ldmVudHMgPSBuZXcgRXZlbnRIYW5kbGVycygpO1xuICAgIHRoaXMuX2V2ZW50c0NvdW50ID0gMDtcbiAgfVxuXG4gIHRoaXMuX21heExpc3RlbmVycyA9IHRoaXMuX21heExpc3RlbmVycyB8fCB1bmRlZmluZWQ7XG59O1xuXG4vLyBPYnZpb3VzbHkgbm90IGFsbCBFbWl0dGVycyBzaG91bGQgYmUgbGltaXRlZCB0byAxMC4gVGhpcyBmdW5jdGlvbiBhbGxvd3Ncbi8vIHRoYXQgdG8gYmUgaW5jcmVhc2VkLiBTZXQgdG8gemVybyBmb3IgdW5saW1pdGVkLlxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5zZXRNYXhMaXN0ZW5lcnMgPSBmdW5jdGlvbiBzZXRNYXhMaXN0ZW5lcnMobikge1xuICBpZiAodHlwZW9mIG4gIT09ICdudW1iZXInIHx8IG4gPCAwIHx8IGlzTmFOKG4pKVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1wiblwiIGFyZ3VtZW50IG11c3QgYmUgYSBwb3NpdGl2ZSBudW1iZXInKTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gbjtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5mdW5jdGlvbiAkZ2V0TWF4TGlzdGVuZXJzKHRoYXQpIHtcbiAgaWYgKHRoYXQuX21heExpc3RlbmVycyA9PT0gdW5kZWZpbmVkKVxuICAgIHJldHVybiBFdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycztcbiAgcmV0dXJuIHRoYXQuX21heExpc3RlbmVycztcbn1cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5nZXRNYXhMaXN0ZW5lcnMgPSBmdW5jdGlvbiBnZXRNYXhMaXN0ZW5lcnMoKSB7XG4gIHJldHVybiAkZ2V0TWF4TGlzdGVuZXJzKHRoaXMpO1xufTtcblxuLy8gVGhlc2Ugc3RhbmRhbG9uZSBlbWl0KiBmdW5jdGlvbnMgYXJlIHVzZWQgdG8gb3B0aW1pemUgY2FsbGluZyBvZiBldmVudFxuLy8gaGFuZGxlcnMgZm9yIGZhc3QgY2FzZXMgYmVjYXVzZSBlbWl0KCkgaXRzZWxmIG9mdGVuIGhhcyBhIHZhcmlhYmxlIG51bWJlciBvZlxuLy8gYXJndW1lbnRzIGFuZCBjYW4gYmUgZGVvcHRpbWl6ZWQgYmVjYXVzZSBvZiB0aGF0LiBUaGVzZSBmdW5jdGlvbnMgYWx3YXlzIGhhdmVcbi8vIHRoZSBzYW1lIG51bWJlciBvZiBhcmd1bWVudHMgYW5kIHRodXMgZG8gbm90IGdldCBkZW9wdGltaXplZCwgc28gdGhlIGNvZGVcbi8vIGluc2lkZSB0aGVtIGNhbiBleGVjdXRlIGZhc3Rlci5cbmZ1bmN0aW9uIGVtaXROb25lKGhhbmRsZXIsIGlzRm4sIHNlbGYpIHtcbiAgaWYgKGlzRm4pXG4gICAgaGFuZGxlci5jYWxsKHNlbGYpO1xuICBlbHNlIHtcbiAgICB2YXIgbGVuID0gaGFuZGxlci5sZW5ndGg7XG4gICAgdmFyIGxpc3RlbmVycyA9IGFycmF5Q2xvbmUoaGFuZGxlciwgbGVuKTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKVxuICAgICAgbGlzdGVuZXJzW2ldLmNhbGwoc2VsZik7XG4gIH1cbn1cbmZ1bmN0aW9uIGVtaXRPbmUoaGFuZGxlciwgaXNGbiwgc2VsZiwgYXJnMSkge1xuICBpZiAoaXNGbilcbiAgICBoYW5kbGVyLmNhbGwoc2VsZiwgYXJnMSk7XG4gIGVsc2Uge1xuICAgIHZhciBsZW4gPSBoYW5kbGVyLmxlbmd0aDtcbiAgICB2YXIgbGlzdGVuZXJzID0gYXJyYXlDbG9uZShoYW5kbGVyLCBsZW4pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpXG4gICAgICBsaXN0ZW5lcnNbaV0uY2FsbChzZWxmLCBhcmcxKTtcbiAgfVxufVxuZnVuY3Rpb24gZW1pdFR3byhoYW5kbGVyLCBpc0ZuLCBzZWxmLCBhcmcxLCBhcmcyKSB7XG4gIGlmIChpc0ZuKVxuICAgIGhhbmRsZXIuY2FsbChzZWxmLCBhcmcxLCBhcmcyKTtcbiAgZWxzZSB7XG4gICAgdmFyIGxlbiA9IGhhbmRsZXIubGVuZ3RoO1xuICAgIHZhciBsaXN0ZW5lcnMgPSBhcnJheUNsb25lKGhhbmRsZXIsIGxlbik7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47ICsraSlcbiAgICAgIGxpc3RlbmVyc1tpXS5jYWxsKHNlbGYsIGFyZzEsIGFyZzIpO1xuICB9XG59XG5mdW5jdGlvbiBlbWl0VGhyZWUoaGFuZGxlciwgaXNGbiwgc2VsZiwgYXJnMSwgYXJnMiwgYXJnMykge1xuICBpZiAoaXNGbilcbiAgICBoYW5kbGVyLmNhbGwoc2VsZiwgYXJnMSwgYXJnMiwgYXJnMyk7XG4gIGVsc2Uge1xuICAgIHZhciBsZW4gPSBoYW5kbGVyLmxlbmd0aDtcbiAgICB2YXIgbGlzdGVuZXJzID0gYXJyYXlDbG9uZShoYW5kbGVyLCBsZW4pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpXG4gICAgICBsaXN0ZW5lcnNbaV0uY2FsbChzZWxmLCBhcmcxLCBhcmcyLCBhcmczKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBlbWl0TWFueShoYW5kbGVyLCBpc0ZuLCBzZWxmLCBhcmdzKSB7XG4gIGlmIChpc0ZuKVxuICAgIGhhbmRsZXIuYXBwbHkoc2VsZiwgYXJncyk7XG4gIGVsc2Uge1xuICAgIHZhciBsZW4gPSBoYW5kbGVyLmxlbmd0aDtcbiAgICB2YXIgbGlzdGVuZXJzID0gYXJyYXlDbG9uZShoYW5kbGVyLCBsZW4pO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpXG4gICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkoc2VsZiwgYXJncyk7XG4gIH1cbn1cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24gZW1pdCh0eXBlKSB7XG4gIHZhciBlciwgaGFuZGxlciwgbGVuLCBhcmdzLCBpLCBldmVudHMsIGRvbWFpbjtcbiAgdmFyIG5lZWREb21haW5FeGl0ID0gZmFsc2U7XG4gIHZhciBkb0Vycm9yID0gKHR5cGUgPT09ICdlcnJvcicpO1xuXG4gIGV2ZW50cyA9IHRoaXMuX2V2ZW50cztcbiAgaWYgKGV2ZW50cylcbiAgICBkb0Vycm9yID0gKGRvRXJyb3IgJiYgZXZlbnRzLmVycm9yID09IG51bGwpO1xuICBlbHNlIGlmICghZG9FcnJvcilcbiAgICByZXR1cm4gZmFsc2U7XG5cbiAgZG9tYWluID0gdGhpcy5kb21haW47XG5cbiAgLy8gSWYgdGhlcmUgaXMgbm8gJ2Vycm9yJyBldmVudCBsaXN0ZW5lciB0aGVuIHRocm93LlxuICBpZiAoZG9FcnJvcikge1xuICAgIGVyID0gYXJndW1lbnRzWzFdO1xuICAgIGlmIChkb21haW4pIHtcbiAgICAgIGlmICghZXIpXG4gICAgICAgIGVyID0gbmV3IEVycm9yKCdVbmNhdWdodCwgdW5zcGVjaWZpZWQgXCJlcnJvclwiIGV2ZW50Jyk7XG4gICAgICBlci5kb21haW5FbWl0dGVyID0gdGhpcztcbiAgICAgIGVyLmRvbWFpbiA9IGRvbWFpbjtcbiAgICAgIGVyLmRvbWFpblRocm93biA9IGZhbHNlO1xuICAgICAgZG9tYWluLmVtaXQoJ2Vycm9yJywgZXIpO1xuICAgIH0gZWxzZSBpZiAoZXIgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgdGhyb3cgZXI7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIEF0IGxlYXN0IGdpdmUgc29tZSBraW5kIG9mIGNvbnRleHQgdG8gdGhlIHVzZXJcbiAgICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoJ1VuY2F1Z2h0LCB1bnNwZWNpZmllZCBcImVycm9yXCIgZXZlbnQuICgnICsgZXIgKyAnKScpO1xuICAgICAgZXJyLmNvbnRleHQgPSBlcjtcbiAgICAgIHRocm93IGVycjtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgaGFuZGxlciA9IGV2ZW50c1t0eXBlXTtcblxuICBpZiAoIWhhbmRsZXIpXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIHZhciBpc0ZuID0gdHlwZW9mIGhhbmRsZXIgPT09ICdmdW5jdGlvbic7XG4gIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gIHN3aXRjaCAobGVuKSB7XG4gICAgLy8gZmFzdCBjYXNlc1xuICAgIGNhc2UgMTpcbiAgICAgIGVtaXROb25lKGhhbmRsZXIsIGlzRm4sIHRoaXMpO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAyOlxuICAgICAgZW1pdE9uZShoYW5kbGVyLCBpc0ZuLCB0aGlzLCBhcmd1bWVudHNbMV0pO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSAzOlxuICAgICAgZW1pdFR3byhoYW5kbGVyLCBpc0ZuLCB0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIDQ6XG4gICAgICBlbWl0VGhyZWUoaGFuZGxlciwgaXNGbiwgdGhpcywgYXJndW1lbnRzWzFdLCBhcmd1bWVudHNbMl0sIGFyZ3VtZW50c1szXSk7XG4gICAgICBicmVhaztcbiAgICAvLyBzbG93ZXJcbiAgICBkZWZhdWx0OlxuICAgICAgYXJncyA9IG5ldyBBcnJheShsZW4gLSAxKTtcbiAgICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICBlbWl0TWFueShoYW5kbGVyLCBpc0ZuLCB0aGlzLCBhcmdzKTtcbiAgfVxuXG4gIGlmIChuZWVkRG9tYWluRXhpdClcbiAgICBkb21haW4uZXhpdCgpO1xuXG4gIHJldHVybiB0cnVlO1xufTtcblxuZnVuY3Rpb24gX2FkZExpc3RlbmVyKHRhcmdldCwgdHlwZSwgbGlzdGVuZXIsIHByZXBlbmQpIHtcbiAgdmFyIG07XG4gIHZhciBldmVudHM7XG4gIHZhciBleGlzdGluZztcblxuICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSAnZnVuY3Rpb24nKVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1wibGlzdGVuZXJcIiBhcmd1bWVudCBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBldmVudHMgPSB0YXJnZXQuX2V2ZW50cztcbiAgaWYgKCFldmVudHMpIHtcbiAgICBldmVudHMgPSB0YXJnZXQuX2V2ZW50cyA9IG5ldyBFdmVudEhhbmRsZXJzKCk7XG4gICAgdGFyZ2V0Ll9ldmVudHNDb3VudCA9IDA7XG4gIH0gZWxzZSB7XG4gICAgLy8gVG8gYXZvaWQgcmVjdXJzaW9uIGluIHRoZSBjYXNlIHRoYXQgdHlwZSA9PT0gXCJuZXdMaXN0ZW5lclwiISBCZWZvcmVcbiAgICAvLyBhZGRpbmcgaXQgdG8gdGhlIGxpc3RlbmVycywgZmlyc3QgZW1pdCBcIm5ld0xpc3RlbmVyXCIuXG4gICAgaWYgKGV2ZW50cy5uZXdMaXN0ZW5lcikge1xuICAgICAgdGFyZ2V0LmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgICAgIGxpc3RlbmVyLmxpc3RlbmVyID8gbGlzdGVuZXIubGlzdGVuZXIgOiBsaXN0ZW5lcik7XG5cbiAgICAgIC8vIFJlLWFzc2lnbiBgZXZlbnRzYCBiZWNhdXNlIGEgbmV3TGlzdGVuZXIgaGFuZGxlciBjb3VsZCBoYXZlIGNhdXNlZCB0aGVcbiAgICAgIC8vIHRoaXMuX2V2ZW50cyB0byBiZSBhc3NpZ25lZCB0byBhIG5ldyBvYmplY3RcbiAgICAgIGV2ZW50cyA9IHRhcmdldC5fZXZlbnRzO1xuICAgIH1cbiAgICBleGlzdGluZyA9IGV2ZW50c1t0eXBlXTtcbiAgfVxuXG4gIGlmICghZXhpc3RpbmcpIHtcbiAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cbiAgICBleGlzdGluZyA9IGV2ZW50c1t0eXBlXSA9IGxpc3RlbmVyO1xuICAgICsrdGFyZ2V0Ll9ldmVudHNDb3VudDtcbiAgfSBlbHNlIHtcbiAgICBpZiAodHlwZW9mIGV4aXN0aW5nID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAvLyBBZGRpbmcgdGhlIHNlY29uZCBlbGVtZW50LCBuZWVkIHRvIGNoYW5nZSB0byBhcnJheS5cbiAgICAgIGV4aXN0aW5nID0gZXZlbnRzW3R5cGVdID0gcHJlcGVuZCA/IFtsaXN0ZW5lciwgZXhpc3RpbmddIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIFtleGlzdGluZywgbGlzdGVuZXJdO1xuICAgIH0gZWxzZSB7XG4gICAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhcHBlbmQuXG4gICAgICBpZiAocHJlcGVuZCkge1xuICAgICAgICBleGlzdGluZy51bnNoaWZ0KGxpc3RlbmVyKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGV4aXN0aW5nLnB1c2gobGlzdGVuZXIpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gICAgaWYgKCFleGlzdGluZy53YXJuZWQpIHtcbiAgICAgIG0gPSAkZ2V0TWF4TGlzdGVuZXJzKHRhcmdldCk7XG4gICAgICBpZiAobSAmJiBtID4gMCAmJiBleGlzdGluZy5sZW5ndGggPiBtKSB7XG4gICAgICAgIGV4aXN0aW5nLndhcm5lZCA9IHRydWU7XG4gICAgICAgIHZhciB3ID0gbmV3IEVycm9yKCdQb3NzaWJsZSBFdmVudEVtaXR0ZXIgbWVtb3J5IGxlYWsgZGV0ZWN0ZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV4aXN0aW5nLmxlbmd0aCArICcgJyArIHR5cGUgKyAnIGxpc3RlbmVycyBhZGRlZC4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgJ1VzZSBlbWl0dGVyLnNldE1heExpc3RlbmVycygpIHRvIGluY3JlYXNlIGxpbWl0Jyk7XG4gICAgICAgIHcubmFtZSA9ICdNYXhMaXN0ZW5lcnNFeGNlZWRlZFdhcm5pbmcnO1xuICAgICAgICB3LmVtaXR0ZXIgPSB0YXJnZXQ7XG4gICAgICAgIHcudHlwZSA9IHR5cGU7XG4gICAgICAgIHcuY291bnQgPSBleGlzdGluZy5sZW5ndGg7XG4gICAgICAgIGVtaXRXYXJuaW5nKHcpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0YXJnZXQ7XG59XG5mdW5jdGlvbiBlbWl0V2FybmluZyhlKSB7XG4gIHR5cGVvZiBjb25zb2xlLndhcm4gPT09ICdmdW5jdGlvbicgPyBjb25zb2xlLndhcm4oZSkgOiBjb25zb2xlLmxvZyhlKTtcbn1cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBmdW5jdGlvbiBhZGRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcikge1xuICByZXR1cm4gX2FkZExpc3RlbmVyKHRoaXMsIHR5cGUsIGxpc3RlbmVyLCBmYWxzZSk7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5wcmVwZW5kTGlzdGVuZXIgPVxuICAgIGZ1bmN0aW9uIHByZXBlbmRMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcikge1xuICAgICAgcmV0dXJuIF9hZGRMaXN0ZW5lcih0aGlzLCB0eXBlLCBsaXN0ZW5lciwgdHJ1ZSk7XG4gICAgfTtcblxuZnVuY3Rpb24gX29uY2VXcmFwKHRhcmdldCwgdHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIGZpcmVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGcoKSB7XG4gICAgdGFyZ2V0LnJlbW92ZUxpc3RlbmVyKHR5cGUsIGcpO1xuICAgIGlmICghZmlyZWQpIHtcbiAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgIGxpc3RlbmVyLmFwcGx5KHRhcmdldCwgYXJndW1lbnRzKTtcbiAgICB9XG4gIH1cbiAgZy5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICByZXR1cm4gZztcbn1cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24gb25jZSh0eXBlLCBsaXN0ZW5lcikge1xuICBpZiAodHlwZW9mIGxpc3RlbmVyICE9PSAnZnVuY3Rpb24nKVxuICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1wibGlzdGVuZXJcIiBhcmd1bWVudCBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgdGhpcy5vbih0eXBlLCBfb25jZVdyYXAodGhpcywgdHlwZSwgbGlzdGVuZXIpKTtcbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnByZXBlbmRPbmNlTGlzdGVuZXIgPVxuICAgIGZ1bmN0aW9uIHByZXBlbmRPbmNlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXIpIHtcbiAgICAgIGlmICh0eXBlb2YgbGlzdGVuZXIgIT09ICdmdW5jdGlvbicpXG4gICAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ1wibGlzdGVuZXJcIiBhcmd1bWVudCBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcbiAgICAgIHRoaXMucHJlcGVuZExpc3RlbmVyKHR5cGUsIF9vbmNlV3JhcCh0aGlzLCB0eXBlLCBsaXN0ZW5lcikpO1xuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuLy8gZW1pdHMgYSAncmVtb3ZlTGlzdGVuZXInIGV2ZW50IGlmZiB0aGUgbGlzdGVuZXIgd2FzIHJlbW92ZWRcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPVxuICAgIGZ1bmN0aW9uIHJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVyKSB7XG4gICAgICB2YXIgbGlzdCwgZXZlbnRzLCBwb3NpdGlvbiwgaSwgb3JpZ2luYWxMaXN0ZW5lcjtcblxuICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignXCJsaXN0ZW5lclwiIGFyZ3VtZW50IG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gICAgICBldmVudHMgPSB0aGlzLl9ldmVudHM7XG4gICAgICBpZiAoIWV2ZW50cylcbiAgICAgICAgcmV0dXJuIHRoaXM7XG5cbiAgICAgIGxpc3QgPSBldmVudHNbdHlwZV07XG4gICAgICBpZiAoIWxpc3QpXG4gICAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHwgKGxpc3QubGlzdGVuZXIgJiYgbGlzdC5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgICAgIGlmICgtLXRoaXMuX2V2ZW50c0NvdW50ID09PSAwKVxuICAgICAgICAgIHRoaXMuX2V2ZW50cyA9IG5ldyBFdmVudEhhbmRsZXJzKCk7XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIGRlbGV0ZSBldmVudHNbdHlwZV07XG4gICAgICAgICAgaWYgKGV2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgICAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0Lmxpc3RlbmVyIHx8IGxpc3RlbmVyKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmICh0eXBlb2YgbGlzdCAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICBwb3NpdGlvbiA9IC0xO1xuXG4gICAgICAgIGZvciAoaSA9IGxpc3QubGVuZ3RoOyBpLS0gPiAwOykge1xuICAgICAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fFxuICAgICAgICAgICAgICAobGlzdFtpXS5saXN0ZW5lciAmJiBsaXN0W2ldLmxpc3RlbmVyID09PSBsaXN0ZW5lcikpIHtcbiAgICAgICAgICAgIG9yaWdpbmFsTGlzdGVuZXIgPSBsaXN0W2ldLmxpc3RlbmVyO1xuICAgICAgICAgICAgcG9zaXRpb24gPSBpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHBvc2l0aW9uIDwgMClcbiAgICAgICAgICByZXR1cm4gdGhpcztcblxuICAgICAgICBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICBsaXN0WzBdID0gdW5kZWZpbmVkO1xuICAgICAgICAgIGlmICgtLXRoaXMuX2V2ZW50c0NvdW50ID09PSAwKSB7XG4gICAgICAgICAgICB0aGlzLl9ldmVudHMgPSBuZXcgRXZlbnRIYW5kbGVycygpO1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlbGV0ZSBldmVudHNbdHlwZV07XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHNwbGljZU9uZShsaXN0LCBwb3NpdGlvbik7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBvcmlnaW5hbExpc3RlbmVyIHx8IGxpc3RlbmVyKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRoaXM7XG4gICAgfTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVBbGxMaXN0ZW5lcnMgPVxuICAgIGZ1bmN0aW9uIHJlbW92ZUFsbExpc3RlbmVycyh0eXBlKSB7XG4gICAgICB2YXIgbGlzdGVuZXJzLCBldmVudHM7XG5cbiAgICAgIGV2ZW50cyA9IHRoaXMuX2V2ZW50cztcbiAgICAgIGlmICghZXZlbnRzKVxuICAgICAgICByZXR1cm4gdGhpcztcblxuICAgICAgLy8gbm90IGxpc3RlbmluZyBmb3IgcmVtb3ZlTGlzdGVuZXIsIG5vIG5lZWQgdG8gZW1pdFxuICAgICAgaWYgKCFldmVudHMucmVtb3ZlTGlzdGVuZXIpIHtcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICB0aGlzLl9ldmVudHMgPSBuZXcgRXZlbnRIYW5kbGVycygpO1xuICAgICAgICAgIHRoaXMuX2V2ZW50c0NvdW50ID0gMDtcbiAgICAgICAgfSBlbHNlIGlmIChldmVudHNbdHlwZV0pIHtcbiAgICAgICAgICBpZiAoLS10aGlzLl9ldmVudHNDb3VudCA9PT0gMClcbiAgICAgICAgICAgIHRoaXMuX2V2ZW50cyA9IG5ldyBFdmVudEhhbmRsZXJzKCk7XG4gICAgICAgICAgZWxzZVxuICAgICAgICAgICAgZGVsZXRlIGV2ZW50c1t0eXBlXTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgIH1cblxuICAgICAgLy8gZW1pdCByZW1vdmVMaXN0ZW5lciBmb3IgYWxsIGxpc3RlbmVycyBvbiBhbGwgZXZlbnRzXG4gICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGV2ZW50cyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBrZXk7IGkgPCBrZXlzLmxlbmd0aDsgKytpKSB7XG4gICAgICAgICAga2V5ID0ga2V5c1tpXTtcbiAgICAgICAgICBpZiAoa2V5ID09PSAncmVtb3ZlTGlzdGVuZXInKSBjb250aW51ZTtcbiAgICAgICAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycyhrZXkpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMucmVtb3ZlQWxsTGlzdGVuZXJzKCdyZW1vdmVMaXN0ZW5lcicpO1xuICAgICAgICB0aGlzLl9ldmVudHMgPSBuZXcgRXZlbnRIYW5kbGVycygpO1xuICAgICAgICB0aGlzLl9ldmVudHNDb3VudCA9IDA7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgfVxuXG4gICAgICBsaXN0ZW5lcnMgPSBldmVudHNbdHlwZV07XG5cbiAgICAgIGlmICh0eXBlb2YgbGlzdGVuZXJzID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzKTtcbiAgICAgIH0gZWxzZSBpZiAobGlzdGVuZXJzKSB7XG4gICAgICAgIC8vIExJRk8gb3JkZXJcbiAgICAgICAgZG8ge1xuICAgICAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzW2xpc3RlbmVycy5sZW5ndGggLSAxXSk7XG4gICAgICAgIH0gd2hpbGUgKGxpc3RlbmVyc1swXSk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB0aGlzO1xuICAgIH07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24gbGlzdGVuZXJzKHR5cGUpIHtcbiAgdmFyIGV2bGlzdGVuZXI7XG4gIHZhciByZXQ7XG4gIHZhciBldmVudHMgPSB0aGlzLl9ldmVudHM7XG5cbiAgaWYgKCFldmVudHMpXG4gICAgcmV0ID0gW107XG4gIGVsc2Uge1xuICAgIGV2bGlzdGVuZXIgPSBldmVudHNbdHlwZV07XG4gICAgaWYgKCFldmxpc3RlbmVyKVxuICAgICAgcmV0ID0gW107XG4gICAgZWxzZSBpZiAodHlwZW9mIGV2bGlzdGVuZXIgPT09ICdmdW5jdGlvbicpXG4gICAgICByZXQgPSBbZXZsaXN0ZW5lci5saXN0ZW5lciB8fCBldmxpc3RlbmVyXTtcbiAgICBlbHNlXG4gICAgICByZXQgPSB1bndyYXBMaXN0ZW5lcnMoZXZsaXN0ZW5lcik7XG4gIH1cblxuICByZXR1cm4gcmV0O1xufTtcblxuRXZlbnRFbWl0dGVyLmxpc3RlbmVyQ291bnQgPSBmdW5jdGlvbihlbWl0dGVyLCB0eXBlKSB7XG4gIGlmICh0eXBlb2YgZW1pdHRlci5saXN0ZW5lckNvdW50ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgcmV0dXJuIGVtaXR0ZXIubGlzdGVuZXJDb3VudCh0eXBlKTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbGlzdGVuZXJDb3VudC5jYWxsKGVtaXR0ZXIsIHR5cGUpO1xuICB9XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVyQ291bnQgPSBsaXN0ZW5lckNvdW50O1xuZnVuY3Rpb24gbGlzdGVuZXJDb3VudCh0eXBlKSB7XG4gIHZhciBldmVudHMgPSB0aGlzLl9ldmVudHM7XG5cbiAgaWYgKGV2ZW50cykge1xuICAgIHZhciBldmxpc3RlbmVyID0gZXZlbnRzW3R5cGVdO1xuXG4gICAgaWYgKHR5cGVvZiBldmxpc3RlbmVyID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm4gMTtcbiAgICB9IGVsc2UgaWYgKGV2bGlzdGVuZXIpIHtcbiAgICAgIHJldHVybiBldmxpc3RlbmVyLmxlbmd0aDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gMDtcbn1cblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5ldmVudE5hbWVzID0gZnVuY3Rpb24gZXZlbnROYW1lcygpIHtcbiAgcmV0dXJuIHRoaXMuX2V2ZW50c0NvdW50ID4gMCA/IFJlZmxlY3Qub3duS2V5cyh0aGlzLl9ldmVudHMpIDogW107XG59O1xuXG4vLyBBYm91dCAxLjV4IGZhc3RlciB0aGFuIHRoZSB0d28tYXJnIHZlcnNpb24gb2YgQXJyYXkjc3BsaWNlKCkuXG5mdW5jdGlvbiBzcGxpY2VPbmUobGlzdCwgaW5kZXgpIHtcbiAgZm9yICh2YXIgaSA9IGluZGV4LCBrID0gaSArIDEsIG4gPSBsaXN0Lmxlbmd0aDsgayA8IG47IGkgKz0gMSwgayArPSAxKVxuICAgIGxpc3RbaV0gPSBsaXN0W2tdO1xuICBsaXN0LnBvcCgpO1xufVxuXG5mdW5jdGlvbiBhcnJheUNsb25lKGFyciwgaSkge1xuICB2YXIgY29weSA9IG5ldyBBcnJheShpKTtcbiAgd2hpbGUgKGktLSlcbiAgICBjb3B5W2ldID0gYXJyW2ldO1xuICByZXR1cm4gY29weTtcbn1cblxuZnVuY3Rpb24gdW53cmFwTGlzdGVuZXJzKGFycikge1xuICB2YXIgcmV0ID0gbmV3IEFycmF5KGFyci5sZW5ndGgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHJldC5sZW5ndGg7ICsraSkge1xuICAgIHJldFtpXSA9IGFycltpXS5saXN0ZW5lciB8fCBhcnJbaV07XG4gIH1cbiAgcmV0dXJuIHJldDtcbn1cbiIsIi8qKlxuICogVHJhZSwgdGhlIGZldGNoIGxpYnJhcnkhXG4gKlxuICogQHZlcnNpb246IDAuMC4xMFxuICogQGF1dGhvcnM6IGdpbGxjaHJpc3RpYW4gPGdpbGxjaHJpc3RpYW5nQGdtYWlsLmNvbT4gfCBuZGVsdmFsbGUgPG5pY29sYXMuZGVsdmFsbGVAZ21haWwuY29tPlxuICovXG4hZnVuY3Rpb24oZSx0KXtcIm9iamVjdFwiPT10eXBlb2YgZXhwb3J0cyYmXCJ1bmRlZmluZWRcIiE9dHlwZW9mIG1vZHVsZT9tb2R1bGUuZXhwb3J0cz10KCk6XCJmdW5jdGlvblwiPT10eXBlb2YgZGVmaW5lJiZkZWZpbmUuYW1kP2RlZmluZShcInRyYWVcIix0KTplLnRyYWU9dCgpfSh0aGlzLGZ1bmN0aW9uKCl7XCJ1c2Ugc3RyaWN0XCI7ZnVuY3Rpb24gZSgpe3ZhciBlPWFyZ3VtZW50cy5sZW5ndGg+MCYmdm9pZCAwIT09YXJndW1lbnRzWzBdP2FyZ3VtZW50c1swXTpcIlwiLHQ9YXJndW1lbnRzLmxlbmd0aD4xJiZ2b2lkIDAhPT1hcmd1bWVudHNbMV0/YXJndW1lbnRzWzFdOnt9LHI9T2JqZWN0LmtleXModCk7cmV0dXJuIDA9PT1yLmxlbmd0aD9lOmUrZW5jb2RlVVJJKHIucmVkdWNlKGZ1bmN0aW9uKGUscil7cmV0dXJuIGUrXCImXCIrcitcIj1cIisodFtyXXx8XCJcIil9LFwiP1wiKS5yZXBsYWNlKFwiPyZcIixcIj9cIikpfWZ1bmN0aW9uIHQoKXt2YXIgZT1hcmd1bWVudHMubGVuZ3RoPjAmJnZvaWQgMCE9PWFyZ3VtZW50c1swXT9hcmd1bWVudHNbMF06XCJcIjtpZighZS5pbmNsdWRlcyhcIj9cIikpcmV0dXJue307dmFyIHQ9e30sbj1kZWNvZGVVUkkoZSkuc3BsaXQoXCI/XCIpLG89eShuLDIpLGk9b1sxXSxzPWkuc3BsaXQoXCImXCIpO3JldHVybiBzLmZvckVhY2goZnVuY3Rpb24oZSl7dmFyIG49ZS5zcGxpdChcIj1cIiksbz15KG4sMiksaT1vWzBdLHM9b1sxXTt0W2ldPXIocyl9KSx0fWZ1bmN0aW9uIHIoZSl7aWYoXCJcIiE9PWUpe2lmKFwidHJ1ZVwiPT09ZSlyZXR1cm4hMDtpZihcImZhbHNlXCI9PT1lKXJldHVybiExO3ZhciB0PXBhcnNlRmxvYXQoZSk7cmV0dXJuIE51bWJlci5pc05hTih0KXx8dCE9ZT9lOnR9fWZ1bmN0aW9uIG4oZSx0KXtyZXR1cm4gdD17ZXhwb3J0czp7fX0sZSh0LHQuZXhwb3J0cyksdC5leHBvcnRzfWZ1bmN0aW9uIG8oKXtmb3IodmFyIGU9YXJndW1lbnRzLmxlbmd0aCx0PUFycmF5KGUpLHI9MDtyPGU7cisrKXRbcl09YXJndW1lbnRzW3JdO3JldHVybiBnLnJlY3Vyc2l2ZS5hcHBseShnLFshMF0uY29uY2F0KHQpKX1mdW5jdGlvbiBpKGUsdCl7dmFyIHI9e307cmV0dXJuIE9iamVjdC5rZXlzKGUpLmZvckVhY2goZnVuY3Rpb24obil7dC5pbmRleE9mKG4pPT09LTEmJihyW25dPWVbbl0pfSkscn1mdW5jdGlvbiBzKGUsdCl7cmV0dXJuIGUucmVwbGFjZSgvXFwvKyQvLFwiXCIpK1wiL1wiK3QucmVwbGFjZSgvXlxcLysvLFwiXCIpfWZ1bmN0aW9uIGEoZSl7cmV0dXJuL14oW2Etel1bYS16XFxkXFwrXFwtXFwuXSo6KT9cXC9cXC8vaS50ZXN0KGUpfWZ1bmN0aW9uIHUoZSx0KXtyZXR1cm4hZXx8YSh0KT90OnMoZSx0KX1mdW5jdGlvbiBmKGUsdCl7cmV0dXJuIGVbdF0oKS50aGVuKGZ1bmN0aW9uKHQpe3JldHVybntoZWFkZXJzOmUuaGVhZGVycyxzdGF0dXM6ZS5zdGF0dXMsc3RhdHVzVGV4dDplLnN0YXR1c1RleHQsZGF0YTp0fX0pfWZ1bmN0aW9uIGMoZSx0KXtpZighZS5vayl7dmFyIHI9bmV3IEVycm9yKGUuc3RhdHVzVGV4dCk7cmV0dXJuIHIuc3RhdHVzPWUuc3RhdHVzLHIuc3RhdHVzVGV4dD1lLnN0YXR1c1RleHQsci5oZWFkZXJzPWUuaGVhZGVycyxQcm9taXNlLnJlamVjdChyKX1pZih0KXJldHVybiBmKGUsdCk7dmFyIG49ZS5oZWFkZXJzLmdldChcIkNvbnRlbnQtVHlwZVwiKTtyZXR1cm4gbiYmbi5pbmNsdWRlcyhcImFwcGxpY2F0aW9uL2pzb25cIik/ZihlLFwianNvblwiKTpmKGUsXCJ0ZXh0XCIpfSFmdW5jdGlvbihlKXtmdW5jdGlvbiB0KGUpe2lmKFwic3RyaW5nXCIhPXR5cGVvZiBlJiYoZT1TdHJpbmcoZSkpLC9bXmEtejAtOVxcLSMkJSYnKisuXFxeX2B8fl0vaS50ZXN0KGUpKXRocm93IG5ldyBUeXBlRXJyb3IoXCJJbnZhbGlkIGNoYXJhY3RlciBpbiBoZWFkZXIgZmllbGQgbmFtZVwiKTtyZXR1cm4gZS50b0xvd2VyQ2FzZSgpfWZ1bmN0aW9uIHIoZSl7cmV0dXJuXCJzdHJpbmdcIiE9dHlwZW9mIGUmJihlPVN0cmluZyhlKSksZX1mdW5jdGlvbiBuKGUpe3ZhciB0PXtuZXh0OmZ1bmN0aW9uKCl7dmFyIHQ9ZS5zaGlmdCgpO3JldHVybntkb25lOnZvaWQgMD09PXQsdmFsdWU6dH19fTtyZXR1cm4geS5pdGVyYWJsZSYmKHRbU3ltYm9sLml0ZXJhdG9yXT1mdW5jdGlvbigpe3JldHVybiB0fSksdH1mdW5jdGlvbiBvKGUpe3RoaXMubWFwPXt9LGUgaW5zdGFuY2VvZiBvP2UuZm9yRWFjaChmdW5jdGlvbihlLHQpe3RoaXMuYXBwZW5kKHQsZSl9LHRoaXMpOmUmJk9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKGUpLmZvckVhY2goZnVuY3Rpb24odCl7dGhpcy5hcHBlbmQodCxlW3RdKX0sdGhpcyl9ZnVuY3Rpb24gaShlKXtyZXR1cm4gZS5ib2R5VXNlZD9Qcm9taXNlLnJlamVjdChuZXcgVHlwZUVycm9yKFwiQWxyZWFkeSByZWFkXCIpKTp2b2lkKGUuYm9keVVzZWQ9ITApfWZ1bmN0aW9uIHMoZSl7cmV0dXJuIG5ldyBQcm9taXNlKGZ1bmN0aW9uKHQscil7ZS5vbmxvYWQ9ZnVuY3Rpb24oKXt0KGUucmVzdWx0KX0sZS5vbmVycm9yPWZ1bmN0aW9uKCl7cihlLmVycm9yKX19KX1mdW5jdGlvbiBhKGUpe3ZhciB0PW5ldyBGaWxlUmVhZGVyO3JldHVybiB0LnJlYWRBc0FycmF5QnVmZmVyKGUpLHModCl9ZnVuY3Rpb24gdShlKXt2YXIgdD1uZXcgRmlsZVJlYWRlcjtyZXR1cm4gdC5yZWFkQXNUZXh0KGUpLHModCl9ZnVuY3Rpb24gZigpe3JldHVybiB0aGlzLmJvZHlVc2VkPSExLHRoaXMuX2luaXRCb2R5PWZ1bmN0aW9uKGUpe2lmKHRoaXMuX2JvZHlJbml0PWUsXCJzdHJpbmdcIj09dHlwZW9mIGUpdGhpcy5fYm9keVRleHQ9ZTtlbHNlIGlmKHkuYmxvYiYmQmxvYi5wcm90b3R5cGUuaXNQcm90b3R5cGVPZihlKSl0aGlzLl9ib2R5QmxvYj1lO2Vsc2UgaWYoeS5mb3JtRGF0YSYmRm9ybURhdGEucHJvdG90eXBlLmlzUHJvdG90eXBlT2YoZSkpdGhpcy5fYm9keUZvcm1EYXRhPWU7ZWxzZSBpZih5LnNlYXJjaFBhcmFtcyYmVVJMU2VhcmNoUGFyYW1zLnByb3RvdHlwZS5pc1Byb3RvdHlwZU9mKGUpKXRoaXMuX2JvZHlUZXh0PWUudG9TdHJpbmcoKTtlbHNlIGlmKGUpe2lmKCF5LmFycmF5QnVmZmVyfHwhQXJyYXlCdWZmZXIucHJvdG90eXBlLmlzUHJvdG90eXBlT2YoZSkpdGhyb3cgbmV3IEVycm9yKFwidW5zdXBwb3J0ZWQgQm9keUluaXQgdHlwZVwiKX1lbHNlIHRoaXMuX2JvZHlUZXh0PVwiXCI7dGhpcy5oZWFkZXJzLmdldChcImNvbnRlbnQtdHlwZVwiKXx8KFwic3RyaW5nXCI9PXR5cGVvZiBlP3RoaXMuaGVhZGVycy5zZXQoXCJjb250ZW50LXR5cGVcIixcInRleHQvcGxhaW47Y2hhcnNldD1VVEYtOFwiKTp0aGlzLl9ib2R5QmxvYiYmdGhpcy5fYm9keUJsb2IudHlwZT90aGlzLmhlYWRlcnMuc2V0KFwiY29udGVudC10eXBlXCIsdGhpcy5fYm9keUJsb2IudHlwZSk6eS5zZWFyY2hQYXJhbXMmJlVSTFNlYXJjaFBhcmFtcy5wcm90b3R5cGUuaXNQcm90b3R5cGVPZihlKSYmdGhpcy5oZWFkZXJzLnNldChcImNvbnRlbnQtdHlwZVwiLFwiYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkO2NoYXJzZXQ9VVRGLThcIikpfSx5LmJsb2I/KHRoaXMuYmxvYj1mdW5jdGlvbigpe3ZhciBlPWkodGhpcyk7aWYoZSlyZXR1cm4gZTtpZih0aGlzLl9ib2R5QmxvYilyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX2JvZHlCbG9iKTtpZih0aGlzLl9ib2R5Rm9ybURhdGEpdGhyb3cgbmV3IEVycm9yKFwiY291bGQgbm90IHJlYWQgRm9ybURhdGEgYm9keSBhcyBibG9iXCIpO3JldHVybiBQcm9taXNlLnJlc29sdmUobmV3IEJsb2IoW3RoaXMuX2JvZHlUZXh0XSkpfSx0aGlzLmFycmF5QnVmZmVyPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMuYmxvYigpLnRoZW4oYSl9LHRoaXMudGV4dD1mdW5jdGlvbigpe3ZhciBlPWkodGhpcyk7aWYoZSlyZXR1cm4gZTtpZih0aGlzLl9ib2R5QmxvYilyZXR1cm4gdSh0aGlzLl9ib2R5QmxvYik7aWYodGhpcy5fYm9keUZvcm1EYXRhKXRocm93IG5ldyBFcnJvcihcImNvdWxkIG5vdCByZWFkIEZvcm1EYXRhIGJvZHkgYXMgdGV4dFwiKTtyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuX2JvZHlUZXh0KX0pOnRoaXMudGV4dD1mdW5jdGlvbigpe3ZhciBlPWkodGhpcyk7cmV0dXJuIGU/ZTpQcm9taXNlLnJlc29sdmUodGhpcy5fYm9keVRleHQpfSx5LmZvcm1EYXRhJiYodGhpcy5mb3JtRGF0YT1mdW5jdGlvbigpe3JldHVybiB0aGlzLnRleHQoKS50aGVuKGwpfSksdGhpcy5qc29uPWZ1bmN0aW9uKCl7cmV0dXJuIHRoaXMudGV4dCgpLnRoZW4oSlNPTi5wYXJzZSl9LHRoaXN9ZnVuY3Rpb24gYyhlKXt2YXIgdD1lLnRvVXBwZXJDYXNlKCk7cmV0dXJuIGIuaW5kZXhPZih0KT4tMT90OmV9ZnVuY3Rpb24gaChlLHQpe3Q9dHx8e307dmFyIHI9dC5ib2R5O2lmKGgucHJvdG90eXBlLmlzUHJvdG90eXBlT2YoZSkpe2lmKGUuYm9keVVzZWQpdGhyb3cgbmV3IFR5cGVFcnJvcihcIkFscmVhZHkgcmVhZFwiKTt0aGlzLnVybD1lLnVybCx0aGlzLmNyZWRlbnRpYWxzPWUuY3JlZGVudGlhbHMsdC5oZWFkZXJzfHwodGhpcy5oZWFkZXJzPW5ldyBvKGUuaGVhZGVycykpLHRoaXMubWV0aG9kPWUubWV0aG9kLHRoaXMubW9kZT1lLm1vZGUscnx8KHI9ZS5fYm9keUluaXQsZS5ib2R5VXNlZD0hMCl9ZWxzZSB0aGlzLnVybD1lO2lmKHRoaXMuY3JlZGVudGlhbHM9dC5jcmVkZW50aWFsc3x8dGhpcy5jcmVkZW50aWFsc3x8XCJvbWl0XCIsIXQuaGVhZGVycyYmdGhpcy5oZWFkZXJzfHwodGhpcy5oZWFkZXJzPW5ldyBvKHQuaGVhZGVycykpLHRoaXMubWV0aG9kPWModC5tZXRob2R8fHRoaXMubWV0aG9kfHxcIkdFVFwiKSx0aGlzLm1vZGU9dC5tb2RlfHx0aGlzLm1vZGV8fG51bGwsdGhpcy5yZWZlcnJlcj1udWxsLChcIkdFVFwiPT09dGhpcy5tZXRob2R8fFwiSEVBRFwiPT09dGhpcy5tZXRob2QpJiZyKXRocm93IG5ldyBUeXBlRXJyb3IoXCJCb2R5IG5vdCBhbGxvd2VkIGZvciBHRVQgb3IgSEVBRCByZXF1ZXN0c1wiKTt0aGlzLl9pbml0Qm9keShyKX1mdW5jdGlvbiBsKGUpe3ZhciB0PW5ldyBGb3JtRGF0YTtyZXR1cm4gZS50cmltKCkuc3BsaXQoXCImXCIpLmZvckVhY2goZnVuY3Rpb24oZSl7aWYoZSl7dmFyIHI9ZS5zcGxpdChcIj1cIiksbj1yLnNoaWZ0KCkucmVwbGFjZSgvXFwrL2csXCIgXCIpLG89ci5qb2luKFwiPVwiKS5yZXBsYWNlKC9cXCsvZyxcIiBcIik7dC5hcHBlbmQoZGVjb2RlVVJJQ29tcG9uZW50KG4pLGRlY29kZVVSSUNvbXBvbmVudChvKSl9fSksdH1mdW5jdGlvbiBkKGUpe3ZhciB0PW5ldyBvLHI9KGUuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCl8fFwiXCIpLnRyaW0oKS5zcGxpdChcIlxcblwiKTtyZXR1cm4gci5mb3JFYWNoKGZ1bmN0aW9uKGUpe3ZhciByPWUudHJpbSgpLnNwbGl0KFwiOlwiKSxuPXIuc2hpZnQoKS50cmltKCksbz1yLmpvaW4oXCI6XCIpLnRyaW0oKTt0LmFwcGVuZChuLG8pfSksdH1mdW5jdGlvbiBwKGUsdCl7dHx8KHQ9e30pLHRoaXMudHlwZT1cImRlZmF1bHRcIix0aGlzLnN0YXR1cz10LnN0YXR1cyx0aGlzLm9rPXRoaXMuc3RhdHVzPj0yMDAmJnRoaXMuc3RhdHVzPDMwMCx0aGlzLnN0YXR1c1RleHQ9dC5zdGF0dXNUZXh0LHRoaXMuaGVhZGVycz10LmhlYWRlcnMgaW5zdGFuY2VvZiBvP3QuaGVhZGVyczpuZXcgbyh0LmhlYWRlcnMpLHRoaXMudXJsPXQudXJsfHxcIlwiLHRoaXMuX2luaXRCb2R5KGUpfWlmKCFlLmZldGNoKXt2YXIgeT17c2VhcmNoUGFyYW1zOlwiVVJMU2VhcmNoUGFyYW1zXCJpbiBlLGl0ZXJhYmxlOlwiU3ltYm9sXCJpbiBlJiZcIml0ZXJhdG9yXCJpbiBTeW1ib2wsYmxvYjpcIkZpbGVSZWFkZXJcImluIGUmJlwiQmxvYlwiaW4gZSYmZnVuY3Rpb24oKXt0cnl7cmV0dXJuIG5ldyBCbG9iLCEwfWNhdGNoKGUpe3JldHVybiExfX0oKSxmb3JtRGF0YTpcIkZvcm1EYXRhXCJpbiBlLGFycmF5QnVmZmVyOlwiQXJyYXlCdWZmZXJcImluIGV9O28ucHJvdG90eXBlLmFwcGVuZD1mdW5jdGlvbihlLG4pe2U9dChlKSxuPXIobik7dmFyIG89dGhpcy5tYXBbZV07b3x8KG89W10sdGhpcy5tYXBbZV09byksby5wdXNoKG4pfSxvLnByb3RvdHlwZS5kZWxldGU9ZnVuY3Rpb24oZSl7ZGVsZXRlIHRoaXMubWFwW3QoZSldfSxvLnByb3RvdHlwZS5nZXQ9ZnVuY3Rpb24oZSl7dmFyIHI9dGhpcy5tYXBbdChlKV07cmV0dXJuIHI/clswXTpudWxsfSxvLnByb3RvdHlwZS5nZXRBbGw9ZnVuY3Rpb24oZSl7cmV0dXJuIHRoaXMubWFwW3QoZSldfHxbXX0sby5wcm90b3R5cGUuaGFzPWZ1bmN0aW9uKGUpe3JldHVybiB0aGlzLm1hcC5oYXNPd25Qcm9wZXJ0eSh0KGUpKX0sby5wcm90b3R5cGUuc2V0PWZ1bmN0aW9uKGUsbil7dGhpcy5tYXBbdChlKV09W3IobildfSxvLnByb3RvdHlwZS5mb3JFYWNoPWZ1bmN0aW9uKGUsdCl7T2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModGhpcy5tYXApLmZvckVhY2goZnVuY3Rpb24ocil7dGhpcy5tYXBbcl0uZm9yRWFjaChmdW5jdGlvbihuKXtlLmNhbGwodCxuLHIsdGhpcyl9LHRoaXMpfSx0aGlzKX0sby5wcm90b3R5cGUua2V5cz1mdW5jdGlvbigpe3ZhciBlPVtdO3JldHVybiB0aGlzLmZvckVhY2goZnVuY3Rpb24odCxyKXtlLnB1c2gocil9KSxuKGUpfSxvLnByb3RvdHlwZS52YWx1ZXM9ZnVuY3Rpb24oKXt2YXIgZT1bXTtyZXR1cm4gdGhpcy5mb3JFYWNoKGZ1bmN0aW9uKHQpe2UucHVzaCh0KX0pLG4oZSl9LG8ucHJvdG90eXBlLmVudHJpZXM9ZnVuY3Rpb24oKXt2YXIgZT1bXTtyZXR1cm4gdGhpcy5mb3JFYWNoKGZ1bmN0aW9uKHQscil7ZS5wdXNoKFtyLHRdKX0pLG4oZSl9LHkuaXRlcmFibGUmJihvLnByb3RvdHlwZVtTeW1ib2wuaXRlcmF0b3JdPW8ucHJvdG90eXBlLmVudHJpZXMpO3ZhciBiPVtcIkRFTEVURVwiLFwiR0VUXCIsXCJIRUFEXCIsXCJPUFRJT05TXCIsXCJQT1NUXCIsXCJQVVRcIl07aC5wcm90b3R5cGUuY2xvbmU9ZnVuY3Rpb24oKXtyZXR1cm4gbmV3IGgodGhpcyl9LGYuY2FsbChoLnByb3RvdHlwZSksZi5jYWxsKHAucHJvdG90eXBlKSxwLnByb3RvdHlwZS5jbG9uZT1mdW5jdGlvbigpe3JldHVybiBuZXcgcCh0aGlzLl9ib2R5SW5pdCx7c3RhdHVzOnRoaXMuc3RhdHVzLHN0YXR1c1RleHQ6dGhpcy5zdGF0dXNUZXh0LGhlYWRlcnM6bmV3IG8odGhpcy5oZWFkZXJzKSx1cmw6dGhpcy51cmx9KX0scC5lcnJvcj1mdW5jdGlvbigpe3ZhciBlPW5ldyBwKG51bGwse3N0YXR1czowLHN0YXR1c1RleHQ6XCJcIn0pO3JldHVybiBlLnR5cGU9XCJlcnJvclwiLGV9O3ZhciB2PVszMDEsMzAyLDMwMywzMDcsMzA4XTtwLnJlZGlyZWN0PWZ1bmN0aW9uKGUsdCl7aWYodi5pbmRleE9mKHQpPT09LTEpdGhyb3cgbmV3IFJhbmdlRXJyb3IoXCJJbnZhbGlkIHN0YXR1cyBjb2RlXCIpO3JldHVybiBuZXcgcChudWxsLHtzdGF0dXM6dCxoZWFkZXJzOntsb2NhdGlvbjplfX0pfSxlLkhlYWRlcnM9byxlLlJlcXVlc3Q9aCxlLlJlc3BvbnNlPXAsZS5mZXRjaD1mdW5jdGlvbihlLHQpe3JldHVybiBuZXcgUHJvbWlzZShmdW5jdGlvbihyLG4pe2Z1bmN0aW9uIG8oKXtyZXR1cm5cInJlc3BvbnNlVVJMXCJpbiBzP3MucmVzcG9uc2VVUkw6L15YLVJlcXVlc3QtVVJMOi9tLnRlc3Qocy5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKSk/cy5nZXRSZXNwb25zZUhlYWRlcihcIlgtUmVxdWVzdC1VUkxcIik6dm9pZCAwfXZhciBpO2k9aC5wcm90b3R5cGUuaXNQcm90b3R5cGVPZihlKSYmIXQ/ZTpuZXcgaChlLHQpO3ZhciBzPW5ldyBYTUxIdHRwUmVxdWVzdDtzLm9ubG9hZD1mdW5jdGlvbigpe3ZhciBlPXtzdGF0dXM6cy5zdGF0dXMsc3RhdHVzVGV4dDpzLnN0YXR1c1RleHQsaGVhZGVyczpkKHMpLHVybDpvKCl9LHQ9XCJyZXNwb25zZVwiaW4gcz9zLnJlc3BvbnNlOnMucmVzcG9uc2VUZXh0O3IobmV3IHAodCxlKSl9LHMub25lcnJvcj1mdW5jdGlvbigpe24obmV3IFR5cGVFcnJvcihcIk5ldHdvcmsgcmVxdWVzdCBmYWlsZWRcIikpfSxzLm9udGltZW91dD1mdW5jdGlvbigpe24obmV3IFR5cGVFcnJvcihcIk5ldHdvcmsgcmVxdWVzdCBmYWlsZWRcIikpfSxzLm9wZW4oaS5tZXRob2QsaS51cmwsITApLFwiaW5jbHVkZVwiPT09aS5jcmVkZW50aWFscyYmKHMud2l0aENyZWRlbnRpYWxzPSEwKSxcInJlc3BvbnNlVHlwZVwiaW4gcyYmeS5ibG9iJiYocy5yZXNwb25zZVR5cGU9XCJibG9iXCIpLGkuaGVhZGVycy5mb3JFYWNoKGZ1bmN0aW9uKGUsdCl7cy5zZXRSZXF1ZXN0SGVhZGVyKHQsZSl9KSxzLnNlbmQoXCJ1bmRlZmluZWRcIj09dHlwZW9mIGkuX2JvZHlJbml0P251bGw6aS5fYm9keUluaXQpfSl9LGUuZmV0Y2gucG9seWZpbGw9ITB9fShcInVuZGVmaW5lZFwiIT10eXBlb2Ygc2VsZj9zZWxmOndpbmRvdyk7dmFyIGg9ZSxsPVwiZnVuY3Rpb25cIj09dHlwZW9mIFN5bWJvbCYmXCJzeW1ib2xcIj09dHlwZW9mIFN5bWJvbC5pdGVyYXRvcj9mdW5jdGlvbihlKXtyZXR1cm4gdHlwZW9mIGV9OmZ1bmN0aW9uKGUpe3JldHVybiBlJiZcImZ1bmN0aW9uXCI9PXR5cGVvZiBTeW1ib2wmJmUuY29uc3RydWN0b3I9PT1TeW1ib2wmJmUhPT1TeW1ib2wucHJvdG90eXBlP1wic3ltYm9sXCI6dHlwZW9mIGV9LGQ9ZnVuY3Rpb24oZSx0KXtpZighKGUgaW5zdGFuY2VvZiB0KSl0aHJvdyBuZXcgVHlwZUVycm9yKFwiQ2Fubm90IGNhbGwgYSBjbGFzcyBhcyBhIGZ1bmN0aW9uXCIpfSxwPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gZShlLHQpe2Zvcih2YXIgcj0wO3I8dC5sZW5ndGg7cisrKXt2YXIgbj10W3JdO24uZW51bWVyYWJsZT1uLmVudW1lcmFibGV8fCExLG4uY29uZmlndXJhYmxlPSEwLFwidmFsdWVcImluIG4mJihuLndyaXRhYmxlPSEwKSxPYmplY3QuZGVmaW5lUHJvcGVydHkoZSxuLmtleSxuKX19cmV0dXJuIGZ1bmN0aW9uKHQscixuKXtyZXR1cm4gciYmZSh0LnByb3RvdHlwZSxyKSxuJiZlKHQsbiksdH19KCkseT1mdW5jdGlvbigpe2Z1bmN0aW9uIGUoZSx0KXt2YXIgcj1bXSxuPSEwLG89ITEsaT12b2lkIDA7dHJ5e2Zvcih2YXIgcyxhPWVbU3ltYm9sLml0ZXJhdG9yXSgpOyEobj0ocz1hLm5leHQoKSkuZG9uZSkmJihyLnB1c2gocy52YWx1ZSksIXR8fHIubGVuZ3RoIT09dCk7bj0hMCk7fWNhdGNoKGUpe289ITAsaT1lfWZpbmFsbHl7dHJ5eyFuJiZhLnJldHVybiYmYS5yZXR1cm4oKX1maW5hbGx5e2lmKG8pdGhyb3cgaX19cmV0dXJuIHJ9cmV0dXJuIGZ1bmN0aW9uKHQscil7aWYoQXJyYXkuaXNBcnJheSh0KSlyZXR1cm4gdDtpZihTeW1ib2wuaXRlcmF0b3IgaW4gT2JqZWN0KHQpKXJldHVybiBlKHQscik7dGhyb3cgbmV3IFR5cGVFcnJvcihcIkludmFsaWQgYXR0ZW1wdCB0byBkZXN0cnVjdHVyZSBub24taXRlcmFibGUgaW5zdGFuY2VcIil9fSgpLGI9dCx2PWgsbT1iLF89e2J1aWxkUXVlcnk6dixwYXJzZVF1ZXJ5Om19LHc9ZnVuY3Rpb24oKXtmdW5jdGlvbiBlKCl7ZCh0aGlzLGUpLHRoaXMuX2JlZm9yZT1bXSx0aGlzLl9zdWNjZXNzPVtdLHRoaXMuX2Vycm9yPVtdLHRoaXMuX2FmdGVyPVtdfXJldHVybiBwKGUsW3trZXk6XCJiZWZvcmVcIix2YWx1ZTpmdW5jdGlvbihlKXtyZXR1cm4gdGhpcy5fYmVmb3JlLnB1c2goZSksdGhpcy5fYmVmb3JlLmxlbmd0aC0xfX0se2tleTpcInN1Y2Nlc3NcIix2YWx1ZTpmdW5jdGlvbigpe3ZhciBlPWFyZ3VtZW50cy5sZW5ndGg+MCYmdm9pZCAwIT09YXJndW1lbnRzWzBdP2FyZ3VtZW50c1swXTpmdW5jdGlvbihlKXtyZXR1cm4gZX07cmV0dXJuIHRoaXMuX3N1Y2Nlc3MucHVzaChlKSx0aGlzLl9zdWNjZXNzLmxlbmd0aC0xfX0se2tleTpcImVycm9yXCIsdmFsdWU6ZnVuY3Rpb24oZSl7cmV0dXJuIHRoaXMuX2Vycm9yLnB1c2goZSksdGhpcy5fZXJyb3IubGVuZ3RoLTF9fSx7a2V5OlwiYWZ0ZXJcIix2YWx1ZTpmdW5jdGlvbihlKXtyZXR1cm4gdGhpcy5fYWZ0ZXIucHVzaChlKSx0aGlzLl9hZnRlci5sZW5ndGgtMX19LHtrZXk6XCJyZXNvbHZlQmVmb3JlXCIsdmFsdWU6ZnVuY3Rpb24oZSl7cmV0dXJuIHRoaXMuX2JlZm9yZS5yZWR1Y2UoZnVuY3Rpb24oZSx0KXtyZXR1cm4gZT1lLnRoZW4odCl9LFByb21pc2UucmVzb2x2ZShlKSl9fSx7a2V5OlwicmVzb2x2ZVN1Y2Nlc3NcIix2YWx1ZTpmdW5jdGlvbihlKXtyZXR1cm4gdGhpcy5fc3VjY2Vzcy5yZWR1Y2UoZnVuY3Rpb24oZSx0KXtyZXR1cm4gZT1lLnRoZW4odCl9LFByb21pc2UucmVzb2x2ZShlKSl9fSx7a2V5OlwicmVzb2x2ZUVycm9yXCIsdmFsdWU6ZnVuY3Rpb24oZSl7cmV0dXJuIHRoaXMuX2Vycm9yLmZvckVhY2goZnVuY3Rpb24odCl7cmV0dXJuIHQmJnQuY2FsbCYmdChlKX0pLFByb21pc2UucmVqZWN0KGUpfX0se2tleTpcInJlc29sdmVBZnRlclwiLHZhbHVlOmZ1bmN0aW9uKGUpe3JldHVybiB0aGlzLl9hZnRlci5yZWR1Y2UoZnVuY3Rpb24oZSx0KXtyZXR1cm4gZT1lLnRoZW4odCl9LFByb21pc2UucmVzb2x2ZShlKSl9fV0pLGV9KCksZz1uKGZ1bmN0aW9uKGUpeyFmdW5jdGlvbih0KXtmdW5jdGlvbiByKGUsdCl7aWYoXCJvYmplY3RcIiE9PW8oZSkpcmV0dXJuIHQ7Zm9yKHZhciBuIGluIHQpXCJvYmplY3RcIj09PW8oZVtuXSkmJlwib2JqZWN0XCI9PT1vKHRbbl0pP2Vbbl09cihlW25dLHRbbl0pOmVbbl09dFtuXTtyZXR1cm4gZX1mdW5jdGlvbiBuKGUsdCxuKXt2YXIgcz1uWzBdLGE9bi5sZW5ndGg7KGV8fFwib2JqZWN0XCIhPT1vKHMpKSYmKHM9e30pO2Zvcih2YXIgdT0wO3U8YTsrK3Upe3ZhciBmPW5bdV0sYz1vKGYpO2lmKFwib2JqZWN0XCI9PT1jKWZvcih2YXIgaCBpbiBmKXt2YXIgbD1lP2kuY2xvbmUoZltoXSk6ZltoXTt0P3NbaF09cihzW2hdLGwpOnNbaF09bH19cmV0dXJuIHN9ZnVuY3Rpb24gbyhlKXtyZXR1cm57fS50b1N0cmluZy5jYWxsKGUpLnNsaWNlKDgsLTEpLnRvTG93ZXJDYXNlKCl9dmFyIGk9ZnVuY3Rpb24oZSl7cmV0dXJuIG4oZT09PSEwLCExLGFyZ3VtZW50cyl9LHM9XCJtZXJnZVwiO2kucmVjdXJzaXZlPWZ1bmN0aW9uKGUpe3JldHVybiBuKGU9PT0hMCwhMCxhcmd1bWVudHMpfSxpLmNsb25lPWZ1bmN0aW9uKGUpe3ZhciB0LHIsbj1lLHM9byhlKTtpZihcImFycmF5XCI9PT1zKWZvcihuPVtdLHI9ZS5sZW5ndGgsdD0wO3Q8cjsrK3Qpblt0XT1pLmNsb25lKGVbdF0pO2Vsc2UgaWYoXCJvYmplY3RcIj09PXMpe249e307Zm9yKHQgaW4gZSluW3RdPWkuY2xvbmUoZVt0XSl9cmV0dXJuIG59LHQ/ZS5leHBvcnRzPWk6d2luZG93W3NdPWl9KFwib2JqZWN0XCI9PT0oXCJ1bmRlZmluZWRcIj09dHlwZW9mIGU/XCJ1bmRlZmluZWRcIjpsKGUpKSYmZSYmXCJvYmplY3RcIj09PWwoZS5leHBvcnRzKSYmZS5leHBvcnRzKX0pLFQ9e0FjY2VwdDpcImFwcGxpY2F0aW9uL2pzb24sIHRleHQvcGxhaW4sICovKlwiLFwiQ29udGVudC1UeXBlXCI6XCJhcHBsaWNhdGlvbi9qc29uXCJ9LHg9e3hzcmZDb29raWVOYW1lOlwiWFNSRi1UT0tFTlwiLHhzcmZIZWFkZXJOYW1lOlwiWC1YU1JGLVRPS0VOXCJ9LEU9ZnVuY3Rpb24oKXtmdW5jdGlvbiBlKCl7dmFyIHQ9YXJndW1lbnRzLmxlbmd0aD4wJiZ2b2lkIDAhPT1hcmd1bWVudHNbMF0/YXJndW1lbnRzWzBdOnt9O2QodGhpcyxlKSx0aGlzLl9kZWZhdWx0cz1vKHgse2hlYWRlcnM6VH0pLHRoaXMuX2NvbmZpZz17fSx0aGlzLnNldCh0KX1yZXR1cm4gcChlLFt7a2V5OlwibWVyZ2VXaXRoRGVmYXVsdHNcIix2YWx1ZTpmdW5jdGlvbigpe2Zvcih2YXIgZT1hcmd1bWVudHMubGVuZ3RoLHQ9QXJyYXkoZSkscj0wO3I8ZTtyKyspdFtyXT1hcmd1bWVudHNbcl07dmFyIG49by5hcHBseSh2b2lkIDAsW3RoaXMuX2RlZmF1bHRzLHRoaXMuX2NvbmZpZ10uY29uY2F0KHQpKTtyZXR1cm5cIm9iamVjdFwiPT09bChuLmJvZHkpJiZuLmhlYWRlcnMmJlwiYXBwbGljYXRpb24vanNvblwiPT09bi5oZWFkZXJzW1wiQ29udGVudC1UeXBlXCJdJiYobi5ib2R5PUpTT04uc3RyaW5naWZ5KG4uYm9keSkpLG59fSx7a2V5Olwic2V0XCIsdmFsdWU6ZnVuY3Rpb24oZSl7dGhpcy5fY29uZmlnPW8odGhpcy5fY29uZmlnLGUpfX0se2tleTpcImdldFwiLHZhbHVlOmZ1bmN0aW9uKCl7cmV0dXJuIG8odGhpcy5fZGVmYXVsdHMsdGhpcy5fY29uZmlnKX19XSksZX0oKSxVPWZ1bmN0aW9uKCl7ZnVuY3Rpb24gZSgpe3ZhciB0PWFyZ3VtZW50cy5sZW5ndGg+MCYmdm9pZCAwIT09YXJndW1lbnRzWzBdP2FyZ3VtZW50c1swXTp7fTtkKHRoaXMsZSksdGhpcy5fbWlkZGxld2FyZT1uZXcgdyx0aGlzLl9jb25maWc9bmV3IEUoaSh0LFtcImJhc2VVcmxcIl0pKSx0aGlzLmJhc2VVcmwodC5iYXNlVXJsfHxcIlwiKSx0aGlzLl9pbml0TWV0aG9kc1dpdGhCb2R5KCksdGhpcy5faW5pdE1ldGhvZHNXaXRoTm9Cb2R5KCl9cmV0dXJuIHAoZSxbe2tleTpcImNyZWF0ZVwiLHZhbHVlOmZ1bmN0aW9uKGUpe3JldHVybiBuZXcgdGhpcy5jb25zdHJ1Y3RvcihlKX19LHtrZXk6XCJ1c2VcIix2YWx1ZTpmdW5jdGlvbigpe3ZhciBlPWFyZ3VtZW50cy5sZW5ndGg+MCYmdm9pZCAwIT09YXJndW1lbnRzWzBdP2FyZ3VtZW50c1swXTp7fTtlLmJlZm9yZSYmdGhpcy5fbWlkZGxld2FyZS5iZWZvcmUoZS5iZWZvcmUpLGUuc3VjY2VzcyYmdGhpcy5fbWlkZGxld2FyZS5zdWNjZXNzKGUuc3VjY2VzcyksZS5lcnJvciYmdGhpcy5fbWlkZGxld2FyZS5lcnJvcihlLmVycm9yKSxlLmFmdGVyJiZ0aGlzLl9taWRkbGV3YXJlLmFmdGVyKGUuYWZ0ZXIpfX0se2tleTpcImRlZmF1bHRzXCIsdmFsdWU6ZnVuY3Rpb24oZSl7cmV0dXJuXCJ1bmRlZmluZWRcIj09dHlwZW9mIGU/dGhpcy5fY29uZmlnLmdldCgpOih0aGlzLl9jb25maWcuc2V0KGkoZSxbXCJiYXNlVXJsXCJdKSksZS5iYXNlVXJsJiZ0aGlzLmJhc2VVcmwoZS5iYXNlVXJsKSx0aGlzLl9jb25maWcuZ2V0KCkpfX0se2tleTpcImJhc2VVcmxcIix2YWx1ZTpmdW5jdGlvbihlKXtyZXR1cm5cInVuZGVmaW5lZFwiPT10eXBlb2YgZT90aGlzLl9iYXNlVXJsOih0aGlzLl9iYXNlVXJsPWUsdGhpcy5fYmFzZVVybCl9fSx7a2V5OlwicmVxdWVzdFwiLHZhbHVlOmZ1bmN0aW9uKCl7dmFyIGU9YXJndW1lbnRzLmxlbmd0aD4wJiZ2b2lkIDAhPT1hcmd1bWVudHNbMF0/YXJndW1lbnRzWzBdOnt9O2UubWV0aG9kfHwoZS5tZXRob2Q9XCJnZXRcIik7dmFyIHQ9dGhpcy5fY29uZmlnLm1lcmdlV2l0aERlZmF1bHRzKGUpLHI9Xy5idWlsZFF1ZXJ5KHUodGhpcy5fYmFzZVVybCxlLnVybCksZS5wYXJhbXMpO3JldHVybiB0aGlzLl9mZXRjaChyLHQpfX0se2tleTpcIl9mZXRjaFwiLHZhbHVlOmZ1bmN0aW9uKGUsdCl7dmFyIHI9dGhpcyxuPSEwO3JldHVybiB0aGlzLl9taWRkbGV3YXJlLnJlc29sdmVCZWZvcmUodCkudGhlbihmdW5jdGlvbih0KXtyZXR1cm4gZmV0Y2goZSx0KX0pLnRoZW4oZnVuY3Rpb24oZSl7cmV0dXJuIGMoZSx0LmJvZHlUeXBlKX0pLnRoZW4oZnVuY3Rpb24oZSl7cmV0dXJuIHIuX21pZGRsZXdhcmUucmVzb2x2ZVN1Y2Nlc3MoZSl9KS50aGVuKGZ1bmN0aW9uKGUpe3JldHVybiBuPSExLHIuX21pZGRsZXdhcmUucmVzb2x2ZUFmdGVyKGUpfSkuY2F0Y2goZnVuY3Rpb24oZSl7cmV0dXJuIHIuX21pZGRsZXdhcmUucmVzb2x2ZUVycm9yKGUpLG4/ci5fbWlkZGxld2FyZS5yZXNvbHZlQWZ0ZXIoZSk6UHJvbWlzZS5yZWplY3QoZSl9KX19LHtrZXk6XCJfaW5pdE1ldGhvZHNXaXRoTm9Cb2R5XCIsdmFsdWU6ZnVuY3Rpb24oKXt2YXIgZT10aGlzO1tcImdldFwiLFwiZGVsZXRlXCIsXCJoZWFkXCJdLmZvckVhY2goZnVuY3Rpb24odCl7ZVt0XT1mdW5jdGlvbihyKXt2YXIgbj1hcmd1bWVudHMubGVuZ3RoPjEmJnZvaWQgMCE9PWFyZ3VtZW50c1sxXT9hcmd1bWVudHNbMV06e30sbz1lLl9jb25maWcubWVyZ2VXaXRoRGVmYXVsdHMobix7bWV0aG9kOnR9KSxpPV8uYnVpbGRRdWVyeSh1KGUuX2Jhc2VVcmwsciksbi5wYXJhbXMpO3JldHVybiBlLl9mZXRjaChpLG8pfX0pfX0se2tleTpcIl9pbml0TWV0aG9kc1dpdGhCb2R5XCIsdmFsdWU6ZnVuY3Rpb24oKXt2YXIgZT10aGlzO1tcInBvc3RcIixcInB1dFwiLFwicGF0Y2hcIl0uZm9yRWFjaChmdW5jdGlvbih0KXtlW3RdPWZ1bmN0aW9uKHIsbixvKXt2YXIgaT1lLl9jb25maWcubWVyZ2VXaXRoRGVmYXVsdHMobyx7Ym9keTpuLG1ldGhvZDp0fSkscz11KGUuX2Jhc2VVcmwscik7cmV0dXJuIGUuX2ZldGNoKHMsaSl9fSl9fV0pLGV9KCksUD1uZXcgVTtyZXR1cm4gUH0pO1xuIiwiXG5cbmNvbnN0IGV4ZWMgPSAoZm4pID0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCB2YWwgPSB0eXBlb2YgZm4gPT09ICdmdW5jdGlvbicgPyBmbigpIDogZm47XG4gICAgaWYgKCF2YWwgfHwgdHlwZW9mIHZhbCAhPT0gJ29iamVjdCcgfHwgdHlwZW9mIHZhbC50aGVuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHZhbCk7XG4gICAgfVxuICAgIHJldHVybiB2YWw7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuICB9XG59O1xuXG5cbm1vZHVsZS5leHBvcnRzID0gZXhlYztcbiIsImNvbnN0IGV4ZWMgPSByZXF1aXJlKCcuL2V4ZWMnKTtcblxuXG5jbGFzcyBUaW1lb3V0UHJvbWlzZSBleHRlbmRzIFByb21pc2Uge1xuXG4gIGNvbnN0cnVjdG9yKGZuLCBkdXJhdGlvbikge1xuICAgIGlmICh0eXBlb2YgZm4gPT09ICdudW1iZXInKSB7XG4gICAgICBkdXJhdGlvbiA9IGZuO1xuICAgICAgZm4gICAgICAgPSB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGxldCB0aW1lb3V0RGF0YSA9IG51bGw7XG4gICAgc3VwZXIoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgdGltZW91dERhdGEgPSB7IHJlc29sdmUsIHJlamVjdCwgZm4sIGR1cmF0aW9uIH07XG4gICAgICBpZiAodHlwZW9mIGR1cmF0aW9uID09PSAnbnVtYmVyJykge1xuICAgICAgICB0aW1lb3V0RGF0YS50aW1lb3V0SWQgPSBnbG9iYWwuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgZXhlYyhmbikudGhlbihyZXNvbHZlKS5jYXRjaChyZWplY3QpO1xuICAgICAgICB9LCBkdXJhdGlvbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmbihyZXNvbHZlLCByZWplY3QpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5fcGFyZW50ICAgICAgPSBudWxsO1xuICAgIHRoaXMuX3RpbWVvdXREYXRhID0gdGltZW91dERhdGE7XG4gIH1cblxuICBnZXQgX3RpbWVvdXREYXRhKCkge1xuICAgIHJldHVybiB0aGlzLl9wYXJlbnQgPyB0aGlzLl9wYXJlbnQuX3RpbWVvdXREYXRhIDogdGhpcy5fX3RpbWVvdXREYXRhO1xuICB9XG5cbiAgc2V0IF90aW1lb3V0RGF0YSh0aW1lb3V0RGF0YSkge1xuICAgIHRoaXMuX190aW1lb3V0RGF0YSA9IHRpbWVvdXREYXRhO1xuICB9XG5cbiAgdGhlbihmbikge1xuICAgIGNvbnN0IHByb21pc2UgICA9IHN1cGVyLnRoZW4oZm4pO1xuICAgIHByb21pc2UuX3BhcmVudCA9IHRoaXM7XG4gICAgcmV0dXJuIHByb21pc2U7XG4gIH1cblxuICBjbGVhcih2YWwpIHtcbiAgICBjb25zdCB0aW1lb3V0RGF0YSA9IHRoaXMuX3RpbWVvdXREYXRhO1xuICAgIGdsb2JhbC5jbGVhclRpbWVvdXQodGltZW91dERhdGEudGltZW91dElkKTtcbiAgICB0aW1lb3V0RGF0YS5yZXNvbHZlKHZhbCk7XG4gIH1cblxuICByZXNldCgpIHtcbiAgICBjb25zdCB0aW1lb3V0RGF0YSA9IHRoaXMuX3RpbWVvdXREYXRhO1xuICAgIGdsb2JhbC5jbGVhclRpbWVvdXQodGltZW91dERhdGEudGltZW91dElkKTtcbiAgICB0aW1lb3V0RGF0YS50aW1lb3V0SWQgPSBnbG9iYWwuc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICBleGVjKHRpbWVvdXREYXRhLmZuKS50aGVuKHRpbWVvdXREYXRhLnJlc29sdmUpLmNhdGNoKHRpbWVvdXREYXRhLnJlamVjdCk7XG4gICAgfSwgdGltZW91dERhdGEuZHVyYXRpb24pO1xuICB9XG59XG5cbmNvbnN0IHNldFRpbWVvdXQgPSAoZm4sIGQgPSAwKSA9PiB7XG4gIHJldHVybiBuZXcgVGltZW91dFByb21pc2UoZm4sIGQpO1xufTtcblxuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBzZXRUaW1lb3V0O1xuZXhwb3J0cy5UaW1lb3V0UHJvbWlzZSA9IFRpbWVvdXRQcm9taXNlO1xuIiwiY29uc3QgZXhlYyA9IHJlcXVpcmUoJy4vZXhlYycpO1xuXG5cbmNsYXNzIEludGVydmFsUHJvbWlzZSBleHRlbmRzIFByb21pc2Uge1xuXG4gIGNvbnN0cnVjdG9yKGZuLCBkdXJhdGlvbikge1xuICAgIGxldCBfcmVzb2x2ZSwgX2ludGVydmFsSWQ7XG4gICAgc3VwZXIoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgX3Jlc29sdmUgPSByZXNvbHZlO1xuICAgICAgaWYgKHR5cGVvZiBkdXJhdGlvbiA9PT0gJ251bWJlcicpIHtcbiAgICAgICAgX2ludGVydmFsSWQgPSBnbG9iYWwuc2V0SW50ZXJ2YWwoKCkgPT4ge1xuICAgICAgICAgIGV4ZWMoZm4pLmNhdGNoKGVyciA9PiB7XG4gICAgICAgICAgICBjbGVhckludGVydmFsKF9pbnRlcnZhbElkKTtcbiAgICAgICAgICAgIHJlamVjdChlcnIpO1xuICAgICAgICAgIH0pO1xuICAgICAgICB9LCBkdXJhdGlvbik7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmbihyZXNvbHZlLCByZWplY3QpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHRoaXMuX2ludGVydmFsSWQgPSBfaW50ZXJ2YWxJZDtcbiAgICB0aGlzLl9yZXNvbHZlICAgID0gX3Jlc29sdmU7XG4gIH1cblxuICB0aGVuKGZuKSB7XG4gICAgY29uc3QgcHJvbWlzZSAgICAgICA9IHN1cGVyLnRoZW4oZm4pO1xuICAgIHByb21pc2UuX2ludGVydmFsSWQgPSB0aGlzLl9pbnRlcnZhbElkO1xuICAgIHByb21pc2UuX3Jlc29sdmUgICAgPSB0aGlzLl9yZXNvbHZlO1xuICAgIHJldHVybiBwcm9taXNlO1xuICB9XG5cbiAgY2xlYXIodmFsKSB7XG4gICAgY2xlYXJJbnRlcnZhbCh0aGlzLl9pbnRlcnZhbElkKTtcbiAgICB0aGlzLl9yZXNvbHZlKHZhbCk7XG4gIH1cbn1cblxuY29uc3Qgc2V0SW50ZXJ2YWwgPSAoZm4sIGQgPSAwKSA9PiB7XG4gIHJldHVybiBuZXcgSW50ZXJ2YWxQcm9taXNlKGZuLCBkKTtcbn07XG5cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gc2V0SW50ZXJ2YWw7XG5leHBvcnRzLkludGVydmFsUHJvbWlzZSA9IEludGVydmFsUHJvbWlzZTtcbiIsIiFmdW5jdGlvbihlLHQpe1wib2JqZWN0XCI9PXR5cGVvZiBleHBvcnRzJiZcIm9iamVjdFwiPT10eXBlb2YgbW9kdWxlP21vZHVsZS5leHBvcnRzPXQoKTpcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQ/ZGVmaW5lKFwieDItc2VydmljZS1zdG9yYWdlXCIsW10sdCk6XCJvYmplY3RcIj09dHlwZW9mIGV4cG9ydHM/ZXhwb3J0c1tcIngyLXNlcnZpY2Utc3RvcmFnZVwiXT10KCk6ZVtcIngyLXNlcnZpY2Utc3RvcmFnZVwiXT10KCl9KHRoaXMsZnVuY3Rpb24oKXtyZXR1cm4gZnVuY3Rpb24oZSl7ZnVuY3Rpb24gdChyKXtpZihvW3JdKXJldHVybiBvW3JdLmV4cG9ydHM7dmFyIG49b1tyXT17ZXhwb3J0czp7fSxpZDpyLGxvYWRlZDohMX07cmV0dXJuIGVbcl0uY2FsbChuLmV4cG9ydHMsbixuLmV4cG9ydHMsdCksbi5sb2FkZWQ9ITAsbi5leHBvcnRzfXZhciBvPXt9O3JldHVybiB0Lm09ZSx0LmM9byx0LnA9XCJcIix0KDApfShbZnVuY3Rpb24oZSx0KXtcInVzZSBzdHJpY3RcIjtmdW5jdGlvbiBvKGUsdCl7aWYoIShlIGluc3RhbmNlb2YgdCkpdGhyb3cgbmV3IFR5cGVFcnJvcihcIkNhbm5vdCBjYWxsIGEgY2xhc3MgYXMgYSBmdW5jdGlvblwiKX1PYmplY3QuZGVmaW5lUHJvcGVydHkodCxcIl9fZXNNb2R1bGVcIix7dmFsdWU6ITB9KTt2YXIgcj1cImZ1bmN0aW9uXCI9PXR5cGVvZiBTeW1ib2wmJlwic3ltYm9sXCI9PXR5cGVvZiBTeW1ib2wuaXRlcmF0b3I/ZnVuY3Rpb24oZSl7cmV0dXJuIHR5cGVvZiBlfTpmdW5jdGlvbihlKXtyZXR1cm4gZSYmXCJmdW5jdGlvblwiPT10eXBlb2YgU3ltYm9sJiZlLmNvbnN0cnVjdG9yPT09U3ltYm9sP1wic3ltYm9sXCI6dHlwZW9mIGV9LG49ZnVuY3Rpb24oKXtmdW5jdGlvbiBlKGUsdCl7Zm9yKHZhciBvPTA7bzx0Lmxlbmd0aDtvKyspe3ZhciByPXRbb107ci5lbnVtZXJhYmxlPXIuZW51bWVyYWJsZXx8ITEsci5jb25maWd1cmFibGU9ITAsXCJ2YWx1ZVwiaW4gciYmKHIud3JpdGFibGU9ITApLE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlLHIua2V5LHIpfX1yZXR1cm4gZnVuY3Rpb24odCxvLHIpe3JldHVybiBvJiZlKHQucHJvdG90eXBlLG8pLHImJmUodCxyKSx0fX0oKTtpZighd2luZG93KXRocm93IG5ldyBFcnJvcihcIk1pc3Npbmcgd2luZG93IG9iamVjdC5cIik7aWYoIXdpbmRvdy5sb2NhbFN0b3JhZ2UpdGhyb3cgbmV3IEVycm9yKFwibG9jYWxTdG9yYWdlIGlzIG5vdCBzdXBwb3J0ZWQuXCIpO2lmKCF3aW5kb3cuc2Vzc2lvblN0b3JhZ2UpdGhyb3cgbmV3IEVycm9yKFwic2Vzc2lvblN0b3JhZ2UgaXMgbm90IHN1cHBvcnRlZC5cIik7dmFyIGk9ZnVuY3Rpb24oKXtmdW5jdGlvbiBlKHQpe28odGhpcyxlKSx0aGlzLnN0b3JhZ2U9dCYmXCJzZXNzaW9uXCI9PT10LnRvTG93ZXJDYXNlKCk/d2luZG93LnNlc3Npb25TdG9yYWdlOndpbmRvdy5sb2NhbFN0b3JhZ2V9cmV0dXJuIG4oZSxbe2tleTpcImdldFwiLHZhbHVlOmZ1bmN0aW9uKGUpe3ZhciB0PXRoaXMuc3RvcmFnZS5nZXRJdGVtKGUpO2lmKFwic3RyaW5nXCIhPXR5cGVvZiB0KXJldHVybiB0O3RyeXtyZXR1cm4gSlNPTi5wYXJzZSh0KX1jYXRjaChvKXtyZXR1cm4gdHx8dm9pZCAwfX19LHtrZXk6XCJnZXRBbGxcIix2YWx1ZTpmdW5jdGlvbigpe3ZhciBlPXRoaXM7cmV0dXJuIEFycmF5LmFwcGx5KDAsbmV3IEFycmF5KHRoaXMuc3RvcmFnZS5sZW5ndGgpKS5tYXAoZnVuY3Rpb24odCxvKXtyZXR1cm4gZS5zdG9yYWdlLmtleShvKX0pfX0se2tleTpcInNldFwiLHZhbHVlOmZ1bmN0aW9uKGUsdCl7aWYoZSlyZXR1cm4gdD1cIm9iamVjdFwiPT09KFwidW5kZWZpbmVkXCI9PXR5cGVvZiB0P1widW5kZWZpbmVkXCI6cih0KSk/SlNPTi5zdHJpbmdpZnkodCk6dCx0aGlzLnN0b3JhZ2Uuc2V0SXRlbShlLHQpLHR9fSx7a2V5OlwicmVtb3ZlXCIsdmFsdWU6ZnVuY3Rpb24oZSl7dGhpcy5zdG9yYWdlLnJlbW92ZUl0ZW0oZSl9fSx7a2V5OlwiY2xlYXJcIix2YWx1ZTpmdW5jdGlvbigpe3RoaXMuc3RvcmFnZS5jbGVhcigpfX1dKSxlfSgpO3RbXCJkZWZhdWx0XCJdPWksZS5leHBvcnRzPXRbXCJkZWZhdWx0XCJdfV0pfSk7XG4vLyMgc291cmNlTWFwcGluZ1VSTD14Mi1zZXJ2aWNlLXN0b3JhZ2UubWluLmpzLm1hcCIsImltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgdHJhZSAgICAgICAgICAgICBmcm9tICd0cmFlJztcbmltcG9ydCBzZXRUaW1lb3V0ICAgICAgIGZyb20gJ3JlbGlnbi9zZXQtdGltZW91dCc7XG5pbXBvcnQgc2V0SW50ZXJ2YWwgICAgICBmcm9tICdyZWxpZ24vc2V0LWludGVydmFsJztcbmltcG9ydCBTdG9yYWdlICAgICAgICAgIGZyb20gJ0BmaW50ZWNoZGV2L3gyLXNlcnZpY2Utc3RvcmFnZSc7XG5cblxuY2xhc3MgSFRUUCBleHRlbmRzIEV2ZW50RW1pdHRlciB7XG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHN1cGVyKCk7XG5cbiAgICB0aGlzLl9lbnYgPSAnREVWJztcblxuICAgIHRoaXMudG9rZW4gICAgICAgICAgID0gbnVsbDtcbiAgICB0aGlzLnRva2VuRXhwaXJpZXNBdCA9IG51bGw7XG4gICAgdGhpcy5fdG9rZW5EdXJhdGlvbiAgPSAxMDAwICogNjAgKiAyMDsgLy8gMjAgbWludXRlc1xuXG4gICAgdGhpcy5fc3RvcmFnZSAgICAgICAgICAgICAgICAgPSBuZXcgU3RvcmFnZSgpO1xuICAgIHRoaXMuX2luYWN0aXZpdHlDaGVja0ludGVydmFsID0gbnVsbDtcbiAgICB0aGlzLl90b2tlblJlbmV3VGltZW91dCAgICAgICA9IG51bGw7XG4gICAgdGhpcy5faW5hY3Rpdml0eVRpbWVvdXQgICAgICAgPSBudWxsO1xuICAgIHRoaXMuX3BhZ2VBY3Rpdml0eURldGVjdGVkICAgID0gZmFsc2U7XG4gICAgdGhpcy5fd2F0Y2hGb3JQYWdlQWN0aXZpdHkgICAgPSBmYWxzZTtcblxuICAgIHRoaXMuc2Vzc2lvbiA9IHt9O1xuXG4gICAgdGhpcy5fcmVzdG9yZUV4aXN0aW5nU2Vzc2lvbigpO1xuXG4gICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSB0aGlzLnRva2VuICE9PSBudWxsO1xuXG4gICAgdGhpcy5faW5pdE1pZGRsZXdhcmVzKCk7XG4gICAgdGhpcy5faW5pdE1ldGhvZHMoKTtcbiAgfVxuXG4gIGluaXQob3B0cyA9IHt9KSB7XG4gICAgdGhpcy5fc2V0VXBNaWRkbGV3YXJlcyhvcHRzLm1pZGRsZXdhcmVzKTtcblxuICAgIGlmICghb3B0cy5jb25maWdQYXRoKSB7XG4gICAgICBvcHRzLmh0dHBDb25maWcgICAgICAgICB8fCAob3B0cy5odHRwQ29uZmlnID0ge30pO1xuICAgICAgb3B0cy5odHRwQ29uZmlnLmJhc2VVcmwgfHwgKG9wdHMuaHR0cENvbmZpZy5iYXNlVXJsID0gJ2h0dHA6Ly9sb2NhbGhvc3Q6ODA4MCcpO1xuICAgICAgdHJhZS5kZWZhdWx0cyhvcHRzLmh0dHBDb25maWcpO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIHJldHVybiB0cmFlXG4gICAgICAuZ2V0KG9wdHMuY29uZmlnUGF0aClcbiAgICAgIC50aGVuKChyZXMpID0+IHtcbiAgICAgICAgcmVzLmRhdGEuZW52ICAgICAgICAgICAmJiAodGhpcy5fZW52ID0gcmVzLmRhdGEuZW52KTtcbiAgICAgICAgcmVzLmRhdGEudG9rZW5EdXJhdGlvbiAmJiAodGhpcy5fdG9rZW5EdXJhdGlvbiA9IHJlcy5kYXRhLnRva2VuRHVyYXRpb24pO1xuXG4gICAgICAgIGNvbnN0IGdldEJhc2VVcmwgPSAoKSA9PiB7XG4gICAgICAgICAgY29uc3QgYXBpVXJsID0gcmVzLmRhdGEuYXBpICYmIHJlcy5kYXRhLmFwaS51cmw7XG4gICAgICAgICAgcmV0dXJuIGFwaVVybCB8fCAnaHR0cDovL2xvY2FsaG9zdDo4MDgwJztcbiAgICAgICAgfTtcblxuICAgICAgICByZXMuZGF0YS5odHRwQ29uZmlnICAgICAgICAgfHwgKHJlcy5kYXRhLmh0dHBDb25maWcgPSB7fSk7XG4gICAgICAgIHJlcy5kYXRhLmh0dHBDb25maWcuYmFzZVVybCB8fCAocmVzLmRhdGEuaHR0cENvbmZpZy5iYXNlVXJsID0gZ2V0QmFzZVVybCgpKTtcblxuICAgICAgICB0cmFlLmRlZmF1bHRzKHJlcy5kYXRhLmh0dHBDb25maWcpO1xuICAgICAgfSk7XG4gIH1cblxuICBnZXRFbnZpcm9ubWVudCgpIHtcbiAgICByZXR1cm4gdGhpcy5fZW52O1xuICB9XG5cbiAgaXNQcm9kKCkge1xuICAgIHJldHVybiB0aGlzLl9lbnYgPT09ICdQUk9EJztcbiAgfVxuXG4gIGxvZ2luKGVtYWlsLCBwYXNzd29yZCkge1xuICAgIHJldHVybiB0cmFlXG4gICAgICAucG9zdCgnL3Rva2VuJywgeyBlbWFpbCwgcGFzc3dvcmQgfSlcbiAgICAgIC50aGVuKChyZXMpID0+IHtcbiAgICAgICAgdGhpcy5pc0F1dGhlbnRpY2F0ZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLnRva2VuICAgICAgICAgICA9IHJlcy5kYXRhLnRva2VuO1xuICAgICAgICB0aGlzLnRva2VuRXhwaXJpZXNBdCA9IHJlcy5kYXRhLmV4cGlyZXNBdDtcblxuICAgICAgICB0aGlzLl9zdG9yYWdlLnNldCgndG9rZW4nLCByZXMuZGF0YS50b2tlbik7XG4gICAgICAgIHRoaXMuX3N0b3JhZ2Uuc2V0KCd0b2tlbkV4cGlyaWVzQXQnLCByZXMuZGF0YS5leHBpcmVzQXQpO1xuXG4gICAgICAgIGlmICh0aGlzLl93YXRjaEZvclBhZ2VBY3Rpdml0eSkge1xuICAgICAgICAgIHRoaXMuX3N0YXJ0UmVuZXdUb2tlbkxvb3AoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICBnZXRTZXNzaW9uKCkge1xuICAgIHJldHVybiB0cmFlXG4gICAgICAuZ2V0KCcvdXNlci9jdXJyZW50JylcbiAgICAgIC50aGVuKChyZXMpID0+IHtcbiAgICAgICAgdGhpcy5zZXNzaW9uID0gcmVzLmRhdGE7XG4gICAgICAgIHRoaXMuX3N0b3JhZ2Uuc2V0KCdzZXNzaW9uJywgcmVzLmRhdGEpO1xuXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUocmVzKTtcbiAgICAgIH0pO1xuICB9XG5cbiAgbG9nb3V0KCkge1xuICAgIHRoaXMuaXNBdXRoZW50aWNhdGVkID0gZmFsc2U7XG4gICAgZGVsZXRlIHRoaXMudG9rZW47XG4gICAgdGhpcy5fc3RvcmFnZS5yZW1vdmUoJ3Rva2VuJyk7XG4gICAgdGhpcy5fc3RvcmFnZS5yZW1vdmUoJ3Rva2VuRXhwaXJpZXNBdCcpO1xuXG4gICAgdGhpcy5fc3RvcFJlbmV3VG9rZW5Mb29wKCk7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG5cbiAgcmVzZXRQYXNzd29yZFJlcXVlc3QoZW1haWwpIHtcbiAgICByZXR1cm4gdHJhZVxuICAgICAgLnBvc3QoYC91c2VyL3NlbmQtcGFzc3dvcmQtcmVzZXQvJHtlbWFpbH1gKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuZGF0YSk7XG4gIH1cblxuICByZXNldFBhc3N3b3JkKG5ld1Bhc3N3b3JkLCBwYXNzd29yZFJlc2V0VG9rZW4pIHtcbiAgICByZXR1cm4gdHJhZVxuICAgICAgLnBvc3QoYC91c2VyL3Jlc2V0LXBhc3N3b3JkLyR7cGFzc3dvcmRSZXNldFRva2VufWAsIHsgbmV3UGFzc3dvcmQgfSlcbiAgICAgIC50aGVuKHJlc3BvbnNlID0+IHJlc3BvbnNlLmRhdGEpO1xuICB9XG5cbiAgd2F0Y2hGb3JJbmFjdGl2aXR5KCkge1xuICAgIGlmICh0aGlzLl93YXRjaEZvclBhZ2VBY3Rpdml0eSkgeyByZXR1cm47IH1cbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsICAgKCkgPT4geyB0aGlzLl9wYWdlQWN0aXZpdHlEZXRlY3RlZCA9IHRydWU7IH0pO1xuICAgIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCAoKSA9PiB7IHRoaXMuX3BhZ2VBY3Rpdml0eURldGVjdGVkID0gdHJ1ZTsgfSk7XG4gICAgdGhpcy5fd2F0Y2hGb3JQYWdlQWN0aXZpdHkgPSB0cnVlO1xuICB9XG5cbiAgX3Jlc3RvcmVFeGlzdGluZ1Nlc3Npb24oKSB7XG4gICAgdGhpcy50b2tlbiA9IHRoaXMuX3N0b3JhZ2UuZ2V0KCd0b2tlbicpIHx8IG51bGw7XG4gIH1cblxuICBfc3RhcnRSZW5ld1Rva2VuTG9vcCgpIHtcbiAgICBjb25zdCBzdGFydFRva2VuUmVuZXdUaW1lb3V0ID0gKCkgPT4ge1xuICAgICAgaWYgKHRoaXMuX3Rva2VuUmVuZXdUaW1lb3V0KSB7XG4gICAgICAgIHRoaXMuX3Rva2VuUmVuZXdUaW1lb3V0LmNsZWFyKCk7XG4gICAgICAgIHRoaXMuX3Rva2VuUmVuZXdUaW1lb3V0ID0gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcmVuZXdUb2tlbkluID0gKG5ldyBEYXRlKHRoaXMudG9rZW5FeHBpcmllc0F0KSkuZ2V0VGltZSgpIC0gRGF0ZS5ub3coKTtcblxuICAgICAgdGhpcy5fdG9rZW5SZW5ld1RpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHRyYWVcbiAgICAgICAgLnB1dCgnL3Rva2VuJylcbiAgICAgICAgLnRoZW4oKHJlcykgPT4ge1xuICAgICAgICAgIHRoaXMudG9rZW5FeHBpcmllc0F0ID0gcmVzLmRhdGEuZXhwaXJlc0F0O1xuICAgICAgICAgIHRoaXMuX3N0b3JhZ2Uuc2V0KCd0b2tlbkV4cGlyaWVzQXQnLCByZXMuZGF0YS5leHBpcmVzQXQpO1xuICAgICAgICB9KSwgcmVuZXdUb2tlbkluKTtcbiAgICB9O1xuXG4gICAgY29uc3Qgc3RhcnRJbmFjdGl2aXR5VGltZW91dCA9ICgpID0+IHtcbiAgICAgIGlmICh0aGlzLl9pbmFjdGl2aXR5VGltZW91dCkge1xuICAgICAgICB0aGlzLl9pbmFjdGl2aXR5VGltZW91dC5jbGVhcigpO1xuICAgICAgICB0aGlzLl9pbmFjdGl2aXR5VGltZW91dCA9IG51bGw7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX2luYWN0aXZpdHlUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHRoaXNcbiAgICAgICAgICAuZGVsZXRlKCcvdG9rZW4nKVxuICAgICAgICAgIC50aGVuKHJlcyA9PiB0aGlzLmVtaXQoJ3Nlc3Npb24tZXhwaXJlZCcpKTtcbiAgICAgIH0sIHRoaXMuX3Rva2VuRHVyYXRpb24pO1xuICAgIH07XG5cbiAgICBjb25zdCBpbmFjdGl2aXR5Q2hlY2sgPSAoKSA9PiB7XG4gICAgICBpZiAodGhpcy5fcGFnZUFjdGl2aXR5RGV0ZWN0ZWQpIHtcbiAgICAgICAgdGhpcy5fcGFnZUFjdGl2aXR5RGV0ZWN0ZWQgPSBmYWxzZTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgc3RhcnRJbmFjdGl2aXR5VGltZW91dCgpO1xuICAgIH07XG5cbiAgICB0aGlzLl9pbmFjdGl2aXR5Q2hlY2tJbnRlcnZhbCA9IHNldEludGVydmFsKGluYWN0aXZpdHlDaGVjaywgNTAwKTtcbiAgICBzdGFydFRva2VuUmVuZXdUaW1lb3V0KCk7XG4gIH1cblxuICBfc3RvcFJlbmV3VG9rZW5Mb29wKCkge1xuICAgIGlmICh0aGlzLl90b2tlblJlbmV3VGltZW91dCkge1xuICAgICAgdGhpcy5fdG9rZW5SZW5ld1RpbWVvdXQuY2xlYXIoKTtcbiAgICAgIHRoaXMuX3Rva2VuUmVuZXdUaW1lb3V0ID0gbnVsbDtcbiAgICB9XG4gICAgaWYgKHRoaXMuX2luYWN0aXZpdHlUaW1lb3V0KSB7XG4gICAgICB0aGlzLl9pbmFjdGl2aXR5VGltZW91dC5jbGVhcigpO1xuICAgICAgdGhpcy5faW5hY3Rpdml0eVRpbWVvdXQgPSBudWxsO1xuICAgIH1cbiAgICBpZiAodGhpcy5faW5hY3Rpdml0eUNoZWNrSW50ZXJ2YWwpIHtcbiAgICAgIHRoaXMuX2luYWN0aXZpdHlDaGVja0ludGVydmFsLmNsZWFyKCk7XG4gICAgICB0aGlzLl9pbmFjdGl2aXR5Q2hlY2tJbnRlcnZhbCA9IG51bGw7XG4gICAgfVxuICB9XG5cbiAgX2luaXRNZXRob2RzKCkge1xuICAgIFsnZ2V0JywgJ3Bvc3QnLCAncHV0JywgJ2RlbGV0ZSddLmZvckVhY2goKG1ldGhvZCkgPT4ge1xuICAgICAgdGhpc1ttZXRob2RdID0gKC4uLmFyZ3MpID0+IHRyYWVbbWV0aG9kXSguLi5hcmdzKVxuICAgICAgLnRoZW4ocmVzcG9uc2UgPT4gcmVzcG9uc2UuZGF0YSk7XG4gICAgfSk7XG4gIH1cblxuICBfaW5pdE1pZGRsZXdhcmVzKCkge1xuICAgIHRyYWUudXNlKHtcbiAgICAgIGJlZm9yZTogKGJlZm9yZSkgPT4ge1xuICAgICAgICB0aGlzLmVtaXQoJ2JlZm9yZScsIGJlZm9yZSk7XG5cbiAgICAgICAgaWYgKHRoaXMuaXNBdXRoZW50aWNhdGVkKSB7XG4gICAgICAgICAgYmVmb3JlLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA9IHRoaXMudG9rZW47XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYmVmb3JlO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdHJhZS51c2Uoe1xuICAgICAgZXJyb3I6IChlcnIpID0+IHtcbiAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsIGVycik7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdHJhZS51c2Uoe1xuICAgICAgc3VjY2VzczogKHJlcykgPT4ge1xuICAgICAgICB0aGlzLmVtaXQoJ3N1Y2Nlc3MnLCByZXMpO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlcyk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0cmFlLnVzZSh7XG4gICAgICBhZnRlcjogKHJlcykgPT4ge1xuICAgICAgICB0aGlzLmVtaXQoJ2FmdGVyJywgcmVzKTtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXMpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG5cbiAgX3NldFVwTWlkZGxld2FyZXMobWlkZGxld2FyZXMpIHtcbiAgICBpZiAoIW1pZGRsZXdhcmVzKSB7IHJldHVybjsgfVxuICAgIGlmIChtaWRkbGV3YXJlcy5iZWZvcmUgJiYgbWlkZGxld2FyZXMuYmVmb3JlLmxlbmd0aCkge1xuICAgICAgbWlkZGxld2FyZXMuYmVmb3JlLmZvckVhY2goYmVmb3JlID0+IHRyYWUudXNlKHsgYmVmb3JlIH0pKTtcbiAgICB9XG5cbiAgICBpZiAobWlkZGxld2FyZXMuc3VjY2VzcyAmJiBtaWRkbGV3YXJlcy5zdWNjZXNzLmxlbmd0aCkge1xuICAgICAgbWlkZGxld2FyZXMuc3VjY2Vzcy5mb3JFYWNoKHN1Y2Nlc3MgPT4gdHJhZS51c2UoeyBzdWNjZXNzIH0pKTtcbiAgICB9XG5cbiAgICBpZiAobWlkZGxld2FyZXMuZXJyb3IgJiYgbWlkZGxld2FyZXMuZXJyb3IubGVuZ3RoKSB7XG4gICAgICBtaWRkbGV3YXJlcy5lcnJvci5mb3JFYWNoKGVycm9yID0+IHRyYWUudXNlKHsgZXJyb3IgfSkpO1xuICAgIH1cblxuICAgIGlmIChtaWRkbGV3YXJlcy5hZnRlciAmJiBtaWRkbGV3YXJlcy5hZnRlci5sZW5ndGgpIHtcbiAgICAgIG1pZGRsZXdhcmVzLmFmdGVyLmZvckVhY2goYWZ0ZXIgPT4gdHJhZS51c2UoeyBhZnRlciB9KSk7XG4gICAgfVxuICB9XG59XG5cbmNvbnN0IGh0dHAgPSBuZXcgSFRUUCgpO1xuaHR0cC5IVFRQICA9IEhUVFA7XG5leHBvcnQgZGVmYXVsdCBodHRwO1xuIl0sIm5hbWVzIjpbImRvbWFpbiIsIkV2ZW50SGFuZGxlcnMiLCJwcm90b3R5cGUiLCJPYmplY3QiLCJjcmVhdGUiLCJFdmVudEVtaXR0ZXIiLCJpbml0IiwiY2FsbCIsInVzaW5nRG9tYWlucyIsInVuZGVmaW5lZCIsIl9ldmVudHMiLCJfbWF4TGlzdGVuZXJzIiwiZGVmYXVsdE1heExpc3RlbmVycyIsImFjdGl2ZSIsIkRvbWFpbiIsImdldFByb3RvdHlwZU9mIiwiX2V2ZW50c0NvdW50Iiwic2V0TWF4TGlzdGVuZXJzIiwibiIsImlzTmFOIiwiVHlwZUVycm9yIiwiJGdldE1heExpc3RlbmVycyIsInRoYXQiLCJnZXRNYXhMaXN0ZW5lcnMiLCJlbWl0Tm9uZSIsImhhbmRsZXIiLCJpc0ZuIiwic2VsZiIsImxlbiIsImxlbmd0aCIsImxpc3RlbmVycyIsImFycmF5Q2xvbmUiLCJpIiwiZW1pdE9uZSIsImFyZzEiLCJlbWl0VHdvIiwiYXJnMiIsImVtaXRUaHJlZSIsImFyZzMiLCJlbWl0TWFueSIsImFyZ3MiLCJhcHBseSIsImVtaXQiLCJ0eXBlIiwiZXIiLCJldmVudHMiLCJuZWVkRG9tYWluRXhpdCIsImRvRXJyb3IiLCJlcnJvciIsImFyZ3VtZW50cyIsIkVycm9yIiwiZG9tYWluRW1pdHRlciIsImRvbWFpblRocm93biIsImVyciIsImNvbnRleHQiLCJBcnJheSIsImV4aXQiLCJfYWRkTGlzdGVuZXIiLCJ0YXJnZXQiLCJsaXN0ZW5lciIsInByZXBlbmQiLCJtIiwiZXhpc3RpbmciLCJuZXdMaXN0ZW5lciIsInVuc2hpZnQiLCJwdXNoIiwid2FybmVkIiwidyIsIm5hbWUiLCJlbWl0dGVyIiwiY291bnQiLCJlbWl0V2FybmluZyIsImUiLCJjb25zb2xlIiwid2FybiIsImxvZyIsImFkZExpc3RlbmVyIiwib24iLCJwcmVwZW5kTGlzdGVuZXIiLCJfb25jZVdyYXAiLCJmaXJlZCIsImciLCJyZW1vdmVMaXN0ZW5lciIsIm9uY2UiLCJwcmVwZW5kT25jZUxpc3RlbmVyIiwibGlzdCIsInBvc2l0aW9uIiwib3JpZ2luYWxMaXN0ZW5lciIsInJlbW92ZUFsbExpc3RlbmVycyIsImtleXMiLCJrZXkiLCJldmxpc3RlbmVyIiwicmV0IiwidW53cmFwTGlzdGVuZXJzIiwibGlzdGVuZXJDb3VudCIsImV2ZW50TmFtZXMiLCJSZWZsZWN0Iiwib3duS2V5cyIsInNwbGljZU9uZSIsImluZGV4IiwiayIsInBvcCIsImFyciIsImNvcHkiLCJ0IiwibW9kdWxlIiwidGhpcyIsInIiLCJlbmNvZGVVUkkiLCJyZWR1Y2UiLCJyZXBsYWNlIiwiaW5jbHVkZXMiLCJkZWNvZGVVUkkiLCJzcGxpdCIsIm8iLCJ5IiwicyIsImZvckVhY2giLCJwYXJzZUZsb2F0IiwiTnVtYmVyIiwiZXhwb3J0cyIsInJlY3Vyc2l2ZSIsImNvbmNhdCIsImluZGV4T2YiLCJhIiwidGVzdCIsInUiLCJmIiwidGhlbiIsImhlYWRlcnMiLCJzdGF0dXMiLCJzdGF0dXNUZXh0IiwiZGF0YSIsImMiLCJvayIsIlByb21pc2UiLCJyZWplY3QiLCJnZXQiLCJTdHJpbmciLCJ0b0xvd2VyQ2FzZSIsIm5leHQiLCJzaGlmdCIsImRvbmUiLCJ2YWx1ZSIsIml0ZXJhYmxlIiwiU3ltYm9sIiwiaXRlcmF0b3IiLCJtYXAiLCJhcHBlbmQiLCJnZXRPd25Qcm9wZXJ0eU5hbWVzIiwiYm9keVVzZWQiLCJvbmxvYWQiLCJyZXN1bHQiLCJvbmVycm9yIiwiRmlsZVJlYWRlciIsInJlYWRBc0FycmF5QnVmZmVyIiwicmVhZEFzVGV4dCIsIl9pbml0Qm9keSIsIl9ib2R5SW5pdCIsIl9ib2R5VGV4dCIsImJsb2IiLCJCbG9iIiwiaXNQcm90b3R5cGVPZiIsIl9ib2R5QmxvYiIsImZvcm1EYXRhIiwiRm9ybURhdGEiLCJfYm9keUZvcm1EYXRhIiwic2VhcmNoUGFyYW1zIiwiVVJMU2VhcmNoUGFyYW1zIiwidG9TdHJpbmciLCJhcnJheUJ1ZmZlciIsIkFycmF5QnVmZmVyIiwic2V0IiwicmVzb2x2ZSIsInRleHQiLCJsIiwianNvbiIsIkpTT04iLCJwYXJzZSIsInRvVXBwZXJDYXNlIiwiYiIsImgiLCJib2R5IiwidXJsIiwiY3JlZGVudGlhbHMiLCJtZXRob2QiLCJtb2RlIiwicmVmZXJyZXIiLCJ0cmltIiwiam9pbiIsImRlY29kZVVSSUNvbXBvbmVudCIsImQiLCJnZXRBbGxSZXNwb25zZUhlYWRlcnMiLCJwIiwiZmV0Y2giLCJkZWxldGUiLCJnZXRBbGwiLCJoYXMiLCJoYXNPd25Qcm9wZXJ0eSIsInZhbHVlcyIsImVudHJpZXMiLCJjbG9uZSIsInYiLCJyZWRpcmVjdCIsIlJhbmdlRXJyb3IiLCJsb2NhdGlvbiIsIkhlYWRlcnMiLCJSZXF1ZXN0IiwiUmVzcG9uc2UiLCJyZXNwb25zZVVSTCIsImdldFJlc3BvbnNlSGVhZGVyIiwiWE1MSHR0cFJlcXVlc3QiLCJyZXNwb25zZSIsInJlc3BvbnNlVGV4dCIsIm9udGltZW91dCIsIm9wZW4iLCJ3aXRoQ3JlZGVudGlhbHMiLCJyZXNwb25zZVR5cGUiLCJzZXRSZXF1ZXN0SGVhZGVyIiwic2VuZCIsInBvbHlmaWxsIiwid2luZG93IiwiY29uc3RydWN0b3IiLCJlbnVtZXJhYmxlIiwiY29uZmlndXJhYmxlIiwid3JpdGFibGUiLCJkZWZpbmVQcm9wZXJ0eSIsInJldHVybiIsImlzQXJyYXkiLCJfIiwiYnVpbGRRdWVyeSIsInBhcnNlUXVlcnkiLCJfYmVmb3JlIiwiX3N1Y2Nlc3MiLCJfZXJyb3IiLCJfYWZ0ZXIiLCJzbGljZSIsIlQiLCJBY2NlcHQiLCJ4IiwieHNyZkNvb2tpZU5hbWUiLCJ4c3JmSGVhZGVyTmFtZSIsIkUiLCJfZGVmYXVsdHMiLCJfY29uZmlnIiwic3RyaW5naWZ5IiwiVSIsIl9taWRkbGV3YXJlIiwiYmFzZVVybCIsIl9pbml0TWV0aG9kc1dpdGhCb2R5IiwiX2luaXRNZXRob2RzV2l0aE5vQm9keSIsImJlZm9yZSIsInN1Y2Nlc3MiLCJhZnRlciIsIl9iYXNlVXJsIiwibWVyZ2VXaXRoRGVmYXVsdHMiLCJwYXJhbXMiLCJfZmV0Y2giLCJyZXNvbHZlQmVmb3JlIiwiYm9keVR5cGUiLCJyZXNvbHZlU3VjY2VzcyIsInJlc29sdmVBZnRlciIsImNhdGNoIiwicmVzb2x2ZUVycm9yIiwiUCIsImV4ZWMiLCJmbiIsInZhbCIsInJlcXVpcmUkJDAiLCJUaW1lb3V0UHJvbWlzZSIsImR1cmF0aW9uIiwidGltZW91dERhdGEiLCJ0aW1lb3V0SWQiLCJnbG9iYWwiLCJzZXRUaW1lb3V0IiwiX3BhcmVudCIsIl90aW1lb3V0RGF0YSIsInByb21pc2UiLCJjbGVhclRpbWVvdXQiLCJfX3RpbWVvdXREYXRhIiwiSW50ZXJ2YWxQcm9taXNlIiwiX3Jlc29sdmUiLCJfaW50ZXJ2YWxJZCIsInNldEludGVydmFsIiwiaWQiLCJsb2FkZWQiLCJsb2NhbFN0b3JhZ2UiLCJzZXNzaW9uU3RvcmFnZSIsInN0b3JhZ2UiLCJnZXRJdGVtIiwic2V0SXRlbSIsInJlbW92ZUl0ZW0iLCJjbGVhciIsIkhUVFAiLCJfZW52IiwidG9rZW4iLCJ0b2tlbkV4cGlyaWVzQXQiLCJfdG9rZW5EdXJhdGlvbiIsIl9zdG9yYWdlIiwiU3RvcmFnZSIsIl9pbmFjdGl2aXR5Q2hlY2tJbnRlcnZhbCIsIl90b2tlblJlbmV3VGltZW91dCIsIl9pbmFjdGl2aXR5VGltZW91dCIsIl9wYWdlQWN0aXZpdHlEZXRlY3RlZCIsIl93YXRjaEZvclBhZ2VBY3Rpdml0eSIsInNlc3Npb24iLCJfcmVzdG9yZUV4aXN0aW5nU2Vzc2lvbiIsImlzQXV0aGVudGljYXRlZCIsIl9pbml0TWlkZGxld2FyZXMiLCJfaW5pdE1ldGhvZHMiLCJvcHRzIiwiX3NldFVwTWlkZGxld2FyZXMiLCJtaWRkbGV3YXJlcyIsImNvbmZpZ1BhdGgiLCJodHRwQ29uZmlnIiwiZGVmYXVsdHMiLCJ0cmFlIiwicmVzIiwiZW52IiwidG9rZW5EdXJhdGlvbiIsImdldEJhc2VVcmwiLCJhcGlVcmwiLCJhcGkiLCJlbWFpbCIsInBhc3N3b3JkIiwicG9zdCIsImV4cGlyZXNBdCIsIl9zdGFydFJlbmV3VG9rZW5Mb29wIiwicmVtb3ZlIiwiX3N0b3BSZW5ld1Rva2VuTG9vcCIsIm5ld1Bhc3N3b3JkIiwicGFzc3dvcmRSZXNldFRva2VuIiwiYWRkRXZlbnRMaXN0ZW5lciIsInN0YXJ0VG9rZW5SZW5ld1RpbWVvdXQiLCJyZW5ld1Rva2VuSW4iLCJEYXRlIiwiZ2V0VGltZSIsIm5vdyIsInB1dCIsInN0YXJ0SW5hY3Rpdml0eVRpbWVvdXQiLCJpbmFjdGl2aXR5Q2hlY2siLCJ1c2UiLCJhdXRob3JpemF0aW9uIiwiaHR0cCJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBRUEsSUFBSUEsTUFBSjs7Ozs7QUFLQSxTQUFTQyxhQUFULEdBQXlCO0FBQ3pCQSxjQUFjQyxTQUFkLEdBQTBCQyxPQUFPQyxNQUFQLENBQWMsSUFBZCxDQUExQjs7QUFFQSxTQUFTQyxZQUFULEdBQXdCO2VBQ1RDLElBQWIsQ0FBa0JDLElBQWxCLENBQXVCLElBQXZCOztBQUVGLEFBQ0EsQUFFQUYsYUFBYUcsWUFBYixHQUE0QixLQUE1Qjs7QUFFQUgsYUFBYUgsU0FBYixDQUF1QkYsTUFBdkIsR0FBZ0NTLFNBQWhDO0FBQ0FKLGFBQWFILFNBQWIsQ0FBdUJRLE9BQXZCLEdBQWlDRCxTQUFqQztBQUNBSixhQUFhSCxTQUFiLENBQXVCUyxhQUF2QixHQUF1Q0YsU0FBdkM7Ozs7QUFJQUosYUFBYU8sbUJBQWIsR0FBbUMsRUFBbkM7O0FBRUFQLGFBQWFDLElBQWIsR0FBb0IsWUFBVztPQUN4Qk4sTUFBTCxHQUFjLElBQWQ7TUFDSUssYUFBYUcsWUFBakIsRUFBK0I7O1FBRXpCUixPQUFPYSxNQUFQLElBQWlCLEVBQUUsZ0JBQWdCYixPQUFPYyxNQUF6QixDQUFyQixFQUF1RDtXQUNoRGQsTUFBTCxHQUFjQSxPQUFPYSxNQUFyQjs7OztNQUlBLENBQUMsS0FBS0gsT0FBTixJQUFpQixLQUFLQSxPQUFMLEtBQWlCUCxPQUFPWSxjQUFQLENBQXNCLElBQXRCLEVBQTRCTCxPQUFsRSxFQUEyRTtTQUNwRUEsT0FBTCxHQUFlLElBQUlULGFBQUosRUFBZjtTQUNLZSxZQUFMLEdBQW9CLENBQXBCOzs7T0FHR0wsYUFBTCxHQUFxQixLQUFLQSxhQUFMLElBQXNCRixTQUEzQztDQWRGOzs7O0FBbUJBSixhQUFhSCxTQUFiLENBQXVCZSxlQUF2QixHQUF5QyxTQUFTQSxlQUFULENBQXlCQyxDQUF6QixFQUE0QjtNQUMvRCxPQUFPQSxDQUFQLEtBQWEsUUFBYixJQUF5QkEsSUFBSSxDQUE3QixJQUFrQ0MsTUFBTUQsQ0FBTixDQUF0QyxFQUNFLE1BQU0sSUFBSUUsU0FBSixDQUFjLHdDQUFkLENBQU47T0FDR1QsYUFBTCxHQUFxQk8sQ0FBckI7U0FDTyxJQUFQO0NBSkY7O0FBT0EsU0FBU0csZ0JBQVQsQ0FBMEJDLElBQTFCLEVBQWdDO01BQzFCQSxLQUFLWCxhQUFMLEtBQXVCRixTQUEzQixFQUNFLE9BQU9KLGFBQWFPLG1CQUFwQjtTQUNLVSxLQUFLWCxhQUFaOzs7QUFHRk4sYUFBYUgsU0FBYixDQUF1QnFCLGVBQXZCLEdBQXlDLFNBQVNBLGVBQVQsR0FBMkI7U0FDM0RGLGlCQUFpQixJQUFqQixDQUFQO0NBREY7Ozs7Ozs7QUFTQSxTQUFTRyxRQUFULENBQWtCQyxPQUFsQixFQUEyQkMsSUFBM0IsRUFBaUNDLElBQWpDLEVBQXVDO01BQ2pDRCxJQUFKLEVBQ0VELFFBQVFsQixJQUFSLENBQWFvQixJQUFiLEVBREYsS0FFSztRQUNDQyxNQUFNSCxRQUFRSSxNQUFsQjtRQUNJQyxZQUFZQyxXQUFXTixPQUFYLEVBQW9CRyxHQUFwQixDQUFoQjtTQUNLLElBQUlJLElBQUksQ0FBYixFQUFnQkEsSUFBSUosR0FBcEIsRUFBeUIsRUFBRUksQ0FBM0I7Z0JBQ1lBLENBQVYsRUFBYXpCLElBQWIsQ0FBa0JvQixJQUFsQjs7OztBQUdOLFNBQVNNLE9BQVQsQ0FBaUJSLE9BQWpCLEVBQTBCQyxJQUExQixFQUFnQ0MsSUFBaEMsRUFBc0NPLElBQXRDLEVBQTRDO01BQ3RDUixJQUFKLEVBQ0VELFFBQVFsQixJQUFSLENBQWFvQixJQUFiLEVBQW1CTyxJQUFuQixFQURGLEtBRUs7UUFDQ04sTUFBTUgsUUFBUUksTUFBbEI7UUFDSUMsWUFBWUMsV0FBV04sT0FBWCxFQUFvQkcsR0FBcEIsQ0FBaEI7U0FDSyxJQUFJSSxJQUFJLENBQWIsRUFBZ0JBLElBQUlKLEdBQXBCLEVBQXlCLEVBQUVJLENBQTNCO2dCQUNZQSxDQUFWLEVBQWF6QixJQUFiLENBQWtCb0IsSUFBbEIsRUFBd0JPLElBQXhCOzs7O0FBR04sU0FBU0MsT0FBVCxDQUFpQlYsT0FBakIsRUFBMEJDLElBQTFCLEVBQWdDQyxJQUFoQyxFQUFzQ08sSUFBdEMsRUFBNENFLElBQTVDLEVBQWtEO01BQzVDVixJQUFKLEVBQ0VELFFBQVFsQixJQUFSLENBQWFvQixJQUFiLEVBQW1CTyxJQUFuQixFQUF5QkUsSUFBekIsRUFERixLQUVLO1FBQ0NSLE1BQU1ILFFBQVFJLE1BQWxCO1FBQ0lDLFlBQVlDLFdBQVdOLE9BQVgsRUFBb0JHLEdBQXBCLENBQWhCO1NBQ0ssSUFBSUksSUFBSSxDQUFiLEVBQWdCQSxJQUFJSixHQUFwQixFQUF5QixFQUFFSSxDQUEzQjtnQkFDWUEsQ0FBVixFQUFhekIsSUFBYixDQUFrQm9CLElBQWxCLEVBQXdCTyxJQUF4QixFQUE4QkUsSUFBOUI7Ozs7QUFHTixTQUFTQyxTQUFULENBQW1CWixPQUFuQixFQUE0QkMsSUFBNUIsRUFBa0NDLElBQWxDLEVBQXdDTyxJQUF4QyxFQUE4Q0UsSUFBOUMsRUFBb0RFLElBQXBELEVBQTBEO01BQ3BEWixJQUFKLEVBQ0VELFFBQVFsQixJQUFSLENBQWFvQixJQUFiLEVBQW1CTyxJQUFuQixFQUF5QkUsSUFBekIsRUFBK0JFLElBQS9CLEVBREYsS0FFSztRQUNDVixNQUFNSCxRQUFRSSxNQUFsQjtRQUNJQyxZQUFZQyxXQUFXTixPQUFYLEVBQW9CRyxHQUFwQixDQUFoQjtTQUNLLElBQUlJLElBQUksQ0FBYixFQUFnQkEsSUFBSUosR0FBcEIsRUFBeUIsRUFBRUksQ0FBM0I7Z0JBQ1lBLENBQVYsRUFBYXpCLElBQWIsQ0FBa0JvQixJQUFsQixFQUF3Qk8sSUFBeEIsRUFBOEJFLElBQTlCLEVBQW9DRSxJQUFwQzs7Ozs7QUFJTixTQUFTQyxRQUFULENBQWtCZCxPQUFsQixFQUEyQkMsSUFBM0IsRUFBaUNDLElBQWpDLEVBQXVDYSxJQUF2QyxFQUE2QztNQUN2Q2QsSUFBSixFQUNFRCxRQUFRZ0IsS0FBUixDQUFjZCxJQUFkLEVBQW9CYSxJQUFwQixFQURGLEtBRUs7UUFDQ1osTUFBTUgsUUFBUUksTUFBbEI7UUFDSUMsWUFBWUMsV0FBV04sT0FBWCxFQUFvQkcsR0FBcEIsQ0FBaEI7U0FDSyxJQUFJSSxJQUFJLENBQWIsRUFBZ0JBLElBQUlKLEdBQXBCLEVBQXlCLEVBQUVJLENBQTNCO2dCQUNZQSxDQUFWLEVBQWFTLEtBQWIsQ0FBbUJkLElBQW5CLEVBQXlCYSxJQUF6Qjs7Ozs7QUFJTm5DLGFBQWFILFNBQWIsQ0FBdUJ3QyxJQUF2QixHQUE4QixTQUFTQSxJQUFULENBQWNDLElBQWQsRUFBb0I7TUFDNUNDLEVBQUosRUFBUW5CLE9BQVIsRUFBaUJHLEdBQWpCLEVBQXNCWSxJQUF0QixFQUE0QlIsQ0FBNUIsRUFBK0JhLE1BQS9CLEVBQXVDN0MsTUFBdkM7TUFDSThDLGlCQUFpQixLQUFyQjtNQUNJQyxVQUFXSixTQUFTLE9BQXhCOztXQUVTLEtBQUtqQyxPQUFkO01BQ0ltQyxNQUFKLEVBQ0VFLFVBQVdBLFdBQVdGLE9BQU9HLEtBQVAsSUFBZ0IsSUFBdEMsQ0FERixLQUVLLElBQUksQ0FBQ0QsT0FBTCxFQUNILE9BQU8sS0FBUDs7V0FFTyxLQUFLL0MsTUFBZDs7O01BR0krQyxPQUFKLEVBQWE7U0FDTkUsVUFBVSxDQUFWLENBQUw7UUFDSWpELE1BQUosRUFBWTtVQUNOLENBQUM0QyxFQUFMLEVBQ0VBLEtBQUssSUFBSU0sS0FBSixDQUFVLHFDQUFWLENBQUw7U0FDQ0MsYUFBSCxHQUFtQixJQUFuQjtTQUNHbkQsTUFBSCxHQUFZQSxNQUFaO1NBQ0dvRCxZQUFILEdBQWtCLEtBQWxCO2FBQ09WLElBQVAsQ0FBWSxPQUFaLEVBQXFCRSxFQUFyQjtLQU5GLE1BT08sSUFBSUEsY0FBY00sS0FBbEIsRUFBeUI7WUFDeEJOLEVBQU4sQ0FEOEI7S0FBekIsTUFFQTs7VUFFRFMsTUFBTSxJQUFJSCxLQUFKLENBQVUsMkNBQTJDTixFQUEzQyxHQUFnRCxHQUExRCxDQUFWO1VBQ0lVLE9BQUosR0FBY1YsRUFBZDtZQUNNUyxHQUFOOztXQUVLLEtBQVA7OztZQUdRUixPQUFPRixJQUFQLENBQVY7O01BRUksQ0FBQ2xCLE9BQUwsRUFDRSxPQUFPLEtBQVA7O01BRUVDLE9BQU8sT0FBT0QsT0FBUCxLQUFtQixVQUE5QjtRQUNNd0IsVUFBVXBCLE1BQWhCO1VBQ1FELEdBQVI7O1NBRU8sQ0FBTDtlQUNXSCxPQUFULEVBQWtCQyxJQUFsQixFQUF3QixJQUF4Qjs7U0FFRyxDQUFMO2NBQ1VELE9BQVIsRUFBaUJDLElBQWpCLEVBQXVCLElBQXZCLEVBQTZCdUIsVUFBVSxDQUFWLENBQTdCOztTQUVHLENBQUw7Y0FDVXhCLE9BQVIsRUFBaUJDLElBQWpCLEVBQXVCLElBQXZCLEVBQTZCdUIsVUFBVSxDQUFWLENBQTdCLEVBQTJDQSxVQUFVLENBQVYsQ0FBM0M7O1NBRUcsQ0FBTDtnQkFDWXhCLE9BQVYsRUFBbUJDLElBQW5CLEVBQXlCLElBQXpCLEVBQStCdUIsVUFBVSxDQUFWLENBQS9CLEVBQTZDQSxVQUFVLENBQVYsQ0FBN0MsRUFBMkRBLFVBQVUsQ0FBVixDQUEzRDs7OzthQUlPLElBQUlNLEtBQUosQ0FBVTNCLE1BQU0sQ0FBaEIsQ0FBUDtXQUNLSSxJQUFJLENBQVQsRUFBWUEsSUFBSUosR0FBaEIsRUFBcUJJLEdBQXJCO2FBQ09BLElBQUksQ0FBVCxJQUFjaUIsVUFBVWpCLENBQVYsQ0FBZDtPQUNGTyxTQUFTZCxPQUFULEVBQWtCQyxJQUFsQixFQUF3QixJQUF4QixFQUE4QmMsSUFBOUI7OztNQUdBTSxjQUFKLEVBQ0U5QyxPQUFPd0QsSUFBUDs7U0FFSyxJQUFQO0NBbEVGOztBQXFFQSxTQUFTQyxZQUFULENBQXNCQyxNQUF0QixFQUE4QmYsSUFBOUIsRUFBb0NnQixRQUFwQyxFQUE4Q0MsT0FBOUMsRUFBdUQ7TUFDakRDLENBQUo7TUFDSWhCLE1BQUo7TUFDSWlCLFFBQUo7O01BRUksT0FBT0gsUUFBUCxLQUFvQixVQUF4QixFQUNFLE1BQU0sSUFBSXZDLFNBQUosQ0FBYyx3Q0FBZCxDQUFOOztXQUVPc0MsT0FBT2hELE9BQWhCO01BQ0ksQ0FBQ21DLE1BQUwsRUFBYTthQUNGYSxPQUFPaEQsT0FBUCxHQUFpQixJQUFJVCxhQUFKLEVBQTFCO1dBQ09lLFlBQVAsR0FBc0IsQ0FBdEI7R0FGRixNQUdPOzs7UUFHRDZCLE9BQU9rQixXQUFYLEVBQXdCO2FBQ2ZyQixJQUFQLENBQVksYUFBWixFQUEyQkMsSUFBM0IsRUFDWWdCLFNBQVNBLFFBQVQsR0FBb0JBLFNBQVNBLFFBQTdCLEdBQXdDQSxRQURwRDs7OztlQUtTRCxPQUFPaEQsT0FBaEI7O2VBRVNtQyxPQUFPRixJQUFQLENBQVg7OztNQUdFLENBQUNtQixRQUFMLEVBQWU7O2VBRUZqQixPQUFPRixJQUFQLElBQWVnQixRQUExQjtNQUNFRCxPQUFPMUMsWUFBVDtHQUhGLE1BSU87UUFDRCxPQUFPOEMsUUFBUCxLQUFvQixVQUF4QixFQUFvQzs7aUJBRXZCakIsT0FBT0YsSUFBUCxJQUFlaUIsVUFBVSxDQUFDRCxRQUFELEVBQVdHLFFBQVgsQ0FBVixHQUNVLENBQUNBLFFBQUQsRUFBV0gsUUFBWCxDQURwQztLQUZGLE1BSU87O1VBRURDLE9BQUosRUFBYTtpQkFDRkksT0FBVCxDQUFpQkwsUUFBakI7T0FERixNQUVPO2lCQUNJTSxJQUFULENBQWNOLFFBQWQ7Ozs7O1FBS0EsQ0FBQ0csU0FBU0ksTUFBZCxFQUFzQjtVQUNoQjdDLGlCQUFpQnFDLE1BQWpCLENBQUo7VUFDSUcsS0FBS0EsSUFBSSxDQUFULElBQWNDLFNBQVNqQyxNQUFULEdBQWtCZ0MsQ0FBcEMsRUFBdUM7aUJBQzVCSyxNQUFULEdBQWtCLElBQWxCO1lBQ0lDLElBQUksSUFBSWpCLEtBQUosQ0FBVSxpREFDRVksU0FBU2pDLE1BRFgsR0FDb0IsR0FEcEIsR0FDMEJjLElBRDFCLEdBQ2lDLG9CQURqQyxHQUVFLGlEQUZaLENBQVI7VUFHRXlCLElBQUYsR0FBUyw2QkFBVDtVQUNFQyxPQUFGLEdBQVlYLE1BQVo7VUFDRWYsSUFBRixHQUFTQSxJQUFUO1VBQ0UyQixLQUFGLEdBQVVSLFNBQVNqQyxNQUFuQjtvQkFDWXNDLENBQVo7Ozs7O1NBS0NULE1BQVA7O0FBRUYsU0FBU2EsV0FBVCxDQUFxQkMsQ0FBckIsRUFBd0I7U0FDZkMsUUFBUUMsSUFBZixLQUF3QixVQUF4QixHQUFxQ0QsUUFBUUMsSUFBUixDQUFhRixDQUFiLENBQXJDLEdBQXVEQyxRQUFRRSxHQUFSLENBQVlILENBQVosQ0FBdkQ7O0FBRUZuRSxhQUFhSCxTQUFiLENBQXVCMEUsV0FBdkIsR0FBcUMsU0FBU0EsV0FBVCxDQUFxQmpDLElBQXJCLEVBQTJCZ0IsUUFBM0IsRUFBcUM7U0FDakVGLGFBQWEsSUFBYixFQUFtQmQsSUFBbkIsRUFBeUJnQixRQUF6QixFQUFtQyxLQUFuQyxDQUFQO0NBREY7O0FBSUF0RCxhQUFhSCxTQUFiLENBQXVCMkUsRUFBdkIsR0FBNEJ4RSxhQUFhSCxTQUFiLENBQXVCMEUsV0FBbkQ7O0FBRUF2RSxhQUFhSCxTQUFiLENBQXVCNEUsZUFBdkIsR0FDSSxTQUFTQSxlQUFULENBQXlCbkMsSUFBekIsRUFBK0JnQixRQUEvQixFQUF5QztTQUNoQ0YsYUFBYSxJQUFiLEVBQW1CZCxJQUFuQixFQUF5QmdCLFFBQXpCLEVBQW1DLElBQW5DLENBQVA7Q0FGTjs7QUFLQSxTQUFTb0IsU0FBVCxDQUFtQnJCLE1BQW5CLEVBQTJCZixJQUEzQixFQUFpQ2dCLFFBQWpDLEVBQTJDO01BQ3JDcUIsUUFBUSxLQUFaO1dBQ1NDLENBQVQsR0FBYTtXQUNKQyxjQUFQLENBQXNCdkMsSUFBdEIsRUFBNEJzQyxDQUE1QjtRQUNJLENBQUNELEtBQUwsRUFBWTtjQUNGLElBQVI7ZUFDU3ZDLEtBQVQsQ0FBZWlCLE1BQWYsRUFBdUJULFNBQXZCOzs7SUFHRlUsUUFBRixHQUFhQSxRQUFiO1NBQ09zQixDQUFQOzs7QUFHRjVFLGFBQWFILFNBQWIsQ0FBdUJpRixJQUF2QixHQUE4QixTQUFTQSxJQUFULENBQWN4QyxJQUFkLEVBQW9CZ0IsUUFBcEIsRUFBOEI7TUFDdEQsT0FBT0EsUUFBUCxLQUFvQixVQUF4QixFQUNFLE1BQU0sSUFBSXZDLFNBQUosQ0FBYyx3Q0FBZCxDQUFOO09BQ0d5RCxFQUFMLENBQVFsQyxJQUFSLEVBQWNvQyxVQUFVLElBQVYsRUFBZ0JwQyxJQUFoQixFQUFzQmdCLFFBQXRCLENBQWQ7U0FDTyxJQUFQO0NBSkY7O0FBT0F0RCxhQUFhSCxTQUFiLENBQXVCa0YsbUJBQXZCLEdBQ0ksU0FBU0EsbUJBQVQsQ0FBNkJ6QyxJQUE3QixFQUFtQ2dCLFFBQW5DLEVBQTZDO01BQ3ZDLE9BQU9BLFFBQVAsS0FBb0IsVUFBeEIsRUFDRSxNQUFNLElBQUl2QyxTQUFKLENBQWMsd0NBQWQsQ0FBTjtPQUNHMEQsZUFBTCxDQUFxQm5DLElBQXJCLEVBQTJCb0MsVUFBVSxJQUFWLEVBQWdCcEMsSUFBaEIsRUFBc0JnQixRQUF0QixDQUEzQjtTQUNPLElBQVA7Q0FMTjs7O0FBU0F0RCxhQUFhSCxTQUFiLENBQXVCZ0YsY0FBdkIsR0FDSSxTQUFTQSxjQUFULENBQXdCdkMsSUFBeEIsRUFBOEJnQixRQUE5QixFQUF3QztNQUNsQzBCLElBQUosRUFBVXhDLE1BQVYsRUFBa0J5QyxRQUFsQixFQUE0QnRELENBQTVCLEVBQStCdUQsZ0JBQS9COztNQUVJLE9BQU81QixRQUFQLEtBQW9CLFVBQXhCLEVBQ0UsTUFBTSxJQUFJdkMsU0FBSixDQUFjLHdDQUFkLENBQU47O1dBRU8sS0FBS1YsT0FBZDtNQUNJLENBQUNtQyxNQUFMLEVBQ0UsT0FBTyxJQUFQOztTQUVLQSxPQUFPRixJQUFQLENBQVA7TUFDSSxDQUFDMEMsSUFBTCxFQUNFLE9BQU8sSUFBUDs7TUFFRUEsU0FBUzFCLFFBQVQsSUFBc0IwQixLQUFLMUIsUUFBTCxJQUFpQjBCLEtBQUsxQixRQUFMLEtBQWtCQSxRQUE3RCxFQUF3RTtRQUNsRSxFQUFFLEtBQUszQyxZQUFQLEtBQXdCLENBQTVCLEVBQ0UsS0FBS04sT0FBTCxHQUFlLElBQUlULGFBQUosRUFBZixDQURGLEtBRUs7YUFDSTRDLE9BQU9GLElBQVAsQ0FBUDtVQUNJRSxPQUFPcUMsY0FBWCxFQUNFLEtBQUt4QyxJQUFMLENBQVUsZ0JBQVYsRUFBNEJDLElBQTVCLEVBQWtDMEMsS0FBSzFCLFFBQUwsSUFBaUJBLFFBQW5EOztHQU5OLE1BUU8sSUFBSSxPQUFPMEIsSUFBUCxLQUFnQixVQUFwQixFQUFnQztlQUMxQixDQUFDLENBQVo7O1NBRUtyRCxJQUFJcUQsS0FBS3hELE1BQWQsRUFBc0JHLE1BQU0sQ0FBNUIsR0FBZ0M7VUFDMUJxRCxLQUFLckQsQ0FBTCxNQUFZMkIsUUFBWixJQUNDMEIsS0FBS3JELENBQUwsRUFBUTJCLFFBQVIsSUFBb0IwQixLQUFLckQsQ0FBTCxFQUFRMkIsUUFBUixLQUFxQkEsUUFEOUMsRUFDeUQ7MkJBQ3BDMEIsS0FBS3JELENBQUwsRUFBUTJCLFFBQTNCO21CQUNXM0IsQ0FBWDs7Ozs7UUFLQXNELFdBQVcsQ0FBZixFQUNFLE9BQU8sSUFBUDs7UUFFRUQsS0FBS3hELE1BQUwsS0FBZ0IsQ0FBcEIsRUFBdUI7V0FDaEIsQ0FBTCxJQUFVcEIsU0FBVjtVQUNJLEVBQUUsS0FBS08sWUFBUCxLQUF3QixDQUE1QixFQUErQjthQUN4Qk4sT0FBTCxHQUFlLElBQUlULGFBQUosRUFBZjtlQUNPLElBQVA7T0FGRixNQUdPO2VBQ0U0QyxPQUFPRixJQUFQLENBQVA7O0tBTkosTUFRTztnQkFDSzBDLElBQVYsRUFBZ0JDLFFBQWhCOzs7UUFHRXpDLE9BQU9xQyxjQUFYLEVBQ0UsS0FBS3hDLElBQUwsQ0FBVSxnQkFBVixFQUE0QkMsSUFBNUIsRUFBa0M0QyxvQkFBb0I1QixRQUF0RDs7O1NBR0csSUFBUDtDQXRETjs7QUF5REF0RCxhQUFhSCxTQUFiLENBQXVCc0Ysa0JBQXZCLEdBQ0ksU0FBU0Esa0JBQVQsQ0FBNEI3QyxJQUE1QixFQUFrQztNQUM1QmIsU0FBSixFQUFlZSxNQUFmOztXQUVTLEtBQUtuQyxPQUFkO01BQ0ksQ0FBQ21DLE1BQUwsRUFDRSxPQUFPLElBQVA7OztNQUdFLENBQUNBLE9BQU9xQyxjQUFaLEVBQTRCO1FBQ3RCakMsVUFBVXBCLE1BQVYsS0FBcUIsQ0FBekIsRUFBNEI7V0FDckJuQixPQUFMLEdBQWUsSUFBSVQsYUFBSixFQUFmO1dBQ0tlLFlBQUwsR0FBb0IsQ0FBcEI7S0FGRixNQUdPLElBQUk2QixPQUFPRixJQUFQLENBQUosRUFBa0I7VUFDbkIsRUFBRSxLQUFLM0IsWUFBUCxLQUF3QixDQUE1QixFQUNFLEtBQUtOLE9BQUwsR0FBZSxJQUFJVCxhQUFKLEVBQWYsQ0FERixLQUdFLE9BQU80QyxPQUFPRixJQUFQLENBQVA7O1dBRUcsSUFBUDs7OztNQUlFTSxVQUFVcEIsTUFBVixLQUFxQixDQUF6QixFQUE0QjtRQUN0QjRELE9BQU90RixPQUFPc0YsSUFBUCxDQUFZNUMsTUFBWixDQUFYO1NBQ0ssSUFBSWIsSUFBSSxDQUFSLEVBQVcwRCxHQUFoQixFQUFxQjFELElBQUl5RCxLQUFLNUQsTUFBOUIsRUFBc0MsRUFBRUcsQ0FBeEMsRUFBMkM7WUFDbkN5RCxLQUFLekQsQ0FBTCxDQUFOO1VBQ0kwRCxRQUFRLGdCQUFaLEVBQThCO1dBQ3pCRixrQkFBTCxDQUF3QkUsR0FBeEI7O1NBRUdGLGtCQUFMLENBQXdCLGdCQUF4QjtTQUNLOUUsT0FBTCxHQUFlLElBQUlULGFBQUosRUFBZjtTQUNLZSxZQUFMLEdBQW9CLENBQXBCO1dBQ08sSUFBUDs7O2NBR1U2QixPQUFPRixJQUFQLENBQVo7O01BRUksT0FBT2IsU0FBUCxLQUFxQixVQUF6QixFQUFxQztTQUM5Qm9ELGNBQUwsQ0FBb0J2QyxJQUFwQixFQUEwQmIsU0FBMUI7R0FERixNQUVPLElBQUlBLFNBQUosRUFBZTs7T0FFakI7V0FDSW9ELGNBQUwsQ0FBb0J2QyxJQUFwQixFQUEwQmIsVUFBVUEsVUFBVUQsTUFBVixHQUFtQixDQUE3QixDQUExQjtLQURGLFFBRVNDLFVBQVUsQ0FBVixDQUZUOzs7U0FLSyxJQUFQO0NBL0NOOztBQWtEQXpCLGFBQWFILFNBQWIsQ0FBdUI0QixTQUF2QixHQUFtQyxTQUFTQSxTQUFULENBQW1CYSxJQUFuQixFQUF5QjtNQUN0RGdELFVBQUo7TUFDSUMsR0FBSjtNQUNJL0MsU0FBUyxLQUFLbkMsT0FBbEI7O01BRUksQ0FBQ21DLE1BQUwsRUFDRStDLE1BQU0sRUFBTixDQURGLEtBRUs7aUJBQ1UvQyxPQUFPRixJQUFQLENBQWI7UUFDSSxDQUFDZ0QsVUFBTCxFQUNFQyxNQUFNLEVBQU4sQ0FERixLQUVLLElBQUksT0FBT0QsVUFBUCxLQUFzQixVQUExQixFQUNIQyxNQUFNLENBQUNELFdBQVdoQyxRQUFYLElBQXVCZ0MsVUFBeEIsQ0FBTixDQURHLEtBR0hDLE1BQU1DLGdCQUFnQkYsVUFBaEIsQ0FBTjs7O1NBR0dDLEdBQVA7Q0FqQkY7O0FBb0JBdkYsYUFBYXlGLGFBQWIsR0FBNkIsVUFBU3pCLE9BQVQsRUFBa0IxQixJQUFsQixFQUF3QjtNQUMvQyxPQUFPMEIsUUFBUXlCLGFBQWYsS0FBaUMsVUFBckMsRUFBaUQ7V0FDeEN6QixRQUFReUIsYUFBUixDQUFzQm5ELElBQXRCLENBQVA7R0FERixNQUVPO1dBQ0VtRCxjQUFjdkYsSUFBZCxDQUFtQjhELE9BQW5CLEVBQTRCMUIsSUFBNUIsQ0FBUDs7Q0FKSjs7QUFRQXRDLGFBQWFILFNBQWIsQ0FBdUI0RixhQUF2QixHQUF1Q0EsYUFBdkM7QUFDQSxTQUFTQSxhQUFULENBQXVCbkQsSUFBdkIsRUFBNkI7TUFDdkJFLFNBQVMsS0FBS25DLE9BQWxCOztNQUVJbUMsTUFBSixFQUFZO1FBQ044QyxhQUFhOUMsT0FBT0YsSUFBUCxDQUFqQjs7UUFFSSxPQUFPZ0QsVUFBUCxLQUFzQixVQUExQixFQUFzQzthQUM3QixDQUFQO0tBREYsTUFFTyxJQUFJQSxVQUFKLEVBQWdCO2FBQ2RBLFdBQVc5RCxNQUFsQjs7OztTQUlHLENBQVA7OztBQUdGeEIsYUFBYUgsU0FBYixDQUF1QjZGLFVBQXZCLEdBQW9DLFNBQVNBLFVBQVQsR0FBc0I7U0FDakQsS0FBSy9FLFlBQUwsR0FBb0IsQ0FBcEIsR0FBd0JnRixRQUFRQyxPQUFSLENBQWdCLEtBQUt2RixPQUFyQixDQUF4QixHQUF3RCxFQUEvRDtDQURGOzs7QUFLQSxTQUFTd0YsU0FBVCxDQUFtQmIsSUFBbkIsRUFBeUJjLEtBQXpCLEVBQWdDO09BQ3pCLElBQUluRSxJQUFJbUUsS0FBUixFQUFlQyxJQUFJcEUsSUFBSSxDQUF2QixFQUEwQmQsSUFBSW1FLEtBQUt4RCxNQUF4QyxFQUFnRHVFLElBQUlsRixDQUFwRCxFQUF1RGMsS0FBSyxDQUFMLEVBQVFvRSxLQUFLLENBQXBFO1NBQ09wRSxDQUFMLElBQVVxRCxLQUFLZSxDQUFMLENBQVY7R0FDRmYsS0FBS2dCLEdBQUw7OztBQUdGLFNBQVN0RSxVQUFULENBQW9CdUUsR0FBcEIsRUFBeUJ0RSxDQUF6QixFQUE0QjtNQUN0QnVFLE9BQU8sSUFBSWhELEtBQUosQ0FBVXZCLENBQVYsQ0FBWDtTQUNPQSxHQUFQO1NBQ09BLENBQUwsSUFBVXNFLElBQUl0RSxDQUFKLENBQVY7R0FDRixPQUFPdUUsSUFBUDs7O0FBR0YsU0FBU1YsZUFBVCxDQUF5QlMsR0FBekIsRUFBOEI7TUFDeEJWLE1BQU0sSUFBSXJDLEtBQUosQ0FBVStDLElBQUl6RSxNQUFkLENBQVY7T0FDSyxJQUFJRyxJQUFJLENBQWIsRUFBZ0JBLElBQUk0RCxJQUFJL0QsTUFBeEIsRUFBZ0MsRUFBRUcsQ0FBbEMsRUFBcUM7UUFDL0JBLENBQUosSUFBU3NFLElBQUl0RSxDQUFKLEVBQU8yQixRQUFQLElBQW1CMkMsSUFBSXRFLENBQUosQ0FBNUI7O1NBRUs0RCxHQUFQOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0dDL2NELFVBQVNwQixDQUFULEVBQVdnQyxDQUFYLEVBQWE7SUFBc0RDLGNBQUEsR0FBZUQsR0FBcEUsQUFBQTtHQUFkLENBQXlKRSxjQUF6SixFQUE4SixZQUFVOzthQUF1QmxDLENBQVQsR0FBWTtVQUFLQSxJQUFFdkIsVUFBVXBCLE1BQVYsR0FBaUIsQ0FBakIsSUFBb0IsS0FBSyxDQUFMLEtBQVNvQixVQUFVLENBQVYsQ0FBN0IsR0FBMENBLFVBQVUsQ0FBVixDQUExQyxHQUF1RCxFQUE3RDtVQUFnRXVELElBQUV2RCxVQUFVcEIsTUFBVixHQUFpQixDQUFqQixJQUFvQixLQUFLLENBQUwsS0FBU29CLFVBQVUsQ0FBVixDQUE3QixHQUEwQ0EsVUFBVSxDQUFWLENBQTFDLEdBQXVELEVBQXpIO1VBQTRIMEQsSUFBRXhHLE9BQU9zRixJQUFQLENBQVllLENBQVosQ0FBOUgsQ0FBNkksT0FBTyxNQUFJRyxFQUFFOUUsTUFBTixHQUFhMkMsQ0FBYixHQUFlQSxJQUFFb0MsVUFBVUQsRUFBRUUsTUFBRixDQUFTLFVBQVNyQyxDQUFULEVBQVdtQyxDQUFYLEVBQWE7ZUFBUW5DLElBQUUsR0FBRixHQUFNbUMsQ0FBTixHQUFRLEdBQVIsSUFBYUgsRUFBRUcsQ0FBRixLQUFNLEVBQW5CLENBQVA7T0FBdkIsRUFBc0QsR0FBdEQsRUFBMkRHLE9BQTNELENBQW1FLElBQW5FLEVBQXdFLEdBQXhFLENBQVYsQ0FBeEI7Y0FBeUhOLENBQVQsR0FBWTtVQUFLaEMsSUFBRXZCLFVBQVVwQixNQUFWLEdBQWlCLENBQWpCLElBQW9CLEtBQUssQ0FBTCxLQUFTb0IsVUFBVSxDQUFWLENBQTdCLEdBQTBDQSxVQUFVLENBQVYsQ0FBMUMsR0FBdUQsRUFBN0QsQ0FBZ0UsSUFBRyxDQUFDdUIsRUFBRXVDLFFBQUYsQ0FBVyxHQUFYLENBQUosRUFBb0IsT0FBTSxFQUFOLENBQVMsSUFBSVAsSUFBRSxFQUFOO1VBQVN0RixJQUFFOEYsVUFBVXhDLENBQVYsRUFBYXlDLEtBQWIsQ0FBbUIsR0FBbkIsQ0FBWDtVQUFtQ0MsSUFBRUMsRUFBRWpHLENBQUYsRUFBSSxDQUFKLENBQXJDO1VBQTRDYyxJQUFFa0YsRUFBRSxDQUFGLENBQTlDO1VBQW1ERSxJQUFFcEYsRUFBRWlGLEtBQUYsQ0FBUSxHQUFSLENBQXJELENBQWtFLE9BQU9HLEVBQUVDLE9BQUYsQ0FBVSxVQUFTN0MsQ0FBVCxFQUFXO1lBQUt0RCxJQUFFc0QsRUFBRXlDLEtBQUYsQ0FBUSxHQUFSLENBQU47WUFBbUJDLElBQUVDLEVBQUVqRyxDQUFGLEVBQUksQ0FBSixDQUFyQjtZQUE0QmMsSUFBRWtGLEVBQUUsQ0FBRixDQUE5QjtZQUFtQ0UsSUFBRUYsRUFBRSxDQUFGLENBQXJDLENBQTBDVixFQUFFeEUsQ0FBRixJQUFLMkUsRUFBRVMsQ0FBRixDQUFMO09BQWhFLEdBQTRFWixDQUFuRjtjQUE4RkcsQ0FBVCxDQUFXbkMsQ0FBWCxFQUFhO1VBQUksT0FBS0EsQ0FBUixFQUFVO1lBQUksV0FBU0EsQ0FBWixFQUFjLE9BQU0sQ0FBQyxDQUFQLENBQVMsSUFBRyxZQUFVQSxDQUFiLEVBQWUsT0FBTSxDQUFDLENBQVAsQ0FBUyxJQUFJZ0MsSUFBRWMsV0FBVzlDLENBQVgsQ0FBTixDQUFvQixPQUFPK0MsT0FBT3BHLEtBQVAsQ0FBYXFGLENBQWIsS0FBaUJBLEtBQUdoQyxDQUFwQixHQUFzQkEsQ0FBdEIsR0FBd0JnQyxDQUEvQjs7Y0FBMkN0RixDQUFULENBQVdzRCxDQUFYLEVBQWFnQyxDQUFiLEVBQWU7YUFBUUEsSUFBRSxFQUFDZ0IsU0FBUSxFQUFULEVBQUYsRUFBZWhELEVBQUVnQyxDQUFGLEVBQUlBLEVBQUVnQixPQUFOLENBQWYsRUFBOEJoQixFQUFFZ0IsT0FBdkM7Y0FBd0ROLENBQVQsR0FBWTtXQUFLLElBQUkxQyxJQUFFdkIsVUFBVXBCLE1BQWhCLEVBQXVCMkUsSUFBRWpELE1BQU1pQixDQUFOLENBQXpCLEVBQWtDbUMsSUFBRSxDQUF4QyxFQUEwQ0EsSUFBRW5DLENBQTVDLEVBQThDbUMsR0FBOUM7VUFBb0RBLENBQUYsSUFBSzFELFVBQVUwRCxDQUFWLENBQUw7T0FBa0IsT0FBTzFCLEVBQUV3QyxTQUFGLENBQVloRixLQUFaLENBQWtCd0MsQ0FBbEIsRUFBb0IsQ0FBQyxDQUFDLENBQUYsRUFBS3lDLE1BQUwsQ0FBWWxCLENBQVosQ0FBcEIsQ0FBUDtjQUFvRHhFLENBQVQsQ0FBV3dDLENBQVgsRUFBYWdDLENBQWIsRUFBZTtVQUFLRyxJQUFFLEVBQU4sQ0FBUyxPQUFPeEcsT0FBT3NGLElBQVAsQ0FBWWpCLENBQVosRUFBZTZDLE9BQWYsQ0FBdUIsVUFBU25HLENBQVQsRUFBVztVQUFHeUcsT0FBRixDQUFVekcsQ0FBVixNQUFlLENBQUMsQ0FBaEIsS0FBb0J5RixFQUFFekYsQ0FBRixJQUFLc0QsRUFBRXRELENBQUYsQ0FBekI7T0FBbkMsR0FBb0V5RixDQUEzRTtjQUFzRlMsQ0FBVCxDQUFXNUMsQ0FBWCxFQUFhZ0MsQ0FBYixFQUFlO2FBQVFoQyxFQUFFc0MsT0FBRixDQUFVLE1BQVYsRUFBaUIsRUFBakIsSUFBcUIsR0FBckIsR0FBeUJOLEVBQUVNLE9BQUYsQ0FBVSxNQUFWLEVBQWlCLEVBQWpCLENBQWhDO2NBQThEYyxDQUFULENBQVdwRCxDQUFYLEVBQWE7OENBQXVDcUQsSUFBaEMsQ0FBcUNyRCxDQUFyQzs7Y0FBaURzRCxDQUFULENBQVd0RCxDQUFYLEVBQWFnQyxDQUFiLEVBQWU7YUFBTyxDQUFDaEMsQ0FBRCxJQUFJb0QsRUFBRXBCLENBQUYsQ0FBSixHQUFTQSxDQUFULEdBQVdZLEVBQUU1QyxDQUFGLEVBQUlnQyxDQUFKLENBQWpCO2NBQWlDdUIsQ0FBVCxDQUFXdkQsQ0FBWCxFQUFhZ0MsQ0FBYixFQUFlO2FBQVFoQyxFQUFFZ0MsQ0FBRixJQUFPd0IsSUFBUCxDQUFZLFVBQVN4QixDQUFULEVBQVc7ZUFBTyxFQUFDeUIsU0FBUXpELEVBQUV5RCxPQUFYLEVBQW1CQyxRQUFPMUQsRUFBRTBELE1BQTVCLEVBQW1DQyxZQUFXM0QsRUFBRTJELFVBQWhELEVBQTJEQyxNQUFLNUIsQ0FBaEUsRUFBTjtPQUF4QixDQUFQO2NBQW1INkIsQ0FBVCxDQUFXN0QsQ0FBWCxFQUFhZ0MsQ0FBYixFQUFlO1VBQUksQ0FBQ2hDLEVBQUU4RCxFQUFOLEVBQVM7WUFBSzNCLElBQUUsSUFBSXpELEtBQUosQ0FBVXNCLEVBQUUyRCxVQUFaLENBQU4sQ0FBOEIsT0FBT3hCLEVBQUV1QixNQUFGLEdBQVMxRCxFQUFFMEQsTUFBWCxFQUFrQnZCLEVBQUV3QixVQUFGLEdBQWEzRCxFQUFFMkQsVUFBakMsRUFBNEN4QixFQUFFc0IsT0FBRixHQUFVekQsRUFBRXlELE9BQXhELEVBQWdFTSxRQUFRQyxNQUFSLENBQWU3QixDQUFmLENBQXZFO1dBQTRGSCxDQUFILEVBQUssT0FBT3VCLEVBQUV2RCxDQUFGLEVBQUlnQyxDQUFKLENBQVAsQ0FBYyxJQUFJdEYsSUFBRXNELEVBQUV5RCxPQUFGLENBQVVRLEdBQVYsQ0FBYyxjQUFkLENBQU4sQ0FBb0MsT0FBT3ZILEtBQUdBLEVBQUU2RixRQUFGLENBQVcsa0JBQVgsQ0FBSCxHQUFrQ2dCLEVBQUV2RCxDQUFGLEVBQUksTUFBSixDQUFsQyxHQUE4Q3VELEVBQUV2RCxDQUFGLEVBQUksTUFBSixDQUFyRDtNQUFrRSxVQUFTQSxDQUFULEVBQVc7ZUFBVWdDLENBQVQsQ0FBV2hDLENBQVgsRUFBYTtZQUFJLFlBQVUsT0FBT0EsQ0FBakIsS0FBcUJBLElBQUVrRSxPQUFPbEUsQ0FBUCxDQUF2QixHQUFrQyw2QkFBNkJxRCxJQUE3QixDQUFrQ3JELENBQWxDLENBQXJDLEVBQTBFLE1BQU0sSUFBSXBELFNBQUosQ0FBYyx3Q0FBZCxDQUFOLENBQThELE9BQU9vRCxFQUFFbUUsV0FBRixFQUFQO2dCQUFnQ2hDLENBQVQsQ0FBV25DLENBQVgsRUFBYTtlQUFPLFlBQVUsT0FBT0EsQ0FBakIsS0FBcUJBLElBQUVrRSxPQUFPbEUsQ0FBUCxDQUF2QixHQUFrQ0EsQ0FBeEM7Z0JBQW1EdEQsQ0FBVCxDQUFXc0QsQ0FBWCxFQUFhO1lBQUtnQyxJQUFFLEVBQUNvQyxNQUFLLGdCQUFVO2dCQUFLcEMsSUFBRWhDLEVBQUVxRSxLQUFGLEVBQU4sQ0FBZ0IsT0FBTSxFQUFDQyxNQUFLLEtBQUssQ0FBTCxLQUFTdEMsQ0FBZixFQUFpQnVDLE9BQU12QyxDQUF2QixFQUFOO1dBQWpDLEVBQU4sQ0FBeUUsT0FBT1csRUFBRTZCLFFBQUYsS0FBYXhDLEVBQUV5QyxPQUFPQyxRQUFULElBQW1CLFlBQVU7aUJBQVExQyxDQUFQO1NBQTNDLEdBQXNEQSxDQUE3RDtnQkFBd0VVLENBQVQsQ0FBVzFDLENBQVgsRUFBYTthQUFNMkUsR0FBTCxHQUFTLEVBQVQsRUFBWTNFLGFBQWEwQyxDQUFiLEdBQWUxQyxFQUFFNkMsT0FBRixDQUFVLFVBQVM3QyxDQUFULEVBQVdnQyxDQUFYLEVBQWE7ZUFBTTRDLE1BQUwsQ0FBWTVDLENBQVosRUFBY2hDLENBQWQ7U0FBeEIsRUFBMEMsSUFBMUMsQ0FBZixHQUErREEsS0FBR3JFLE9BQU9rSixtQkFBUCxDQUEyQjdFLENBQTNCLEVBQThCNkMsT0FBOUIsQ0FBc0MsVUFBU2IsQ0FBVCxFQUFXO2VBQU00QyxNQUFMLENBQVk1QyxDQUFaLEVBQWNoQyxFQUFFZ0MsQ0FBRixDQUFkO1NBQWxELEVBQXVFLElBQXZFLENBQTlFO2dCQUFvS3hFLENBQVQsQ0FBV3dDLENBQVgsRUFBYTtlQUFRQSxFQUFFOEUsUUFBRixHQUFXZixRQUFRQyxNQUFSLENBQWUsSUFBSXBILFNBQUosQ0FBYyxjQUFkLENBQWYsQ0FBWCxHQUF5RCxNQUFLb0QsRUFBRThFLFFBQUYsR0FBVyxDQUFDLENBQWpCLENBQWhFO2dCQUE2RmxDLENBQVQsQ0FBVzVDLENBQVgsRUFBYTtlQUFRLElBQUkrRCxPQUFKLENBQVksVUFBUy9CLENBQVQsRUFBV0csQ0FBWCxFQUFhO1lBQUc0QyxNQUFGLEdBQVMsWUFBVTtjQUFHL0UsRUFBRWdGLE1BQUo7V0FBcEIsRUFBaUNoRixFQUFFaUYsT0FBRixHQUFVLFlBQVU7Y0FBR2pGLEVBQUV4QixLQUFKO1dBQXREO1NBQTFCLENBQVA7Z0JBQThHNEUsQ0FBVCxDQUFXcEQsQ0FBWCxFQUFhO1lBQUtnQyxJQUFFLElBQUlrRCxVQUFKLEVBQU4sQ0FBcUIsT0FBT2xELEVBQUVtRCxpQkFBRixDQUFvQm5GLENBQXBCLEdBQXVCNEMsRUFBRVosQ0FBRixDQUE5QjtnQkFBNENzQixDQUFULENBQVd0RCxDQUFYLEVBQWE7WUFBS2dDLElBQUUsSUFBSWtELFVBQUosRUFBTixDQUFxQixPQUFPbEQsRUFBRW9ELFVBQUYsQ0FBYXBGLENBQWIsR0FBZ0I0QyxFQUFFWixDQUFGLENBQXZCO2dCQUFxQ3VCLENBQVQsR0FBWTtlQUFRLEtBQUt1QixRQUFMLEdBQWMsQ0FBQyxDQUFmLEVBQWlCLEtBQUtPLFNBQUwsR0FBZSxVQUFTckYsQ0FBVCxFQUFXO2NBQUksS0FBS3NGLFNBQUwsR0FBZXRGLENBQWYsRUFBaUIsWUFBVSxPQUFPQSxDQUFyQyxFQUF1QyxLQUFLdUYsU0FBTCxHQUFldkYsQ0FBZixDQUF2QyxLQUE2RCxJQUFHMkMsRUFBRTZDLElBQUYsSUFBUUMsS0FBSy9KLFNBQUwsQ0FBZWdLLGFBQWYsQ0FBNkIxRixDQUE3QixDQUFYLEVBQTJDLEtBQUsyRixTQUFMLEdBQWUzRixDQUFmLENBQTNDLEtBQWlFLElBQUcyQyxFQUFFaUQsUUFBRixJQUFZQyxTQUFTbkssU0FBVCxDQUFtQmdLLGFBQW5CLENBQWlDMUYsQ0FBakMsQ0FBZixFQUFtRCxLQUFLOEYsYUFBTCxHQUFtQjlGLENBQW5CLENBQW5ELEtBQTZFLElBQUcyQyxFQUFFb0QsWUFBRixJQUFnQkMsZ0JBQWdCdEssU0FBaEIsQ0FBMEJnSyxhQUExQixDQUF3QzFGLENBQXhDLENBQW5CLEVBQThELEtBQUt1RixTQUFMLEdBQWV2RixFQUFFaUcsUUFBRixFQUFmLENBQTlELEtBQStGLElBQUdqRyxDQUFILEVBQUs7Z0JBQUksQ0FBQzJDLEVBQUV1RCxXQUFILElBQWdCLENBQUNDLFlBQVl6SyxTQUFaLENBQXNCZ0ssYUFBdEIsQ0FBb0MxRixDQUFwQyxDQUFwQixFQUEyRCxNQUFNLElBQUl0QixLQUFKLENBQVUsMkJBQVYsQ0FBTjtXQUFqRSxNQUFtSCxLQUFLNkcsU0FBTCxHQUFlLEVBQWYsQ0FBa0IsS0FBSzlCLE9BQUwsQ0FBYVEsR0FBYixDQUFpQixjQUFqQixNQUFtQyxZQUFVLE9BQU9qRSxDQUFqQixHQUFtQixLQUFLeUQsT0FBTCxDQUFhMkMsR0FBYixDQUFpQixjQUFqQixFQUFnQywwQkFBaEMsQ0FBbkIsR0FBK0UsS0FBS1QsU0FBTCxJQUFnQixLQUFLQSxTQUFMLENBQWV4SCxJQUEvQixHQUFvQyxLQUFLc0YsT0FBTCxDQUFhMkMsR0FBYixDQUFpQixjQUFqQixFQUFnQyxLQUFLVCxTQUFMLENBQWV4SCxJQUEvQyxDQUFwQyxHQUF5RndFLEVBQUVvRCxZQUFGLElBQWdCQyxnQkFBZ0J0SyxTQUFoQixDQUEwQmdLLGFBQTFCLENBQXdDMUYsQ0FBeEMsQ0FBaEIsSUFBNEQsS0FBS3lELE9BQUwsQ0FBYTJDLEdBQWIsQ0FBaUIsY0FBakIsRUFBZ0MsaURBQWhDLENBQXZRO1NBQTNkLEVBQXV6QnpELEVBQUU2QyxJQUFGLElBQVEsS0FBS0EsSUFBTCxHQUFVLFlBQVU7Y0FBS3hGLElBQUV4QyxFQUFFLElBQUYsQ0FBTixDQUFjLElBQUd3QyxDQUFILEVBQUssT0FBT0EsQ0FBUCxDQUFTLElBQUcsS0FBSzJGLFNBQVIsRUFBa0IsT0FBTzVCLFFBQVFzQyxPQUFSLENBQWdCLEtBQUtWLFNBQXJCLENBQVAsQ0FBdUMsSUFBRyxLQUFLRyxhQUFSLEVBQXNCLE1BQU0sSUFBSXBILEtBQUosQ0FBVSxzQ0FBVixDQUFOLENBQXdELE9BQU9xRixRQUFRc0MsT0FBUixDQUFnQixJQUFJWixJQUFKLENBQVMsQ0FBQyxLQUFLRixTQUFOLENBQVQsQ0FBaEIsQ0FBUDtTQUF4TCxFQUE0TyxLQUFLVyxXQUFMLEdBQWlCLFlBQVU7aUJBQVEsS0FBS1YsSUFBTCxHQUFZaEMsSUFBWixDQUFpQkosQ0FBakIsQ0FBUDtTQUF4USxFQUFvUyxLQUFLa0QsSUFBTCxHQUFVLFlBQVU7Y0FBS3RHLElBQUV4QyxFQUFFLElBQUYsQ0FBTixDQUFjLElBQUd3QyxDQUFILEVBQUssT0FBT0EsQ0FBUCxDQUFTLElBQUcsS0FBSzJGLFNBQVIsRUFBa0IsT0FBT3JDLEVBQUUsS0FBS3FDLFNBQVAsQ0FBUCxDQUF5QixJQUFHLEtBQUtHLGFBQVIsRUFBc0IsTUFBTSxJQUFJcEgsS0FBSixDQUFVLHNDQUFWLENBQU4sQ0FBd0QsT0FBT3FGLFFBQVFzQyxPQUFSLENBQWdCLEtBQUtkLFNBQXJCLENBQVA7U0FBdGQsSUFBK2YsS0FBS2UsSUFBTCxHQUFVLFlBQVU7Y0FBS3RHLElBQUV4QyxFQUFFLElBQUYsQ0FBTixDQUFjLE9BQU93QyxJQUFFQSxDQUFGLEdBQUkrRCxRQUFRc0MsT0FBUixDQUFnQixLQUFLZCxTQUFyQixDQUFYO1NBQXoxQyxFQUFxNEM1QyxFQUFFaUQsUUFBRixLQUFhLEtBQUtBLFFBQUwsR0FBYyxZQUFVO2lCQUFRLEtBQUtVLElBQUwsR0FBWTlDLElBQVosQ0FBaUIrQyxDQUFqQixDQUFQO1NBQXRDLENBQXI0QyxFQUF3OEMsS0FBS0MsSUFBTCxHQUFVLFlBQVU7aUJBQVEsS0FBS0YsSUFBTCxHQUFZOUMsSUFBWixDQUFpQmlELEtBQUtDLEtBQXRCLENBQVA7U0FBNzlDLEVBQWtnRCxJQUF6Z0Q7Z0JBQXVoRDdDLENBQVQsQ0FBVzdELENBQVgsRUFBYTtZQUFLZ0MsSUFBRWhDLEVBQUUyRyxXQUFGLEVBQU4sQ0FBc0IsT0FBT0MsRUFBRXpELE9BQUYsQ0FBVW5CLENBQVYsSUFBYSxDQUFDLENBQWQsR0FBZ0JBLENBQWhCLEdBQWtCaEMsQ0FBekI7Z0JBQW9DNkcsQ0FBVCxDQUFXN0csQ0FBWCxFQUFhZ0MsQ0FBYixFQUFlO1lBQUdBLEtBQUcsRUFBTCxDQUFRLElBQUlHLElBQUVILEVBQUU4RSxJQUFSLENBQWEsSUFBR0QsRUFBRW5MLFNBQUYsQ0FBWWdLLGFBQVosQ0FBMEIxRixDQUExQixDQUFILEVBQWdDO2NBQUlBLEVBQUU4RSxRQUFMLEVBQWMsTUFBTSxJQUFJbEksU0FBSixDQUFjLGNBQWQsQ0FBTixDQUFvQyxLQUFLbUssR0FBTCxHQUFTL0csRUFBRStHLEdBQVgsRUFBZSxLQUFLQyxXQUFMLEdBQWlCaEgsRUFBRWdILFdBQWxDLEVBQThDaEYsRUFBRXlCLE9BQUYsS0FBWSxLQUFLQSxPQUFMLEdBQWEsSUFBSWYsQ0FBSixDQUFNMUMsRUFBRXlELE9BQVIsQ0FBekIsQ0FBOUMsRUFBeUYsS0FBS3dELE1BQUwsR0FBWWpILEVBQUVpSCxNQUF2RyxFQUE4RyxLQUFLQyxJQUFMLEdBQVVsSCxFQUFFa0gsSUFBMUgsRUFBK0gvRSxNQUFJQSxJQUFFbkMsRUFBRXNGLFNBQUosRUFBY3RGLEVBQUU4RSxRQUFGLEdBQVcsQ0FBQyxDQUE5QixDQUEvSDtTQUFuRixNQUF3UCxLQUFLaUMsR0FBTCxHQUFTL0csQ0FBVCxDQUFXLElBQUcsS0FBS2dILFdBQUwsR0FBaUJoRixFQUFFZ0YsV0FBRixJQUFlLEtBQUtBLFdBQXBCLElBQWlDLE1BQWxELEVBQXlELENBQUNoRixFQUFFeUIsT0FBSCxJQUFZLEtBQUtBLE9BQWpCLEtBQTJCLEtBQUtBLE9BQUwsR0FBYSxJQUFJZixDQUFKLENBQU1WLEVBQUV5QixPQUFSLENBQXhDLENBQXpELEVBQW1ILEtBQUt3RCxNQUFMLEdBQVlwRCxFQUFFN0IsRUFBRWlGLE1BQUYsSUFBVSxLQUFLQSxNQUFmLElBQXVCLEtBQXpCLENBQS9ILEVBQStKLEtBQUtDLElBQUwsR0FBVWxGLEVBQUVrRixJQUFGLElBQVEsS0FBS0EsSUFBYixJQUFtQixJQUE1TCxFQUFpTSxLQUFLQyxRQUFMLEdBQWMsSUFBL00sRUFBb04sQ0FBQyxVQUFRLEtBQUtGLE1BQWIsSUFBcUIsV0FBUyxLQUFLQSxNQUFwQyxLQUE2QzlFLENBQXBRLEVBQXNRLE1BQU0sSUFBSXZGLFNBQUosQ0FBYywyQ0FBZCxDQUFOLENBQWlFLEtBQUt5SSxTQUFMLENBQWVsRCxDQUFmO2dCQUEyQm9FLENBQVQsQ0FBV3ZHLENBQVgsRUFBYTtZQUFLZ0MsSUFBRSxJQUFJNkQsUUFBSixFQUFOLENBQW1CLE9BQU83RixFQUFFb0gsSUFBRixHQUFTM0UsS0FBVCxDQUFlLEdBQWYsRUFBb0JJLE9BQXBCLENBQTRCLFVBQVM3QyxDQUFULEVBQVc7Y0FBSUEsQ0FBSCxFQUFLO2dCQUFLbUMsSUFBRW5DLEVBQUV5QyxLQUFGLENBQVEsR0FBUixDQUFOO2dCQUFtQi9GLElBQUV5RixFQUFFa0MsS0FBRixHQUFVL0IsT0FBVixDQUFrQixLQUFsQixFQUF3QixHQUF4QixDQUFyQjtnQkFBa0RJLElBQUVQLEVBQUVrRixJQUFGLENBQU8sR0FBUCxFQUFZL0UsT0FBWixDQUFvQixLQUFwQixFQUEwQixHQUExQixDQUFwRCxDQUFtRk4sRUFBRTRDLE1BQUYsQ0FBUzBDLG1CQUFtQjVLLENBQW5CLENBQVQsRUFBK0I0SyxtQkFBbUI1RSxDQUFuQixDQUEvQjs7U0FBakksR0FBMExWLENBQWpNO2dCQUE0TXVGLENBQVQsQ0FBV3ZILENBQVgsRUFBYTtZQUFLZ0MsSUFBRSxJQUFJVSxDQUFKLEVBQU47WUFBWVAsSUFBRSxDQUFDbkMsRUFBRXdILHFCQUFGLE1BQTJCLEVBQTVCLEVBQWdDSixJQUFoQyxHQUF1QzNFLEtBQXZDLENBQTZDLElBQTdDLENBQWQsQ0FBaUUsT0FBT04sRUFBRVUsT0FBRixDQUFVLFVBQVM3QyxDQUFULEVBQVc7Y0FBS21DLElBQUVuQyxFQUFFb0gsSUFBRixHQUFTM0UsS0FBVCxDQUFlLEdBQWYsQ0FBTjtjQUEwQi9GLElBQUV5RixFQUFFa0MsS0FBRixHQUFVK0MsSUFBVixFQUE1QjtjQUE2QzFFLElBQUVQLEVBQUVrRixJQUFGLENBQU8sR0FBUCxFQUFZRCxJQUFaLEVBQS9DLENBQWtFcEYsRUFBRTRDLE1BQUYsQ0FBU2xJLENBQVQsRUFBV2dHLENBQVg7U0FBeEYsR0FBd0dWLENBQS9HO2dCQUEwSHlGLENBQVQsQ0FBV3pILENBQVgsRUFBYWdDLENBQWIsRUFBZTtjQUFLQSxJQUFFLEVBQU4sR0FBVSxLQUFLN0QsSUFBTCxHQUFVLFNBQXBCLEVBQThCLEtBQUt1RixNQUFMLEdBQVkxQixFQUFFMEIsTUFBNUMsRUFBbUQsS0FBS0ksRUFBTCxHQUFRLEtBQUtKLE1BQUwsSUFBYSxHQUFiLElBQWtCLEtBQUtBLE1BQUwsR0FBWSxHQUF6RixFQUE2RixLQUFLQyxVQUFMLEdBQWdCM0IsRUFBRTJCLFVBQS9HLEVBQTBILEtBQUtGLE9BQUwsR0FBYXpCLEVBQUV5QixPQUFGLFlBQXFCZixDQUFyQixHQUF1QlYsRUFBRXlCLE9BQXpCLEdBQWlDLElBQUlmLENBQUosQ0FBTVYsRUFBRXlCLE9BQVIsQ0FBeEssRUFBeUwsS0FBS3NELEdBQUwsR0FBUy9FLEVBQUUrRSxHQUFGLElBQU8sRUFBek0sRUFBNE0sS0FBSzFCLFNBQUwsQ0FBZXJGLENBQWYsQ0FBNU07V0FBaU8sQ0FBQ0EsRUFBRTBILEtBQU4sRUFBWTtZQUFLL0UsSUFBRSxFQUFDb0QsY0FBYSxxQkFBb0IvRixDQUFsQyxFQUFvQ3dFLFVBQVMsWUFBV3hFLENBQVgsSUFBYyxjQUFheUUsTUFBeEUsRUFBK0VlLE1BQUssZ0JBQWV4RixDQUFmLElBQWtCLFVBQVNBLENBQTNCLElBQThCLFlBQVU7Z0JBQUk7cUJBQVEsSUFBSXlGLElBQUosSUFBUyxDQUFDLENBQWpCO2FBQUosQ0FBdUIsT0FBTXpGLENBQU4sRUFBUTtxQkFBTyxDQUFDLENBQVA7O1dBQTNDLEVBQWxILEVBQTBLNEYsVUFBUyxjQUFhNUYsQ0FBaE0sRUFBa01rRyxhQUFZLGlCQUFnQmxHLENBQTlOLEVBQU4sQ0FBdU8wQyxFQUFFaEgsU0FBRixDQUFZa0osTUFBWixHQUFtQixVQUFTNUUsQ0FBVCxFQUFXdEQsQ0FBWCxFQUFhO2NBQUdzRixFQUFFaEMsQ0FBRixDQUFGLEVBQU90RCxJQUFFeUYsRUFBRXpGLENBQUYsQ0FBVCxDQUFjLElBQUlnRyxJQUFFLEtBQUtpQyxHQUFMLENBQVMzRSxDQUFULENBQU4sQ0FBa0IwQyxNQUFJQSxJQUFFLEVBQUYsRUFBSyxLQUFLaUMsR0FBTCxDQUFTM0UsQ0FBVCxJQUFZMEMsQ0FBckIsR0FBd0JBLEVBQUVqRCxJQUFGLENBQU8vQyxDQUFQLENBQXhCO1NBQWpFLEVBQW9HZ0csRUFBRWhILFNBQUYsQ0FBWWlNLE1BQVosR0FBbUIsVUFBUzNILENBQVQsRUFBVztpQkFBUSxLQUFLMkUsR0FBTCxDQUFTM0MsRUFBRWhDLENBQUYsQ0FBVCxDQUFQO1NBQW5JLEVBQTBKMEMsRUFBRWhILFNBQUYsQ0FBWXVJLEdBQVosR0FBZ0IsVUFBU2pFLENBQVQsRUFBVztjQUFLbUMsSUFBRSxLQUFLd0MsR0FBTCxDQUFTM0MsRUFBRWhDLENBQUYsQ0FBVCxDQUFOLENBQXFCLE9BQU9tQyxJQUFFQSxFQUFFLENBQUYsQ0FBRixHQUFPLElBQWQ7U0FBM00sRUFBK05PLEVBQUVoSCxTQUFGLENBQVlrTSxNQUFaLEdBQW1CLFVBQVM1SCxDQUFULEVBQVc7aUJBQVEsS0FBSzJFLEdBQUwsQ0FBUzNDLEVBQUVoQyxDQUFGLENBQVQsS0FBZ0IsRUFBdkI7U0FBOVAsRUFBeVIwQyxFQUFFaEgsU0FBRixDQUFZbU0sR0FBWixHQUFnQixVQUFTN0gsQ0FBVCxFQUFXO2lCQUFRLEtBQUsyRSxHQUFMLENBQVNtRCxjQUFULENBQXdCOUYsRUFBRWhDLENBQUYsQ0FBeEIsQ0FBUDtTQUFyVCxFQUEyVjBDLEVBQUVoSCxTQUFGLENBQVkwSyxHQUFaLEdBQWdCLFVBQVNwRyxDQUFULEVBQVd0RCxDQUFYLEVBQWE7ZUFBTWlJLEdBQUwsQ0FBUzNDLEVBQUVoQyxDQUFGLENBQVQsSUFBZSxDQUFDbUMsRUFBRXpGLENBQUYsQ0FBRCxDQUFmO1NBQXpYLEVBQWdaZ0csRUFBRWhILFNBQUYsQ0FBWW1ILE9BQVosR0FBb0IsVUFBUzdDLENBQVQsRUFBV2dDLENBQVgsRUFBYTtpQkFBUTZDLG1CQUFQLENBQTJCLEtBQUtGLEdBQWhDLEVBQXFDOUIsT0FBckMsQ0FBNkMsVUFBU1YsQ0FBVCxFQUFXO2lCQUFNd0MsR0FBTCxDQUFTeEMsQ0FBVCxFQUFZVSxPQUFaLENBQW9CLFVBQVNuRyxDQUFULEVBQVc7Z0JBQUdYLElBQUYsQ0FBT2lHLENBQVAsRUFBU3RGLENBQVQsRUFBV3lGLENBQVgsRUFBYSxJQUFiO2FBQWhDLEVBQW9ELElBQXBEO1dBQXpELEVBQW9ILElBQXBIO1NBQWxiLEVBQTZpQk8sRUFBRWhILFNBQUYsQ0FBWXVGLElBQVosR0FBaUIsWUFBVTtjQUFLakIsSUFBRSxFQUFOLENBQVMsT0FBTyxLQUFLNkMsT0FBTCxDQUFhLFVBQVNiLENBQVQsRUFBV0csQ0FBWCxFQUFhO2NBQUcxQyxJQUFGLENBQU8wQyxDQUFQO1dBQTNCLEdBQXVDekYsRUFBRXNELENBQUYsQ0FBOUM7U0FBbGxCLEVBQXNvQjBDLEVBQUVoSCxTQUFGLENBQVlxTSxNQUFaLEdBQW1CLFlBQVU7Y0FBSy9ILElBQUUsRUFBTixDQUFTLE9BQU8sS0FBSzZDLE9BQUwsQ0FBYSxVQUFTYixDQUFULEVBQVc7Y0FBR3ZDLElBQUYsQ0FBT3VDLENBQVA7V0FBekIsR0FBcUN0RixFQUFFc0QsQ0FBRixDQUE1QztTQUE3cUIsRUFBK3RCMEMsRUFBRWhILFNBQUYsQ0FBWXNNLE9BQVosR0FBb0IsWUFBVTtjQUFLaEksSUFBRSxFQUFOLENBQVMsT0FBTyxLQUFLNkMsT0FBTCxDQUFhLFVBQVNiLENBQVQsRUFBV0csQ0FBWCxFQUFhO2NBQUcxQyxJQUFGLENBQU8sQ0FBQzBDLENBQUQsRUFBR0gsQ0FBSCxDQUFQO1dBQTNCLEdBQTJDdEYsRUFBRXNELENBQUYsQ0FBbEQ7U0FBdndCLEVBQSt6QjJDLEVBQUU2QixRQUFGLEtBQWE5QixFQUFFaEgsU0FBRixDQUFZK0ksT0FBT0MsUUFBbkIsSUFBNkJoQyxFQUFFaEgsU0FBRixDQUFZc00sT0FBdEQsQ0FBL3pCLENBQTgzQixJQUFJcEIsSUFBRSxDQUFDLFFBQUQsRUFBVSxLQUFWLEVBQWdCLE1BQWhCLEVBQXVCLFNBQXZCLEVBQWlDLE1BQWpDLEVBQXdDLEtBQXhDLENBQU4sQ0FBcURDLEVBQUVuTCxTQUFGLENBQVl1TSxLQUFaLEdBQWtCLFlBQVU7aUJBQVEsSUFBSXBCLENBQUosQ0FBTSxJQUFOLENBQVA7U0FBN0IsRUFBaUR0RCxFQUFFeEgsSUFBRixDQUFPOEssRUFBRW5MLFNBQVQsQ0FBakQsRUFBcUU2SCxFQUFFeEgsSUFBRixDQUFPMEwsRUFBRS9MLFNBQVQsQ0FBckUsRUFBeUYrTCxFQUFFL0wsU0FBRixDQUFZdU0sS0FBWixHQUFrQixZQUFVO2lCQUFRLElBQUlSLENBQUosQ0FBTSxLQUFLbkMsU0FBWCxFQUFxQixFQUFDNUIsUUFBTyxLQUFLQSxNQUFiLEVBQW9CQyxZQUFXLEtBQUtBLFVBQXBDLEVBQStDRixTQUFRLElBQUlmLENBQUosQ0FBTSxLQUFLZSxPQUFYLENBQXZELEVBQTJFc0QsS0FBSSxLQUFLQSxHQUFwRixFQUFyQixDQUFQO1NBQXRILEVBQTZPVSxFQUFFakosS0FBRixHQUFRLFlBQVU7Y0FBS3dCLElBQUUsSUFBSXlILENBQUosQ0FBTSxJQUFOLEVBQVcsRUFBQy9ELFFBQU8sQ0FBUixFQUFVQyxZQUFXLEVBQXJCLEVBQVgsQ0FBTixDQUEyQyxPQUFPM0QsRUFBRTdCLElBQUYsR0FBTyxPQUFQLEVBQWU2QixDQUF0QjtTQUEzUyxDQUFvVSxJQUFJa0ksSUFBRSxDQUFDLEdBQUQsRUFBSyxHQUFMLEVBQVMsR0FBVCxFQUFhLEdBQWIsRUFBaUIsR0FBakIsQ0FBTixDQUE0QlQsRUFBRVUsUUFBRixHQUFXLFVBQVNuSSxDQUFULEVBQVdnQyxDQUFYLEVBQWE7Y0FBSWtHLEVBQUUvRSxPQUFGLENBQVVuQixDQUFWLE1BQWUsQ0FBQyxDQUFuQixFQUFxQixNQUFNLElBQUlvRyxVQUFKLENBQWUscUJBQWYsQ0FBTixDQUE0QyxPQUFPLElBQUlYLENBQUosQ0FBTSxJQUFOLEVBQVcsRUFBQy9ELFFBQU8xQixDQUFSLEVBQVV5QixTQUFRLEVBQUM0RSxVQUFTckksQ0FBVixFQUFsQixFQUFYLENBQVA7U0FBMUYsRUFBOElBLEVBQUVzSSxPQUFGLEdBQVU1RixDQUF4SixFQUEwSjFDLEVBQUV1SSxPQUFGLEdBQVUxQixDQUFwSyxFQUFzSzdHLEVBQUV3SSxRQUFGLEdBQVdmLENBQWpMLEVBQW1MekgsRUFBRTBILEtBQUYsR0FBUSxVQUFTMUgsQ0FBVCxFQUFXZ0MsQ0FBWCxFQUFhO2lCQUFRLElBQUkrQixPQUFKLENBQVksVUFBUzVCLENBQVQsRUFBV3pGLENBQVgsRUFBYTtxQkFBVWdHLENBQVQsR0FBWTtxQkFBTyxpQkFBZ0JFLENBQWhCLEdBQWtCQSxFQUFFNkYsV0FBcEIsR0FBZ0MsbUJBQW1CcEYsSUFBbkIsQ0FBd0JULEVBQUU0RSxxQkFBRixFQUF4QixJQUFtRDVFLEVBQUU4RixpQkFBRixDQUFvQixlQUFwQixDQUFuRCxHQUF3RixLQUFLLENBQW5JO2lCQUF5SWxMLENBQUosQ0FBTUEsSUFBRXFKLEVBQUVuTCxTQUFGLENBQVlnSyxhQUFaLENBQTBCMUYsQ0FBMUIsS0FBOEIsQ0FBQ2dDLENBQS9CLEdBQWlDaEMsQ0FBakMsR0FBbUMsSUFBSTZHLENBQUosQ0FBTTdHLENBQU4sRUFBUWdDLENBQVIsQ0FBckMsQ0FBZ0QsSUFBSVksSUFBRSxJQUFJK0YsY0FBSixFQUFOLENBQXlCL0YsRUFBRW1DLE1BQUYsR0FBUyxZQUFVO2tCQUFLL0UsSUFBRSxFQUFDMEQsUUFBT2QsRUFBRWMsTUFBVixFQUFpQkMsWUFBV2YsRUFBRWUsVUFBOUIsRUFBeUNGLFNBQVE4RCxFQUFFM0UsQ0FBRixDQUFqRCxFQUFzRG1FLEtBQUlyRSxHQUExRCxFQUFOO2tCQUFxRVYsSUFBRSxjQUFhWSxDQUFiLEdBQWVBLEVBQUVnRyxRQUFqQixHQUEwQmhHLEVBQUVpRyxZQUFuRyxDQUFnSDFHLEVBQUUsSUFBSXNGLENBQUosQ0FBTXpGLENBQU4sRUFBUWhDLENBQVIsQ0FBRjthQUFwSSxFQUFtSjRDLEVBQUVxQyxPQUFGLEdBQVUsWUFBVTtnQkFBRyxJQUFJckksU0FBSixDQUFjLHdCQUFkLENBQUY7YUFBeEssRUFBb05nRyxFQUFFa0csU0FBRixHQUFZLFlBQVU7Z0JBQUcsSUFBSWxNLFNBQUosQ0FBYyx3QkFBZCxDQUFGO2FBQTNPLEVBQXVSZ0csRUFBRW1HLElBQUYsQ0FBT3ZMLEVBQUV5SixNQUFULEVBQWdCekosRUFBRXVKLEdBQWxCLEVBQXNCLENBQUMsQ0FBdkIsQ0FBdlIsRUFBaVQsY0FBWXZKLEVBQUV3SixXQUFkLEtBQTRCcEUsRUFBRW9HLGVBQUYsR0FBa0IsQ0FBQyxDQUEvQyxDQUFqVCxFQUFtVyxrQkFBaUJwRyxDQUFqQixJQUFvQkQsRUFBRTZDLElBQXRCLEtBQTZCNUMsRUFBRXFHLFlBQUYsR0FBZSxNQUE1QyxDQUFuVyxFQUF1WnpMLEVBQUVpRyxPQUFGLENBQVVaLE9BQVYsQ0FBa0IsVUFBUzdDLENBQVQsRUFBV2dDLENBQVgsRUFBYTtnQkFBR2tILGdCQUFGLENBQW1CbEgsQ0FBbkIsRUFBcUJoQyxDQUFyQjthQUFoQyxDQUF2WixFQUFpZDRDLEVBQUV1RyxJQUFGLENBQU8sZUFBYSxPQUFPM0wsRUFBRThILFNBQXRCLEdBQWdDLElBQWhDLEdBQXFDOUgsRUFBRThILFNBQTlDLENBQWpkO1dBQTNQLENBQVA7U0FBek0sRUFBdzlCdEYsRUFBRTBILEtBQUYsQ0FBUTBCLFFBQVIsR0FBaUIsQ0FBQyxDQUExK0I7O0tBQTl2SyxDQUE0dU0sZUFBYSxPQUFPak0sSUFBcEIsR0FBeUJBLElBQXpCLEdBQThCa00sTUFBMXdNLENBQUQsQ0FBbXhNLElBQUl4QyxJQUFFN0csQ0FBTjtRQUFRdUcsSUFBRSxjQUFZLE9BQU85QixNQUFuQixJQUEyQixvQkFBaUJBLE9BQU9DLFFBQXhCLENBQTNCLEdBQTRELFVBQVMxRSxDQUFULEVBQVc7b0JBQWVBLENBQWQseUNBQWNBLENBQWQ7S0FBeEUsR0FBeUYsVUFBU0EsQ0FBVCxFQUFXO2FBQVFBLEtBQUcsY0FBWSxPQUFPeUUsTUFBdEIsSUFBOEJ6RSxFQUFFc0osV0FBRixLQUFnQjdFLE1BQTlDLElBQXNEekUsTUFBSXlFLE9BQU8vSSxTQUFqRSxHQUEyRSxRQUEzRSxVQUEyRnNFLENBQTNGLHlDQUEyRkEsQ0FBM0YsQ0FBUDtLQUEvRztRQUFvTnVILElBQUUsU0FBRkEsQ0FBRSxDQUFTdkgsQ0FBVCxFQUFXZ0MsQ0FBWCxFQUFhO1VBQUksRUFBRWhDLGFBQWFnQyxDQUFmLENBQUgsRUFBcUIsTUFBTSxJQUFJcEYsU0FBSixDQUFjLG1DQUFkLENBQU47S0FBelA7UUFBbVQ2SyxJQUFFLFlBQVU7ZUFBVXpILENBQVQsQ0FBV0EsQ0FBWCxFQUFhZ0MsQ0FBYixFQUFlO2FBQUssSUFBSUcsSUFBRSxDQUFWLEVBQVlBLElBQUVILEVBQUUzRSxNQUFoQixFQUF1QjhFLEdBQXZCLEVBQTJCO2NBQUt6RixJQUFFc0YsRUFBRUcsQ0FBRixDQUFOLENBQVd6RixFQUFFNk0sVUFBRixHQUFhN00sRUFBRTZNLFVBQUYsSUFBYyxDQUFDLENBQTVCLEVBQThCN00sRUFBRThNLFlBQUYsR0FBZSxDQUFDLENBQTlDLEVBQWdELFdBQVU5TSxDQUFWLEtBQWNBLEVBQUUrTSxRQUFGLEdBQVcsQ0FBQyxDQUExQixDQUFoRCxFQUE2RTlOLE9BQU8rTixjQUFQLENBQXNCMUosQ0FBdEIsRUFBd0J0RCxFQUFFd0UsR0FBMUIsRUFBOEJ4RSxDQUE5QixDQUE3RTs7Y0FBc0gsVUFBU3NGLENBQVQsRUFBV0csQ0FBWCxFQUFhekYsQ0FBYixFQUFlO2VBQVF5RixLQUFHbkMsRUFBRWdDLEVBQUV0RyxTQUFKLEVBQWN5RyxDQUFkLENBQUgsRUFBb0J6RixLQUFHc0QsRUFBRWdDLENBQUYsRUFBSXRGLENBQUosQ0FBdkIsRUFBOEJzRixDQUFyQztPQUF2QjtLQUFqTCxFQUFyVDtRQUF3aUJXLElBQUUsWUFBVTtlQUFVM0MsQ0FBVCxDQUFXQSxDQUFYLEVBQWFnQyxDQUFiLEVBQWU7WUFBS0csSUFBRSxFQUFOO1lBQVN6RixJQUFFLENBQUMsQ0FBWjtZQUFjZ0csSUFBRSxDQUFDLENBQWpCO1lBQW1CbEYsSUFBRSxLQUFLLENBQTFCLENBQTRCLElBQUc7ZUFBSyxJQUFJb0YsQ0FBSixFQUFNUSxJQUFFcEQsRUFBRXlFLE9BQU9DLFFBQVQsR0FBWixFQUFpQyxFQUFFaEksSUFBRSxDQUFDa0csSUFBRVEsRUFBRWdCLElBQUYsRUFBSCxFQUFhRSxJQUFqQixNQUF5Qm5DLEVBQUUxQyxJQUFGLENBQU9tRCxFQUFFMkIsS0FBVCxHQUFnQixDQUFDdkMsQ0FBRCxJQUFJRyxFQUFFOUUsTUFBRixLQUFXMkUsQ0FBeEQsQ0FBakMsRUFBNEZ0RixJQUFFLENBQUMsQ0FBL0Y7U0FBSixDQUF1RyxPQUFNc0QsQ0FBTixFQUFRO2NBQUcsQ0FBQyxDQUFILEVBQUt4QyxJQUFFd0MsQ0FBUDtTQUFoSCxTQUFnSTtjQUFJO2FBQUV0RCxDQUFELElBQUkwRyxFQUFFdUcsTUFBTixJQUFjdkcsRUFBRXVHLE1BQUYsRUFBZDtXQUFKLFNBQW9DO2dCQUFJakgsQ0FBSCxFQUFLLE1BQU1sRixDQUFOOztnQkFBZ0IyRSxDQUFQO2NBQWdCLFVBQVNILENBQVQsRUFBV0csQ0FBWCxFQUFhO1lBQUlwRCxNQUFNNkssT0FBTixDQUFjNUgsQ0FBZCxDQUFILEVBQW9CLE9BQU9BLENBQVAsQ0FBUyxJQUFHeUMsT0FBT0MsUUFBUCxJQUFtQi9JLE9BQU9xRyxDQUFQLENBQXRCLEVBQWdDLE9BQU9oQyxFQUFFZ0MsQ0FBRixFQUFJRyxDQUFKLENBQVAsQ0FBYyxNQUFNLElBQUl2RixTQUFKLENBQWMsc0RBQWQsQ0FBTjtPQUFoRztLQUFwUCxFQUExaUI7UUFBODhCZ0ssSUFBRTVFLENBQWg5QjtRQUFrOUJrRyxJQUFFckIsQ0FBcDlCO1FBQXM5QnhILElBQUV1SCxDQUF4OUI7UUFBMDlCaUQsSUFBRSxFQUFDQyxZQUFXNUIsQ0FBWixFQUFjNkIsWUFBVzFLLENBQXpCLEVBQTU5QjtRQUF3L0JNLElBQUUsWUFBVTtlQUFVSyxDQUFULEdBQVk7VUFBRyxJQUFGLEVBQU9BLENBQVAsR0FBVSxLQUFLZ0ssT0FBTCxHQUFhLEVBQXZCLEVBQTBCLEtBQUtDLFFBQUwsR0FBYyxFQUF4QyxFQUEyQyxLQUFLQyxNQUFMLEdBQVksRUFBdkQsRUFBMEQsS0FBS0MsTUFBTCxHQUFZLEVBQXRFO2NBQWdGMUMsRUFBRXpILENBQUYsRUFBSSxDQUFDLEVBQUNrQixLQUFJLFFBQUwsRUFBY3FELE9BQU0sZUFBU3ZFLENBQVQsRUFBVztpQkFBUSxLQUFLZ0ssT0FBTCxDQUFhdkssSUFBYixDQUFrQk8sQ0FBbEIsR0FBcUIsS0FBS2dLLE9BQUwsQ0FBYTNNLE1BQWIsR0FBb0IsQ0FBaEQ7U0FBaEMsRUFBRCxFQUFxRixFQUFDNkQsS0FBSSxTQUFMLEVBQWVxRCxPQUFNLGlCQUFVO2NBQUt2RSxJQUFFdkIsVUFBVXBCLE1BQVYsR0FBaUIsQ0FBakIsSUFBb0IsS0FBSyxDQUFMLEtBQVNvQixVQUFVLENBQVYsQ0FBN0IsR0FBMENBLFVBQVUsQ0FBVixDQUExQyxHQUF1RCxVQUFTdUIsQ0FBVCxFQUFXO21CQUFRQSxDQUFQO1dBQXpFLENBQW1GLE9BQU8sS0FBS2lLLFFBQUwsQ0FBY3hLLElBQWQsQ0FBbUJPLENBQW5CLEdBQXNCLEtBQUtpSyxRQUFMLENBQWM1TSxNQUFkLEdBQXFCLENBQWxEO1NBQW5ILEVBQXJGLEVBQThQLEVBQUM2RCxLQUFJLE9BQUwsRUFBYXFELE9BQU0sZUFBU3ZFLENBQVQsRUFBVztpQkFBUSxLQUFLa0ssTUFBTCxDQUFZekssSUFBWixDQUFpQk8sQ0FBakIsR0FBb0IsS0FBS2tLLE1BQUwsQ0FBWTdNLE1BQVosR0FBbUIsQ0FBOUM7U0FBL0IsRUFBOVAsRUFBK1UsRUFBQzZELEtBQUksT0FBTCxFQUFhcUQsT0FBTSxlQUFTdkUsQ0FBVCxFQUFXO2lCQUFRLEtBQUttSyxNQUFMLENBQVkxSyxJQUFaLENBQWlCTyxDQUFqQixHQUFvQixLQUFLbUssTUFBTCxDQUFZOU0sTUFBWixHQUFtQixDQUE5QztTQUEvQixFQUEvVSxFQUFnYSxFQUFDNkQsS0FBSSxlQUFMLEVBQXFCcUQsT0FBTSxlQUFTdkUsQ0FBVCxFQUFXO2lCQUFRLEtBQUtnSyxPQUFMLENBQWEzSCxNQUFiLENBQW9CLFVBQVNyQyxDQUFULEVBQVdnQyxDQUFYLEVBQWE7bUJBQVFoQyxJQUFFQSxFQUFFd0QsSUFBRixDQUFPeEIsQ0FBUCxDQUFUO1dBQWxDLEVBQXNEK0IsUUFBUXNDLE9BQVIsQ0FBZ0JyRyxDQUFoQixDQUF0RCxDQUFQO1NBQXZDLEVBQWhhLEVBQTBoQixFQUFDa0IsS0FBSSxnQkFBTCxFQUFzQnFELE9BQU0sZUFBU3ZFLENBQVQsRUFBVztpQkFBUSxLQUFLaUssUUFBTCxDQUFjNUgsTUFBZCxDQUFxQixVQUFTckMsQ0FBVCxFQUFXZ0MsQ0FBWCxFQUFhO21CQUFRaEMsSUFBRUEsRUFBRXdELElBQUYsQ0FBT3hCLENBQVAsQ0FBVDtXQUFuQyxFQUF1RCtCLFFBQVFzQyxPQUFSLENBQWdCckcsQ0FBaEIsQ0FBdkQsQ0FBUDtTQUF4QyxFQUExaEIsRUFBc3BCLEVBQUNrQixLQUFJLGNBQUwsRUFBb0JxRCxPQUFNLGVBQVN2RSxDQUFULEVBQVc7aUJBQVEsS0FBS2tLLE1BQUwsQ0FBWXJILE9BQVosQ0FBb0IsVUFBU2IsQ0FBVCxFQUFXO21CQUFRQSxLQUFHQSxFQUFFakcsSUFBTCxJQUFXaUcsRUFBRWhDLENBQUYsQ0FBbEI7V0FBaEMsR0FBeUQrRCxRQUFRQyxNQUFSLENBQWVoRSxDQUFmLENBQWhFO1NBQXRDLEVBQXRwQixFQUFneEIsRUFBQ2tCLEtBQUksY0FBTCxFQUFvQnFELE9BQU0sZUFBU3ZFLENBQVQsRUFBVztpQkFBUSxLQUFLbUssTUFBTCxDQUFZOUgsTUFBWixDQUFtQixVQUFTckMsQ0FBVCxFQUFXZ0MsQ0FBWCxFQUFhO21CQUFRaEMsSUFBRUEsRUFBRXdELElBQUYsQ0FBT3hCLENBQVAsQ0FBVDtXQUFqQyxFQUFxRCtCLFFBQVFzQyxPQUFSLENBQWdCckcsQ0FBaEIsQ0FBckQsQ0FBUDtTQUF0QyxFQUFoeEIsQ0FBSixHQUE4NEJBLENBQXI1QjtLQUFqRyxFQUExL0I7UUFBcS9EUyxJQUFFL0QsRUFBRSxVQUFTc0QsQ0FBVCxFQUFXO09BQUUsVUFBU2dDLENBQVQsRUFBVztpQkFBVUcsQ0FBVCxDQUFXbkMsQ0FBWCxFQUFhZ0MsQ0FBYixFQUFlO2NBQUksYUFBV1UsRUFBRTFDLENBQUYsQ0FBZCxFQUFtQixPQUFPZ0MsQ0FBUCxDQUFTLEtBQUksSUFBSXRGLENBQVIsSUFBYXNGLENBQWI7eUJBQTBCVSxFQUFFMUMsRUFBRXRELENBQUYsQ0FBRixDQUFYLElBQW9CLGFBQVdnRyxFQUFFVixFQUFFdEYsQ0FBRixDQUFGLENBQS9CLEdBQXVDc0QsRUFBRXRELENBQUYsSUFBS3lGLEVBQUVuQyxFQUFFdEQsQ0FBRixDQUFGLEVBQU9zRixFQUFFdEYsQ0FBRixDQUFQLENBQTVDLEdBQXlEc0QsRUFBRXRELENBQUYsSUFBS3NGLEVBQUV0RixDQUFGLENBQTlEO1dBQW1FLE9BQU9zRCxDQUFQO2tCQUFrQnRELENBQVQsQ0FBV3NELENBQVgsRUFBYWdDLENBQWIsRUFBZXRGLENBQWYsRUFBaUI7Y0FBS2tHLElBQUVsRyxFQUFFLENBQUYsQ0FBTjtjQUFXMEcsSUFBRTFHLEVBQUVXLE1BQWYsQ0FBc0IsQ0FBQzJDLEtBQUcsYUFBVzBDLEVBQUVFLENBQUYsQ0FBZixNQUF1QkEsSUFBRSxFQUF6QixFQUE2QixLQUFJLElBQUlVLElBQUUsQ0FBVixFQUFZQSxJQUFFRixDQUFkLEVBQWdCLEVBQUVFLENBQWxCLEVBQW9CO2dCQUFLQyxJQUFFN0csRUFBRTRHLENBQUYsQ0FBTjtnQkFBV08sSUFBRW5CLEVBQUVhLENBQUYsQ0FBYixDQUFrQixJQUFHLGFBQVdNLENBQWQsRUFBZ0IsS0FBSSxJQUFJZ0QsQ0FBUixJQUFhdEQsQ0FBYixFQUFlO2tCQUFLZ0QsSUFBRXZHLElBQUV4QyxFQUFFeUssS0FBRixDQUFRMUUsRUFBRXNELENBQUYsQ0FBUixDQUFGLEdBQWdCdEQsRUFBRXNELENBQUYsQ0FBdEIsQ0FBMkI3RSxJQUFFWSxFQUFFaUUsQ0FBRixJQUFLMUUsRUFBRVMsRUFBRWlFLENBQUYsQ0FBRixFQUFPTixDQUFQLENBQVAsR0FBaUIzRCxFQUFFaUUsQ0FBRixJQUFLTixDQUF0Qjs7a0JBQWdDM0QsQ0FBUDtrQkFBa0JGLENBQVQsQ0FBVzFDLENBQVgsRUFBYTtpQkFBTyxHQUFHaUcsUUFBSCxDQUFZbEssSUFBWixDQUFpQmlFLENBQWpCLEVBQW9Cb0ssS0FBcEIsQ0FBMEIsQ0FBMUIsRUFBNEIsQ0FBQyxDQUE3QixFQUFnQ2pHLFdBQWhDLEVBQU47YUFBd0QzRyxJQUFFLFNBQUZBLENBQUUsQ0FBU3dDLENBQVQsRUFBVztpQkFBUXRELEVBQUVzRCxNQUFJLENBQUMsQ0FBUCxFQUFTLENBQUMsQ0FBVixFQUFZdkIsU0FBWixDQUFQO1NBQWxCO1lBQWlEbUUsSUFBRSxPQUFuRCxDQUEyRHBGLEVBQUV5RixTQUFGLEdBQVksVUFBU2pELENBQVQsRUFBVztpQkFBUXRELEVBQUVzRCxNQUFJLENBQUMsQ0FBUCxFQUFTLENBQUMsQ0FBVixFQUFZdkIsU0FBWixDQUFQO1NBQXhCLEVBQXVEakIsRUFBRXlLLEtBQUYsR0FBUSxVQUFTakksQ0FBVCxFQUFXO2NBQUtnQyxDQUFKO2NBQU1HLENBQU47Y0FBUXpGLElBQUVzRCxDQUFWO2NBQVk0QyxJQUFFRixFQUFFMUMsQ0FBRixDQUFkLENBQW1CLElBQUcsWUFBVTRDLENBQWIsRUFBZSxLQUFJbEcsSUFBRSxFQUFGLEVBQUt5RixJQUFFbkMsRUFBRTNDLE1BQVQsRUFBZ0IyRSxJQUFFLENBQXRCLEVBQXdCQSxJQUFFRyxDQUExQixFQUE0QixFQUFFSCxDQUE5QjtjQUFrQ0EsQ0FBRixJQUFLeEUsRUFBRXlLLEtBQUYsQ0FBUWpJLEVBQUVnQyxDQUFGLENBQVIsQ0FBTDtXQUEvQyxNQUF1RSxJQUFHLGFBQVdZLENBQWQsRUFBZ0I7Z0JBQUcsRUFBRixDQUFLLEtBQUlaLENBQUosSUFBU2hDLENBQVQ7Z0JBQWFnQyxDQUFGLElBQUt4RSxFQUFFeUssS0FBRixDQUFRakksRUFBRWdDLENBQUYsQ0FBUixDQUFMOztrQkFBMEJ0RixDQUFQO1NBQXpOLEVBQW1Pc0YsSUFBRWhDLEVBQUVnRCxPQUFGLEdBQVV4RixDQUFaLEdBQWM2TCxPQUFPekcsQ0FBUCxJQUFVcEYsQ0FBM1A7T0FBemQsQ0FBdXRCLGNBQVksZUFBYSxPQUFPd0MsQ0FBcEIsR0FBc0IsV0FBdEIsR0FBa0N1RyxFQUFFdkcsQ0FBRixDQUE5QyxLQUFxREEsQ0FBckQsSUFBd0QsYUFBV3VHLEVBQUV2RyxFQUFFZ0QsT0FBSixDQUFuRSxJQUFpRmhELEVBQUVnRCxPQUExeUIsQ0FBRDtLQUFkLENBQXYvRDtRQUEyekZxSCxJQUFFLEVBQUNDLFFBQU8sbUNBQVIsRUFBNEMsZ0JBQWUsa0JBQTNELEVBQTd6RjtRQUE0NEZDLElBQUUsRUFBQ0MsZ0JBQWUsWUFBaEIsRUFBNkJDLGdCQUFlLGNBQTVDLEVBQTk0RjtRQUEwOEZDLElBQUUsWUFBVTtlQUFVMUssQ0FBVCxHQUFZO1lBQUtnQyxJQUFFdkQsVUFBVXBCLE1BQVYsR0FBaUIsQ0FBakIsSUFBb0IsS0FBSyxDQUFMLEtBQVNvQixVQUFVLENBQVYsQ0FBN0IsR0FBMENBLFVBQVUsQ0FBVixDQUExQyxHQUF1RCxFQUE3RCxDQUFnRThJLEVBQUUsSUFBRixFQUFPdkgsQ0FBUCxHQUFVLEtBQUsySyxTQUFMLEdBQWVqSSxFQUFFNkgsQ0FBRixFQUFJLEVBQUM5RyxTQUFRNEcsQ0FBVCxFQUFKLENBQXpCLEVBQTBDLEtBQUtPLE9BQUwsR0FBYSxFQUF2RCxFQUEwRCxLQUFLeEUsR0FBTCxDQUFTcEUsQ0FBVCxDQUExRDtjQUE2RXlGLEVBQUV6SCxDQUFGLEVBQUksQ0FBQyxFQUFDa0IsS0FBSSxtQkFBTCxFQUF5QnFELE9BQU0saUJBQVU7ZUFBSyxJQUFJdkUsSUFBRXZCLFVBQVVwQixNQUFoQixFQUF1QjJFLElBQUVqRCxNQUFNaUIsQ0FBTixDQUF6QixFQUFrQ21DLElBQUUsQ0FBeEMsRUFBMENBLElBQUVuQyxDQUE1QyxFQUE4Q21DLEdBQTlDO2NBQW9EQSxDQUFGLElBQUsxRCxVQUFVMEQsQ0FBVixDQUFMO1dBQWtCLElBQUl6RixJQUFFZ0csRUFBRXpFLEtBQUYsQ0FBUSxLQUFLLENBQWIsRUFBZSxDQUFDLEtBQUswTSxTQUFOLEVBQWdCLEtBQUtDLE9BQXJCLEVBQThCMUgsTUFBOUIsQ0FBcUNsQixDQUFyQyxDQUFmLENBQU4sQ0FBOEQsT0FBTSxhQUFXdUUsRUFBRTdKLEVBQUVvSyxJQUFKLENBQVgsSUFBc0JwSyxFQUFFK0csT0FBeEIsSUFBaUMsdUJBQXFCL0csRUFBRStHLE9BQUYsQ0FBVSxjQUFWLENBQXRELEtBQWtGL0csRUFBRW9LLElBQUYsR0FBT0wsS0FBS29FLFNBQUwsQ0FBZW5PLEVBQUVvSyxJQUFqQixDQUF6RixHQUFpSHBLLENBQXZIO1NBQTVLLEVBQUQsRUFBd1MsRUFBQ3dFLEtBQUksS0FBTCxFQUFXcUQsT0FBTSxlQUFTdkUsQ0FBVCxFQUFXO2VBQU00SyxPQUFMLEdBQWFsSSxFQUFFLEtBQUtrSSxPQUFQLEVBQWU1SyxDQUFmLENBQWI7U0FBN0IsRUFBeFMsRUFBc1csRUFBQ2tCLEtBQUksS0FBTCxFQUFXcUQsT0FBTSxpQkFBVTtpQkFBUTdCLEVBQUUsS0FBS2lJLFNBQVAsRUFBaUIsS0FBS0MsT0FBdEIsQ0FBUDtTQUE1QixFQUF0VyxDQUFKLEdBQWdiNUssQ0FBdmI7S0FBOUosRUFBNThGO1FBQXNpSDhLLElBQUUsWUFBVTtlQUFVOUssQ0FBVCxHQUFZO1lBQUtnQyxJQUFFdkQsVUFBVXBCLE1BQVYsR0FBaUIsQ0FBakIsSUFBb0IsS0FBSyxDQUFMLEtBQVNvQixVQUFVLENBQVYsQ0FBN0IsR0FBMENBLFVBQVUsQ0FBVixDQUExQyxHQUF1RCxFQUE3RCxDQUFnRThJLEVBQUUsSUFBRixFQUFPdkgsQ0FBUCxHQUFVLEtBQUsrSyxXQUFMLEdBQWlCLElBQUlwTCxDQUFKLEVBQTNCLEVBQWlDLEtBQUtpTCxPQUFMLEdBQWEsSUFBSUYsQ0FBSixDQUFNbE4sRUFBRXdFLENBQUYsRUFBSSxDQUFDLFNBQUQsQ0FBSixDQUFOLENBQTlDLEVBQXNFLEtBQUtnSixPQUFMLENBQWFoSixFQUFFZ0osT0FBRixJQUFXLEVBQXhCLENBQXRFLEVBQWtHLEtBQUtDLG9CQUFMLEVBQWxHLEVBQThILEtBQUtDLHNCQUFMLEVBQTlIO2NBQW1LekQsRUFBRXpILENBQUYsRUFBSSxDQUFDLEVBQUNrQixLQUFJLFFBQUwsRUFBY3FELE9BQU0sZUFBU3ZFLENBQVQsRUFBVztpQkFBUSxJQUFJLEtBQUtzSixXQUFULENBQXFCdEosQ0FBckIsQ0FBUDtTQUFoQyxFQUFELEVBQWtFLEVBQUNrQixLQUFJLEtBQUwsRUFBV3FELE9BQU0saUJBQVU7Y0FBS3ZFLElBQUV2QixVQUFVcEIsTUFBVixHQUFpQixDQUFqQixJQUFvQixLQUFLLENBQUwsS0FBU29CLFVBQVUsQ0FBVixDQUE3QixHQUEwQ0EsVUFBVSxDQUFWLENBQTFDLEdBQXVELEVBQTdELENBQWdFdUIsRUFBRW1MLE1BQUYsSUFBVSxLQUFLSixXQUFMLENBQWlCSSxNQUFqQixDQUF3Qm5MLEVBQUVtTCxNQUExQixDQUFWLEVBQTRDbkwsRUFBRW9MLE9BQUYsSUFBVyxLQUFLTCxXQUFMLENBQWlCSyxPQUFqQixDQUF5QnBMLEVBQUVvTCxPQUEzQixDQUF2RCxFQUEyRnBMLEVBQUV4QixLQUFGLElBQVMsS0FBS3VNLFdBQUwsQ0FBaUJ2TSxLQUFqQixDQUF1QndCLEVBQUV4QixLQUF6QixDQUFwRyxFQUFvSXdCLEVBQUVxTCxLQUFGLElBQVMsS0FBS04sV0FBTCxDQUFpQk0sS0FBakIsQ0FBdUJyTCxFQUFFcUwsS0FBekIsQ0FBN0k7U0FBNUYsRUFBbEUsRUFBNlUsRUFBQ25LLEtBQUksVUFBTCxFQUFnQnFELE9BQU0sZUFBU3ZFLENBQVQsRUFBVztpQkFBTyxlQUFhLE9BQU9BLENBQXBCLEdBQXNCLEtBQUs0SyxPQUFMLENBQWEzRyxHQUFiLEVBQXRCLElBQTBDLEtBQUsyRyxPQUFMLENBQWF4RSxHQUFiLENBQWlCNUksRUFBRXdDLENBQUYsRUFBSSxDQUFDLFNBQUQsQ0FBSixDQUFqQixHQUFtQ0EsRUFBRWdMLE9BQUYsSUFBVyxLQUFLQSxPQUFMLENBQWFoTCxFQUFFZ0wsT0FBZixDQUE5QyxFQUFzRSxLQUFLSixPQUFMLENBQWEzRyxHQUFiLEVBQWhILENBQU47U0FBbEMsRUFBN1UsRUFBMmYsRUFBQy9DLEtBQUksU0FBTCxFQUFlcUQsT0FBTSxlQUFTdkUsQ0FBVCxFQUFXO2lCQUFPLGVBQWEsT0FBT0EsQ0FBcEIsR0FBc0IsS0FBS3NMLFFBQTNCLElBQXFDLEtBQUtBLFFBQUwsR0FBY3RMLENBQWQsRUFBZ0IsS0FBS3NMLFFBQTFELENBQU47U0FBakMsRUFBM2YsRUFBd21CLEVBQUNwSyxLQUFJLFNBQUwsRUFBZXFELE9BQU0saUJBQVU7Y0FBS3ZFLElBQUV2QixVQUFVcEIsTUFBVixHQUFpQixDQUFqQixJQUFvQixLQUFLLENBQUwsS0FBU29CLFVBQVUsQ0FBVixDQUE3QixHQUEwQ0EsVUFBVSxDQUFWLENBQTFDLEdBQXVELEVBQTdELENBQWdFdUIsRUFBRWlILE1BQUYsS0FBV2pILEVBQUVpSCxNQUFGLEdBQVMsS0FBcEIsRUFBMkIsSUFBSWpGLElBQUUsS0FBSzRJLE9BQUwsQ0FBYVcsaUJBQWIsQ0FBK0J2TCxDQUEvQixDQUFOO2NBQXdDbUMsSUFBRTBILEVBQUVDLFVBQUYsQ0FBYXhHLEVBQUUsS0FBS2dJLFFBQVAsRUFBZ0J0TCxFQUFFK0csR0FBbEIsQ0FBYixFQUFvQy9HLEVBQUV3TCxNQUF0QyxDQUExQyxDQUF3RixPQUFPLEtBQUtDLE1BQUwsQ0FBWXRKLENBQVosRUFBY0gsQ0FBZCxDQUFQO1NBQW5OLEVBQXhtQixFQUFxMUIsRUFBQ2QsS0FBSSxRQUFMLEVBQWNxRCxPQUFNLGVBQVN2RSxDQUFULEVBQVdnQyxDQUFYLEVBQWE7Y0FBS0csSUFBRSxJQUFOO2NBQVd6RixJQUFFLENBQUMsQ0FBZCxDQUFnQixPQUFPLEtBQUtxTyxXQUFMLENBQWlCVyxhQUFqQixDQUErQjFKLENBQS9CLEVBQWtDd0IsSUFBbEMsQ0FBdUMsVUFBU3hCLENBQVQsRUFBVzttQkFBUTBGLE1BQU0xSCxDQUFOLEVBQVFnQyxDQUFSLENBQVA7V0FBbkQsRUFBdUV3QixJQUF2RSxDQUE0RSxVQUFTeEQsQ0FBVCxFQUFXO21CQUFRNkQsRUFBRTdELENBQUYsRUFBSWdDLEVBQUUySixRQUFOLENBQVA7V0FBeEYsRUFBaUhuSSxJQUFqSCxDQUFzSCxVQUFTeEQsQ0FBVCxFQUFXO21CQUFRbUMsRUFBRTRJLFdBQUYsQ0FBY2EsY0FBZCxDQUE2QjVMLENBQTdCLENBQVA7V0FBbEksRUFBMkt3RCxJQUEzSyxDQUFnTCxVQUFTeEQsQ0FBVCxFQUFXO21CQUFRdEQsSUFBRSxDQUFDLENBQUgsRUFBS3lGLEVBQUU0SSxXQUFGLENBQWNjLFlBQWQsQ0FBMkI3TCxDQUEzQixDQUFaO1dBQTVMLEVBQXdPOEwsS0FBeE8sQ0FBOE8sVUFBUzlMLENBQVQsRUFBVzttQkFBUW1DLEVBQUU0SSxXQUFGLENBQWNnQixZQUFkLENBQTJCL0wsQ0FBM0IsR0FBOEJ0RCxJQUFFeUYsRUFBRTRJLFdBQUYsQ0FBY2MsWUFBZCxDQUEyQjdMLENBQTNCLENBQUYsR0FBZ0MrRCxRQUFRQyxNQUFSLENBQWVoRSxDQUFmLENBQXJFO1dBQTFQLENBQVA7U0FBbEQsRUFBcjFCLEVBQW11QyxFQUFDa0IsS0FBSSx3QkFBTCxFQUE4QnFELE9BQU0saUJBQVU7Y0FBS3ZFLElBQUUsSUFBTixDQUFXLENBQUMsS0FBRCxFQUFPLFFBQVAsRUFBZ0IsTUFBaEIsRUFBd0I2QyxPQUF4QixDQUFnQyxVQUFTYixDQUFULEVBQVc7Y0FBR0EsQ0FBRixJQUFLLFVBQVNHLENBQVQsRUFBVztrQkFBS3pGLElBQUUrQixVQUFVcEIsTUFBVixHQUFpQixDQUFqQixJQUFvQixLQUFLLENBQUwsS0FBU29CLFVBQVUsQ0FBVixDQUE3QixHQUEwQ0EsVUFBVSxDQUFWLENBQTFDLEdBQXVELEVBQTdEO2tCQUFnRWlFLElBQUUxQyxFQUFFNEssT0FBRixDQUFVVyxpQkFBVixDQUE0QjdPLENBQTVCLEVBQThCLEVBQUN1SyxRQUFPakYsQ0FBUixFQUE5QixDQUFsRTtrQkFBNEd4RSxJQUFFcU0sRUFBRUMsVUFBRixDQUFheEcsRUFBRXRELEVBQUVzTCxRQUFKLEVBQWFuSixDQUFiLENBQWIsRUFBNkJ6RixFQUFFOE8sTUFBL0IsQ0FBOUcsQ0FBcUosT0FBT3hMLEVBQUV5TCxNQUFGLENBQVNqTyxDQUFULEVBQVdrRixDQUFYLENBQVA7YUFBdEs7V0FBNUM7U0FBMUQsRUFBbnVDLEVBQXlnRCxFQUFDeEIsS0FBSSxzQkFBTCxFQUE0QnFELE9BQU0saUJBQVU7Y0FBS3ZFLElBQUUsSUFBTixDQUFXLENBQUMsTUFBRCxFQUFRLEtBQVIsRUFBYyxPQUFkLEVBQXVCNkMsT0FBdkIsQ0FBK0IsVUFBU2IsQ0FBVCxFQUFXO2NBQUdBLENBQUYsSUFBSyxVQUFTRyxDQUFULEVBQVd6RixDQUFYLEVBQWFnRyxDQUFiLEVBQWU7a0JBQUtsRixJQUFFd0MsRUFBRTRLLE9BQUYsQ0FBVVcsaUJBQVYsQ0FBNEI3SSxDQUE1QixFQUE4QixFQUFDb0UsTUFBS3BLLENBQU4sRUFBUXVLLFFBQU9qRixDQUFmLEVBQTlCLENBQU47a0JBQXVEWSxJQUFFVSxFQUFFdEQsRUFBRXNMLFFBQUosRUFBYW5KLENBQWIsQ0FBekQsQ0FBeUUsT0FBT25DLEVBQUV5TCxNQUFGLENBQVM3SSxDQUFULEVBQVdwRixDQUFYLENBQVA7YUFBOUY7V0FBM0M7U0FBeEQsRUFBemdELENBQUosR0FBMHVEd0MsQ0FBanZEO0tBQXBQLEVBQXhpSDtRQUFraExnTSxJQUFFLElBQUlsQixDQUFKLEVBQXBoTCxDQUEwaEwsT0FBT2tCLENBQVA7R0FBejdhLENBQUQ7OztBQ0pBLElBQU1DLE9BQU8sU0FBUEEsSUFBTyxDQUFDQyxFQUFELEVBQVE7TUFDZjtRQUNJQyxNQUFNLE9BQU9ELEVBQVAsS0FBYyxVQUFkLEdBQTJCQSxJQUEzQixHQUFrQ0EsRUFBOUM7UUFDSSxDQUFDQyxHQUFELElBQVEsUUFBT0EsR0FBUCx5Q0FBT0EsR0FBUCxPQUFlLFFBQXZCLElBQW1DLE9BQU9BLElBQUkzSSxJQUFYLEtBQW9CLFVBQTNELEVBQXVFO2FBQzlETyxRQUFRc0MsT0FBUixDQUFnQjhGLEdBQWhCLENBQVA7O1dBRUtBLEdBQVA7R0FMRixDQU1FLE9BQU90TixHQUFQLEVBQVk7V0FDTGtGLFFBQVFDLE1BQVIsQ0FBZW5GLEdBQWYsQ0FBUDs7Q0FSSjs7QUFhQSxhQUFpQm9OLElBQWpCOzs7TUNmTUEsT0FBT0csTUFBYjs7TUFHTUM7Ozs0QkFFUUgsRUFBWixFQUFnQkksUUFBaEIsRUFBMEI7OztVQUNwQixPQUFPSixFQUFQLEtBQWMsUUFBbEIsRUFBNEI7bUJBQ2ZBLEVBQVg7YUFDV2pRLFNBQVg7O1VBRUVzUSxjQUFjLElBQWxCOztpSUFDTSxVQUFDbEcsT0FBRCxFQUFVckMsTUFBVixFQUFxQjtzQkFDWCxFQUFFcUMsZ0JBQUYsRUFBV3JDLGNBQVgsRUFBbUJrSSxNQUFuQixFQUF1Qkksa0JBQXZCLEVBQWQ7WUFDSSxPQUFPQSxRQUFQLEtBQW9CLFFBQXhCLEVBQWtDO3NCQUNwQkUsU0FBWixHQUF3QkMsY0FBQUEsQ0FBT0MsVUFBUEQsQ0FBa0IsWUFBTTtpQkFDekNQLEVBQUwsRUFBUzFJLElBQVQsQ0FBYzZDLE9BQWQsRUFBdUJ5RixLQUF2QixDQUE2QjlILE1BQTdCO1dBRHNCeUksRUFFckJILFFBRnFCRyxDQUF4QjtTQURGLE1BSU87YUFDRnBHLE9BQUgsRUFBWXJDLE1BQVo7O09BYm9COztZQWlCbkIySSxPQUFMLEdBQW9CLElBQXBCO1lBQ0tDLFlBQUwsR0FBb0JMLFdBQXBCOzs7Ozs7MkJBV0dMLElBQUk7WUFDRFcsOEhBQXVCWCxFQUF2QixDQUFOO2dCQUNRUyxPQUFSLEdBQWtCLElBQWxCO2VBQ09FLE9BQVA7Ozs7NEJBR0lWLEtBQUs7WUFDSEksY0FBYyxLQUFLSyxZQUF6QjtzQkFDQUgsQ0FBT0ssWUFBUEwsQ0FBb0JGLFlBQVlDLFNBQWhDQztvQkFDWXBHLE9BQVosQ0FBb0I4RixHQUFwQjs7Ozs4QkFHTTtZQUNBSSxjQUFjLEtBQUtLLFlBQXpCO3NCQUNBSCxDQUFPSyxZQUFQTCxDQUFvQkYsWUFBWUMsU0FBaENDO29CQUNZRCxTQUFaLEdBQXdCQyxjQUFBQSxDQUFPQyxVQUFQRCxDQUFrQixZQUFNO2VBQ3pDRixZQUFZTCxFQUFqQixFQUFxQjFJLElBQXJCLENBQTBCK0ksWUFBWWxHLE9BQXRDLEVBQStDeUYsS0FBL0MsQ0FBcURTLFlBQVl2SSxNQUFqRTtTQURzQnlJLEVBRXJCRixZQUFZRCxRQUZTRyxDQUF4Qjs7Ozs2QkF2QmlCO2VBQ1YsS0FBS0UsT0FBTCxHQUFlLEtBQUtBLE9BQUwsQ0FBYUMsWUFBNUIsR0FBMkMsS0FBS0csYUFBdkQ7OzJCQUdlUixhQUFhO2FBQ3ZCUSxhQUFMLEdBQXFCUixXQUFyQjs7OztJQTVCeUJ4STs7TUFvRHZCMkksYUFBYSxTQUFiQSxVQUFhLENBQUNSLEVBQUQsRUFBZTtRQUFWM0UsQ0FBVSx1RUFBTixDQUFNOztXQUN6QixJQUFJOEUsY0FBSixDQUFtQkgsRUFBbkIsRUFBdUIzRSxDQUF2QixDQUFQO0dBREY7O1lBS1V0RixjQUFBLEdBQWlCeUssVUFBM0I7d0JBQ0EsR0FBeUJMLGNBQXpCOzs7O01DN0RNSixPQUFPRyxNQUFiOztNQUdNWTs7OzZCQUVRZCxFQUFaLEVBQWdCSSxRQUFoQixFQUEwQjs7O1VBQ3BCVyxpQkFBSjtVQUFjQyxvQkFBZDs7bUlBQ00sVUFBQzdHLE9BQUQsRUFBVXJDLE1BQVYsRUFBcUI7bUJBQ2RxQyxPQUFYO1lBQ0ksT0FBT2lHLFFBQVAsS0FBb0IsUUFBeEIsRUFBa0M7d0JBQ2xCRyxjQUFBQSxDQUFPVSxXQUFQVixDQUFtQixZQUFNO2lCQUNoQ1AsRUFBTCxFQUFTSixLQUFULENBQWUsZUFBTzs0QkFDTm9CLFdBQWQ7cUJBQ09yTyxHQUFQO2FBRkY7V0FEWTROLEVBS1hILFFBTFdHLENBQWQ7U0FERixNQU9PO2FBQ0ZwRyxPQUFILEVBQVlyQyxNQUFaOztPQVpvQjs7WUFlbkJrSixXQUFMLEdBQW1CQSxXQUFuQjtZQUNLRCxRQUFMLEdBQW1CQSxRQUFuQjs7Ozs7OzJCQUdHZixJQUFJO1lBQ0RXLGdJQUEyQlgsRUFBM0IsQ0FBTjtnQkFDUWdCLFdBQVIsR0FBc0IsS0FBS0EsV0FBM0I7Z0JBQ1FELFFBQVIsR0FBc0IsS0FBS0EsUUFBM0I7ZUFDT0osT0FBUDs7Ozs0QkFHSVYsS0FBSztzQkFDSyxLQUFLZSxXQUFuQjthQUNLRCxRQUFMLENBQWNkLEdBQWQ7Ozs7SUE5QjBCcEk7O01Ba0N4Qm9KLGNBQWMsU0FBZEEsV0FBYyxDQUFDakIsRUFBRCxFQUFlO1FBQVYzRSxDQUFVLHVFQUFOLENBQU07O1dBQzFCLElBQUl5RixlQUFKLENBQW9CZCxFQUFwQixFQUF3QjNFLENBQXhCLENBQVA7R0FERjs7WUFLVXRGLGNBQUEsR0FBaUJrTCxXQUEzQjt5QkFDQSxHQUEwQkgsZUFBMUI7Ozs7R0MzQ0MsVUFBU2hOLENBQVQsRUFBV2dDLENBQVgsRUFBYTtJQUFtREMsY0FBQSxHQUFlRCxHQUFqRSxBQUFBO0dBQWQsQ0FBbVBFLGNBQW5QLEVBQXdQLFlBQVU7V0FBUSxVQUFTbEMsQ0FBVCxFQUFXO2VBQVVnQyxDQUFULENBQVdHLENBQVgsRUFBYTtZQUFJTyxFQUFFUCxDQUFGLENBQUgsRUFBUSxPQUFPTyxFQUFFUCxDQUFGLEVBQUthLE9BQVosQ0FBb0IsSUFBSXRHLElBQUVnRyxFQUFFUCxDQUFGLElBQUssRUFBQ2EsU0FBUSxFQUFULEVBQVlvSyxJQUFHakwsQ0FBZixFQUFpQmtMLFFBQU8sQ0FBQyxDQUF6QixFQUFYLENBQXVDLE9BQU9yTixFQUFFbUMsQ0FBRixFQUFLcEcsSUFBTCxDQUFVVyxFQUFFc0csT0FBWixFQUFvQnRHLENBQXBCLEVBQXNCQSxFQUFFc0csT0FBeEIsRUFBZ0NoQixDQUFoQyxHQUFtQ3RGLEVBQUUyUSxNQUFGLEdBQVMsQ0FBQyxDQUE3QyxFQUErQzNRLEVBQUVzRyxPQUF4RDtXQUFvRU4sSUFBRSxFQUFOLENBQVMsT0FBT1YsRUFBRTNDLENBQUYsR0FBSVcsQ0FBSixFQUFNZ0MsRUFBRTZCLENBQUYsR0FBSW5CLENBQVYsRUFBWVYsRUFBRXlGLENBQUYsR0FBSSxFQUFoQixFQUFtQnpGLEVBQUUsQ0FBRixDQUExQjtLQUF0SyxDQUFzTSxDQUFDLFVBQVNoQyxDQUFULEVBQVdnQyxDQUFYLEVBQWE7O2VBQXVCVSxDQUFULENBQVcxQyxDQUFYLEVBQWFnQyxDQUFiLEVBQWU7WUFBSSxFQUFFaEMsYUFBYWdDLENBQWYsQ0FBSCxFQUFxQixNQUFNLElBQUlwRixTQUFKLENBQWMsbUNBQWQsQ0FBTjtjQUFnRThNLGNBQVAsQ0FBc0IxSCxDQUF0QixFQUF3QixZQUF4QixFQUFxQyxFQUFDdUMsT0FBTSxDQUFDLENBQVIsRUFBckMsRUFBaUQsSUFBSXBDLElBQUUsY0FBWSxPQUFPc0MsTUFBbkIsSUFBMkIsb0JBQWlCQSxPQUFPQyxRQUF4QixDQUEzQixHQUE0RCxVQUFTMUUsQ0FBVCxFQUFXO3NCQUFlQSxDQUFkLHlDQUFjQSxDQUFkO09BQXhFLEdBQXlGLFVBQVNBLENBQVQsRUFBVztlQUFRQSxLQUFHLGNBQVksT0FBT3lFLE1BQXRCLElBQThCekUsRUFBRXNKLFdBQUYsS0FBZ0I3RSxNQUE5QyxHQUFxRCxRQUFyRCxVQUFxRXpFLENBQXJFLHlDQUFxRUEsQ0FBckUsQ0FBUDtPQUEzRztVQUEwTHRELElBQUUsWUFBVTtpQkFBVXNELENBQVQsQ0FBV0EsQ0FBWCxFQUFhZ0MsQ0FBYixFQUFlO2VBQUssSUFBSVUsSUFBRSxDQUFWLEVBQVlBLElBQUVWLEVBQUUzRSxNQUFoQixFQUF1QnFGLEdBQXZCLEVBQTJCO2dCQUFLUCxJQUFFSCxFQUFFVSxDQUFGLENBQU4sQ0FBV1AsRUFBRW9ILFVBQUYsR0FBYXBILEVBQUVvSCxVQUFGLElBQWMsQ0FBQyxDQUE1QixFQUE4QnBILEVBQUVxSCxZQUFGLEdBQWUsQ0FBQyxDQUE5QyxFQUFnRCxXQUFVckgsQ0FBVixLQUFjQSxFQUFFc0gsUUFBRixHQUFXLENBQUMsQ0FBMUIsQ0FBaEQsRUFBNkU5TixPQUFPK04sY0FBUCxDQUFzQjFKLENBQXRCLEVBQXdCbUMsRUFBRWpCLEdBQTFCLEVBQThCaUIsQ0FBOUIsQ0FBN0U7O2dCQUFzSCxVQUFTSCxDQUFULEVBQVdVLENBQVgsRUFBYVAsQ0FBYixFQUFlO2lCQUFRTyxLQUFHMUMsRUFBRWdDLEVBQUV0RyxTQUFKLEVBQWNnSCxDQUFkLENBQUgsRUFBb0JQLEtBQUduQyxFQUFFZ0MsQ0FBRixFQUFJRyxDQUFKLENBQXZCLEVBQThCSCxDQUFyQztTQUF2QjtPQUFqTCxFQUE1TCxDQUErYSxJQUFHLENBQUNxSCxNQUFKLEVBQVcsTUFBTSxJQUFJM0ssS0FBSixDQUFVLHdCQUFWLENBQU4sQ0FBMEMsSUFBRyxDQUFDMkssT0FBT2lFLFlBQVgsRUFBd0IsTUFBTSxJQUFJNU8sS0FBSixDQUFVLGdDQUFWLENBQU4sQ0FBa0QsSUFBRyxDQUFDMkssT0FBT2tFLGNBQVgsRUFBMEIsTUFBTSxJQUFJN08sS0FBSixDQUFVLGtDQUFWLENBQU4sQ0FBb0QsSUFBSWxCLElBQUUsWUFBVTtpQkFBVXdDLENBQVQsQ0FBV2dDLENBQVgsRUFBYTtZQUFHLElBQUYsRUFBT2hDLENBQVAsR0FBVSxLQUFLd04sT0FBTCxHQUFheEwsS0FBRyxjQUFZQSxFQUFFbUMsV0FBRixFQUFmLEdBQStCa0YsT0FBT2tFLGNBQXRDLEdBQXFEbEUsT0FBT2lFLFlBQW5GO2dCQUF1RzVRLEVBQUVzRCxDQUFGLEVBQUksQ0FBQyxFQUFDa0IsS0FBSSxLQUFMLEVBQVdxRCxPQUFNLGVBQVN2RSxDQUFULEVBQVc7Z0JBQUtnQyxJQUFFLEtBQUt3TCxPQUFMLENBQWFDLE9BQWIsQ0FBcUJ6TixDQUFyQixDQUFOLENBQThCLElBQUcsWUFBVSxPQUFPZ0MsQ0FBcEIsRUFBc0IsT0FBT0EsQ0FBUCxDQUFTLElBQUc7cUJBQVF5RSxLQUFLQyxLQUFMLENBQVcxRSxDQUFYLENBQVA7YUFBSixDQUF5QixPQUFNVSxDQUFOLEVBQVE7cUJBQVFWLEtBQUcsS0FBSyxDQUFmOztXQUE1SCxFQUFELEVBQWlKLEVBQUNkLEtBQUksUUFBTCxFQUFjcUQsT0FBTSxpQkFBVTtnQkFBS3ZFLElBQUUsSUFBTixDQUFXLE9BQU9qQixNQUFNZCxLQUFOLENBQVksQ0FBWixFQUFjLElBQUljLEtBQUosQ0FBVSxLQUFLeU8sT0FBTCxDQUFhblEsTUFBdkIsQ0FBZCxFQUE4Q3NILEdBQTlDLENBQWtELFVBQVMzQyxDQUFULEVBQVdVLENBQVgsRUFBYTtxQkFBUTFDLEVBQUV3TixPQUFGLENBQVV0TSxHQUFWLENBQWN3QixDQUFkLENBQVA7YUFBaEUsQ0FBUDtXQUExQyxFQUFqSixFQUE4UixFQUFDeEIsS0FBSSxLQUFMLEVBQVdxRCxPQUFNLGVBQVN2RSxDQUFULEVBQVdnQyxDQUFYLEVBQWE7Z0JBQUloQyxDQUFILEVBQUssT0FBT2dDLElBQUUsY0FBWSxlQUFhLE9BQU9BLENBQXBCLEdBQXNCLFdBQXRCLEdBQWtDRyxFQUFFSCxDQUFGLENBQTlDLElBQW9EeUUsS0FBS29FLFNBQUwsQ0FBZTdJLENBQWYsQ0FBcEQsR0FBc0VBLENBQXhFLEVBQTBFLEtBQUt3TCxPQUFMLENBQWFFLE9BQWIsQ0FBcUIxTixDQUFyQixFQUF1QmdDLENBQXZCLENBQTFFLEVBQW9HQSxDQUEzRztXQUFwQyxFQUE5UixFQUFpYixFQUFDZCxLQUFJLFFBQUwsRUFBY3FELE9BQU0sZUFBU3ZFLENBQVQsRUFBVztpQkFBTXdOLE9BQUwsQ0FBYUcsVUFBYixDQUF3QjNOLENBQXhCO1dBQWhDLEVBQWpiLEVBQThlLEVBQUNrQixLQUFJLE9BQUwsRUFBYXFELE9BQU0saUJBQVU7aUJBQU1pSixPQUFMLENBQWFJLEtBQWI7V0FBOUIsRUFBOWUsQ0FBSixHQUF5aUI1TixDQUFoakI7T0FBekgsRUFBTixDQUFvckJnQyxFQUFFLFNBQUYsSUFBYXhFLENBQWIsRUFBZXdDLEVBQUVnRCxPQUFGLEdBQVVoQixFQUFFLFNBQUYsQ0FBekI7S0FBMzlDLENBQXRNLENBQVA7R0FBblEsQ0FBRDs7Ozs7O0lDT002TDs7O2tCQUNVOzs7OztVQUdQQyxJQUFMLEdBQVksS0FBWjs7VUFFS0MsS0FBTCxHQUF1QixJQUF2QjtVQUNLQyxlQUFMLEdBQXVCLElBQXZCO1VBQ0tDLGNBQUwsR0FBdUIsT0FBTyxFQUFQLEdBQVksRUFBbkMsQ0FQWTs7VUFTUEMsUUFBTCxHQUFnQyxJQUFJQyxPQUFKLEVBQWhDO1VBQ0tDLHdCQUFMLEdBQWdDLElBQWhDO1VBQ0tDLGtCQUFMLEdBQWdDLElBQWhDO1VBQ0tDLGtCQUFMLEdBQWdDLElBQWhDO1VBQ0tDLHFCQUFMLEdBQWdDLEtBQWhDO1VBQ0tDLHFCQUFMLEdBQWdDLEtBQWhDOztVQUVLQyxPQUFMLEdBQWUsRUFBZjs7VUFFS0MsdUJBQUw7O1VBRUtDLGVBQUwsR0FBdUIsTUFBS1osS0FBTCxLQUFlLElBQXRDOztVQUVLYSxnQkFBTDtVQUNLQyxZQUFMOzs7Ozs7MkJBR2M7OztVQUFYQyxJQUFXLHVFQUFKLEVBQUk7O1dBQ1RDLGlCQUFMLENBQXVCRCxLQUFLRSxXQUE1Qjs7VUFFSSxDQUFDRixLQUFLRyxVQUFWLEVBQXNCO2FBQ2ZDLFVBQUwsS0FBNEJKLEtBQUtJLFVBQUwsR0FBa0IsRUFBOUM7YUFDS0EsVUFBTCxDQUFnQmxFLE9BQWhCLEtBQTRCOEQsS0FBS0ksVUFBTCxDQUFnQmxFLE9BQWhCLEdBQTBCLHVCQUF0RDtpQkFDS21FLFFBQUwsQ0FBY0wsS0FBS0ksVUFBbkI7ZUFDT25MLFFBQVFzQyxPQUFSLEVBQVA7OzthQUdLK0ksU0FDSm5MLEdBREksQ0FDQTZLLEtBQUtHLFVBREwsRUFFSnpMLElBRkksQ0FFQyxVQUFDNkwsR0FBRCxFQUFTO1lBQ1R6TCxJQUFKLENBQVMwTCxHQUFULEtBQTJCLE9BQUt4QixJQUFMLEdBQVl1QixJQUFJekwsSUFBSixDQUFTMEwsR0FBaEQ7WUFDSTFMLElBQUosQ0FBUzJMLGFBQVQsS0FBMkIsT0FBS3RCLGNBQUwsR0FBc0JvQixJQUFJekwsSUFBSixDQUFTMkwsYUFBMUQ7O1lBRU1DLGFBQWEsU0FBYkEsVUFBYSxHQUFNO2NBQ2pCQyxTQUFTSixJQUFJekwsSUFBSixDQUFTOEwsR0FBVCxJQUFnQkwsSUFBSXpMLElBQUosQ0FBUzhMLEdBQVQsQ0FBYTNJLEdBQTVDO2lCQUNPMEksVUFBVSx1QkFBakI7U0FGRjs7WUFLSTdMLElBQUosQ0FBU3NMLFVBQVQsS0FBZ0NHLElBQUl6TCxJQUFKLENBQVNzTCxVQUFULEdBQXNCLEVBQXREO1lBQ0l0TCxJQUFKLENBQVNzTCxVQUFULENBQW9CbEUsT0FBcEIsS0FBZ0NxRSxJQUFJekwsSUFBSixDQUFTc0wsVUFBVCxDQUFvQmxFLE9BQXBCLEdBQThCd0UsWUFBOUQ7O2lCQUVLTCxRQUFMLENBQWNFLElBQUl6TCxJQUFKLENBQVNzTCxVQUF2QjtPQWRHLENBQVA7Ozs7cUNBa0JlO2FBQ1IsS0FBS3BCLElBQVo7Ozs7NkJBR087YUFDQSxLQUFLQSxJQUFMLEtBQWMsTUFBckI7Ozs7MEJBR0k2QixPQUFPQyxVQUFVOzs7YUFDZFIsU0FDSlMsSUFESSxDQUNDLFFBREQsRUFDVyxFQUFFRixZQUFGLEVBQVNDLGtCQUFULEVBRFgsRUFFSnBNLElBRkksQ0FFQyxVQUFDNkwsR0FBRCxFQUFTO2VBQ1JWLGVBQUwsR0FBdUIsSUFBdkI7ZUFDS1osS0FBTCxHQUF1QnNCLElBQUl6TCxJQUFKLENBQVNtSyxLQUFoQztlQUNLQyxlQUFMLEdBQXVCcUIsSUFBSXpMLElBQUosQ0FBU2tNLFNBQWhDOztlQUVLNUIsUUFBTCxDQUFjOUgsR0FBZCxDQUFrQixPQUFsQixFQUEyQmlKLElBQUl6TCxJQUFKLENBQVNtSyxLQUFwQztlQUNLRyxRQUFMLENBQWM5SCxHQUFkLENBQWtCLGlCQUFsQixFQUFxQ2lKLElBQUl6TCxJQUFKLENBQVNrTSxTQUE5Qzs7WUFFSSxPQUFLdEIscUJBQVQsRUFBZ0M7aUJBQ3pCdUIsb0JBQUw7O09BWEMsQ0FBUDs7OztpQ0FnQlc7OzthQUNKWCxTQUNKbkwsR0FESSxDQUNBLGVBREEsRUFFSlQsSUFGSSxDQUVDLFVBQUM2TCxHQUFELEVBQVM7ZUFDUlosT0FBTCxHQUFlWSxJQUFJekwsSUFBbkI7ZUFDS3NLLFFBQUwsQ0FBYzlILEdBQWQsQ0FBa0IsU0FBbEIsRUFBNkJpSixJQUFJekwsSUFBakM7O2VBRU9HLFFBQVFzQyxPQUFSLENBQWdCZ0osR0FBaEIsQ0FBUDtPQU5HLENBQVA7Ozs7NkJBVU87V0FDRlYsZUFBTCxHQUF1QixLQUF2QjthQUNPLEtBQUtaLEtBQVo7V0FDS0csUUFBTCxDQUFjOEIsTUFBZCxDQUFxQixPQUFyQjtXQUNLOUIsUUFBTCxDQUFjOEIsTUFBZCxDQUFxQixpQkFBckI7O1dBRUtDLG1CQUFMO2FBQ09sTSxRQUFRc0MsT0FBUixFQUFQOzs7O3lDQUdtQnNKLE9BQU87YUFDbkJQLFNBQ0pTLElBREksZ0NBQzhCRixLQUQ5QixFQUVKbk0sSUFGSSxDQUVDO2VBQVlvRixTQUFTaEYsSUFBckI7T0FGRCxDQUFQOzs7O2tDQUtZc00sYUFBYUMsb0JBQW9CO2FBQ3RDZixTQUNKUyxJQURJLDJCQUN5Qk0sa0JBRHpCLEVBQytDLEVBQUVELHdCQUFGLEVBRC9DLEVBRUoxTSxJQUZJLENBRUM7ZUFBWW9GLFNBQVNoRixJQUFyQjtPQUZELENBQVA7Ozs7eUNBS21COzs7VUFDZixLQUFLNEsscUJBQVQsRUFBZ0M7OzthQUN6QjRCLGdCQUFQLENBQXdCLFNBQXhCLEVBQXFDLFlBQU07ZUFBTzdCLHFCQUFMLEdBQTZCLElBQTdCO09BQTdDO2FBQ082QixnQkFBUCxDQUF3QixXQUF4QixFQUFxQyxZQUFNO2VBQU83QixxQkFBTCxHQUE2QixJQUE3QjtPQUE3QztXQUNLQyxxQkFBTCxHQUE2QixJQUE3Qjs7Ozs4Q0FHd0I7V0FDbkJULEtBQUwsR0FBYSxLQUFLRyxRQUFMLENBQWNqSyxHQUFkLENBQWtCLE9BQWxCLEtBQThCLElBQTNDOzs7OzJDQUdxQjs7O1VBQ2ZvTSx5QkFBeUIsU0FBekJBLHNCQUF5QixHQUFNO1lBQy9CLE9BQUtoQyxrQkFBVCxFQUE2QjtpQkFDdEJBLGtCQUFMLENBQXdCVCxLQUF4QjtpQkFDS1Msa0JBQUwsR0FBMEIsSUFBMUI7OztZQUdJaUMsZUFBZ0IsSUFBSUMsSUFBSixDQUFTLE9BQUt2QyxlQUFkLENBQUQsQ0FBaUN3QyxPQUFqQyxLQUE2Q0QsS0FBS0UsR0FBTCxFQUFsRTs7ZUFFS3BDLGtCQUFMLEdBQTBCM0IsYUFBVztpQkFBTTBDLFNBQ3hDc0IsR0FEd0MsQ0FDcEMsUUFEb0MsRUFFeENsTixJQUZ3QyxDQUVuQyxVQUFDNkwsR0FBRCxFQUFTO21CQUNSckIsZUFBTCxHQUF1QnFCLElBQUl6TCxJQUFKLENBQVNrTSxTQUFoQzttQkFDSzVCLFFBQUwsQ0FBYzlILEdBQWQsQ0FBa0IsaUJBQWxCLEVBQXFDaUosSUFBSXpMLElBQUosQ0FBU2tNLFNBQTlDO1dBSnVDLENBQU47U0FBWCxFQUtwQlEsWUFMb0IsQ0FBMUI7T0FSRjs7VUFnQk1LLHlCQUF5QixTQUF6QkEsc0JBQXlCLEdBQU07WUFDL0IsT0FBS3JDLGtCQUFULEVBQTZCO2lCQUN0QkEsa0JBQUwsQ0FBd0JWLEtBQXhCO2lCQUNLVSxrQkFBTCxHQUEwQixJQUExQjs7O2VBR0dBLGtCQUFMLEdBQTBCNUIsYUFBVyxZQUFNO2lCQUV0Qy9FLE1BREgsQ0FDVSxRQURWLEVBRUduRSxJQUZILENBRVE7bUJBQU8sT0FBS3RGLElBQUwsQ0FBVSxpQkFBVixDQUFQO1dBRlI7U0FEd0IsRUFJdkIsT0FBSytQLGNBSmtCLENBQTFCO09BTkY7O1VBYU0yQyxrQkFBa0IsU0FBbEJBLGVBQWtCLEdBQU07WUFDeEIsT0FBS3JDLHFCQUFULEVBQWdDO2lCQUN6QkEscUJBQUwsR0FBNkIsS0FBN0I7Ozs7T0FGSjs7V0FRS0gsd0JBQUwsR0FBZ0NqQixjQUFZeUQsZUFBWixFQUE2QixHQUE3QixDQUFoQzs7Ozs7MENBSW9CO1VBQ2hCLEtBQUt2QyxrQkFBVCxFQUE2QjthQUN0QkEsa0JBQUwsQ0FBd0JULEtBQXhCO2FBQ0tTLGtCQUFMLEdBQTBCLElBQTFCOztVQUVFLEtBQUtDLGtCQUFULEVBQTZCO2FBQ3RCQSxrQkFBTCxDQUF3QlYsS0FBeEI7YUFDS1Usa0JBQUwsR0FBMEIsSUFBMUI7O1VBRUUsS0FBS0Ysd0JBQVQsRUFBbUM7YUFDNUJBLHdCQUFMLENBQThCUixLQUE5QjthQUNLUSx3QkFBTCxHQUFnQyxJQUFoQzs7Ozs7bUNBSVc7OztPQUNaLEtBQUQsRUFBUSxNQUFSLEVBQWdCLEtBQWhCLEVBQXVCLFFBQXZCLEVBQWlDdkwsT0FBakMsQ0FBeUMsVUFBQ29FLE1BQUQsRUFBWTtlQUM5Q0EsTUFBTCxJQUFlO2lCQUFhbUksU0FBS25JLE1BQUwsNkJBQzNCekQsSUFEMkIsQ0FDdEI7bUJBQVlvRixTQUFTaEYsSUFBckI7V0FEc0IsQ0FBYjtTQUFmO09BREY7Ozs7dUNBTWlCOzs7ZUFDWmlOLEdBQUwsQ0FBUztnQkFDQyxnQkFBQzFGLE9BQUQsRUFBWTtpQkFDYmpOLElBQUwsQ0FBVSxRQUFWLEVBQW9CaU4sT0FBcEI7O2NBRUksT0FBS3dELGVBQVQsRUFBMEI7b0JBQ2pCbEwsT0FBUCxDQUFlcU4sYUFBZixHQUErQixPQUFLL0MsS0FBcEM7OztpQkFHSzVDLE9BQVA7O09BUko7O2VBWUswRixHQUFMLENBQVM7ZUFDQSxlQUFDaFMsR0FBRCxFQUFTO2lCQUNUWCxJQUFMLENBQVUsT0FBVixFQUFtQlcsR0FBbkI7aUJBQ09rRixRQUFRQyxNQUFSLENBQWVuRixHQUFmLENBQVA7O09BSEo7O2VBT0tnUyxHQUFMLENBQVM7aUJBQ0UsaUJBQUN4QixHQUFELEVBQVM7aUJBQ1huUixJQUFMLENBQVUsU0FBVixFQUFxQm1SLEdBQXJCO2lCQUNPdEwsUUFBUXNDLE9BQVIsQ0FBZ0JnSixHQUFoQixDQUFQOztPQUhKOztlQU9Ld0IsR0FBTCxDQUFTO2VBQ0EsZUFBQ3hCLEdBQUQsRUFBUztpQkFDVG5SLElBQUwsQ0FBVSxPQUFWLEVBQW1CbVIsR0FBbkI7aUJBQ090TCxRQUFRc0MsT0FBUixDQUFnQmdKLEdBQWhCLENBQVA7O09BSEo7Ozs7c0NBUWdCTCxhQUFhO1VBQ3pCLENBQUNBLFdBQUwsRUFBa0I7OztVQUNkQSxZQUFZN0QsTUFBWixJQUFzQjZELFlBQVk3RCxNQUFaLENBQW1COU4sTUFBN0MsRUFBcUQ7b0JBQ3ZDOE4sTUFBWixDQUFtQnRJLE9BQW5CLENBQTJCO2lCQUFVdU0sU0FBS3lCLEdBQUwsQ0FBUyxFQUFFMUYsY0FBRixFQUFULENBQVY7U0FBM0I7OztVQUdFNkQsWUFBWTVELE9BQVosSUFBdUI0RCxZQUFZNUQsT0FBWixDQUFvQi9OLE1BQS9DLEVBQXVEO29CQUN6QytOLE9BQVosQ0FBb0J2SSxPQUFwQixDQUE0QjtpQkFBV3VNLFNBQUt5QixHQUFMLENBQVMsRUFBRXpGLGdCQUFGLEVBQVQsQ0FBWDtTQUE1Qjs7O1VBR0U0RCxZQUFZeFEsS0FBWixJQUFxQndRLFlBQVl4USxLQUFaLENBQWtCbkIsTUFBM0MsRUFBbUQ7b0JBQ3JDbUIsS0FBWixDQUFrQnFFLE9BQWxCLENBQTBCO2lCQUFTdU0sU0FBS3lCLEdBQUwsQ0FBUyxFQUFFclMsWUFBRixFQUFULENBQVQ7U0FBMUI7OztVQUdFd1EsWUFBWTNELEtBQVosSUFBcUIyRCxZQUFZM0QsS0FBWixDQUFrQmhPLE1BQTNDLEVBQW1EO29CQUNyQ2dPLEtBQVosQ0FBa0J4SSxPQUFsQixDQUEwQjtpQkFBU3VNLFNBQUt5QixHQUFMLENBQVMsRUFBRXhGLFlBQUYsRUFBVCxDQUFUO1NBQTFCOzs7OztFQTlPYXhQOztBQW1QbkIsSUFBTWtWLE9BQU8sSUFBSWxELElBQUosRUFBYjtBQUNBa0QsS0FBS2xELElBQUwsR0FBYUEsSUFBYixDQUNBOzs7OyJ9
