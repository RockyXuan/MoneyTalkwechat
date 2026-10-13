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

test('copy workflow creates independent month entry, retry keeps identity and original stays unchanged', async () => {
 const user='copy-workflow';await req('/api/session',{user});
 const original=(await req('/api/entries',{user,method:'POST',body:expense({note:'合成常用',occurred_on:'2025-12-31'})})).data.entry;
 const read=(await req(`/api/entries/${original.id}`,{user})).data.entry;
 const body={type:read.type,amount_minor:read.amount_minor,category_id:read.category_id,note:read.note,occurred_on:'2026-09'};
 const key=crypto.randomUUID(),created=await req('/api/entries',{user,method:'POST',body,key});assert.equal(created.status,201);assert.notEqual(created.data.entry.id,original.id);
 assert.equal((await req('/api/entries',{user,method:'POST',body,key})).data.entry.id,created.data.entry.id);
 assert.deepEqual((await req(`/api/entries/${original.id}`,{user})).data.entry,read);
 assert.equal((await req(`/api/entries/${original.id}`,{user:'other-copy-user'})).status,404);
 assert.equal((await req('/api/entries?from=2026-09-01&to=2026-09-30',{user})).data.totals.expense_minor,read.amount_minor);
});

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

async function textFixture(items,original='虚构循环测试'){return (await req('/api/text-batches',{method:'POST',body:{original_text:original,items}})).data.batch;}
const textItem=(extra={})=>({id:'item-1',raw:'虚构测试',title:'虚构循环服务',type:'expense',amount_minor:1800,category_id:'other',cycle:'monthly',occurred_on:null,start_month:'2026-01',through_month:'2026-03',charge_day:15,short_month:'pending',ongoing:false,questions:[],selected:true,...extra});
test('text candidates persist without expenses; permission and version boundary are enforced',async()=>{
 const count=(await req('/api/entries')).data.totals.count;
 const batch=await textFixture([textItem({start_month:null,charge_day:null,questions:['起始月未知']})],'虚构待核对');
 assert.ok((await req('/api/text-batches')).data.batches.some(b=>b.id===batch.id));assert.equal((await req('/api/entries')).data.totals.count,count);
 assert.equal((await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',user:'bob',body:{}})).status,404);
 const preview=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;assert.equal(preview.count,0);
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body:{version:1,preview_hash:preview.preview_hash}})).status,400);
});
test('text batch confirmation is atomic, idempotent, conflict-safe and never resurrects deleted slots',async()=>{
 const batch=await textFixture([textItem()],'虚构确认');
 const plan=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;assert.equal(plan.count,3);assert.equal(plan.expense_minor,5400);
 const body={version:1,preview_hash:plan.preview_hash,acknowledge_duplicates:true},key=crypto.randomUUID();
 const [a,b]=await Promise.all([req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body,key}),req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body,key:crypto.randomUUID()})]);
 assert.equal([a.status,b.status].filter(s=>s===200).length,1);
 const result=a.status===200?a:b;assert.equal(result.data.entry_ids.length,3);
 const duplicateKey=a.status===200?key:null;if(duplicateKey)assert.deepEqual((await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body,key})).data,result.data);
 const saved=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;assert.equal(saved.count,0);
 const id=result.data.entry_ids[0];await req(`/api/entries/${id}/delete`,{method:'POST',body:{version:1}});
 assert.equal((await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data.count,0);
 const slots=await db.prepare('SELECT COUNT(*) AS n FROM text_slots WHERE batch_id=?').bind(batch.id).first();assert.equal(slots.n,3);
});
test('text confirmations require refreshed preview and explicit same-date amount acknowledgement',async()=>{
 const batch=await textFixture([textItem({cycle:'single',occurred_on:'2026-01-15',amount_minor:999,title:'虚构单笔冲突'})],'虚构同额');
 let plan=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;
 await req('/api/entries',{method:'POST',body:expense({occurred_on:'2026-01-15',amount_minor:999,note:'另一笔测试'})});
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body:{version:1,preview_hash:plan.preview_hash}})).status,409);
 plan=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;assert.equal(plan.duplicates.length,1);
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body:{version:1,preview_hash:plan.preview_hash}})).status,409);
});
test('mixed text batches allow unresolved fields to be completed while confirmed rules stay locked; pause suppresses reminders',async()=>{
 const items=[textItem({start_month:'2025-08',through_month:'2025-08',amount_minor:127}),textItem({id:'item-2',title:'虚构待补全',start_month:null,charge_day:null})];
 let batch=await textFixture(items,'虚构部分确认');
 const plan=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;
 assert.equal(plan.count,1);assert.equal(plan.pending_count,1);
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body:{version:1,preview_hash:plan.preview_hash,acknowledge_duplicates:true}})).status,200);
 const value={original_text:batch.original_text,items:structuredClone(items),version:2};value.items[1].start_month='2025-07';value.items[1].through_month='2025-07';value.items[1].charge_day=20;
 const patched=await req(`/api/text-batches/${batch.id}`,{method:'PATCH',body:value});assert.equal(patched.status,200);batch=patched.data.batch;
 const locked=structuredClone(value);locked.version=3;locked.items[0].amount_minor=200;
 assert.equal((await req(`/api/text-batches/${batch.id}`,{method:'PATCH',body:locked})).status,409);
 assert.equal((await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data.count,1);
 assert.equal((await req(`/api/text-batches/${batch.id}/status`,{method:'POST',body:{version:3,status:'paused'}})).status,200);
 const current=(await req('/api/text-batches')).data.batches.find(b=>b.id===batch.id);assert.equal(current.status,'paused');assert.equal(current.due_count,0);
 const after=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body:{version:4,preview_hash:after.preview_hash}})).status,409);
});
test('editing a generated expense date preserves the original cycle marker and produces a valid backup',async()=>{
 const batch=await textFixture([textItem({start_month:'2025-06',through_month:'2025-06',amount_minor:131})],'虚构日期修正');
 const plan=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;
 const confirmed=await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body:{version:1,preview_hash:plan.preview_hash,acknowledge_duplicates:true}});
 const id=confirmed.data.entry_ids[0];
 assert.equal((await req(`/api/entries/${id}`,{method:'PATCH',body:{...expense({amount_minor:131,category_id:'other',occurred_on:'2025-06-16',note:'虚构日期修正'}),version:1}})).status,200);
 assert.equal((await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data.count,0);
 const backup=(await req('/api/backup')).data;
 assert.equal((await req('/api/restores/preview',{method:'POST',body:backup})).data.valid,true);
 assert.equal(backup.text_slots.find(s=>s.entry_id===id).occurred_on,'2025-06-15');
});
test('new backup round trip keeps pending text, generated cycles and prevents repeated entries; old backups stay valid',async()=>{
 const backup=(await req('/api/backup')).data;assert.equal(backup.version,2);assert.ok(backup.text_batches.length);assert.ok(backup.text_slots.length);
 const preview=(await req('/api/restores/preview',{method:'POST',body:backup})).data;assert.equal(preview.valid,true);
 const job=(await req('/api/restores',{method:'POST',body:{fingerprint:preview.fingerprint,ledger:backup.ledger,categories:backup.categories,entry_count:backup.entries.length,text_batches:backup.text_batches,text_slots:backup.text_slots}})).data;
 for(let i=0;i<backup.entries.length;i+=50)assert.equal((await req(`/api/restores/${job.id}/entries`,{method:'POST',body:{entries:backup.entries.slice(i,i+50)}})).status,200);
 assert.equal((await req(`/api/restores/${job.id}/finish`,{method:'POST',body:{}})).status,200);
 const restored=(await req('/api/backup',{ledger:job.id})).data;assert.deepEqual(backupContent(restored),backupContent(backup));
 const done=restored.text_batches.find(b=>b.status==='active');assert.equal((await req(`/api/text-batches/${done.id}/preview`,{method:'POST',body:{},ledger:job.id})).data.count,0);
 const bad=structuredClone(backup);bad.text_slots[0].entry_id='missing';assert.equal((await req('/api/restores/preview',{method:'POST',body:bad})).data.valid,false);
 assert.equal((await req('/api/restores/preview',{method:'POST',body:demoBackup()})).data.valid,true);
});
test('mobile confirmation returns exact persisted range and two-month statistics',async()=>{
 const batch=await textFixture([textItem({start_month:'2026-08',through_month:'2026-09',amount_minor:6800,title:'合成手机验收'})],'合成两月回执');
 const plan=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;
 const key=crypto.randomUUID(),body={version:1,preview_hash:plan.preview_hash,acknowledge_duplicates:true};
 const saved=await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body,key});
 assert.equal(saved.status,200);assert.equal(saved.data.count,2);assert.equal(saved.data.expense_minor,13600);assert.equal(saved.data.from,'2026-08-15');assert.equal(saved.data.to,'2026-09-15');
 assert.deepEqual((await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body,key})).data,saved.data);
 for(const [id,month] of saved.data.entry_ids.map((id,n)=>[id,n?'2026-09':'2026-08'])){
  const entry=(await req(`/api/entries/${id}`)).data.entry;assert.equal(entry.amount_minor,6800);assert.equal(entry.occurred_on.slice(0,7),month);
  // September has 30 days; use a valid period for the exact series check.
  const validStats=(await req(`/api/stats?from=${month}-01&to=${month}-${month==='2026-09'?'30':'31'}`)).data;
  assert.ok(validStats.series.some(s=>s.bucket===entry.occurred_on&&s.amount_minor>=6800));
 }
 assert.equal((await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data.count,0);
});
test('draft removal is permission-scoped, versioned and replayable, and cannot erase generated rules',async()=>{
 const batch=await textFixture([textItem({start_month:null,charge_day:null})],'合成待删除草稿');
 const before=(await req('/api/entries')).data.totals.count;
 assert.equal((await req(`/api/text-batches/${batch.id}`,{method:'DELETE',body:{version:1},user:'bob'})).status,404);
 assert.equal((await req(`/api/text-batches/${batch.id}`,{method:'DELETE',body:{version:2}})).status,409);
 const key=crypto.randomUUID(),body={version:1};const removed=await req(`/api/text-batches/${batch.id}`,{method:'DELETE',body,key});assert.equal(removed.status,200);
 assert.deepEqual((await req(`/api/text-batches/${batch.id}`,{method:'DELETE',body,key})).data,removed.data);
 assert.equal((await req('/api/text-batches')).data.batches.some(b=>b.id===batch.id),false);assert.equal((await req('/api/entries')).data.totals.count,before);
 const generated=await textFixture([textItem({start_month:'2026-07',through_month:'2026-07',amount_minor:137})],'合成规则不可删除');
 const plan=(await req(`/api/text-batches/${generated.id}/preview`,{method:'POST',body:{}})).data;
 assert.equal((await req(`/api/text-batches/${generated.id}/confirm`,{method:'POST',body:{version:1,preview_hash:plan.preview_hash,acknowledge_duplicates:true}})).status,200);
 assert.equal((await req(`/api/text-batches/${generated.id}`,{method:'DELETE',body:{version:2}})).data.error.code,'TEXT_HAS_ENTRIES');
});
test('ambiguous existing recurrence remains a draft at the server even with questions acknowledged',async()=>{
 const batch=await textFixture([textItem({start_month:null,charge_day:null,through_month:'2026-01',ongoing:true,questions:[]})],'合成旧草稿状态');
 const plan=(await req(`/api/text-batches/${batch.id}/preview`,{method:'POST',body:{}})).data;
 assert.equal(plan.count,0);assert.match(plan.rows[0].missing.join(' '),/两种范围/);
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{method:'POST',body:{version:1,preview_hash:plan.preview_hash}})).status,400);
});

test('legacy unknown charge day requires explicit month precision and still rejects an unknown start',async()=>{
 const user='explicit-month-choice';await req('/api/session',{user});
 const legacy=textItem({id:'legacy-month',start_month:null,through_month:'2026-01',charge_day:null,amount_minor:1,questions:[]});
 const batch=(await req('/api/text-batches',{user,method:'POST',body:{original_text:'合成旧循环模式',items:[legacy]}})).data.batch;
 const preview=()=>req(`/api/text-batches/${batch.id}/preview`,{user,method:'POST',body:{item_ids:[legacy.id]}});
 let plan=(await preview()).data;assert.equal(plan.count,0);assert.ok(plan.rows[0].missing.includes('扣款日待确认'));
 const patch=async(version,item)=>req(`/api/text-batches/${batch.id}`,{user,method:'PATCH',body:{version,original_text:batch.original_text,items:[item]}});
 const monthly={...legacy,date_precision:'month'};assert.equal((await patch(1,monthly)).status,200);
 plan=(await preview()).data;assert.equal(plan.count,0);assert.ok(plan.rows[0].missing.includes('起始月待确认'));assert.ok(!plan.rows[0].missing.includes('扣款日待确认'));
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{user,method:'POST',body:{version:2,preview_hash:plan.preview_hash,item_ids:[legacy.id]}})).status,400);
 assert.equal((await req('/api/entries',{user})).data.totals.count,0);
 assert.equal((await patch(2,{...monthly,start_month:'2025-10'})).status,200);
 plan=(await preview()).data;assert.equal(plan.count,4);
 const body={version:3,preview_hash:plan.preview_hash,item_ids:[legacy.id]},key=crypto.randomUUID();
 const result=await req(`/api/text-batches/${batch.id}/confirm`,{user,method:'POST',body,key});assert.equal(result.status,200);assert.equal(result.data.expense_minor,4);
 assert.deepEqual((await req(`/api/text-batches/${batch.id}/confirm`,{user,method:'POST',body,key})).data,result.data);
 const entries=(await req('/api/entries',{user})).data.entries;assert.equal(entries.length,4);assert.deepEqual(entries.map(e=>e.occurred_on).sort(),['2025-10','2025-11','2025-12','2026-01']);
 const backup=(await req('/api/backup',{user})).data;assert.equal(backup.version,3);assert.equal(backup.text_batches[0].items[0].charge_day,null);assert.equal(backup.text_batches[0].items[0].date_precision,'month');
});

test('one-item confirmation binds preview scope, preserves purchase gaps, locks saved rows and retries once',async()=>{
 const user='per-item-test';await req('/api/session',{user});
 const items=['第一件','第二件','第三件'].map((title,n)=>textItem({id:`item-${n+1}`,cycle:'single',occurred_on:'2026-09',amount_minor:n+1,title:`淘宝 · ${title}`}));
 const batch=(await req('/api/text-batches',{user,method:'POST',body:{original_text:'合成淘宝逐条验收',items}})).data.batch;
 const preview=ids=>req(`/api/text-batches/${batch.id}/preview`,{user,method:'POST',body:{item_ids:ids}});
 for(const ids of [[],['missing'],['item-1','item-1']])assert.equal((await preview(ids)).status,400);
 const third=(await preview(['item-3'])).data;assert.equal(third.count,1);assert.equal(third.expense_minor,3);
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{user,method:'POST',body:{version:1,preview_hash:third.preview_hash,item_ids:['item-1']}})).data.error.code,'PREVIEW_CHANGED');
 const body={version:1,preview_hash:third.preview_hash,item_ids:['item-3']},key=crypto.randomUUID();
 const result=await req(`/api/text-batches/${batch.id}/confirm`,{user,method:'POST',body,key});assert.equal(result.status,200);assert.equal(result.data.count,1);assert.ok(result.data.recorded_at);
 assert.deepEqual((await req(`/api/text-batches/${batch.id}/confirm`,{user,method:'POST',body,key})).data,result.data);
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{user:'bob',method:'POST',body})).status,404);
 let current=(await req('/api/text-batches',{user})).data.batches[0];
 assert.equal(current.progress.first_title,'第一件');assert.equal(current.progress.last_title,'第三件');assert.equal(current.progress.next_title,'第一件');assert.equal(current.progress.has_gaps,true);assert.equal(current.progress.continuous_items,0);assert.equal(current.due_count,2);assert.equal(current.slots[0].amount_minor,3);assert.equal(current.slots[0].current_occurred_on,'2026-09');
 const patch={version:2,original_text:batch.original_text,items:structuredClone(items)};patch.items[2].amount_minor=500;
 assert.equal((await req(`/api/text-batches/${batch.id}`,{user,method:'PATCH',body:patch})).data.error.code,'TEXT_LOCKED');
 const plans=await Promise.all([preview(['item-1']),preview(['item-2'])]);
 const races=await Promise.all(plans.map((p,n)=>req(`/api/text-batches/${batch.id}/confirm`,{user,method:'POST',body:{version:2,preview_hash:p.data.preview_hash,item_ids:[`item-${n+1}`]}})));
 assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);assert.equal((await req('/api/entries',{user})).data.totals.count,2);
 const id=result.data.entry_ids[0];assert.equal((await req(`/api/entries/${id}`,{user,method:'PATCH',body:{...expense({amount_minor:9,category_id:'other',occurred_on:'2026-08',note:'合成修改'}),version:1}})).status,200);
 const edited=(await req('/api/text-batches',{user})).data.batches[0].slots.find(s=>s.entry_id===id);assert.equal(edited.amount_minor,9);assert.equal(edited.current_occurred_on,'2026-08');assert.equal(edited.occurred_on,'2026-09');
 assert.equal((await req(`/api/entries/${id}/delete`,{user,method:'POST',body:{version:2}})).status,200);
 current=(await req('/api/text-batches',{user})).data.batches[0];assert.equal(current.progress.deleted_entries,1);assert.equal((await preview(['item-3'])).data.count,0);
});

test('month dates survive filtering, daily/annual statistics, edit, trash, CSV and v3 restore',async()=>{
 const user='month-precision';await req('/api/session',{user});
 const month=(await req('/api/entries',{user,method:'POST',body:expense({amount_minor:101,occurred_on:'2026-09',note:'合成未指定日期'})})).data.entry;
 const day=(await req('/api/entries',{user,method:'POST',body:expense({amount_minor:202,occurred_on:'2026-09-14'})})).data.entry;
 assert.equal(month.occurred_on,'2026-09');
 for(const date of ['2026-00','2026-13','2026-9','2100-01'])assert.equal((await req('/api/entries',{user,method:'POST',body:expense({occurred_on:date})})).status,400);
 let entries=(await req('/api/entries?from=2026-09-15&to=2026-09-20',{user})).data;assert.equal(entries.totals.count,1);assert.equal(entries.totals.month_precision_count,1);assert.equal(entries.entries[0].occurred_on,'2026-09');
 assert.equal((await req('/api/entries?from=2026-10-01&to=2026-10-10',{user})).data.totals.count,0);
 const stats=(await req('/api/stats?from=2026-09-01&to=2026-09-30',{user})).data;
 assert.equal(stats.totals.expense_minor,303);assert.ok(stats.buckets.includes('2026-09'));assert.equal(stats.series.find(s=>s.bucket==='2026-09').amount_minor,101);assert.ok(!stats.series.some(s=>s.bucket==='2026-09-01'));
 assert.equal(stats.series.reduce((sum,s)=>sum+s.amount_minor,0),303);
 const annual=(await req('/api/stats?from=2026-01-01&to=2026-12-31&bucket=month',{user})).data;assert.equal(annual.series[0].amount_minor,303);
 const csv=(await req('/api/export.csv',{user})).data;assert.ok(csv.includes('"2026-09",'));assert.ok(csv.includes('"2026-09-14",'));
 const changed=await req(`/api/entries/${day.id}`,{user,method:'PATCH',body:{...expense({amount_minor:202,occurred_on:'2026-09'}),version:1}});assert.equal(changed.status,200);assert.equal(changed.data.entry.occurred_on,'2026-09');
 const batch=(await req('/api/text-batches',{user,method:'POST',body:{original_text:'合成月记账',items:[textItem({id:'month-1',cycle:'single',occurred_on:'2026-08',amount_minor:3})]}})).data.batch;
 const plan=(await req(`/api/text-batches/${batch.id}/preview`,{user,method:'POST',body:{item_ids:['month-1']}})).data;
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{user,method:'POST',body:{version:1,preview_hash:plan.preview_hash,item_ids:['month-1']}})).status,200);
 await req(`/api/entries/${month.id}/delete`,{user,method:'POST',body:{version:1}});
 assert.equal((await req('/api/entries?deleted=true',{user})).data.entries[0].occurred_on,'2026-09');
 assert.equal((await req(`/api/entries/${month.id}/restore`,{user,method:'POST',body:{version:2}})).status,200);
 const backup=(await req('/api/backup',{user})).data;assert.equal(backup.version,3);assert.equal(backup.text_slots[0].occurred_on,'2026-08');
 const downgraded={...backup,version:2};assert.equal((await req('/api/restores/preview',{user,method:'POST',body:downgraded})).data.valid,false);
 const preview=(await req('/api/restores/preview',{user,method:'POST',body:backup})).data;assert.equal(preview.valid,true);
 const job=(await req('/api/restores',{user,method:'POST',body:{fingerprint:preview.fingerprint,ledger:backup.ledger,categories:backup.categories,entry_count:backup.entries.length,text_batches:backup.text_batches,text_slots:backup.text_slots}})).data;
 await req(`/api/restores/${job.id}/entries`,{user,method:'POST',body:{entries:backup.entries}});
 assert.equal((await req(`/api/restores/${job.id}/finish`,{user,method:'POST',body:{}})).status,200);
 const restored=(await req('/api/backup',{user,ledger:job.id})).data;assert.deepEqual(backupContent(restored),backupContent(backup));
 assert.equal((await req(`/api/text-batches/${batch.id}/preview`,{user,ledger:job.id,method:'POST',body:{}})).data.count,0);
});

test('field edits preserve the other values, refresh aggregates and reject stale versions', async () => {
  const user='field-edit-contract';await req('/api/session',{user});
  let entry=(await req('/api/entries',{user,method:'POST',body:expense({note:'合成<备注>&原文'})})).data.entry;
  const originalId=entry.id;
  for(const change of [{note:''},{category_id:'transport'},{amount_minor:4101},{occurred_on:'2026-08'}]){
    const body=Object.fromEntries(['type','note','category_id','amount_minor','occurred_on','version'].map(k=>[k,entry[k]]));
    const result=await req(`/api/entries/${entry.id}`,{user,method:'PATCH',body:{...body,...change}});assert.equal(result.status,200);
    const next=(await req(`/api/entries/${entry.id}`,{user})).data.entry;
    for(const k of ['type','note','category_id','amount_minor','occurred_on'])assert.equal(next[k],k in change?change[k]:entry[k]);
    assert.equal(next.version,entry.version+1);
    assert.equal((await req(`/api/entries/${entry.id}`,{user,method:'PATCH',body:{...body,...change,note:'合成过期'}})).status,409);
    entry=next;
  }
  assert.equal(entry.id,originalId);
  const august=(await req('/api/stats?from=2026-08-01&to=2026-08-31',{user})).data;assert.equal(august.totals.expense_minor,4101);assert.equal(august.categories.find(c=>c.id==='transport').amount_minor,4101);
  assert.equal((await req('/api/entries?from=2026-09-01&to=2026-09-30',{user})).data.totals.count,0);
  assert.equal((await req('/api/backup',{user})).data.entries[0].occurred_on,'2026-08');
});

test('private category aliases persist with version and survive full backup restore',async()=>{
 const user='alias-contract';await req('/api/session',{user});
 const cat=(await req('/api/categories',{user,method:'POST',body:{name:'合成孩子',type:'expense',color_key:'blue',icon:'wallet',aliases:['小禾']}})).data.category;
 const get=()=>req('/api/categories',{user}).then(r=>r.data.categories.find(c=>c.id===cat.id));assert.deepEqual((await get()).aliases,['小禾']);
 const body={name:cat.name,type:cat.type,color_key:cat.color_key,icon:cat.icon,sort_order:100,archived:false,version:1};
 assert.equal((await req(`/api/categories/${cat.id}`,{user,method:'PATCH',body})).status,200);assert.deepEqual((await get()).aliases,['小禾']);
 assert.equal((await req(`/api/categories/${cat.id}`,{user,method:'PATCH',body:{...body,version:1,aliases:[]}})).status,409);
 assert.equal((await req('/api/categories',{user:'outsider',ledger:(await req('/api/session',{user})).data.ledger.id})).status,403);
 const hint=textItem({id:'alias-restore',cycle:'single',occurred_on:'2026-09',category_id:null,category_hint:{name:'小禾',recommended_ids:[cat.id],resolved:false}});
 await req('/api/text-batches',{user,method:'POST',body:{original_text:'合成分类建议恢复',items:[hint]}});
 const backup=(await req('/api/backup',{user})).data;assert.equal(backup.version,4);assert.deepEqual(backup.categories.find(c=>c.id===cat.id).aliases,['小禾']);
 const preview=(await req('/api/restores/preview',{user,method:'POST',body:backup})).data;assert.equal(preview.valid,true);
 const job=(await req('/api/restores',{user,method:'POST',body:{fingerprint:preview.fingerprint,ledger:backup.ledger,categories:backup.categories,entry_count:0,text_batches:backup.text_batches,text_slots:backup.text_slots}})).data;
 assert.equal((await req(`/api/restores/${job.id}/finish`,{user,method:'POST',body:{}})).status,200);
 assert.deepEqual(backupContent((await req('/api/backup',{user,ledger:job.id})).data),backupContent(backup));
});
test('one-click category creation reuses same name concurrently and retains idempotency at limit',async()=>{
 const user='alias-create';await req('/api/session',{user});const body={name:'合成新分类',type:'expense'},key=crypto.randomUUID();
 const results=await Promise.all([req('/api/categories/resolve',{user,method:'POST',body,key}),req('/api/categories/resolve',{user,method:'POST',body}),req('/api/categories/resolve',{user,method:'POST',body,key})]);
 assert.ok(results.every(r=>r.status<300));assert.equal(new Set(results.map(r=>r.data.category.id)).size,1);
 assert.equal((await req('/api/categories/resolve',{user,method:'POST',body:{...body,name:'另一个'},key})).status,409);
 const id=results[0].data.category.id;const cat=(await req('/api/categories',{user})).data.categories.find(c=>c.id===id);
 await req(`/api/categories/${id}`,{user,method:'PATCH',body:{name:cat.name,type:cat.type,color_key:cat.color_key,icon:cat.icon,version:1,archived:true}});
 assert.equal((await req('/api/categories/resolve',{user,method:'POST',body})).status,409);
 assert.equal((await req('/api/categories/resolve',{user,method:'POST',body,key})).data.category.id,id);
 const ledger=(await req('/api/session',{user})).data.ledger.id;const n=(await req('/api/categories',{user})).data.categories.length;
 for(let i=n;i<99;i++)await db.prepare("INSERT INTO categories(ledger_id,id,name,type,color_key,icon,sort_order) VALUES(?,?,?,'expense','slate','wallet',100)").bind(ledger,`limit-${i}`,`限制分类${i}`).run();
 const lastKey=crypto.randomUUID(),last={name:'最后一个',type:'expense'};
 const near=await Promise.all([req('/api/categories/resolve',{user,method:'POST',body:last,key:lastKey}),req('/api/categories/resolve',{user,method:'POST',body:{name:'并发另一个',type:'expense'}})]);
 assert.equal(near.filter(r=>r.status<300).length,1);assert.equal((await req('/api/categories',{user})).data.categories.length,100);
 const successful=near.find(r=>r.status<300);if(successful.data.category.name===last.name)assert.equal((await req('/api/categories/resolve',{user,method:'POST',body:last,key:lastKey})).status,200);
 assert.equal((await req('/api/categories/resolve',{user,method:'POST',body:{name:'超限',type:'expense'}})).status,400);
});
test('unresolved category suggestions cannot create entries and foreign hints are rejected',async()=>{
 const user='alias-pending';await req('/api/session',{user});
 const item=textItem({id:'alias-item',cycle:'single',occurred_on:'2026-09',category_id:'food',category_hint:{name:'小禾',recommended_ids:['food'],resolved:false}});
 const bad=await req('/api/text-batches',{user,method:'POST',body:{original_text:'合成无效推荐',items:[{...item,category_hint:{...item.category_hint,recommended_ids:['not-owned']}}]}});assert.equal(bad.status,400);
 const batch=(await req('/api/text-batches',{user,method:'POST',body:{original_text:'合成未选择推荐',items:[item]}})).data.batch;
 const preview=(await req(`/api/text-batches/${batch.id}/preview`,{user,method:'POST',body:{}})).data;assert.equal(preview.count,0);assert.equal(preview.pending_count,1);
 assert.equal((await req(`/api/text-batches/${batch.id}/confirm`,{user,method:'POST',body:{version:1,preview_hash:preview.preview_hash}})).status,400);
 const backup=(await req('/api/backup',{user})).data;assert.equal(backup.version,4);assert.equal(backup.text_batches[0].items[0].category_hint.resolved,false);
 assert.equal((await req('/api/restores/preview',{user,method:'POST',body:backup})).data.valid,true);
});

test('a valid backup containing empty alias arrays restores without changing its content fingerprint',async()=>{
 const user='empty-alias-restore';await req('/api/session',{user});const backup=demoBackup();backup.version=4;backup.entries=[];backup.categories=backup.categories.map(c=>({...c,aliases:[]}));
 const preview=(await req('/api/restores/preview',{user,method:'POST',body:backup})).data;assert.equal(preview.valid,true);
 const job=(await req('/api/restores',{user,method:'POST',body:{fingerprint:preview.fingerprint,ledger:backup.ledger,categories:backup.categories,entry_count:0}})).data;
 assert.equal((await req(`/api/restores/${job.id}/finish`,{user,method:'POST',body:{}})).status,200);
 assert.deepEqual(backupContent((await req('/api/backup',{user,ledger:job.id})).data),backupContent(backup));
});

test('platform progress uses confirmed entries and current categories, deletion and restore preserve source without exposing other ledgers',async()=>{
 const user='platform-board';await req('/api/session',{user});
 const items=['淘宝 · 合成首件','京东 · 合成中件','淘宝 · 合成尾件'].map((title,n)=>textItem({id:`p${n}`,title,cycle:'single',occurred_on:'2026-09',amount_minor:n+1}));
 const b=(await req('/api/text-batches',{user,method:'POST',body:{original_text:'混合平台合成验收',items}})).data.batch;
 const plan=(await req(`/api/text-batches/${b.id}/preview`,{user,method:'POST',body:{item_ids:['p2']}})).data;
 const saved=(await req(`/api/text-batches/${b.id}/confirm`,{user,method:'POST',body:{version:1,preview_hash:plan.preview_hash,item_ids:['p2']}})).data;
 const board=async()=> (await req('/api/text-batches',{user})).data.platforms;
 let p=(await board()).find(x=>x.source==='淘宝');assert.equal(p.latest.progress.next_title,'合成首件');assert.equal(p.latest.progress.last_confirmed,'合成尾件');assert.equal(p.latest.progress.has_gaps,true);assert.equal((await board()).find(x=>x.source==='京东').latest.progress.confirmed_items,0);
 const id=saved.entry_ids[0],entry=(await req(`/api/entries/${id}`,{user})).data.entry;
 assert.equal((await req(`/api/entries/${id}`,{user,method:'PATCH',body:{...expense(),note:entry.note,occurred_on:entry.occurred_on,amount_minor:entry.amount_minor,category_id:'transport',version:entry.version}})).status,200);
 assert.deepEqual((await board()).find(x=>x.source==='淘宝').latest.categories,[{id:'transport',count:1}]);
 assert.equal((await req(`/api/entries/${id}/delete`,{user,method:'POST',body:{version:2}})).status,200);p=(await board()).find(x=>x.source==='淘宝');assert.equal(p.latest.progress.deleted_entries,1);assert.deepEqual(p.latest.categories,[]);
 assert.equal((await req(`/api/entries/${id}/restore`,{user,method:'POST',body:{version:3}})).status,200);assert.deepEqual((await board()).find(x=>x.source==='淘宝').latest.categories,[{id:'transport',count:1}]);
 assert.ok(!(await req('/api/text-batches')).data.batches.some(x=>x.id===b.id));
 const backup=(await req('/api/backup',{user})).data,preview=(await req('/api/restores/preview',{user,method:'POST',body:backup})).data;assert.equal(preview.valid,true);
 const job=(await req('/api/restores',{user,method:'POST',body:{fingerprint:preview.fingerprint,ledger:backup.ledger,categories:backup.categories,entry_count:backup.entries.length,text_batches:backup.text_batches,text_slots:backup.text_slots}})).data;
 await req(`/api/restores/${job.id}/entries`,{user,method:'POST',body:{entries:backup.entries}});assert.equal((await req(`/api/restores/${job.id}/finish`,{user,method:'POST',body:{}})).status,200);
 assert.deepEqual((await req('/api/text-batches',{user,ledger:job.id})).data.platforms,await board());
});

test('batch history reads 500 batches with two scoped data queries and single batch lookup preserves permissions',async()=>{
 const user='history-read-budget';const sess=(await req('/api/session',{user})).data;
 const {parseTextRecords}=await import('../shared/text-records.js');const {batchInsert}=await import('../worker/text-records.js');
 const items=parseTextRecords('淘宝 · 合成旧商品0.01元','2026-10-13').map(i=>({...i,category_id:'food'}));
 const now=new Date().toISOString();await db.batch(Array.from({length:500},(_,i)=>batchInsert(db,sess.ledger.id,{id:`history-${i}`,original_text:`淘宝 · 合成旧商品${i}`,items,status:'pending',version:1,created_at:now,updated_at:now},`fixture-${i}`)));
 const originalDb=db;let batchReads=0,slotReads=0;
 db={prepare(sql){if(sql.startsWith('SELECT * FROM text_batches'))batchReads++;if(sql.includes('FROM text_slots s JOIN entries'))slotReads++;return originalDb.prepare(sql);},batch:statements=>originalDb.batch(statements)};
 let data;try{data=(await req('/api/text-batches',{user})).data;}finally{db=originalDb;}
 assert.equal(data.batches.length,500);assert.equal(data.reminder_count,500);assert.equal(batchReads,1);assert.equal(slotReads,1);assert.equal(data.platforms.find(p=>p.source==='淘宝').batches.length,500);
 const current=(await req('/api/text-batches/history-0',{user})).data.batch;assert.equal(current.items[0].title,items[0].title);assert.equal(current.pending_count,0);assert.equal(current.due_count,1);
 assert.equal((await req('/api/text-batches/history-0',{user:'bob'})).status,404);
 assert.equal((await req('/api/text-batches',{user,method:'POST',body:{original_text:'合成超过边界',items}})).data.error.code,'TEXT_LIMIT');
 const backup=(await req('/api/backup',{user})).data;assert.equal(backup.text_batches.length,500);const preview=(await req('/api/restores/preview',{user,method:'POST',body:backup})).data;assert.equal(preview.valid,true);
 const manifest={fingerprint:preview.fingerprint,ledger:backup.ledger,categories:backup.categories,entry_count:0,text_batches:backup.text_batches,text_slots:backup.text_slots};const job=await budgetRequest('/api/restores',{user,method:'POST',body:manifest});assert.equal(job.status,201);assert.equal((await budgetRequest(`/api/restores/${job.data.id}/finish`,{user,method:'POST',body:{}})).status,200);assert.equal((await req('/api/backup',{user,ledger:job.data.id})).data.text_batches.length,500);assert.equal((await req('/api/text-batches',{user,ledger:job.data.id})).data.platforms.find(p=>p.source==='淘宝').batches.length,500);
});

async function budgetRequest(path,options){const original=db;let queries=0;db={prepare(sql){queries++;return original.prepare(sql);},batch:s=>original.batch(s)};try{const result=await req(path,options);assert.ok(queries<50,`${path} prepares ${queries} queries, exceeds free invocation budget`);return {...result,queries};}finally{db=original;}}
test('long intake creates all drafts atomically, retries once, preserves cloud context and backup restore',async()=>{
 const user='long-intake';const session=(await req('/api/session',{user})).data;const {parseTextIntake}=await import('../shared/text-records.js');
 const raw='  2026年9月，分类餐饮，'+Array.from({length:41},()=> '淘宝 · 合成商品0.01元').join('；\n')+'。\n';const parsed=parseTextIntake(raw,'2026-10-13',[...demoBackup().categories]);
 const body={segments:parsed.segments,anchor_day:parsed.anchor_day};const key=crypto.randomUUID(),made=await budgetRequest('/api/text-intakes',{user,method:'POST',body,key});assert.equal(made.status,201);assert.equal(made.data.batches.length,2);
 assert.deepEqual((await req('/api/text-intakes',{user,method:'POST',body,key})).data.batches,made.data.batches);assert.equal((await req('/api/entries',{user})).data.totals.count,0);
 const list=(await req('/api/text-batches',{user})).data.batches;assert.equal(list.length,2);assert.equal(list[0].intake.total,2);assert.equal(list.find(b=>b.intake.index===1).items[0].occurred_on,'2026-09');
 assert.equal((await req(`/api/text-batches/${made.data.batches[0].id}`,{user:'other-intake'})).status,404);
 const backup=(await req('/api/backup',{user})).data;assert.equal(backup.version,5);assert.equal([...backup.text_batches].sort((a,b)=>a.intake.index-b.intake.index).map(b=>b.original_text).join(''),raw);
 const preview=(await req('/api/restores/preview',{user,method:'POST',body:backup})).data;assert.equal(preview.valid,true);assert.equal((await req('/api/restores/preview',{user,method:'POST',body:{...backup,version:4}})).data.valid,false);
 const manifest={fingerprint:preview.fingerprint,ledger:backup.ledger,categories:backup.categories,entry_count:0,text_batches:backup.text_batches,text_slots:backup.text_slots};const job=(await budgetRequest('/api/restores',{user,method:'POST',body:manifest})).data;
 assert.equal((await budgetRequest(`/api/restores/${job.id}/finish`,{user,method:'POST',body:{}})).status,200);assert.equal(await digest(backupContent((await req('/api/backup',{user,ledger:job.id})).data)),preview.fingerprint);
 assert.equal((await req('/api/text-intakes',{user,ledger:job.id,method:'POST',body})).data.repeated,true);assert.equal((await req('/api/session',{user})).data.ledger.id,session.ledger.id);
 const bad={...body,segments:[body.segments[0],{...body.segments[1],items:[{...body.segments[1].items[0],amount_minor:-1}]}]};assert.equal((await req('/api/text-intakes',{user,method:'POST',body:bad})).status,400);assert.equal((await req('/api/text-batches',{user})).data.batches.length,2);
 const old=db;await db.prepare('UPDATE text_batches SET version=version+1 WHERE ledger_id=? AND id=?').bind(session.ledger.id,made.data.batches[0].id).run();assert.equal((await req('/api/text-intakes',{user,method:'POST',body})).data.batches.find(b=>b.id===made.data.batches[0].id).version,2);assert.equal(db,old);
});
test('120 recurring entries preview and confirm stay below free query budget; slot restore is complete and idempotent',async()=>{
 const user='recurring-budget';await req('/api/session',{user});const {parseTextRecords}=await import('../shared/text-records.js');const items=parseTextRecords('从2016年1月开始，每月合成循环0.01元，补记到2025年12月','2026-10-13');items[0].category_id='food';
 const b=(await req('/api/text-batches',{user,method:'POST',body:{original_text:items[0].raw,items}})).data.batch;const preview=await budgetRequest(`/api/text-batches/${b.id}/preview`,{user,method:'POST',body:{}});assert.equal(preview.data.count,120);
 const key=crypto.randomUUID(),body={version:1,preview_hash:preview.data.preview_hash};const saved=await budgetRequest(`/api/text-batches/${b.id}/confirm`,{user,method:'POST',body,key});assert.equal(saved.status,200);assert.equal(saved.data.count,120);assert.equal(saved.data.expense_minor,120);assert.deepEqual((await req(`/api/text-batches/${b.id}/confirm`,{user,method:'POST',body,key})).data,saved.data);
 const backup=(await req('/api/backup',{user})).data,check=(await req('/api/restores/preview',{user,method:'POST',body:backup})).data;const manifest={fingerprint:check.fingerprint,ledger:backup.ledger,categories:backup.categories,entry_count:120,text_batches:backup.text_batches,text_slots:backup.text_slots};const job=(await budgetRequest('/api/restores',{user,method:'POST',body:manifest})).data;
 const stored=await db.prepare('SELECT manifest_json FROM restores WHERE ledger_id=?').bind(job.id).first();assert.ok(!JSON.parse(stored.manifest_json).text_slots);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM restore_slot_chunks WHERE ledger_id=?').bind(job.id).first()).n,1);
 assert.equal((await req(`/api/restores/${job.id}/finish`,{user,method:'POST',body:{}})).status,409);for(let at=0;at<120;at+=50)await req(`/api/restores/${job.id}/entries`,{user,method:'POST',body:{entries:backup.entries.slice(at,at+50)}});
 assert.equal((await budgetRequest(`/api/restores/${job.id}/finish`,{user,method:'POST',body:{}})).status,200);assert.equal((await req(`/api/restores/${job.id}/finish`,{user,method:'POST',body:{}})).status,200);assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM restore_slot_chunks WHERE ledger_id=?').bind(job.id).first()).n,0);assert.equal((await req('/api/backup',{user,ledger:job.id})).data.text_slots.length,120);
});
