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
