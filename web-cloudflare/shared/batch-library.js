import { batchSources } from './platform-sources.js';

export const BATCH_PAGE_SIZE = 8;
export function batchState(batch) {
  if (batch.status === 'paused') return 'paused';
  const p = batch.progress;
  return batch.pending_count || batch.due_count || batch.status === 'pending' || !p || p.confirmed_items < p.total_items ? 'review' : 'done';
}
export function batchPage(batches, { source = '', status = 'all', q = '', page = 0 } = {}) {
  const normalize = value => value.normalize('NFKC').toLocaleLowerCase();
  const term = normalize(q.trim());
  const filtered = batches.filter(b => (!source || batchSources(b).some(x => x.source === source)) && (status === 'all' || batchState(b) === status) && (!term || normalize([b.original_text, ...b.items.map(i => `${i.title} ${i.raw}`)].join(' ')).includes(term)));
  const pages = Math.max(1, Math.ceil(filtered.length / BATCH_PAGE_SIZE));
  const current = Math.min(Math.max(0, page), pages - 1);
  return { batches: filtered.slice(current * BATCH_PAGE_SIZE, (current + 1) * BATCH_PAGE_SIZE), count: filtered.length, page: current, pages };
}
