import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../src/api.js';

test('CSV download rejects a successful HTML login page and accepts CSV', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('<html>登录</html>', { headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(request('/export.csv', {raw:true}), {code:'LOGIN_REQUIRED'});
  fetch.mock.mockImplementation(async () => new Response('日期,金额', {headers:{'Content-Type':'text/csv; charset=utf-8'}}));
  assert.equal(await (await request('/export.csv', {raw:true})).text(), '日期,金额');
});
