import { batchSources, PRIMARY_PLATFORMS } from './platform-sources.js';
import { batchProgress } from './batch-progress.js';
import { compileTextItems } from './text-records.js';
import { today } from './format.js';

// Derive from every retained batch; never from the six recently loaded entries.
export function platformBoard(batches){
 const groups=new Map(PRIMARY_PLATFORMS.map(source=>[source,[]]));
 for(const batch of batches){
  const split=new Map();for(const {source,item} of batchSources(batch)){if(!split.has(source))split.set(source,[]);split.get(source).push(item);}
  for(const [source,items] of split){
   if(!groups.has(source))groups.set(source,[]);
   const ids=new Set(items.map(i=>i.id)),slots=(batch.slots||[]).filter(s=>ids.has(s.item_id));
   const progress=batchProgress({...batch,items,original_text:source==='口述记录'?'':source},slots);
   const categories=new Map();for(const s of slots.filter(s=>!s.deleted_at)){const id=s.category_id||items.find(i=>i.id===s.item_id)?.category_id;if(id)categories.set(id,(categories.get(id)||0)+1);}
   const plan=compileTextItems(items,today(),slots);
   groups.get(source).push({id:batch.id,status:batch.status,created_at:batch.created_at,progress,categories:[...categories].map(([id,count])=>({id,count})),needs_review:progress.confirmed_items<progress.total_items||Boolean(plan.pending_count||(batch.status!=='paused'&&plan.count))});
  }
 }
 return [...groups].map(([source,rows])=>{
  rows.sort((a,b)=>(b.progress.recorded_at||b.created_at||'').localeCompare(a.progress.recorded_at||a.created_at||'')||a.id.localeCompare(b.id));
  return {source,batches:rows,latest:rows[0]||null,resume:rows.find(r=>r.needs_review)||null,review_batches:rows.filter(r=>r.needs_review).length};
 });
}
