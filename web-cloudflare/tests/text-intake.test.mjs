import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTextIntake,compileTextItems} from '../shared/text-records.js';
import {textBatchSchema} from '../shared/text-schema.js';
import {validateBackup} from '../shared/domain.js';
import {demoBackup} from '../shared/demo.js';
const day='2026-10-13';
const cats=[{id:'child',name:'孩子',type:'expense',aliases:['小禾']},{id:'home',name:'家庭',type:'expense'},{id:'other',name:'其他',type:'expense'}];
const entries=n=>Array.from({length:n},()=>`绘本 0.01元`);
test('intake splits only complete items, retains every original character and global item order',()=>{
 const raw='  昨天，分类孩子，'+entries(41).join('；\n')+'。\n';const p=parseTextIntake(raw,day,cats);
 assert.equal(p.count,41);assert.deepEqual(p.segments.map(s=>s.items.length),[40,1]);assert.equal(p.segments.map(s=>s.original_text).join(''),raw);
 const last=p.segments[1].items[0];assert.equal(last.id,'item-41');assert.equal(last.occurred_on,'2026-10-12');assert.equal(last.category_id,'child');assert.ok(last.questions.some(q=>q.includes('日期沿用')));
});
test('explicit month and category switch carry across segment boundary; income does not inherit expense category',()=>{
 const raw='2026年9月，分类小禾，'+entries(40).join('；')+'；分类家庭，毛巾10元；收到工资100元';
 const p=parseTextIntake(raw,day,cats),items=p.segments.flatMap(s=>s.items);
 assert.equal(items[39].occurred_on,'2026-09');assert.equal(items[39].category_hint.name,'小禾');assert.equal(items[39].category_id,null);
 assert.equal(items[40].category_id,'home');assert.equal(items[40].occurred_on,'2026-09');assert.equal(items[41].type,'income');assert.equal(items[41].category_hint,undefined);
});
test('negation or correction blocks its preceding item, including a correction in the next segment',()=>{
 const p=parseTextIntake(entries(40).join('；')+'；上一笔改成2元',day);
 const prior=p.segments[0].items.at(-1);assert.ok(prior.questions.some(q=>q.includes('后文')));assert.equal(compileTextItems([prior],day).count,0);assert.equal(compileTextItems(p.segments[1].items,day).count,0);
});
test('relative date anchors once; unknown periods never silently inherit a previous exact day',()=>{
 const raw='昨天绘本1元；去年毛巾2元；咖啡3元';const p=parseTextIntake(raw,day);
 assert.equal(p.segments[0].items[0].occurred_on,'2026-10-12');assert.ok(p.segments[0].items[1].questions.some(q=>q.includes('日期范围')));assert.equal(p.segments[0].items[2].occurred_on,'2026-10');
});
test('long source over 10k segments without truncation, all limits fail explicitly',()=>{
 const raw=Array.from({length:80},()=>`合成${'长'.repeat(140)}0.01元`).join('；');const p=parseTextIntake(raw,day);assert.ok(raw.length>10000);assert.equal(p.segments.map(s=>s.original_text).join(''),raw);assert.ok(p.segments.every(s=>s.original_text.length<=10000&&s.items.length<=40));
 assert.throws(()=>parseTextIntake('字'.repeat(50001),day),/50,000/);assert.throws(()=>parseTextIntake(entries(401).join('；'),day),/400/);assert.throws(()=>parseTextIntake('字'.repeat(10001)+'1元',day),/某一项原文/);
});
test('backup v5 preserves intake anchor/order; older backup version rejects losing the context',()=>{
 const b=demoBackup();b.version=5;const p=parseTextIntake(entries(41).join('；'),day);const now='2026-10-13T00:00:00.000Z';b.text_batches=p.segments.map((s,index)=>({id:`batch-${index}`,...s,status:'pending',version:1,created_at:now,updated_at:now,intake:{id:'group',index,total:2,anchor_day:day}}));b.text_slots=[];
 assert.equal(validateBackup(b).valid,true);const corrupt=structuredClone(b);corrupt.text_batches[1].intake.index=0;assert.equal(validateBackup(corrupt).valid,false);corrupt.text_batches[1].intake.index=1;corrupt.text_batches[1].intake.anchor_day='2026-10-12';assert.equal(validateBackup(corrupt).valid,false);assert.equal(validateBackup({...b,version:4}).valid,false);assert.equal(textBatchSchema.safeParse({...b.text_batches[0],intake:{...b.text_batches[0].intake,index:2}}).success,false);
});

test('trailing recurring date details stay on the original item; a chosen platform owns untagged items',()=>{
 const p=parseTextIntake('合成服务每月0.01元，从2026年8月到2026年9月，每月15日扣款',day);assert.equal(p.count,1);assert.equal(p.segments[0].items[0].start_month,'2026-08');assert.equal(p.segments[0].items[0].through_month,'2026-09');assert.equal(p.segments[0].items[0].charge_day,15);
 const auto=parseTextIntake('京东 · 合成甲1元；合成乙2元',day);assert.equal(auto.segments[0].items[1].title,'京东 · 合成乙');const chosen=parseTextIntake('京东 · 合成甲1元；合成乙2元',day,null,{inheritPlatform:false});assert.equal(chosen.segments[0].items[1].title,'合成乙');
});
