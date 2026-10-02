import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTextRecords,compileTextItems} from '../shared/text-records.js';
import {textItemsSchema} from '../shared/text-schema.js';
const now='2026-10-02';
const rule=(extra={})=>({...parseTextRecords('从2025年11月开始，每月15日云服务68元，先记到2026年1月',now)[0],...extra,questions:[]});
test('unknown start, inclusive cutoff and unknown billing day are retained without expenses',()=>{
 const [item]=parseTextRecords('每个月有68元云服务，然后暂时先记到26年1月，可能25年几月开始我忘了',now);
 assert.equal(item.amount_minor,6800);assert.equal(item.start_month,null);assert.equal(item.through_month,'2026-01');assert.equal(item.charge_day,null);
 assert.equal(compileTextItems([item],now).count,0);assert.equal(compileTextItems([item],now).pending_count,1);
});
test('multiple priced clauses split; date carry requires acknowledgement rather than silently saving',()=>{
 const items=parseTextRecords('今天午餐35元，地铁6元；昨天收到工资12000元',now);
 assert.equal(items.length,3);assert.deepEqual(items.map(i=>i.amount_minor),[3500,600,1200000]);assert.equal(items[1].occurred_on,now);assert.ok(items[1].questions.length);assert.equal(items[2].type,'income');assert.equal(items[2].occurred_on,'2026-10-01');
});
test('calendar expansion shows three separate rows and exact cents',()=>{
 const plan=compileTextItems([rule()],now);assert.equal(plan.count,3);assert.equal(plan.expense_minor,20400);assert.deepEqual(plan.entries.map(e=>e.occurred_on),['2025-11-15','2025-12-15','2026-01-15']);
});
test('confirmed slots and deleted entries are never generated again',()=>{
 const slots=[{item_id:'item-1',occurred_on:'2025-11-15'}];assert.equal(compileTextItems([rule()],now,slots).count,2);
});
test('31st and leap day never roll to another month; explicit month-end policy is required',()=>{
 const item=rule({start_month:'2024-01',through_month:'2024-03',charge_day:31});assert.equal(compileTextItems([item],now).count,0);
 const p=compileTextItems([{...item,short_month:'last_day'}],now);assert.deepEqual(p.entries.map(e=>e.occurred_on),['2024-01-31','2024-02-29','2024-03-31']);
});
test('ongoing cycles include only elapsed dates; quarterly and yearly count whole occurrences',()=>{
 assert.equal(compileTextItems([rule({start_month:'2026-09',through_month:null,ongoing:true,charge_day:15})],now).count,1);
 assert.equal(compileTextItems([rule({cycle:'quarterly',start_month:'2025-01',through_month:'2026-01'})],now).count,5);
 assert.equal(compileTextItems([rule({cycle:'yearly',start_month:'2024-02',through_month:'2026-02',charge_day:29})],now).count,0);
});
test('invalid amounts, ambiguous multiple prices, currencies and modification requests stay pending',()=>{
 for(const t of ['今天午餐-35元','今天午餐0元','今天午餐1.234元','今天收入20美元','今天退款35元','每月从68改为80元'])assert.equal(compileTextItems(parseTextRecords(t,now),now).count,0,t);
 const item=rule({amount_minor:1.2});assert.throws(()=>textItemsSchema.parse([item]));
});
test('unknown single dates, unsupported weekly cycles, excessive expansion and invalid input remain explicit',()=>{
 assert.equal(compileTextItems(parseTextRecords('午餐35元',now),now).count,0);
 assert.equal(compileTextItems(parseTextRecords('每周云服务18元',now),now).count,0);
 assert.ok(compileTextItems([rule({start_month:'1900-01',through_month:'2026-01'})],now).rows[0].missing.length);
 assert.throws(()=>parseTextRecords('x'.repeat(10001),now));assert.throws(()=>parseTextRecords('',now));
});
