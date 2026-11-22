import { sourceRanges } from './source-ranges.js';
import { TEXT_BATCH_LIMIT } from '../shared/text-limits.js';
import { jsonInsert } from './json-insert.js';
import { z } from 'zod';
import { textItemsSchema } from '../shared/text-schema.js';
import { compileTextItems, compileDraftItems, TextBatchLimitError } from '../shared/text-records.js';
import { today, digest, canonical, validDate } from '../shared/format.js';
import { all, first, statement, operation, requiredOperationKey, stamp } from './store.js';
import { ApiError } from './auth.js';
import { batchProgress } from '../shared/batch-progress.js';
import { sourceTitle } from '../shared/platform-sources.js';
import { platformBoard } from '../shared/platform-board.js';
const input=z.object({original_text:z.string().min(1).max(10000).refine(s=>Boolean(s.trim())),items:textItemsSchema}).strict();
const version=z.number().int().min(1);
const itemIds=z.array(z.string().regex(/^[A-Za-z0-9_-]{1,100}$/)).min(1).max(40).refine(ids=>new Set(ids).size===ids.length).optional();
export function textBatchRow(row) {const {ledger_id,fingerprint,items_json,intake_json,...batch}=row;return {...batch,items:JSON.parse(items_json),...(intake_json?{intake:JSON.parse(intake_json)}:{})};}
export const batchInsert=(db,ledger,b,fingerprint)=>statement(db,'INSERT INTO text_batches(ledger_id,id,original_text,items_json,status,fingerprint,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[ledger,b.id,b.original_text,JSON.stringify(b.items),b.status,fingerprint,b.version,b.created_at,b.updated_at]);
async function getBatch(c) {
 const row=await first(c.env.DB,'SELECT * FROM text_batches WHERE ledger_id=? AND id=?',[c.get('ledger').id,c.req.param('id')]);
 if(!row)throw new ApiError(404,'TEXT_NOT_FOUND','文字记录不存在或无权访问');
 return textBatchRow(row);
}
async function preview(c,batch,selectedIds=null,subscription=false) {
 const ledger=c.get('ledger').id,db=c.env.DB;
 const slots=subscription?[]:await all(db,'SELECT item_id,occurred_on,entry_id FROM text_slots WHERE ledger_id=? AND batch_id=?',[ledger,batch.id]);
 if(selectedIds?.some(id=>!batch.items.some(i=>i.id===id&&i.selected)))throw new ApiError(400,'TEXT_ITEM_INVALID','所选项目不存在或未勾选');
 let plan;try{plan=compileTextItems(selectedIds?batch.items.filter(i=>selectedIds.includes(i.id)):batch.items,today(),slots);}catch(error){if(error instanceof TextBatchLimitError)throw new ApiError(400,'TEXT_BATCH_TOO_LARGE',error.message);throw error;}const duplicates=[];
 const cats=await all(db,'SELECT id,type,archived FROM categories WHERE ledger_id=?',[ledger]);
 const categoryMap=new Map(cats.map(cat=>[cat.id,cat]));
 for(const entry of plan.entries){const cat=categoryMap.get(entry.category_id);if(!cat||cat.type!==entry.type||cat.archived)throw new ApiError(400,'INVALID_CATEGORY','请选择当前账本中对应类型的有效分类');}
 if(plan.entries.length){
  const matches=subscription
   ? await all(db,`SELECT ? AS item_id,e.occurred_on,e.id,e.note,e.version FROM entries e WHERE ${subscriptionOverlap}`,[batch.items[0].id,...overlapValues(ledger,batch.items[0],plan.entries)])
   : await all(db,`SELECT json_extract(candidate.value,'$.item_id') AS item_id,e.occurred_on,e.id,e.note,e.version FROM json_each(?) candidate JOIN entries e ON e.ledger_id=? AND e.occurred_on=json_extract(candidate.value,'$.occurred_on') AND e.amount_minor=json_extract(candidate.value,'$.amount_minor') AND e.type=json_extract(candidate.value,'$.type') WHERE e.deleted_at IS NULL`,[JSON.stringify(plan.entries),ledger]);
  const groups=new Map();for(const row of matches){const key=row.item_id+'|'+row.occurred_on;if(!groups.has(key))groups.set(key,{item_id:row.item_id,occurred_on:row.occurred_on,matches:[]});groups.get(key).matches.push({id:row.id,note:row.note,version:row.version});}
  for(const group of groups.values())group.matches.sort((a,b)=>a.id.localeCompare(b.id));duplicates.push(...[...groups.values()].sort((a,b)=>(a.item_id+'|'+a.occurred_on).localeCompare(b.item_id+'|'+b.occurred_on)));
 }
 const hash=await digest({id:batch.id,version:batch.version,items:batch.items,selectedIds,entries:plan.entries,duplicates,slots});
 return {...plan,duplicates,preview_hash:hash};
}
// A subscription can share its price with unrelated purchases. Compare its name
// and billed month, including manually entered purchases with a day.
const subscriptionOverlap="e.ledger_id=? AND e.deleted_at IS NULL AND e.type='expense' AND trim(e.note) IN (?,?) AND substr(e.occurred_on,1,7) IN (SELECT value FROM json_each(?))";
const overlapValues=(ledger,item,entries)=>[ledger,item.title,sourceTitle(item.title),JSON.stringify(entries.map(entry=>entry.occurred_on))];
const subscriptionInput=input.extend({
 items:textItemsSchema.refine(items=>items.length===1&&items[0].type==='expense'
   &&['monthly','yearly'].includes(items[0].cycle)&&items[0].date_precision==='month'
   &&items[0].selected&&items[0].category_id&&items[0].questions.length===0)
});
const confirmationFields={
 preview_hash:z.string().regex(/^[0-9a-f]{64}$/),
 acknowledge_duplicates:z.boolean().default(false)
};
async function confirmedEntries(db,ledger,batch,plan,now,guard){
 const ids=[],entryRows=[],slotRows=[];
 for(const candidate of plan.entries){
  const id=await digest(`${ledger}|${batch.id}|${candidate.item_id}|${candidate.occurred_on}`);
  ids.push(id);
  entryRows.push([ledger,id,candidate.type,candidate.amount_minor,candidate.category_id,candidate.occurred_on,candidate.note,1,now,now,null]);
  slotRows.push([ledger,batch.id,candidate.item_id,candidate.occurred_on,id]);
 }
 const writes=[
  ...jsonInsert(db,'entries',['ledger_id','id','type','amount_minor','category_id','occurred_on','note','version','created_at','updated_at','deleted_at'],entryRows,{condition:guard}),
  ...jsonInsert(db,'text_slots',['ledger_id','batch_id','item_id','occurred_on','entry_id'],slotRows,{condition:guard})
 ];
 const dates=plan.entries.map(entry=>entry.occurred_on).sort();
 return {writes,receipt:{id:batch.id,count:plan.count,expense_minor:plan.expense_minor,income_minor:plan.income_minor,entry_ids:ids,recorded_at:now,from:dates[0],to:dates.at(-1)}};
}
async function subscriptionPlan(c,value){
 const plan=await preview(c,{...value,id:'subscription-preview',version:1},null,true);
 if(!plan.count)throw new ApiError(400,'TEXT_INCOMPLETE',plan.rows[0]?.missing.join('；')||'这个范围内没有可确认的扣费月份');
 return plan;
}
async function validateHints(c,items){const cats=await all(c.env.DB,'SELECT id,type FROM categories WHERE ledger_id=?',[c.get('ledger').id]);const types=new Map(cats.map(cat=>[cat.id,cat.type]));for(const item of items)for(const id of item.category_hint?.recommended_ids||[])if(types.get(id)!==item.type)throw new ApiError(400,'INVALID_CATEGORY','分类建议须来自当前账本的同类型分类');}
export function registerTextRecords(app) {
 const slotSql='SELECT s.batch_id,s.item_id,s.occurred_on,s.entry_id,e.created_at,e.deleted_at,e.amount_minor,e.category_id,e.type,e.occurred_on AS current_occurred_on FROM text_slots s JOIN entries e ON e.ledger_id=s.ledger_id AND e.id=s.entry_id WHERE s.ledger_id=?';
 const enrich=(batch,slots)=>{const plan=compileDraftItems(batch.items,today(),slots);return {...batch,slots,progress:batchProgress(batch,slots),pending_count:plan.pending_count,due_count:batch.status==='paused'?0:plan.count};};
 app.get('/api/text-batches',async c=>{
  const ledger=c.get('ledger').id;
  const rows=await all(c.env.DB,`SELECT * FROM text_batches WHERE ledger_id=? ORDER BY updated_at DESC,id LIMIT ${TEXT_BATCH_LIMIT+1}`,[ledger]);
  if(rows.length>TEXT_BATCH_LIMIT)throw new ApiError(400,'TEXT_LIMIT','当前文字批次超过上限，请导出备份后整理');
  const byBatch=new Map();
  for(const slot of await all(c.env.DB,slotSql,[ledger])){const {batch_id,...record}=slot;if(!byBatch.has(batch_id))byBatch.set(batch_id,[]);byBatch.get(batch_id).push(record);}
  const batches=rows.map(row=>enrich(textBatchRow(row),byBatch.get(row.id)||[]));
  return c.json({...c.req.query('view')==='board'?{}:{batches},platforms:platformBoard(batches,await sourceRanges(c.env.DB,ledger)),reminder_count:batches.filter(b=>b.status!=='paused'&&(b.pending_count||b.due_count||b.status==='pending')).length});
 });
 app.patch('/api/text-batches/:id/spending-label',async c=>{
  const value=z.object({version,item_id:z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),spending_label:z.enum(['green','white','yellow','red']).nullable()}).strict().parse(await c.req.json());
  const batch=await getBatch(c),db=c.env.DB,ledger=c.get('ledger').id,item=batch.items.find(i=>i.id===value.item_id);
  if(!item||item.cycle==='single')throw new ApiError(400,'INVALID_SUBSCRIPTION','请选择有效订阅');
  const items=batch.items.map(i=>{if(i.id!==item.id)return i;const {spending_label,...rest}=i;return value.spending_label?{...rest,spending_label:value.spending_label}:rest;});
  const now=stamp();
  return c.json(await operation(db,c.get('user'),ledger,c.req.header('Idempotency-Key'),{route:'subscription-spending-label',id:batch.id,value},{version:value.version+1},[statement(db,'UPDATE text_batches SET items_json=?,version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=?',[JSON.stringify(items),now,ledger,batch.id,value.version])],{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,value.version]}));
 });
 app.get('/api/text-batches/:id',async c=>{const batch=await getBatch(c),slots=await all(c.env.DB,slotSql+' AND s.batch_id=?',[c.get('ledger').id,batch.id]);return c.json({batch:enrich(batch,slots.map(({batch_id,...slot})=>slot))});});
 app.post('/api/text-intakes',async c=>{
  const {segments,anchor_day}=z.object({anchor_day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(day=>validDate(day)&&day<=today()),segments:z.array(input).min(1).max(40)}).strict().parse(await c.req.json());
  if(segments.reduce((n,s)=>n+s.original_text.length,0)>50000||segments.reduce((n,s)=>n+s.items.length,0)>400)throw new ApiError(400,'TEXT_INTAKE_LIMIT','长段最多 50,000 字、400 项，原文不会截断');
  const db=c.env.DB,ledger=c.get('ledger').id,user=c.get('user');await validateHints(c,segments.flatMap(s=>s.items));
  const key=requiredOperationKey(c.req.header('Idempotency-Key'));
  // Content may describe a second real purchase. Only retries share an intent.
  const root=await digest({user:user.id,key,segments,anchor_day}),fingerprints=await Promise.all(segments.map((_,index)=>digest({root,index})));
  const existing=await all(db,`SELECT * FROM text_batches WHERE ledger_id=? AND fingerprint IN (${fingerprints.map(()=>'?').join(',')})`,[ledger,...fingerprints]);
  if(existing.length===segments.length){const map=new Map(existing.map(row=>[row.fingerprint,textBatchRow(row)]));return c.json({batches:fingerprints.map(f=>map.get(f)),repeated:true});}
  if(existing.length)throw new ApiError(409,'TEXT_INTAKE_CHANGED','部分草稿已变化，请从批次列表继续核对');
  const count=await first(db,'SELECT COUNT(*) AS n FROM text_batches WHERE ledger_id=?',[ledger]);if(count.n+segments.length>TEXT_BATCH_LIMIT)throw new ApiError(400,'TEXT_LIMIT',`还可保存 ${Math.max(0,TEXT_BATCH_LIMIT-count.n)} 批，本段需要 ${segments.length} 批；原文保留，请先导出整理`);
  const now=stamp(),batches=segments.map((s,index)=>({id:crypto.randomUUID(),...s,intake:{id:root,index,total:segments.length,anchor_day},status:'pending',version:1,created_at:now,updated_at:now}));
  const guard={sql:'EXISTS(SELECT 1 FROM operations WHERE user_id=? AND ledger_id=? AND key=?)',values:[user.id,ledger,key]};
  const writes=jsonInsert(db,'text_batches',['ledger_id','id','original_text','items_json','status','fingerprint','version','created_at','updated_at','intake_json'],batches.map((b,i)=>[ledger,b.id,b.original_text,JSON.stringify(b.items),b.status,fingerprints[i],1,now,now,JSON.stringify(b.intake)]),{condition:guard});
  const result=await operation(db,user,ledger,key,{route:'create-intake',segments,anchor_day},{batches,repeated:false},writes,{sql:'(SELECT COUNT(*) FROM text_batches WHERE ledger_id=?)<=?',values:[ledger,TEXT_BATCH_LIMIT-batches.length]});
  return c.json(result,201);
 });
 app.post('/api/text-batches',async c=>{
  const value=input.parse(await c.req.json()),db=c.env.DB,ledger=c.get('ledger').id;
  await validateHints(c,value.items);
  const key=requiredOperationKey(c.req.header('Idempotency-Key'));
  const fingerprint=await digest({route:'create-text',user:c.get('user').id,key,value});
  const existing=await first(db,'SELECT * FROM text_batches WHERE ledger_id=? AND fingerprint=?',[ledger,fingerprint]);
  if(existing)return c.json({batch:textBatchRow(existing),repeated:true});
  const count=await first(db,'SELECT COUNT(*) AS n FROM text_batches WHERE ledger_id=?',[ledger]);
  if(count.n>=TEXT_BATCH_LIMIT)throw new ApiError(400,'TEXT_LIMIT',`一个账本最多保留 ${TEXT_BATCH_LIMIT} 个文字批次，请先导出备份`);
  const now=stamp(),batch={id:crypto.randomUUID(),...value,status:'pending',version:1,created_at:now,updated_at:now};
  const result=await operation(db,c.get('user'),ledger,c.req.header('Idempotency-Key'),{route:'create-text',value},{batch},[statement(db,'INSERT INTO text_batches(ledger_id,id,original_text,items_json,status,fingerprint,version,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM operations WHERE user_id=? AND ledger_id=? AND key=?)',[ledger,batch.id,batch.original_text,JSON.stringify(batch.items),batch.status,fingerprint,1,now,now,c.get('user').id,ledger,c.req.header('Idempotency-Key')])],{sql:'(SELECT COUNT(*) FROM text_batches WHERE ledger_id=?)<?',values:[ledger,TEXT_BATCH_LIMIT]});
  return c.json(result,201);
 });
 app.patch('/api/text-batches/:id',async c=>{
  const value=input.extend({version}).parse(await c.req.json()),batch=await getBatch(c),db=c.env.DB,ledger=c.get('ledger').id;
  await validateHints(c,value.items);
  const locked=await all(db,'SELECT DISTINCT item_id FROM text_slots WHERE ledger_id=? AND batch_id=?',[ledger,batch.id]);
  if(locked.some(row=>canonical(batch.items.find(i=>i.id===row.item_id))!==canonical(value.items.find(i=>i.id===row.item_id))))throw new ApiError(409,'TEXT_LOCKED','已生成账目的规则字段不能修改；请暂停旧规则后建立新规则，未生成的项目仍可补全');
  const now=stamp();
  const result=await operation(db,c.get('user'),ledger,c.req.header('Idempotency-Key'),{route:'edit-text',id:batch.id,value},{batch:{...batch,...value,version:value.version+1,updated_at:now}},[statement(db,'UPDATE text_batches SET original_text=?,items_json=?,version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=?',[value.original_text,JSON.stringify(value.items),now,ledger,batch.id,value.version])],{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,value.version]});
  return c.json(result);
 });
 app.delete('/api/text-batches/:id',async c=>{
  const value=z.object({version}).strict().parse(await c.req.json()),db=c.env.DB,ledger=c.get('ledger').id,id=c.req.param('id'),key=c.req.header('Idempotency-Key'),requestValue={route:'delete-text',id,value};
  const prior=await first(db,'SELECT request_hash,response_json FROM operations WHERE user_id=? AND ledger_id=? AND key=?',[c.get('user').id,ledger,key||'']);
  if(prior){if(prior.request_hash!==await digest(requestValue))throw new ApiError(409,'KEY_REUSED','同一次提交内容已变化');return c.json(JSON.parse(prior.response_json));}
  await getBatch(c);
  const slot=await first(db,'SELECT 1 AS found FROM text_slots WHERE ledger_id=? AND batch_id=? LIMIT 1',[ledger,id]);
  if(slot)throw new ApiError(409,'TEXT_HAS_ENTRIES','此规则已生成账目，只能暂停；已有账目可在账单中修改或删除');
  return c.json(await operation(db,c.get('user'),ledger,key,requestValue,{id,deleted:true},[statement(db,'DELETE FROM text_batches WHERE ledger_id=? AND id=? AND version=? AND NOT EXISTS(SELECT 1 FROM text_slots WHERE ledger_id=? AND batch_id=?)',[ledger,id,value.version,ledger,id])],{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?) AND NOT EXISTS(SELECT 1 FROM text_slots WHERE ledger_id=? AND batch_id=?)',values:[ledger,id,value.version,ledger,id]}));
 });
 app.post('/api/subscriptions/preview',async c=>{
  const plan=await subscriptionPlan(c,subscriptionInput.parse(await c.req.json()));
  return c.json({count:plan.count,expense_minor:plan.expense_minor,preview_hash:plan.preview_hash,
   from:plan.entries[0].occurred_on,to:plan.entries.at(-1).occurred_on,
   overlap_months:[...new Set(plan.duplicates.map(row=>row.occurred_on.slice(0,7)))].sort()});
 });
 app.post('/api/subscriptions/confirm',async c=>{
  const {preview_hash,acknowledge_duplicates,...value}=subscriptionInput.extend(confirmationFields).parse(await c.req.json());
  const db=c.env.DB,user=c.get('user'),ledger=c.get('ledger').id,key=requiredOperationKey(c.req.header('Idempotency-Key'));
  const intent={route:'confirm-subscription',value,preview_hash,acknowledge_duplicates};
  const fingerprint=await digest(intent);
  const prior=await first(db,'SELECT request_hash,response_json FROM operations WHERE user_id=? AND ledger_id=? AND key=?',[user.id,ledger,key]);
  if(prior){
   if(prior.request_hash!==fingerprint)throw new ApiError(409,'KEY_REUSED','同一次提交内容已变化');
   return c.json(JSON.parse(prior.response_json));
  }
  const plan=await subscriptionPlan(c,value);
  if(plan.preview_hash!==preview_hash)throw new ApiError(409,'PREVIEW_CHANGED','账本或扣费月份已变化，请重新核对后确认');
  if(plan.duplicates.length&&!acknowledge_duplicates)throw new ApiError(409,'POSSIBLE_DUPLICATES','部分月份已有同名账目，请核对后明确确认这些是另外的扣费');
  const count=await first(db,'SELECT COUNT(*) AS n FROM text_batches WHERE ledger_id=?',[ledger]);
  if(count.n>=TEXT_BATCH_LIMIT)throw new ApiError(400,'TEXT_LIMIT',`一个账本最多保留 ${TEXT_BATCH_LIMIT} 个文字批次，请先导出备份`);
  const now=stamp(),batch={id:crypto.randomUUID(),...value,status:'active',version:1,created_at:now,updated_at:now};
  const guard={sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=?)',values:[ledger,batch.id]};
  const {writes,receipt}=await confirmedEntries(db,ledger,batch,plan,now,guard);
  const insert=jsonInsert(db,'text_batches',['ledger_id','id','original_text','items_json','status','fingerprint','version','created_at','updated_at'],
   [[ledger,batch.id,batch.original_text,JSON.stringify(batch.items),batch.status,await digest({user:user.id,key,fingerprint}),1,now,now]],
   {condition:{sql:'EXISTS(SELECT 1 FROM operations WHERE user_id=? AND ledger_id=? AND key=?)',values:[user.id,ledger,key]}});
  const condition={
   sql:`(SELECT COUNT(*) FROM text_batches WHERE ledger_id=?)<? AND EXISTS(SELECT 1 FROM categories WHERE ledger_id=? AND id=? AND type='expense' AND archived=0) AND (SELECT COUNT(*) FROM entries e WHERE ${subscriptionOverlap})=?`,
   values:[ledger,TEXT_BATCH_LIMIT,ledger,batch.items[0].category_id,...overlapValues(ledger,batch.items[0],plan.entries),plan.duplicates.reduce((sum,row)=>sum+row.matches.length,0)]
  };
  return c.json(await operation(db,user,ledger,key,intent,{...receipt,version:1},[...insert,...writes],condition));
 });
 app.post('/api/text-batches/:id/preview',async c=>{
  const body=z.object({item_ids:itemIds}).strict().parse(await c.req.json());
  return c.json(await preview(c,await getBatch(c),body.item_ids||null));
 });
 app.post('/api/text-batches/:id/confirm',async c=>{
  const body=z.object({version,...confirmationFields,item_ids:itemIds}).strict().parse(await c.req.json());
  const db=c.env.DB,ledger=c.get('ledger').id,id=c.req.param('id'),key=c.req.header('Idempotency-Key'),requestValue={route:'confirm-text',id,body};
  const prior=await first(db,'SELECT request_hash,response_json FROM operations WHERE user_id=? AND ledger_id=? AND key=?',[c.get('user').id,ledger,key||'']);
  if(prior){if(prior.request_hash!==await digest(requestValue))throw new ApiError(409,'KEY_REUSED','同一次提交内容已变化');return c.json(JSON.parse(prior.response_json));}
  const batch=await getBatch(c);
  if(batch.status==='paused')throw new ApiError(409,'TEXT_PAUSED','此批次已暂停，请先恢复');
  if(batch.version!==body.version)throw new ApiError(409,'VERSION_CONFLICT','此批次已在其他页面修改，请重新载入');
  const plan=await preview(c,batch,body.item_ids||null);
  if(plan.preview_hash!==body.preview_hash)throw new ApiError(409,'PREVIEW_CHANGED','候选内容或账本已变化，请重新查看条数和金额后确认');
  if(plan.duplicates.length&&!body.acknowledge_duplicates)throw new ApiError(409,'POSSIBLE_DUPLICATES','同日同额已有账目，请核对后明确确认这些是另一笔');
  if(!plan.count)throw new ApiError(400,'TEXT_INCOMPLETE','没有可确认的新账目；请补齐疑问，或继续保留待核对');
  const now=stamp();
  const guard={sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,body.version]};
  const {writes,receipt}=await confirmedEntries(db,ledger,batch,plan,now,guard);
  writes.push(statement(db,"UPDATE text_batches SET status='active',version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=?",[now,ledger,batch.id,body.version]));
  const result=await operation(db,c.get('user'),ledger,key,requestValue,{...receipt,version:body.version+1},writes,{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,body.version]});
  return c.json(result);
 });
 app.post('/api/text-batches/:id/status',async c=>{
  const value=z.object({version,status:z.enum(['paused','active'])}).strict().parse(await c.req.json()),batch=await getBatch(c),ledger=c.get('ledger').id,db=c.env.DB;
  return c.json(await operation(db,c.get('user'),ledger,c.req.header('Idempotency-Key'),{route:'status-text',id:batch.id,value},{id:batch.id,...value,version:value.version+1},[statement(db,'UPDATE text_batches SET status=?,version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=?',[value.status,stamp(),ledger,batch.id,value.version])],{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,value.version]}));
 });
}
