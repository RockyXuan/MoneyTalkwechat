import { z } from 'zod';
import { textItemsSchema } from '../shared/text-schema.js';
import { compileTextItems } from '../shared/text-records.js';
import { today, digest, canonical } from '../shared/format.js';
import { all, first, statement, operation, validateCategory, stamp } from './store.js';
import { ApiError } from './auth.js';
const input=z.object({original_text:z.string().trim().min(1).max(10000),items:textItemsSchema}).strict();
const version=z.number().int().min(1);
export function textBatchRow(row) {const {ledger_id,fingerprint,items_json,...batch}=row;return {...batch,items:JSON.parse(items_json)};}
export const batchInsert=(db,ledger,b,fingerprint)=>statement(db,'INSERT INTO text_batches(ledger_id,id,original_text,items_json,status,fingerprint,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',[ledger,b.id,b.original_text,JSON.stringify(b.items),b.status,fingerprint,b.version,b.created_at,b.updated_at]);
async function getBatch(c) {
 const row=await first(c.env.DB,'SELECT * FROM text_batches WHERE ledger_id=? AND id=?',[c.get('ledger').id,c.req.param('id')]);
 if(!row)throw new ApiError(404,'TEXT_NOT_FOUND','文字记录不存在或无权访问');
 return textBatchRow(row);
}
async function preview(c,batch) {
 const ledger=c.get('ledger').id,db=c.env.DB;
 const slots=await all(db,'SELECT item_id,occurred_on,entry_id FROM text_slots WHERE ledger_id=? AND batch_id=?',[ledger,batch.id]);
 const plan=compileTextItems(batch.items,today(),slots),duplicates=[];
 for(const e of plan.entries){
  await validateCategory(db,ledger,e);
  const matches=await all(db,'SELECT id,note,version FROM entries WHERE ledger_id=? AND occurred_on=? AND amount_minor=? AND type=? AND deleted_at IS NULL',[ledger,e.occurred_on,e.amount_minor,e.type]);
  if(matches.length)duplicates.push({item_id:e.item_id,occurred_on:e.occurred_on,matches});
 }
 const hash=await digest({id:batch.id,version:batch.version,items:batch.items,entries:plan.entries,duplicates,slots});
 return {...plan,duplicates,preview_hash:hash};
}
export function registerTextRecords(app) {
 app.get('/api/text-batches',async c=>{
  const rows=await all(c.env.DB,'SELECT * FROM text_batches WHERE ledger_id=? ORDER BY updated_at DESC,id LIMIT 101',[c.get('ledger').id]);
  if(rows.length>100)throw new ApiError(400,'TEXT_LIMIT','当前文字批次超过上限，请导出备份后整理');
  const batches=[];
  for(const row of rows){const batch=textBatchRow(row);const slots=await all(c.env.DB,'SELECT item_id,occurred_on,entry_id FROM text_slots WHERE ledger_id=? AND batch_id=?',[c.get('ledger').id,batch.id]);const plan=compileTextItems(batch.items,today(),slots);batches.push({...batch,slots,pending_count:plan.pending_count,due_count:batch.status==='active'?plan.count:0});}
  return c.json({batches,reminder_count:batches.filter(b=>b.status!=='paused'&&(b.pending_count||b.due_count||b.status==='pending')).length});
 });
 app.post('/api/text-batches',async c=>{
  const value=input.parse(await c.req.json()),db=c.env.DB,ledger=c.get('ledger').id;
  const fingerprint=await digest({original_text:value.original_text,items:value.items.map(({id,...i})=>i)});
  const existing=await first(db,'SELECT * FROM text_batches WHERE ledger_id=? AND fingerprint=?',[ledger,fingerprint]);
  if(existing)return c.json({batch:textBatchRow(existing),repeated:true});
  const count=await first(db,'SELECT COUNT(*) AS n FROM text_batches WHERE ledger_id=?',[ledger]);
  if(count.n>=100)throw new ApiError(400,'TEXT_LIMIT','一个账本最多保留 100 个文字批次，请先整理');
  const now=stamp(),batch={id:crypto.randomUUID(),...value,status:'pending',version:1,created_at:now,updated_at:now};
  const result=await operation(db,c.get('user'),ledger,c.req.header('Idempotency-Key'),{route:'create-text',value},{batch},[batchInsert(db,ledger,batch,fingerprint)]);
  return c.json(result,201);
 });
 app.patch('/api/text-batches/:id',async c=>{
  const value=input.extend({version}).parse(await c.req.json()),batch=await getBatch(c),db=c.env.DB,ledger=c.get('ledger').id;
  const locked=await all(db,'SELECT DISTINCT item_id FROM text_slots WHERE ledger_id=? AND batch_id=?',[ledger,batch.id]);
  if(locked.some(row=>canonical(batch.items.find(i=>i.id===row.item_id))!==canonical(value.items.find(i=>i.id===row.item_id))))throw new ApiError(409,'TEXT_LOCKED','已生成账目的规则字段不能修改；请暂停旧规则后建立新规则，未生成的项目仍可补全');
  const now=stamp();
  const result=await operation(db,c.get('user'),ledger,c.req.header('Idempotency-Key'),{route:'edit-text',id:batch.id,value},{batch:{...batch,...value,version:value.version+1,updated_at:now}},[statement(db,'UPDATE text_batches SET original_text=?,items_json=?,version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=?',[value.original_text,JSON.stringify(value.items),now,ledger,batch.id,value.version])],{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,value.version]});
  return c.json(result);
 });
 app.post('/api/text-batches/:id/preview',async c=>c.json(await preview(c,await getBatch(c))));
 app.post('/api/text-batches/:id/confirm',async c=>{
  const body=z.object({version,preview_hash:z.string().regex(/^[0-9a-f]{64}$/),acknowledge_duplicates:z.boolean().default(false)}).strict().parse(await c.req.json());
  const db=c.env.DB,ledger=c.get('ledger').id,id=c.req.param('id'),key=c.req.header('Idempotency-Key'),requestValue={route:'confirm-text',id,body};
  const prior=await first(db,'SELECT request_hash,response_json FROM operations WHERE user_id=? AND ledger_id=? AND key=?',[c.get('user').id,ledger,key||'']);
  if(prior){if(prior.request_hash!==await digest(requestValue))throw new ApiError(409,'KEY_REUSED','同一次提交内容已变化');return c.json(JSON.parse(prior.response_json));}
  const batch=await getBatch(c);
  if(batch.status==='paused')throw new ApiError(409,'TEXT_PAUSED','此批次已暂停，请先恢复');
  if(batch.version!==body.version)throw new ApiError(409,'VERSION_CONFLICT','此批次已在其他页面修改，请重新载入');
  const plan=await preview(c,batch);
  if(plan.preview_hash!==body.preview_hash)throw new ApiError(409,'PREVIEW_CHANGED','候选内容或账本已变化，请重新查看条数和金额后确认');
  if(plan.duplicates.length&&!body.acknowledge_duplicates)throw new ApiError(409,'POSSIBLE_DUPLICATES','同日同额已有账目，请核对后明确确认这些是另一笔');
  if(!plan.count)throw new ApiError(400,'TEXT_INCOMPLETE','没有可确认的新账目；请补齐疑问，或继续保留待核对');
  const now=stamp(),writes=[],ids=[];
  for(const candidate of plan.entries){const entry={...candidate,id:await digest(`${ledger}|${batch.id}|${candidate.item_id}|${candidate.occurred_on}`),version:1,created_at:now,updated_at:now,deleted_at:null};ids.push(entry.id);writes.push(statement(db,'INSERT INTO entries(ledger_id,id,type,amount_minor,category_id,occurred_on,note,version,created_at,updated_at,deleted_at) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',[ledger,entry.id,entry.type,entry.amount_minor,entry.category_id,entry.occurred_on,entry.note,entry.version,entry.created_at,entry.updated_at,null,ledger,batch.id,body.version]),statement(db,'INSERT INTO text_slots(ledger_id,batch_id,item_id,occurred_on,entry_id) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',[ledger,batch.id,candidate.item_id,candidate.occurred_on,entry.id,ledger,batch.id,body.version]));}
  writes.push(statement(db,"UPDATE text_batches SET status='active',version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=?",[now,ledger,batch.id,body.version]));
  const result=await operation(db,c.get('user'),ledger,key,requestValue,{id:batch.id,count:plan.count,expense_minor:plan.expense_minor,income_minor:plan.income_minor,entry_ids:ids,version:body.version+1},writes,{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,body.version]});
  return c.json(result);
 });
 app.post('/api/text-batches/:id/status',async c=>{
  const value=z.object({version,status:z.enum(['paused','active'])}).strict().parse(await c.req.json()),batch=await getBatch(c),ledger=c.get('ledger').id,db=c.env.DB;
  return c.json(await operation(db,c.get('user'),ledger,c.req.header('Idempotency-Key'),{route:'status-text',id:batch.id,value},{id:batch.id,...value,version:value.version+1},[statement(db,'UPDATE text_batches SET status=?,version=version+1,updated_at=? WHERE ledger_id=? AND id=? AND version=?',[value.status,stamp(),ledger,batch.id,value.version])],{sql:'EXISTS(SELECT 1 FROM text_batches WHERE ledger_id=? AND id=? AND version=?)',values:[ledger,batch.id,value.version]}));
 });
}
