import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionItem,subscriptionRows,recordedExpense} from '../shared/subscriptions.js';
import {compileDraftItems} from '../shared/text-records.js';
const input={title:'合成月卡',amount:'30',cycle:'monthly',source:'崩坏星穹铁道',category:'entertainment',start:'2024-01',end:'2025-12'};
test('two years monthly and annual historical subscriptions keep exact months and integer totals',()=>{
 const item=subscriptionItem(input),plan=compileDraftItems([item],'2026-11-17');assert.equal(plan.count,24);assert.equal(plan.expense_minor,72000);assert.equal(plan.entries[0].occurred_on,'2024-01');assert.equal(plan.entries.at(-1).occurred_on,'2025-12');assert.ok(item.title.startsWith('崩坏星穹铁道'));
 const annual=compileDraftItems([subscriptionItem({...input,cycle:'yearly',amount:'198'})],'2026-11-17');assert.equal(annual.count,2);assert.deepEqual(annual.entries.map(e=>e.occurred_on),['2024-01','2025-01']);
});
test('invalid history, missing amount and excessive ranges are rejected; known slots never regenerate',()=>{
 for(const v of [{...input,amount:'0'},{...input,amount:''},{...input,start:'2025-13'},{...input,start:'2026-01'},{...input,cycle:'weekly'},{...input,start:'1900-01'}])assert.throws(()=>subscriptionItem(v));
 const item=subscriptionItem(input),slots=compileDraftItems([item],'2026-11-17').entries.map((e,i)=>({...e,entry_id:`e${i}`,current_occurred_on:e.occurred_on,deleted_at:i===0?'2026-01-01':null}));
 const b={id:'sub-batch',status:'active',items:[item],original_text:item.raw,slots};const row=subscriptionRows([b],'2026-11-17')[0];assert.equal(row.confirmed,23);assert.equal(row.deleted,1);assert.equal(row.due,0);assert.equal(row.status,'有删除记录');assert.equal(subscriptionRows([{...b,status:'paused'}],'2026-11-17')[0].status,'已暂停');
});
test('future periods remain unbooked and rule date uncertainty remains visible',()=>{
 const unclassified=subscriptionItem({...input,category:''});assert.equal(unclassified.category_id,null);
 const item={...subscriptionItem(input),through_month:'2027-12'};assert.ok(compileDraftItems([item],'2026-11-17').entries.every(e=>e.occurred_on<='2026-11'));
 const row=subscriptionRows([{id:'unknown',status:'pending',items:[{...item,start_month:null,questions:['起始月未知']}],original_text:item.raw,slots:[]}],'2026-11-17')[0];assert.equal(row.status,'待补全');assert.equal(row.due,0);
});
test('ongoing subscription needs no end, computes inclusive months and continues beyond 120 already-recorded months',()=>{
 const i=subscriptionItem({...input,start:'2025-11',status:'ongoing',end:''});assert.equal(i.through_month,null);assert.equal(i.auto_record,true);assert.equal(compileDraftItems([i],'2026-11-17').count,13);
 const long={...i,start_month:'2015-01'};const slots=[];for(let y=2015;y<=2024;y++)for(let m=1;m<=12;m++)slots.push({item_id:i.id,occurred_on:`${y}-${String(m).padStart(2,'0')}`});assert.equal(compileDraftItems([long],'2025-01-05',slots).count,1);
});

test('recorded subscription totals use live entry amounts and exclude deleted and income entries',()=>{
 const slots=[{amount_minor:6800,type:'expense'},{amount_minor:5000,type:'expense'},{amount_minor:6800,type:'expense',deleted_at:'2026-01-01'},{amount_minor:300,type:'income'}];
 assert.equal(recordedExpense(slots),11800);assert.equal(recordedExpense([]),0);assert.equal(recordedExpense([{type:'expense'}]),null);
});
