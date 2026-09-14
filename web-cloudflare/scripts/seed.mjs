import { demoBackup } from '../shared/demo.js';
const origin = 'http://127.0.0.1:8787';
const call = async (path, data) => {
  const response = await fetch(origin + path, { method: data ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Origin: origin }, body: data ? JSON.stringify(data) : undefined });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || response.statusText);
  return body;
};
const session = await call('/api/session');
if (!session.local) throw new Error('This script only seeds the explicit loopback local environment.');
const backup = demoBackup();
const preview = await call('/api/restores/preview', backup);
if (!preview.valid) throw new Error(JSON.stringify(preview.errors));
const job = await call('/api/restores', { fingerprint: preview.fingerprint, ledger: backup.ledger, categories: backup.categories, entry_count: backup.entries.length });
if (!job.complete) {
  for (let i = 0; i < backup.entries.length; i += 50) await call(`/api/restores/${job.id}/entries`, { entries: backup.entries.slice(i, i + 50) });
  await call(`/api/restores/${job.id}/finish`, {});
}
await call(`/api/ledgers/${job.id}/activate`, {});
console.log(`Synthetic demo ledger ready: ${backup.entries.length} records, expense ¥3,248.00, income ¥18,000.00. Personal ledger preserved.`);
