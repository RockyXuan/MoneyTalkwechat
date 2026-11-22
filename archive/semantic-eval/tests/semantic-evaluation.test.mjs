import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FREE_MODEL, COMPARISON_MODEL, evaluationRequest, verifyFreeDashboardProof, extractCompletion, scoreProposal } from '../scripts/semantic-evaluation.mjs';
const suite=JSON.parse(readFileSync(new URL('../docs/semantic-intake-20261013/golden-cases.json',import.meta.url)));
const account='a'.repeat(32),now=Date.now();
const proof={kind:'observed-dashboard',account_id:account,current_plan:'Free',price:0,url:`https://dash.cloudflare.com/${account}/workers/plans`,checked_at:new Date(now).toISOString()};

test('free-only preflight refuses unknown, paid, wrong-account, future or stale proof',()=>{
 assert.equal(verifyFreeDashboardProof(proof,account,now),true);
 for(const bad of [{},{...proof,price:5},{...proof,current_plan:'Paid'},{...proof,account_id:'b'.repeat(32)},{...proof,checked_at:new Date(now-3600000).toISOString()},{...proof,checked_at:new Date(now+1000).toISOString()}]) assert.throws(()=>verifyFreeDashboardProof(bad,account,now),/禁止模型调用/);
});
test('synthetic request includes the actual schema and minimal contextual data, no tools or forced JSON mode',()=>{
 const r=evaluationRequest(suite.cases[0],suite);
 assert.ok(r.body.messages[0].content.includes('additionalProperties'));
 assert.ok(r.reservedNeurons>0&&r.reservedNeurons<200);
 assert.equal(r.body.tools,undefined);assert.equal(r.body.response_format,undefined);
 assert.equal(r.body.messages[1].content.includes('expected'),false);
 const override=evaluationRequest(suite.cases[7],suite);
 assert.ok(override.context.categories.some(c=>c.id==='cola-existing'));
 assert.throws(()=>evaluationRequest(suite.cases.find(c=>c.id==='SCALE50000'),suite),/不能截断/);
});
test('newer comparison is fixed, bounded, no storage/tools; other models and prompt versions are refused',()=>{
 const r=evaluationRequest(suite.cases[0],suite,'synthetic-free-v3',COMPARISON_MODEL);
 assert.equal(r.body.max_completion_tokens,4096);assert.equal(r.body.max_tokens,undefined);
 assert.equal(r.body.store,false);assert.equal(r.body.tool_choice,'none');assert.equal(r.body.reasoning_effort,'low');
 assert.ok(r.reservedNeurons>1200);
 assert.throws(()=>evaluationRequest(suite.cases[0],suite,'synthetic-free-v3','paid-model'));
 assert.throws(()=>evaluationRequest(suite.cases[0],suite,'not-versioned'));
});
test('evaluation requires returned model identity, complete finish, success and no tool calls',()=>{
 const env={success:true,result:{model:FREE_MODEL,choices:[{finish_reason:'stop',message:{content:'```json\n{}\n```'}}]}};
 assert.equal(extractCompletion(env).content,'{}');
 for(const result of [{...env.result,model:'other'},{...env.result,model:undefined},{...env.result,choices:[{finish_reason:'length',message:{content:'{}'}}]},{...env.result,choices:[{finish_reason:'stop',message:{content:'{}',tool_calls:[{}]}}]}]) assert.throws(()=>extractCompletion({...env,result}));
 assert.throws(()=>extractCompletion({...env,success:false}));
});
test('scorer cannot accept a matching sum that omitted one item or changed dates',()=>{
 const p={items:[{title:'茶叶',amount_minor:6370,type:'expense',occurred_on:'2026-10-13',recurrence:{cycle:'single'},category:{},requires_confirmation:true}],ignored:[],saved_entries:0};
 const s=scoreProposal(p,suite.cases[0]);assert.equal(s.pass,false);
 assert.ok(s.failures.includes('单笔数量'));assert.ok(s.failures.includes('第1笔/date'));
});
test('recurrence preview is not an actual saved sum and unknown starts remain unavailable',()=>{
 const p={items:[{amount_minor:3700,type:'expense',recurrence:{cycle:'monthly',start_month:'2025-06',through_month:'2025-09',ongoing:false},requires_confirmation:true}],ignored:[],saved_entries:0};
 assert.equal(scoreProposal(p,suite.cases[12]).pass,true);
 p.items[0].recurrence.start_month=null;assert.equal(scoreProposal(p,suite.cases[12]).pass,false);
 p.saved_entries=4;assert.equal(scoreProposal(p,suite.cases[12]).pass,false);
});
