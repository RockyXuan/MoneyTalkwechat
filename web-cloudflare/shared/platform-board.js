import { batchSources, PRIMARY_PLATFORMS } from './platform-sources.js';
import { batchProgress } from './batch-progress.js';
import { compileTextItems } from './text-records.js';
import { today } from './format.js';

// A long spoken message remains one visible range even when saved in small drafts.
// Derive from every retained batch, never just the most recent loaded entries.
export function platformBoard(batches){
 const groups=new Map(PRIMARY_PLATFORMS.map(source=>[source,new Map()]));
 for(const batch of batches){
  const split=new Map();for(const {source,item} of batchSources(batch)){if(!split.has(source))split.set(source,[]);split.get(source).push(item);}
  for(const [source,items] of split){
   if(!groups.has(source))groups.set(source,new Map());
   const ids=new Set(items.map(i=>i.id)),slots=(batch.slots||[]).filter(s=>ids.has(s.item_id));
   const plan=items.length===batch.items.length&&batch.pending_count!==undefined?{pending_count:batch.pending_count,count:batch.due_count}:compileTextItems(items,today(),slots);
   const key=batch.intake?.id||batch.id,rows=groups.get(source);if(!rows.has(key))rows.set(key,[]);rows.get(key).push({batch,items,slots,plan});
  }
 }
 return [...groups].map(([source,sets])=>{
  const rows=[...sets.values()].map(parts=>{
   parts.sort((a,b)=>(a.batch.intake?.index||0)-(b.batch.intake?.index||0));
   const items=parts.flatMap(p=>p.items.map(i=>({...i,id:`${p.batch.id}|${i.id}`}))),slots=parts.flatMap(p=>p.slots.map(s=>({...s,item_id:`${p.batch.id}|${s.item_id}`})));
   const progress=batchProgress({items,original_text:source==='口述记录'?'':source},slots);
   const categories=new Map();for(const slot of slots.filter(s=>!s.deleted_at)){const id=slot.category_id||items.find(i=>i.id===slot.item_id)?.category_id;if(id)categories.set(id,(categories.get(id)||0)+1);}
   const unfinished=parts.find(p=>{const done=new Set(p.slots.map(s=>s.item_id));return p.items.some(i=>i.selected&&!done.has(i.id))||p.plan.pending_count||(p.batch.status!=='paused'&&p.plan.count);});
   const target=unfinished||parts.at(-1);
   return {id:target.batch.id,status:parts.every(p=>p.batch.status==='paused')?'paused':target.batch.status,created_at:parts[0].batch.created_at,progress,categories:[...categories].map(([id,count])=>({id,count})),needs_review:Boolean(unfinished)};
  });
  rows.sort((a,b)=>(b.progress.recorded_at||b.created_at||'').localeCompare(a.progress.recorded_at||a.created_at||'')||a.id.localeCompare(b.id));
  return {source,batches:rows,latest:rows[0]||null,resume:rows.find(r=>r.needs_review)||null,review_batches:rows.filter(r=>r.needs_review).length};
 });
}
