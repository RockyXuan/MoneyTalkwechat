import { queryString, request } from './api.js';

export async function readPageData(page, filters, signal) {
  const read = path => request(path, { signal });
  let detail = null;
  if (page === 'stats') detail = read('/stats?' + queryString(filters));
  if (page === 'bills') detail = read('/entries?' + queryString(filters));
  const [categories, recent, current, textSummary] = await Promise.all([
    read('/categories'),
    read('/entries?limit=6'),
    detail,
    read(page === 'subscriptions' ? '/text-batches' : '/text-batches?view=board'),
  ]);
  return { categories: categories.categories, recent, current, textSummary };
}

export async function restoreBackup(data, fingerprint, onProgress) {
  const manifest = {
    fingerprint,
    ledger: data.ledger,
    categories: data.categories,
    entry_count: data.entries.length,
  };
  if (data.source_ranges) manifest.source_ranges = data.source_ranges;
  if (data.text_batches) {
    manifest.text_batches = data.text_batches;
    manifest.text_slots = data.text_slots || [];
  }
  const job = await request('/restores', { method: 'POST', body: manifest });
  if (!job.complete) {
    for (let offset = 0; offset < data.entries.length; offset += 50) {
      const entries = data.entries.slice(offset, offset + 50);
      const result = await request('/restores/' + job.id + '/entries', { method: 'POST', body: { entries } });
      onProgress(result.received);
    }
  }
  await request('/restores/' + job.id + '/finish', { method: 'POST', body: {} });
  return job;
}
