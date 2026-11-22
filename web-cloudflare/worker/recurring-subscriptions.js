import { all, statement, stamp } from './store.js';
import { compileDraftItems } from '../shared/text-records.js';
import { digest, today } from '../shared/format.js';
import { jsonInsert } from './json-insert.js';

// Only a newly explicit auto_record flag plus an existing confirmed slot is consent.
// Old ongoing rules and unconfirmed drafts are never enabled by deployment.
export async function settleSubscriptions(db,{ledger=null,currentDay=today()}={}) {
 const rows=await all(db,`SELECT b.* FROM text_batches b JOIN ledgers l ON l.id=b.ledger_id WHERE l.status='ready' AND b.status='active' ${ledger?'AND b.ledger_id=?':"AND EXISTS(SELECT 1 FROM users u WHERE u.id=l.owner_id AND u.active_ledger_id=l.id)"} AND EXISTS(SELECT 1 FROM json_each(b.items_json) i WHERE json_extract(i.value,'$.auto_record')=1 AND json_extract(i.value,'$.ongoing')=1) ORDER BY b.updated_at,b.id LIMIT 500`,ledger?[ledger]:[]);
 const slotsByBatch=new Map();
 if(rows.length){const slots=await all(db,`SELECT s.ledger_id,s.batch_id,s.item_id,s.occurred_on FROM text_slots s JOIN json_each(?) r ON s.ledger_id=json_extract(r.value,'$[0]') AND s.batch_id=json_extract(r.value,'$[1]')`,[JSON.stringify(rows.map(r=>[r.ledger_id,r.id]))]);for(const slot of slots){const key=slot.ledger_id+'|'+slot.batch_id;if(!slotsByBatch.has(key))slotsByBatch.set(key,[]);slotsByBatch.get(key).push(slot);}}
 const availableCategories = new Set();
 if (rows.length) {
   const ledgerIds = [...new Set(rows.map(row => row.ledger_id))];
   const categories = await all(db, 'SELECT ledger_id,id,type FROM categories WHERE archived=0 AND ledger_id IN (SELECT value FROM json_each(?))', [JSON.stringify(ledgerIds)]);
   for (const category of categories) availableCategories.add(JSON.stringify([category.ledger_id, category.id, category.type]));
 }
 let count=0,processed=0;const issues=[];
 for(const row of rows){
  if(processed>=5)break; // Keep a tick within the Workers Free D1 query budget.
  const slots=slotsByBatch.get(row.ledger_id+'|'+row.id)||[];
  const items=JSON.parse(row.items_json).filter(i=>i.auto_record===true&&i.ongoing&&i.selected&&slots.some(s=>s.item_id===i.id));
  const plan=compileDraftItems(items,currentDay,slots);
  if(!plan.count){if(plan.pending_count)issues.push({batch_id:row.id,reason:'订阅资料需核对'});continue;}
  if(plan.count>120){issues.push({batch_id:row.id,reason:'待补记超过120笔，请分批核对'});continue;}
  const candidates=plan.entries.filter(e => availableCategories.has(JSON.stringify([row.ledger_id, e.category_id, e.type])));
  if(candidates.length!==plan.count)issues.push({batch_id:row.id,reason:'订阅分类已停用，请核对'});
  if(!candidates.length)continue;
  processed++;
  const now=stamp(),entries=[],newSlots=[];
  for(const e of candidates){const id=await digest(`${row.ledger_id}|${row.id}|${e.item_id}|${e.occurred_on}`);entries.push([row.ledger_id,id,e.type,e.amount_minor,e.category_id,e.occurred_on,e.note,1,now,now,null]);newSlots.push([row.ledger_id,row.id,e.item_id,e.occurred_on,id]);}
  const guard={sql:"EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=? AND status='active')",values:[row.ledger_id,row.id,row.version]};
  const results=await db.batch([
   ...jsonInsert(db,'entries',['ledger_id','id','type','amount_minor','category_id','occurred_on','note','version','created_at','updated_at','deleted_at'],entries,{condition:guard,ignore:true}),
   ...jsonInsert(db,'text_slots',['ledger_id','batch_id','item_id','occurred_on','entry_id'],newSlots,{condition:guard,ignore:true}),
   statement(db,"UPDATE text_batches SET version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=? AND status='active'",[now,row.ledger_id,row.id,row.version])
  ]);
  count+=results[0]?.meta?.changes||0;
 }
 return {count,issues};
}
