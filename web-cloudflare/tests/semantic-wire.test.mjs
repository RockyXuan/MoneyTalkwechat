import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticContext } from '../shared/semantic-proposal.js';
import { compactMessages, validateCompactProposal } from '../shared/semantic-wire.js';
import { evaluationRequest, COMPARISON_MODEL } from '../scripts/semantic-evaluation.mjs';
import { auditProposal, audits, goldenSuite, replayEvidence, buildCoreReport } from '../scripts/semantic-audit.mjs';
import { readFileSync } from 'node:fs';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const context=semanticContext('购物：杯子10元。', '2026-10-13', goldenSuite.categories);
const item={title:'杯子',type:'expense',source:null,currency:'CNY',evidence:[{quote:'杯子10元',occurrence:0}],
 amount:{method:'exact',terms:[{value:'10',evidence:{quote:'10元',occurrence:0}}]},category:{id:'shopping'}};
const wire=()=>({version:2,complete:true,items:[structuredClone(item)],ignored:[]});

test('compact output generates only identities and structural defaults, with unchanged money/reference/category guards',()=>{
 const p=validateCompactProposal(wire(),context);
 assert.equal(p.items[0].id,'p1');assert.equal(p.items[0].amount_minor,1000);assert.equal(p.items[0].occurred_on,'2026-10');
 assert.equal(p.items[0].recurrence.cycle,'single');assert.equal(p.saved_entries,0);
 for(const change of [i=>i.amount.terms[0].value='20',i=>i.evidence[0].quote='不存在',i=>i.category.id='unknown',i=>i.id='model-id']){
  const w=wire();change(w.items[0]);assert.throws(()=>validateCompactProposal(w,context));
 }
 const w=wire();w.complete=false;assert.throws(()=>validateCompactProposal(w,context));
});
test('compact unknown amount and explicit unknown category never gain guessed defaults',()=>{
 const w=wire();w.items[0].amount={method:'unknown',terms:[]};w.items[0].category={id:null,suggested_name:'小禾',alternatives:['kids']};
 const p=validateCompactProposal(w,context);assert.equal(p.items[0].amount_minor,null);assert.equal(p.items[0].category.id,null);
 assert.equal(p.items[0].category.suggested_name,'小禾');assert.ok(p.items[0].questions.includes('金额待确认'));
 w.items[0].amount.terms.push({value:'10',evidence:{quote:'10元',occurrence:0}});assert.throws(()=>validateCompactProposal(w,context));
});
test('compact recurring start remains unknown; false totals and invented dates still fail',()=>{
 const c=semanticContext('存储每月10，起始月忘了，只补到2025年12月。','2026-10-13',goldenSuite.categories);
 const w=wire();w.items[0].evidence=[{quote:'存储每月10',occurrence:0}];w.items[0].amount.terms[0].evidence={quote:'10',occurrence:0};
 w.items[0].recurrence={cycle:'monthly',start_month:null,through_month:'2025-12',ongoing:false,charge_day:null,evidence:[{quote:'存储每月10，起始月忘了，只补到2025年12月',occurrence:0}]};
 const p=validateCompactProposal(w,c);assert.equal(p.items[0].recurrence.start_month,null);assert.ok(p.items[0].questions.includes('起始月待确认'));
 w.items[0].amount.stated_total='12';assert.throws(()=>validateCompactProposal(w,c));delete w.items[0].amount.stated_total;
 w.items[0].date={kind:'unknown',value:'2025-01',evidence:[]};assert.throws(()=>validateCompactProposal(w,c));
});
test('compact requests are independently versioned, keep all source text and never include test answers',()=>{
 const f=goldenSuite.cases[10],r=evaluationRequest(f,goldenSuite,'synthetic-free-v5',COMPARISON_MODEL);
 assert.equal(r.body.max_completion_tokens,3072);assert.equal(r.body.store,false);
 assert.equal(JSON.parse(r.body.messages[1].content).raw,f.raw);assert.ok(r.body.messages[0].content.includes('换平台不等于换月份'));
 assert.ok(r.body.messages[0].content.includes('additionalProperties'));assert.ok(!r.body.messages[1].content.includes('expected'));
 assert.ok(!compactMessages(context)[0].content.includes('2026-10-12'));
});
test('full independent audit catches lost month context that a sum-only score missed',()=>{
 const record=JSON.parse(readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v4/SEM11.json',import.meta.url)));
 const replay=replayEvidence(record,goldenSuite.cases[10]);assert.equal(replay.original.pass,true);assert.equal(replay.pass,false);
 assert.ok(replay.audit.failures.includes('完整第2项/date'));
 const altered=structuredClone(record);altered.request.messages[1].content='{}';assert.match(replayEvidence(altered,goldenSuite.cases[10]).validation_error,/快照/);
});
test('full item audit rejects same-sum omissions, reorder, altered source and implicit extra recurrence',()=>{
 const rows=audits.cases.SCALE80ITEMS.records;
 const p={items:rows.map((r,n)=>({title:r.title,amount_minor:r.amount_minor,occurred_on:r.date,source:r.source,type:r.type,category:{id:r.category_id},recurrence:{cycle:'single'},requires_confirmation:true})),saved_entries:0};
 assert.equal(auditProposal(p,audits.cases.SCALE80ITEMS).pass,true);
 p.items[1].title=p.items[0].title;assert.equal(auditProposal(p,audits.cases.SCALE80ITEMS).pass,false);
 p.items[1].title=rows[1].title;p.items[2].source='淘宝';assert.equal(auditProposal(p,audits.cases.SCALE80ITEMS).pass,false);
});
test('unmeasured core rows cannot become a completion certificate or website release',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'moneytalk-gate-'));
 try{
  mkdirSync(join(tmp,'free-qwen38-v4'));
  const root=new URL('../docs/semantic-intake-20261013/free-qwen38-v4/',import.meta.url);
  for(const name of ['SEM11.json','reservations.json'])writeFileSync(join(tmp,'free-qwen38-v4',name),readFileSync(new URL(name,root)));
  const r=buildCoreReport(tmp);assert.equal(r.total,25);assert.equal(r.core_pass,false);assert.equal(r.website_ready,false);
  assert.deepEqual(r.failed,['SEM11']);assert.ok(r.untested.includes('SEM25'));
 }finally{rmSync(tmp,{recursive:true});}
});
test('messy fixtures are fictional, cover inferred categories and have independent consistent per-item totals',()=>{
 const suite=JSON.parse(readFileSync(new URL('../docs/semantic-intake-20261013/messy-cases.json',import.meta.url)));
 assert.equal(suite.cases.length,4);assert.match(suite.provenance,/No real ledger/);
 assert.ok(suite.cases.some(c=>c.raw.length>6000));assert.ok(suite.cases.some(c=>c.id==='MESSY04'&&c.risks.includes('没有分类标题时的用途判断')));
 for(const f of suite.cases){
  assert.equal(f.expected.records_count,f.audit.records.length+(f.audit.recurring_count||0));
  for(const kind of ['expense','income'])if(f.expected[kind+'_minor']!==undefined)
   assert.equal(f.expected[kind+'_minor'],f.audit.records.filter(r=>r.type===kind).reduce((sum,r)=>sum+(r.amount_minor??0),0));
  const r=evaluationRequest(f,suite,'synthetic-free-v5',COMPARISON_MODEL);
  assert.equal(JSON.parse(r.body.messages[1].content).raw,f.raw);assert.equal(r.body.messages[1].content.includes('expected'),false);
  assert.equal(r.body.max_completion_tokens,11264);
 }
});
