const jsdom        = require('jsdom');
const LocalStorage = require('node-localstorage').LocalStorage;

global.localStorage   = new LocalStorage('test/localStorageTemp');
global.sessionStorage = new LocalStorage('test/sessionStorageTemp');


global.window = jsdom.jsdom('').defaultView;
global.window.localStorage   = global.localStorage;
global.window.sessionStorage = global.sessionStorage;
