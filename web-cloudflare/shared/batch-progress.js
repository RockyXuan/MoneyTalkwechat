// Purchase order is the original item order, never the order of confirmations.
export function batchProgress(batch, slots = batch.slots || []) {
  const source = batch.items.map(i=>i.title.match(/^([^·]{1,24})\s*·/)).find(Boolean)?.[1].trim()
    || batch.original_text.match(/淘宝|京东|拼多多|美团|抖音|山姆|支付宝|微信/)?.[0] || '口述记录';
  const title = item => item.title.replace(new RegExp(`^${source.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\s*·\\s*`),'');
  const done = new Set(slots.map(s=>s.item_id));
  const selected = batch.items.filter(i=>i.selected);
  let prefix=0;
  while(prefix<selected.length && done.has(selected[prefix].id)) prefix++;
  const confirmed=selected.filter(i=>done.has(i.id));
  return { source, total_items: selected.length, skipped_items: batch.items.length-selected.length,
    confirmed_items: confirmed.length, generated_entries: slots.length,
    deleted_entries: slots.filter(s=>s.deleted_at).length,
    first_title: selected[0]?title(selected[0]):'', last_title: selected.at(-1)?title(selected.at(-1)):'',
    first_confirmed: confirmed[0]?title(confirmed[0]):'', last_confirmed: confirmed.at(-1)?title(confirmed.at(-1)):'',
    continuous_items: prefix, continue_after: prefix?title(selected[prefix-1]):null,
    next_title: selected[prefix]?title(selected[prefix]):null,
    has_gaps: confirmed.length>prefix,
    recorded_at: slots.map(s=>s.created_at).filter(Boolean).sort().at(-1)||null };
}
