// Purchase order is the original item order, never the order of confirmations.
import { batchSources, sourceTitle } from './platform-sources.js';
export function batchProgress(batch, slots = batch.slots || []) {
  const sources=[...new Set(batchSources(batch).map(x=>x.source))];
  const source=sources.length===1?sources[0]:'混合来源';
  const title = item => sourceTitle(item.title);
  const done = new Set(slots.map(s=>s.item_id));
  const selected = batch.items.filter(i=>i.selected);
  let prefix=0;
  while(prefix<selected.length && done.has(selected[prefix].id)) prefix++;
  const confirmed=selected.filter(i=>done.has(i.id));
  return { source, total_items: selected.length, skipped_items: batch.items.length-selected.length,
    confirmed_items: confirmed.length, generated_entries: slots.length,
    deleted_entries: slots.filter(s=>s.deleted_at).length,
    first_title: batch.items[0]?title(batch.items[0]):'', last_title: batch.items.at(-1)?title(batch.items.at(-1)):'',
    first_confirmed: confirmed[0]?title(confirmed[0]):'', last_confirmed: confirmed.at(-1)?title(confirmed.at(-1)):'',
    continuous_items: prefix, continue_after: prefix?title(selected[prefix-1]):null,
    next_title: selected[prefix]?title(selected[prefix]):null,
    has_gaps: confirmed.length>prefix,
    recorded_at: slots.map(s=>s.created_at).filter(Boolean).sort().at(-1)||null };
}
