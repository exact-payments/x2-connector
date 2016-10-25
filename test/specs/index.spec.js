/* global describe it sinon */

import assert from 'assert';
import http   from '../../src';

describe('HTTP -> http', () => {


  it('extends from EventEmitter class so it should have the "emit" and "on" methods available', () => {
    assert.ok(http.emit);
    assert.ok(http.on);
  });

  it('throws an error when lib has not being initialized', () => {
    assert.throws(
      () => {
        http.get('foo');
      },
      /Library has not being initialized/
    );

    assert.throws(
      () => {
        http.post('foo');
      },
      /Library has not being initialized/
    );

    assert.throws(
      () => {
        http.del('foo');
      },
      /Library has not being initialized/
    );

    assert.throws(
      () => {
        http.put('foo');
      },
      /Library has not being initialized/
    );
  });

  describe('init', () => {
    it('Initilize http attributes', () => {
      const baseURL = 'http://localhost:8080';
      const timeout = 5000;

      http.init({
        middlewares: [() => {}],
        timeout,
        baseURL
      });

      assert.equal(http._middlewares.length, 1);
      assert.equal(typeof http._axios, 'function');
    });
  });

  describe('get', () => {
    it('call the axios GET method', async () => {
      const resolved = new Promise(r => r({ data: {} }));
      sinon.stub(http._axios, 'get').returns(resolved);

      try {
        await http.get('/foo');
        sinon.assert.calledOnce(http._axios.get);
      } catch (err) {
        return err;
      }
    });
  });

  describe('post', () => {
    it('call the axios POST method', async () => {
      const resolved = new Promise(r => r({ data: {} }));
      sinon.stub(http._axios, 'post').returns(resolved);

      try {
        await http.post('/foo');
        sinon.assert.calledOnce(http._axios.post);
      } catch (err) {
        return err;
      }
    });
  });

  describe('put', () => {
    it('call the axios PUT method', async () => {
      const resolved = new Promise(r => r({ data: {} }));
      sinon.stub(http._axios, 'put').returns(resolved);

      try {
        await http.put('/foo');
        sinon.assert.calledOnce(http._axios.put);
      } catch (err) {
        return err;
      }
    });
  });

  describe('del', () => {
    it('call the axios DELETE method', async () => {
      const resolved = new Promise(r => r({ data: {} }));
      sinon.stub(http._axios, 'delete').returns(resolved);

      try {
        await http.del('/foo');
        sinon.assert.calledOnce(http._axios.delete);
      } catch (err) {
        return err;
      }
    });
  });

});
