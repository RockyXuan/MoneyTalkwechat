import test from 'node:test';
import assert from 'node:assert/strict';
import { platformBoard } from '../shared/platform-board.js';
import { batchProgress } from '../shared/batch-progress.js';
import { batchSources, tagPlatformItems } from '../shared/platform-sources.js';
import { parseTextRecords } from '../shared/text-records.js';
const batch=(id,text,date='2026-09-01T00:00:00.000Z')=>({id,status:'pending',created_at:date,original_text:text,items:parseTextRecords(text,'2026-10-11'),slots:[]});
const saved=(i,date='2026-10-01T00:00:00.000Z',extra={})=>({item_id:i.id,occurred_on:i.occurred_on,created_at:date,entry_id:i.id,category_id:i.category_id,...extra});
test('platform board keeps six empty platforms; mixed sources split without changing original order',()=>{
 assert.equal(platformBoard([]).length,6);assert.ok(platformBoard([]).every(x=>!x.latest));
 const b=batch('mix','淘宝 · 合成首件1元；京东 · 合成物品2元；淘宝 · 合成尾件3元');b.slots=[saved(b.items[2])];
 const board=platformBoard([b]),tao=board.find(x=>x.source==='淘宝'),jd=board.find(x=>x.source==='京东');
 assert.equal(batchProgress(b).source,'混合来源');assert.equal(tao.latest.progress.total_items,2);assert.equal(tao.latest.progress.last_title,'合成尾件');assert.equal(tao.latest.progress.first_confirmed,'合成尾件');assert.equal(tao.latest.progress.next_title,'合成首件');assert.equal(tao.latest.progress.has_gaps,true);assert.equal(jd.latest.progress.confirmed_items,0);
 assert.deepEqual(b.items.map(i=>i.title),['淘宝 · 合成首件','京东 · 合成物品','淘宝 · 合成尾件']);
});
test('all batches survive grouping, latest recorded time and older unfinished resume are separate',()=>{
 const batches=Array.from({length:8},(_,n)=>batch(`b${n}`,`淘宝 · 合成物品${'甲乙丙丁戊己庚辛'[n]}1元`,`2026-09-${String(n+1).padStart(2,'0')}T00:00:00.000Z`));
 for(const b of batches.slice(1)){b.slots=[saved(b.items[0],b.created_at)];b.status='active';}
 const p=platformBoard(batches).find(x=>x.source==='淘宝');assert.equal(p.batches.length,8);assert.equal(p.latest.id,'b7');assert.equal(p.resume.id,'b0');assert.equal(p.review_batches,1);
});
test('deleted, skipped and paused records are honest, actual category follows edited entry',()=>{
 const b=batch('paused','微信 · 合成甲1元；微信 · 合成乙2元；微信 · 合成丙3元');b.status='paused';b.items[2].selected=false;b.slots=[saved(b.items[0],undefined,{category_id:'transport'}),saved(b.items[1],undefined,{deleted_at:'2026-10-02T00:00:00.000Z'})];
 const p=platformBoard([b]).find(x=>x.source==='微信').latest;assert.equal(p.status,'paused');assert.equal(p.progress.deleted_entries,1);assert.equal(p.progress.skipped_items,1);assert.equal(p.progress.last_title,'合成丙');assert.deepEqual(p.categories,[{id:'transport',count:1}]);
});
test('category labels cannot become platforms; ambiguous original source remains unknown',()=>{
 const b=batch('unknown','合成餐饮1元');b.items[0].title='孩子 · 合成餐饮';b.original_text='淘宝与京东比价后的口述';assert.equal(batchSources(b)[0].source,'口述记录');
 b.original_text='淘宝口述';assert.equal(batchSources(b)[0].source,'淘宝');
});
test('flat source choice persists through existing title contract, explicit other platform is preserved',()=>{
 const i=parseTextRecords('合成甲1元；京东 · 合成乙2元','2026-10-11');const tagged=tagPlatformItems(i,'淘宝');assert.equal(tagged[0].title,'淘宝 · 合成甲');assert.equal(tagged[1].title,'京东 · 合成乙');assert.equal(i[0].title,'合成甲');
 assert.throws(()=>tagPlatformItems([{title:'长'.repeat(80)}],'淘宝'),/超过 80/);
});

test('one spoken intake spans drafts but platform range and exact next draft remain continuous',async()=>{
 const {parseTextIntake}=await import('../shared/text-records.js');const p=parseTextIntake(Array.from({length:41},(_,i)=>`淘宝 · 合成${String.fromCharCode(0x4e00+i)}0.01元`).join('；'),'2026-10-13');const now='2026-10-13T00:00:00.000Z';const batches=p.segments.map((s,index)=>({id:`part-${index}`,...s,status:'pending',created_at:now,intake:{id:'spoken-group',index,total:2,anchor_day:'2026-10-13'},slots:[]}));
 let board=platformBoard([...batches].reverse()).find(g=>g.source==='淘宝');assert.equal(board.batches.length,1);assert.equal(board.latest.progress.total_items,41);assert.equal(board.resume.id,'part-0');assert.equal(board.latest.progress.first_title,'合成一');assert.equal(board.latest.progress.last_title,'合成丨');
 batches[0].slots=batches[0].items.map(i=>({item_id:i.id,entry_id:`saved-${i.id}`,occurred_on:i.occurred_on,created_at:now,category_id:'food'}));batches[0].status='active';board=platformBoard(batches).find(g=>g.source==='淘宝');assert.equal(board.resume.id,'part-1');assert.equal(board.latest.progress.continuous_items,40);assert.equal(board.latest.progress.next_title,'合成丨');
});
