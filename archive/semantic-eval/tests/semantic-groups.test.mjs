import test from 'node:test';
import assert from 'node:assert/strict';
import { semanticContext } from '../shared/semantic-proposal.js';
import { validateGroupedProposal, groupedMessages } from '../shared/semantic-groups.js';
import { evaluationRequest, COMPARISON_MODEL } from '../scripts/semantic-evaluation.mjs';
import { goldenSuite } from '../scripts/semantic-audit.mjs';

const ref=quote=>({quote,occurrence:0});
const c=semanticContext('九月淘宝纸巾10元，京东毛巾12元。','2026-10-13',goldenSuite.categories);
const item=(title,price)=>({title,evidence:[ref(`${title}${price}元`)],amount:{method:'exact',terms:[{value:price,evidence:ref(`${price}元`)}]}});
const group=(source,items)=>({source,type:'expense',currency:'CNY',category:{id:'shopping'},date:{kind:'explicit',value:'2026-09',evidence:[ref('九月')]},items});
const wire=()=>({version:3,complete:true,groups:[group('淘宝',[item('纸巾','10')]),group('京东',[item('毛巾','12')])],ignored:[]});

test('group transport flattens original order with explicit defaults and never writes ledger entries',()=>{
 const p=validateGroupedProposal(wire(),c);
 assert.deepEqual(p.items.map(i=>[i.title,i.source,i.occurred_on,i.amount_minor,i.category.id]),[['纸巾','淘宝','2026-09',1000,'shopping'],['毛巾','京东','2026-09',1200,'shopping']]);
 assert.deepEqual(p.items.map(i=>i.id),['p1','p2']);assert.equal(p.saved_entries,0);
});
test('child category override is explicit; no override inherits only the declared group category',()=>{
 const w=wire();w.groups[1].items[0].category={id:'family'};
 assert.deepEqual(validateGroupedProposal(w,c).items.map(i=>i.category.id),['shopping','family']);
 w.groups[1].items[0].category={id:null,suggested_name:'小禾',alternatives:['kids']};
 const i=validateGroupedProposal(w,c).items[1];assert.equal(i.category.id,null);assert.equal(i.category.suggested_name,'小禾');assert.ok(i.questions.includes('分类待选择'));
});
test('grouping cannot bypass missing evidence, incorrect money, made-up day, or changed source order',()=>{
 for(const change of [w=>w.groups.reverse(),w=>w.groups[0].items[0].amount.terms[0].value='20',w=>w.groups[0].date.value='2026-09-01',w=>w.groups[0].items[0].evidence=[ref('编造的商品')],w=>w.complete=false,w=>w.groups[0].execute='delete']){
  const w=wire();change(w);assert.throws(()=>validateGroupedProposal(w,c));
 }
});
test('aggregate item limit applies across groups; output limit cannot be avoided by nested transport',()=>{
 const w=wire();w.groups=[group('淘宝',Array.from({length:250},()=>item('纸巾','10'))),group('淘宝',Array.from({length:250},()=>item('纸巾','10')))];
 assert.throws(()=>validateGroupedProposal(w,c));assert.throws(()=>validateGroupedProposal(' '.repeat(1024*1024+1),c),/超限/);
});
test('grouped request uses fixed Qwen and same privacy boundaries; field compression is not model acceptance',()=>{
 const f=goldenSuite.cases.find(f=>f.id==='SEM25'),r=evaluationRequest(f,goldenSuite,'synthetic-free-v8',COMPARISON_MODEL);
 assert.equal(JSON.parse(r.body.messages[1].content).raw,f.raw);assert.equal(r.body.store,false);assert.equal(r.body.tool_choice,'none');
 assert.deepEqual(r.body.chat_template_kwargs,{enable_thinking:false});assert.ok(groupedMessages(c)[0].content.includes('不能为了合并'));
 assert.ok(!r.body.messages[1].content.includes('expected'));assert.throws(()=>evaluationRequest(f,goldenSuite,'synthetic-free-v8'));
});
