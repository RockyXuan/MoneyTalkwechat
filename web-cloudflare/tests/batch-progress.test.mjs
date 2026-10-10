import test from 'node:test';
import assert from 'node:assert/strict';
import { batchProgress } from '../shared/batch-progress.js';
import { validRecordDate, recordDateLabel, recordRange } from '../shared/format.js';
const batch={original_text:'合成购物记录',items:['甲','乙','丙'].map((title,n)=>({id:`item-${n}`,title:`淘宝 · ${title}`,selected:true}))};
test('purchase order persists through out-of-order confirmation and deletion',()=>{
 let p=batchProgress(batch,[{item_id:'item-2',created_at:'2026-10-10T01:00:00.000Z'}]);
 assert.equal(p.first_title,'甲');assert.equal(p.last_title,'丙');assert.equal(p.confirmed_items,1);assert.equal(p.continuous_items,0);assert.equal(p.next_title,'甲');assert.equal(p.has_gaps,true);
 p=batchProgress(batch,[{item_id:'item-0',created_at:'2026-10-10T02:00:00.000Z'},{item_id:'item-2',deleted_at:'2026-10-10T03:00:00.000Z',created_at:'2026-10-10T01:00:00.000Z'}]);
 assert.equal(p.continue_after,'甲');assert.equal(p.next_title,'乙');assert.equal(p.deleted_entries,1);assert.equal(p.recorded_at,'2026-10-10T02:00:00.000Z');
 p=batchProgress({...batch,items:batch.items.map((i,n)=>({...i,selected:n!==1}))},[{item_id:'item-0'},{item_id:'item-2'}]);assert.equal(p.next_title,null);assert.equal(p.skipped_items,1);
});
test('month precision is actual data and range expansion is only for querying',()=>{
 for(const date of ['2026-00','2026-13','2026-02-30','2026-1','1899-12'])assert.equal(validRecordDate(date),false,date);
 assert.equal(validRecordDate('2026-10'),true);assert.equal(recordDateLabel('2026-10'),'2026年10月 · 日期未指定');
 assert.deepEqual(recordRange('2024-02'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(recordRange('2026-09','2026-10-09'),{from:'2026-09-01',to:'2026-10-09'});
});
