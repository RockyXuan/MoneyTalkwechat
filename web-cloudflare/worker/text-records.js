import { TEXT_BATCH_LIMIT } from '../shared/text-limits.js';
import { jsonInsert } from './json-insert.js';
import { z } from 'zod';
import { textItemsSchema } from '../shared/text-schema.js';
import { compileTextItems } from '../shared/text-records.js';
import { today, digest, canonical, validDate } from '../shared/format.js';
import { all, first, statement, operation, stamp } from './store.js';
import { ApiError } from './auth.js';
import { batchProgress } from '../shared/batch-progress.js';
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
async function preview(c,batch,selectedIds=null) {
 const ledger=c.get('ledger').id,db=c.env.DB;
 const slots=await all(db,'SELECT item_id,occurred_on,entry_id FROM text_slots WHERE ledger_id=? AND batch_id=?',[ledger,batch.id]);
 if(selectedIds?.some(id=>!batch.items.some(i=>i.id===id&&i.selected)))throw new ApiError(400,'TEXT_ITEM_INVALID','所选项目不存在或未勾选');
 const plan=compileTextItems(selectedIds?batch.items.filter(i=>selectedIds.includes(i.id)):batch.items,today(),slots),duplicates=[];
 const cats=await all(db,'SELECT id,type,archived FROM categories WHERE ledger_id=?',[ledger]);
 const categoryMap=new Map(cats.map(cat=>[cat.id,cat]));
 for(const entry of plan.entries){const cat=categoryMap.get(entry.category_id);if(!cat||cat.type!==entry.type||cat.archived)throw new ApiError(400,'INVALID_CATEGORY','请选择当前账本中对应类型的有效分类');}
 if(plan.entries.length){
  const matches=await all(db,`SELECT json_extract(candidate.value,'$.item_id') AS item_id,e.occurred_on,e.id,e.note,e.version FROM json_each(?) candidate JOIN entries e ON e.ledger_id=? AND e.occurred_on=json_extract(candidate.value,'$.occurred_on') AND e.amount_minor=json_extract(candidate.value,'$.amount_minor') AND e.type=json_extract(candidate.value,'$.type') WHERE e.deleted_at IS NULL`,[JSON.stringify(plan.entries),ledger]);
  const groups=new Map();for(const row of matches){const key=row.item_id+'|'+row.occurred_on;if(!groups.has(key))groups.set(key,{item_id:row.item_id,occurred_on:row.occurred_on,matches:[]});groups.get(key).matches.push({id:row.id,note:row.note,version:row.version});}
  for(const group of groups.values())group.matches.sort((a,b)=>a.id.localeCompare(b.id));duplicates.push(...[...groups.values()].sort((a,b)=>(a.item_id+'|'+a.occurred_on).localeCompare(b.item_id+'|'+b.occurred_on)));
 }
 const hash=await digest({id:batch.id,version:batch.version,items:batch.items,selectedIds,entries:plan.entries,duplicates,slots});
 return {...plan,duplicates,preview_hash:hash};
}
async function validateHints(c,items){const cats=await all(c.env.DB,'SELECT id,type FROM categories WHERE ledger_id=?',[c.get('ledger').id]);const types=new Map(cats.map(cat=>[cat.id,cat.type]));for(const item of items)for(const id of item.category_hint?.recommended_ids||[])if(types.get(id)!==item.type)throw new ApiError(400,'INVALID_CATEGORY','分类建议须来自当前账本的同类型分类');}
export function registerTextRecords(app) {
 const slotSql='SELECT s.batch_id,s.item_id,s.occurred_on,s.entry_id,e.created_at,e.deleted_at,e.amount_minor,e.category_id,e.type,e.occurred_on AS current_occurred_on FROM text_slots s JOIN entries e ON e.ledger_id=s.ledger_id AND e.id=s.entry_id WHERE s.ledger_id=?';
 const enrich=(batch,slots)=>{const plan=compileTextItems(batch.items,today(),slots);return {...batch,slots,progress:batchProgress(batch,slots),pending_count:plan.pending_count,due_count:batch.status==='paused'?0:plan.count};};
 app.get('/api/text-batches',async c=>{
  const ledger=c.get('ledger').id;
  const rows=await all(c.env.DB,`SELECT * FROM text_batches WHERE ledger_id=? ORDER BY updated_at DESC,id LIMIT ${TEXT_BATCH_LIMIT+1}`,[ledger]);
  if(rows.length>TEXT_BATCH_LIMIT)throw new ApiError(400,'TEXT_LIMIT','当前文字批次超过上限，请导出备份后整理');
  const byBatch=new Map();
  for(const slot of await all(c.env.DB,slotSql,[ledger])){const {batch_id,...record}=slot;if(!byBatch.has(batch_id))byBatch.set(batch_id,[]);byBatch.get(batch_id).push(record);}
  const batches=rows.map(row=>enrich(textBatchRow(row),byBatch.get(row.id)||[]));
  return c.json({...c.req.query('view')==='board'?{}:{batches},platforms:platformBoard(batches),reminder_count:batches.filter(b=>b.status!=='paused'&&(b.pending_count||b.due_count||b.status==='pending')).length});
 });
 app.get('/api/text-batches/:id',async c=>{const batch=await getBatch(c),slots=await all(c.env.DB,slotSql+' AND s.batch_id=?',[c.get('ledger').id,batch.id]);return c.json({batch:enrich(batch,slots.map(({batch_id,...slot})=>slot))});});
 app.post('/api/text-intakes',async c=>{
  const {segments,anchor_day}=z.object({anchor_day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(day=>validDate(day)&&day<=today()),segments:z.array(input).min(1).max(40)}).strict().parse(await c.req.json());
  if(segments.reduce((n,s)=>n+s.original_text.length,0)>50000||segments.reduce((n,s)=>n+s.items.length,0)>400)throw new ApiError(400,'TEXT_INTAKE_LIMIT','长段最多 50,000 字、400 项，原文不会截断');
  const db=c.env.DB,ledger=c.get('ledger').id,user=c.get('user');await validateHints(c,segments.flatMap(s=>s.items));
  const root=await digest({segments,anchor_day}),fingerprints=await Promise.all(segments.map((_,index)=>digest({root,index})));
  const existing=await all(db,`SELECT * FROM text_batches WHERE ledger_id=? AND fingerprint IN (${fingerprints.map(()=>'?').join(',')})`,[ledger,...fingerprints]);
  if(existing.length===segments.length){const map=new Map(existing.map(row=>[row.fingerprint,textBatchRow(row)]));return c.json({batches:fingerprints.map(f=>map.get(f)),repeated:true});}
  if(existing.length)throw new ApiError(409,'TEXT_INTAKE_CHANGED','部分草稿已变化，请从批次列表继续核对');
  const count=await first(db,'SELECT COUNT(*) AS n FROM text_batches WHERE ledger_id=?',[ledger]);if(count.n+segments.length>TEXT_BATCH_LIMIT)throw new ApiError(400,'TEXT_LIMIT',`还可保存 ${Math.max(0,TEXT_BATCH_LIMIT-count.n)} 批，本段需要 ${segments.length} 批；原文保留，请先导出整理`);
  const now=stamp(),batches=segments.map((s,index)=>({id:crypto.randomUUID(),...s,intake:{id:root,index,total:segments.length,anchor_day},status:'pending',version:1,created_at:now,updated_at:now}));
  const key=c.req.header('Idempotency-Key'),guard={sql:'EXISTS(SELECT 1 FROM operations WHERE user_id=? AND ledger_id=? AND key=?)',values:[user.id,ledger,key]};
  const writes=jsonInsert(db,'text_batches',['ledger_id','id','original_text','items_json','status','fingerprint','version','created_at','updated_at','intake_json'],batches.map((b,i)=>[ledger,b.id,b.original_text,JSON.stringify(b.items),b.status,fingerprints[i],1,now,now,JSON.stringify(b.intake)]),{condition:guard});
  const result=await operation(db,user,ledger,key,{route:'create-intake',segments,anchor_day},{batches,repeated:false},writes,{sql:'(SELECT COUNT(*) FROM text_batches WHERE ledger_id=?)<=?',values:[ledger,TEXT_BATCH_LIMIT-batches.length]});
  return c.json(result,201);
 });
 app.post('/api/text-batches',async c=>{
  const value=input.parse(await c.req.json()),db=c.env.DB,ledger=c.get('ledger').id;
  await validateHints(c,value.items);
  const fingerprint=await digest({original_text:value.original_text,items:value.items.map(({id,...i})=>i)});
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
 app.post('/api/text-batches/:id/preview',async c=>{
  const body=z.object({item_ids:itemIds}).strict().parse(await c.req.json());
  return c.json(await preview(c,await getBatch(c),body.item_ids||null));
 });
 app.post('/api/text-batches/:id/confirm',async c=>{
  const body=z.object({version,preview_hash:z.string().regex(/^[0-9a-f]{64}$/),acknowledge_duplicates:z.boolean().default(false),item_ids:itemIds}).strict().parse(await c.req.json());
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
  const now=stamp(),writes=[],ids=[];
  const entryRows=[],slotRows=[];
  for(const candidate of plan.entries){const id=await digest(`${ledger}|${batch.id}|${candidate.item_id}|${candidate.occurred_on}`);ids.push(id);entryRows.push([ledger,id,candidate.type,candidate.amount_minor,candidate.category_id,candidate.occurred_on,candidate.note,1,now,now,null]);slotRows.push([ledger,batch.id,candidate.item_id,candidate.occurred_on,id]);}
  const guard={sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,body.version]};
  writes.push(...jsonInsert(db,'entries',['ledger_id','id','type','amount_minor','category_id','occurred_on','note','version','created_at','updated_at','deleted_at'],entryRows,{condition:guard}),...jsonInsert(db,'text_slots',['ledger_id','batch_id','item_id','occurred_on','entry_id'],slotRows,{condition:guard}));
  writes.push(statement(db,"UPDATE text_batches SET status='active',version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=?",[now,ledger,batch.id,body.version]));
  const result=await operation(db,c.get('user'),ledger,key,requestValue,{id:batch.id,count:plan.count,expense_minor:plan.expense_minor,income_minor:plan.income_minor,entry_ids:ids,recorded_at:now,from:plan.entries.map(e=>e.occurred_on).sort()[0],to:plan.entries.map(e=>e.occurred_on).sort().at(-1),version:body.version+1},writes,{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,body.version]});
  return c.json(result);
 });
 app.post('/api/text-batches/:id/status',async c=>{
  const value=z.object({version,status:z.enum(['paused','active'])}).strict().parse(await c.req.json()),batch=await getBatch(c),ledger=c.get('ledger').id,db=c.env.DB;
  return c.json(await operation(db,c.get('user'),ledger,c.req.header('Idempotency-Key'),{route:'status-text',id:batch.id,value},{id:batch.id,...value,version:value.version+1},[statement(db,'UPDATE text_batches SET status=?,version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=?',[value.status,stamp(),ledger,batch.id,value.version])],{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,value.version]}));
 });
}
