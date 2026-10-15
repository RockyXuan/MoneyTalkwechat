import test from 'node:test';import assert from 'node:assert/strict';
import {semanticContext} from '../shared/semantic-proposal.js';import {validateDenseProposal,denseMessages} from '../shared/semantic-dense.js';
import {goldenSuite} from '../scripts/semantic-audit.mjs';import {evaluationRequest,COMPARISON_MODEL} from '../scripts/semantic-evaluation.mjs';
const c=semanticContext('九月淘宝纸巾10元，京东毛巾12元。','2026-10-13',goldenSuite.categories);
const item=(title,value)=>[title,[[`${title}${value}元`,0]],['exact',[[value,[`${value}元`,0]]]]];
const group=(source,items)=>({source,type:'expense',currency:'CNY',category:{id:'shopping'},date:{kind:'explicit',value:'2026-09',evidence:[{quote:'九月',occurrence:0}]},items});
const wire=()=>({version:4,complete:true,groups:[group('淘宝',[item('纸巾','10')]),group('京东',[item('毛巾','12')])],ignored:[]});
test('dense transport keeps original order, group month and source; canonical values remain proposals only',()=>{
 const p=validateDenseProposal(wire(),c);assert.deepEqual(p.items.map(i=>[i.title,i.amount_minor,i.occurred_on,i.source,i.category.id]),[['纸巾',1000,'2026-09','淘宝','shopping'],['毛巾',1200,'2026-09','京东','shopping']]);assert.equal(p.saved_entries,0);assert.ok(p.items.every(i=>i.requires_confirmation&&i.recurrence.cycle==='single'));
});
test('explicit one-item overrides preserve existing-category choice; unknown amount/category stay pending',()=>{
 const w=wire();w.groups[0].items[0][3]={category:{id:'family'}};w.groups[1].items[0][2]=['unknown',[]];w.groups[1].items[0][3]={category:{id:null,suggested_name:'小禾',alternatives:['kids']}};
 const p=validateDenseProposal(w,c);assert.equal(p.items[0].category.id,'family');assert.equal(p.items[1].amount_minor,null);assert.equal(p.items[1].category.id,null);assert.ok(p.items[1].questions.includes('金额待确认'));assert.ok(p.items[1].questions.includes('分类待选择'));
});
test('dense format cannot bypass quote, price, date, order, category ID or tuple-position guards',()=>{
 for(const change of [w=>w.groups.reverse(),w=>w.groups[0].items[0][1][0][0]='虚构商品',w=>w.groups[0].items[0][2][1][0][0]='20',w=>w.groups[0].date.value='2026-09-01',w=>w.groups[0].items[0].push({execute:'delete'}),w=>w.groups[0].category.id='missing',w=>w.groups[0].items[0][2]=['exact',[]],w=>w.complete=false]){const w=wire();change(w);assert.throws(()=>validateDenseProposal(w,c));}
 const w=wire();w.groups=[group('淘宝',Array.from({length:400},()=>item('纸巾','10'))),group('京东',[item('毛巾','12')])];assert.throws(()=>validateDenseProposal(w,c),/总数超限/);assert.throws(()=>validateDenseProposal(' '.repeat(1024*1024+1),c),/超限/);
});
test('dense recurrence preserves unknown start, cutoff month and unspecified charging day without inventing history',()=>{
 const raw='云存储每月37元，起始月不记得，先补到2025年12月，不填扣款日。';const context=semanticContext(raw,'2026-10-13',goldenSuite.categories);const w=wire();w.groups=[{...group(null,[]),date:{kind:'unknown',value:null,evidence:[{quote:'起始月不记得',occurrence:0}]},items:[['云存储',[['云存储每月37元',0]],['exact',[['37',['37元',0]]] ],{recurrence:{cycle:'monthly',start_month:null,through_month:'2025-12',ongoing:false,charge_day:null,evidence:[{quote:raw,occurrence:0}]}}]]}];
 const i=validateDenseProposal(w,context).items[0];assert.equal(i.recurrence.start_month,null);assert.equal(i.recurrence.through_month,'2025-12');assert.equal(i.recurrence.charge_day,null);assert.equal(i.occurred_on,null);assert.ok(i.questions.includes('起始月待确认'));
});
test('v10 remains isolated and streams exact fictional raw context without expected answers or history',()=>{
 const f=goldenSuite.cases.find(f=>f.id==='SEM25'),r=evaluationRequest(f,goldenSuite,'synthetic-free-v10',COMPARISON_MODEL);assert.equal(JSON.parse(r.body.messages[1].content).raw,f.raw);assert.equal(r.body.stream,true);assert.equal(r.body.store,false);assert.equal(r.body.tool_choice,'none');assert.deepEqual(r.body.chat_template_kwargs,{enable_thinking:false});assert.ok(!r.body.messages[1].content.includes('expected'));assert.ok(denseMessages(c)[0].content.includes('不为合并同平台搬动'));assert.throws(()=>evaluationRequest(f,goldenSuite,'synthetic-free-v10'));
});
