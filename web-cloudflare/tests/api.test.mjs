import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { createApp } from '../worker/index.js';
import { authenticate, verifyAccess } from '../worker/auth.js';
import { demoBackup } from '../shared/demo.js';
import { backupContent, digest } from '../shared/domain.js';

let mf, db, app, session;
const origin = 'http://localhost:8787';
async function req(path, { method = 'GET', body, key = crypto.randomUUID(), user = 'alice', ledger, originHeader = origin } = {}) {
  const headers = { 'Content-Type': 'application/json', Origin: originHeader, 'X-Test-User': user, 'Idempotency-Key': key };
  if (ledger) headers['X-Ledger-Id'] = ledger;
  const response = await app.request(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, { DB: db });
  const data = response.headers.get('Content-Type')?.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, data, headers: response.headers };
}
const expense = (extra = {}) => ({ type: 'expense', amount_minor: 3510, category_id: 'food', occurred_on: '2026-09-14', note: '测试午餐', ...extra });
before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default { fetch() { return new Response("test") } }', compatibilityDate: '2026-09-14', d1Databases: ['DB'] }));
  db = await mf.getD1Database('DB');
  for (const file of (await readdir(new URL('../migrations/', import.meta.url))).filter(x => x.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8');
    for (const part of sql.split(/;\s*(?=CREATE|PRAGMA|INSERT|DROP|ALTER|$)/i).filter(x => x.trim())) await db.prepare(part).run();
  }
  app = createApp({ verifyIdentity: async r => ({ sub: r.headers.get('X-Test-User'), email: `${r.headers.get('X-Test-User')}@example.invalid`, issuer: 'test' }), onUnexpectedError: error => console.error('TEST_DIAGNOSTIC', error) });
  session = (await req('/api/session')).data;
});
after(async () => { await mf?.dispose(); });

test('production identity fails closed; local bypass needs explicit flags and loopback', async () => {
  await assert.rejects(() => authenticate(new Request(origin), { ENVIRONMENT: 'production', LOCAL_DEV_MODE: 'true' }), e => e.status === 503);
  await assert.rejects(() => authenticate(new Request('https://example.com'), { ENVIRONMENT: 'local', LOCAL_DEV_MODE: 'true' }), e => e.status === 503);
  const local = await authenticate(new Request(origin), { ENVIRONMENT: 'local', LOCAL_DEV_MODE: 'true' }); assert.equal(local.local, true);
  const noAuth = await createApp().request(origin + '/api/session', {}, { DB: db, ACCESS_TEAM_DOMAIN: 'test.cloudflareaccess.com', ACCESS_AUD: 'test', OWNER_EMAIL: 'owner@example.invalid' }); assert.equal(noAuth.status, 401);
});
test('Access signature, issuer, audience and expiry are actually verified', async () => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey); jwk.kid = 'test';
  const keyset = createLocalJWKSet({ keys: [jwk] });
  const sign = (iss = 'https://team.cloudflareaccess.com', aud = 'app', exp = '2m') => new SignJWT({ email: 'owner@example.invalid' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).setSubject('owner').setIssuer(iss).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
  const options = { issuer: 'https://team.cloudflareaccess.com', audience: 'app', keyset };
  assert.equal((await verifyAccess(await sign(), options)).sub, 'owner');
  await assert.rejects(() => sign('wrong').then(t => verifyAccess(t, options)));
  await assert.rejects(() => sign(undefined, 'wrong').then(t => verifyAccess(t, options)));
  await assert.rejects(() => sign(undefined, undefined, '-1s').then(t => verifyAccess(t, options)));
  const token = await sign(); await assert.rejects(() => verifyAccess(token.slice(0, -5) + 'wrong', options));
});
test('writes reject a cross-site origin and spoofed client user_id', async () => {
  assert.equal((await req('/api/entries', { method: 'POST', body: expense(), originHeader: 'https://evil.invalid' })).status, 403);
  assert.equal((await req('/api/entries', { method: 'POST', body: expense({ user_id: 'bob' }) })).status, 400);
  assert.equal((await req('/api/entries', { user: 'bob', ledger: session.ledger.id })).status, 403);
});
test('simultaneous duplicate create writes once and replay survives later changes', async () => {
  const key = crypto.randomUUID(), body = expense();
  const results = await Promise.all([req('/api/entries', { method: 'POST', key, body }), req('/api/entries', { method: 'POST', key, body })]);
  assert.equal(results[0].status, 201); assert.equal(results[1].status, 201);
  assert.equal(results[0].data.entry.id, results[1].data.entry.id);
  const id = results[0].data.entry.id;
  assert.equal((await req(`/api/entries/${id}`, { user: 'bob' })).status, 404);
  assert.equal((await req('/api/entries', { method: 'POST', key, body: expense({ amount_minor: 3511 }) })).status, 409);
  assert.equal((await req(`/api/operations/${key}`)).data.found, true);
});
test('optimistic concurrency commits one edit and reports the other as conflict', async () => {
  const entry = (await req('/api/entries', { method: 'POST', body: expense() })).data.entry;
  const results = await Promise.all(['first', 'second'].map(note => req(`/api/entries/${entry.id}`, { method: 'PATCH', body: { ...expense({ note }), version: 1 } })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await req(`/api/entries/${entry.id}`)).data.entry.version, 2);
});
test('delete, repeated delete and restore preserve one record and totals', async () => {
  const entry = (await req('/api/entries', { method: 'POST', body: expense() })).data.entry;
  const key = crypto.randomUUID();
  const deleted = await req(`/api/entries/${entry.id}/delete`, { method: 'POST', body: { version: 1 }, key }); assert.equal(deleted.status, 200);
  assert.deepEqual((await req(`/api/entries/${entry.id}/delete`, { method: 'POST', body: { version: 1 }, key })).data, deleted.data);
  assert.equal((await req('/api/entries?deleted=true')).data.entries.some(e => e.id === entry.id), true);
  assert.equal((await req(`/api/entries/${entry.id}/restore`, { method: 'POST', body: { version: 2 } })).status, 200);
  assert.equal((await req(`/api/entries/${entry.id}`)).data.entry.deleted_at, null);
});
test('invalid amounts, dates and category types are rejected by the API', async () => {
  for (const extra of [{ amount_minor: 0 }, { amount_minor: null }, { amount_minor: 1.2 }, { amount_minor: 10000000000 }, { occurred_on: '2026-02-30' }, { occurred_on: '2100-01-01' }, { category_id: 'salary' }]) assert.equal((await req('/api/entries', { method: 'POST', body: expense(extra) })).status, 400);
});
test('restore verifies content, refuses early activation, resumes chunks and deduplicates entire import', async () => {
  const backup = demoBackup();
  const preview = await req('/api/restores/preview', { method: 'POST', body: backup }); assert.equal(preview.data.valid, true);
  const manifest = { fingerprint: preview.data.fingerprint, ledger: backup.ledger, categories: backup.categories, entry_count: backup.entries.length };
  const job = (await req('/api/restores', { method: 'POST', body: manifest })).data;
  assert.equal((await req(`/api/ledgers/${job.id}/activate`, { method: 'POST', body: {} })).status, 409);
  assert.equal((await req(`/api/restores/${job.id}/finish`, { method: 'POST', body: {} })).status, 409);
  assert.equal((await req(`/api/restores/${job.id}/entries`, { method: 'POST', user: 'bob', body: { entries: backup.entries.slice(0, 50) } })).status, 403);
  for (let i = 0; i < backup.entries.length; i += 50) {
    const body = { entries: backup.entries.slice(i, i + 50) };
    assert.equal((await req(`/api/restores/${job.id}/entries`, { method: 'POST', body })).status, 200);
    assert.equal((await req(`/api/restores/${job.id}/entries`, { method: 'POST', body })).status, 200);
  }
  const result = await req(`/api/restores/${job.id}/finish`, { method: 'POST', body: {} });
  assert.equal(result.status, 200); assert.equal(result.data.summary.expense_minor, 324800);
  assert.equal((await req('/api/session')).data.ledger.id, session.ledger.id);
  assert.equal((await req('/api/restores', { method: 'POST', body: manifest })).data.id, job.id);
  assert.equal((await req(`/api/ledgers/${job.id}/activate`, { method: 'POST', body: {} })).status, 200);
  const exported = (await req('/api/backup', { ledger: job.id })).data;
  assert.equal(await digest(backupContent(exported)), preview.data.fingerprint);
  const stats = (await req('/api/stats?from=2026-09-01&to=2026-09-14', { ledger: job.id })).data;
  assert.equal(stats.totals.expense_minor, 324800); assert.equal(stats.totals.income_minor, 1800000);
  assert.equal(stats.categories.reduce((s, c) => s + c.amount_minor, 0), 324800);
  assert.equal(stats.series.reduce((s, c) => s + c.amount_minor, 0), 324800);
  const changed = await req('/api/entries', { ledger: job.id, method: 'POST', body: expense({ note: 'restored ledger edited' }) });
  assert.equal(changed.status, 201);
  const nextJob = (await req('/api/restores', { method: 'POST', body: manifest })).data;
  assert.notEqual(nextJob.id, job.id); assert.equal(nextJob.complete, false);
  assert.equal((await req('/api/entries?limit=1', { ledger: job.id })).data.totals.count, 62);
  const newEntry = { ...backup.entries[0], id: 'extra-after-finish' };
  assert.equal((await req(`/api/restores/${job.id}/entries`, { method: 'POST', body: { entries: [newEntry] } })).status, 409);
});
test('more than 500 entries paginate completely and aggregate independently', async () => {
  const s = (await req('/api/session', { user: 'large' })).data;
  const statements = [];
  for (let i = 0; i < 551; i++) statements.push(db.prepare('INSERT INTO entries(ledger_id,id,type,amount_minor,category_id,occurred_on,note,version,created_at,updated_at) VALUES(?,?,\'expense\',101,\'food\',\'2026-09-01\',\'large\',1,?,?)').bind(s.ledger.id, `large-${String(i).padStart(4, '0')}`, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'));
  for (let i = 0; i < statements.length; i += 40) await db.batch(statements.slice(i, i + 40));
  const ids = new Set();
  for (let offset = 0; offset < 551; offset += 100) {
    const page = (await req(`/api/entries?limit=100&offset=${offset}`, { user: 'large' })).data;
    assert.equal(page.totals.count, 551); page.entries.forEach(e => ids.add(e.id));
  }
  assert.equal(ids.size, 551);
  assert.equal((await req('/api/stats?from=2026-09-01&to=2026-09-14', { user: 'large' })).data.totals.expense_minor, 55651);
});
test('category rename preserves color and historical totals; archive prevents new entries', async () => {
  const user = 'categories'; await req('/api/session', { user });
  await req('/api/entries', { user, method: 'POST', body: expense() });
  const food = (await req('/api/categories', { user })).data.categories.find(c => c.id === 'food');
  const { id, ...body } = food; body.name = '吃饭'; body.archived = true;
  assert.equal((await req(`/api/categories/${id}`, { user, method: 'PATCH', body })).status, 200);
  const stats = (await req('/api/stats?from=2026-09-01&to=2026-09-14', { user })).data;
  assert.equal(stats.categories[0].name, '吃饭'); assert.equal(stats.categories[0].color_key, 'blue'); assert.equal(stats.totals.expense_minor, 3510);
  assert.equal((await req('/api/entries', { user, method: 'POST', body: expense() })).status, 400);
});

test('exports include all matching rows, escape spreadsheet formulas and retain deleted rows only in JSON', async () => {
  const user = 'export-test'; await req('/api/session', { user });
  const firstEntry = (await req('/api/entries', { user, method: 'POST', body: expense({ note: '=SUM(1,2)' }) })).data.entry;
  await req('/api/entries', { user, method: 'POST', body: expense({ amount_minor: 200, note: 'ordinary' }) });
  const csv = await req('/api/export.csv?limit=1', { user });
  assert.equal(csv.status, 200); assert.equal(csv.data.split('\r\n').length, 3);
  assert.ok(csv.data.includes("\"'=SUM(1,2)\""));
  const filtered = await req('/api/export.csv?q=ordinary', { user });
  assert.equal(filtered.data.split('\r\n').length, 2); assert.ok(!filtered.data.includes('SUM'));
  await req(`/api/entries/${firstEntry.id}/delete`, { user, method: 'POST', body: { version: 1 } });
  assert.equal((await req('/api/export.csv', { user })).data.split('\r\n').length, 2);
  const backup = (await req('/api/backup', { user })).data;
  assert.equal(backup.entries.length, 2); assert.ok(backup.entries.find(e => e.id === firstEntry.id).deleted_at);
  assert.equal((await req('/api/restores/preview', { user, method: 'POST', body: backup })).data.summary.deleted, 1);
});

test('empty backup restores safely and malformed preview performs no ledger writes', async () => {
  const user = 'empty-restore'; const s = (await req('/api/session', { user })).data;
  const broken = await req('/api/restores/preview', { user, method: 'POST', body: { entries: [{ amount_minor: null }] } });
  assert.equal(broken.data.valid, false);
  assert.equal((await req('/api/session', { user })).data.ledgers.length, 1);
  const backup = (await req('/api/backup', { user })).data;
  const manifest = { fingerprint: await digest(backupContent(backup)), ledger: backup.ledger, categories: backup.categories, entry_count: 0 };
  const job = (await req('/api/restores', { user, method: 'POST', body: manifest })).data;
  assert.equal((await req(`/api/restores/${job.id}/finish`, { user, method: 'POST', body: {} })).status, 200);
  assert.equal((await req('/api/session', { user })).data.ledger.id, s.ledger.id);
});
