import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {guidedExamples,guidedDenseMessages,constrainedDenseMessages,constrainedDenseSchema,specificationDenseSchema} from '../shared/semantic-guided.js';
import {semanticContext} from '../shared/semantic-proposal.js';import {validateDenseProposal} from '../shared/semantic-dense.js';
import {goldenSuite,replayEvidence} from '../scripts/semantic-audit.mjs';import {evaluationRequest,COMPARISON_MODEL} from '../scripts/semantic-evaluation.mjs';
test('every v11 fictional demonstration is valid under unchanged canonical guards and correct actual-paid arithmetic',()=>{
 const p=guidedExamples.map(e=>validateDenseProposal(e.output,semanticContext(e.raw,'2026-10-13',goldenSuite.categories)));
 assert.deepEqual(p[0].items.map(i=>i.amount_minor),[7200,2100,4200]);assert.deepEqual(p[1].items.map(i=>[i.amount_minor,i.occurred_on]),[[900,'2026-08'],[400,'2026-08']]);
 assert.equal(p[2].items[0].recurrence.start_month,null);assert.equal(p[2].items[0].recurrence.charge_day,null);assert.equal(p[2].items[0].recurrence.through_month,'2025-11');assert.equal(p[2].items[0].occurred_on,null);
 assert.ok(p.every(p=>p.saved_entries===0&&p.items.every(i=>i.requires_confirmation)));
});
test('v11 uses official JSON-object request, same validator, no tools and no expected answers; v10 frozen request is unchanged',()=>{
 const f=goldenSuite.cases.find(f=>f.id==='SEM01');const a=evaluationRequest(f,goldenSuite,'synthetic-free-v10',COMPARISON_MODEL),b=evaluationRequest(f,goldenSuite,'synthetic-free-v11',COMPARISON_MODEL);
 const frozen=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v10-full-core/SEM01.json',import.meta.url)));assert.deepEqual(a.body,frozen.request);
 assert.deepEqual(b.body.response_format,{type:'json_object'});assert.equal(a.body.response_format,undefined);assert.equal(b.body.messages[1].content,a.body.messages[1].content);assert.equal(b.body.messages[1].content.includes('expected'),false);
 for(const k of ['stream','stream_options','chat_template_kwargs','tool_choice','store','temperature','seed','max_completion_tokens'])assert.deepEqual(b.body[k],a.body[k]);assert.equal(b.body.tools,undefined);assert.ok(b.reservedNeurons>a.reservedNeurons);
 const context=semanticContext(f.raw,goldenSuite.anchor_day,goldenSuite.categories);assert.ok(guidedDenseMessages(context)[0].content.includes('示范'));assert.throws(()=>evaluationRequest(f,goldenSuite,'synthetic-free-v11','paid-model'));
});
test('v10 malformed actual response is preserved and rejected, never repaired by the v11 preparation',()=>{
 const f=goldenSuite.cases.find(f=>f.id==='SEM01'),r=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v10-full-core/SEM01.json',import.meta.url)));const replay=replayEvidence(r,f);assert.equal(replay.pass,false);assert.match(replay.validation_error,/JSON/);assert.equal(r.prompt_version,'synthetic-free-v10');
});

test('v12 sends official bare JSON schema once, reserves schema bytes and preserves frozen v11 request',()=>{
 const f=goldenSuite.cases.find(f=>f.id==='SEM01'),a=evaluationRequest(f,goldenSuite,'synthetic-free-v11',COMPARISON_MODEL),b=evaluationRequest(f,goldenSuite,'synthetic-free-v12',COMPARISON_MODEL);
 const frozen=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v11-full-core/SEM01.json',import.meta.url)));assert.deepEqual(a.body,frozen.request);
 assert.equal(b.body.response_format.type,'json_schema');assert.deepEqual(b.body.response_format.json_schema,constrainedDenseSchema());assert.equal(b.body.response_format.json_schema.schema,undefined);assert.equal(b.body.response_format.json_schema.type,'object');
 assert.ok(!b.body.messages[0].content.includes(JSON.stringify(constrainedDenseSchema())));assert.equal(b.body.messages[1].content,a.body.messages[1].content);assert.equal(b.body.store,false);assert.equal(b.body.tool_choice,'none');assert.deepEqual(b.body.chat_template_kwargs,{enable_thinking:false});
 const bound=Buffer.byteLength(JSON.stringify(b.body.messages))+1024+Buffer.byteLength(JSON.stringify(b.body.response_format));assert.equal(b.reservedNeurons,Math.ceil((bound*40909+b.body.max_completion_tokens*290909)/1e6));
 const bad=structuredClone(guidedExamples[0].output);bad.groups[0].items[0][1][0][1]='0';assert.throws(()=>validateDenseProposal(bad,semanticContext(guidedExamples[0].raw,'2026-10-13',goldenSuite.categories)));
});

test('observed v12 specification loss fails even when the amount is correct; do not repair the model answer',()=>{
 const f=goldenSuite.cases.find(f=>f.id==='SEM20'),r=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v12-full-core/SEM20.json',import.meta.url)));const a=replayEvidence(r,f);assert.equal(a.pass,false);assert.ok(a.original.failures.includes('第1笔/title'));assert.equal(a.proposal.items[0].amount_minor,419900);assert.equal(a.proposal.items[0].title,'手机');assert.equal(f.expected.records[0].title,'手机15 256GB');
});
test('v13 is independent, preserves all v12 request bytes and only adds general product-specification guidance',()=>{
 const f=goldenSuite.cases.find(f=>f.id==='SEM01'),a=evaluationRequest(f,goldenSuite,'synthetic-free-v12',COMPARISON_MODEL),b=evaluationRequest(f,goldenSuite,'synthetic-free-v13',COMPARISON_MODEL);const frozen=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v12-full-core/SEM01.json',import.meta.url)));assert.deepEqual(a.body,frozen.request);assert.equal(b.body.messages[1].content,a.body.messages[1].content);assert.ok(b.body.messages[0].content.includes('型号、容量、规格、尺码和颜色'));
 const schema=specificationDenseSchema(),title=schema.properties.groups.items.properties.items.items.prefixItems[0];assert.equal(title.type,'string');assert.ok(title.description.includes('型号'));assert.equal(title.maxLength,80);assert.equal(b.body.response_format.type,'json_schema');assert.equal(b.body.tools,undefined);assert.equal(b.body.store,false);assert.deepEqual(b.body.chat_template_kwargs,{enable_thinking:false});assert.ok(b.reservedNeurons>=a.reservedNeurons);assert.throws(()=>evaluationRequest(f,goldenSuite,'synthetic-free-v13','paid-model'));
});

test('full-field replay retains v12 source and date failures hidden by the original amount score',()=>{
 for(const [id,failure] of [['SEM12','完整循环1/source'],['SEM14','完整第1项/date'],['SEM15','完整第1项/source']]){
  const f=goldenSuite.cases.find(f=>f.id===id),r=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v12-full-core/'+id+'.json',import.meta.url))),a=replayEvidence(r,f);
  assert.equal(a.original.pass,true);assert.equal(a.pass,false);assert.ok(a.audit.failures.includes(failure));
 }
 const f=goldenSuite.cases.find(f=>f.id==='SEM01'),system=evaluationRequest(f,goldenSuite,'synthetic-free-v13',COMPARISON_MODEL).body.messages[0].content;
 assert.ok(system.includes('source必须是JSON的null'));assert.ok(system.includes('禁止自行填锚点当天'));
});

test('the actual Python runner scorer rejects observed full-field failures and accepts the unchanged long answer offline',()=>{
 const extract="import ast,pathlib;tree=ast.parse(pathlib.Path('scripts/evaluate-cloudflare-free.py').read_text());print(next(n.value.value for n in ast.walk(tree) if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=='score_code' for t in n.targets)))";
 const code=execFileSync('python3',['-c',extract],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 for(const id of ['SEM12','SEM14','SEM15','SEM20','SEM25']){
  const fixture=goldenSuite.cases.find(f=>f.id===id),record=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v12-full-core/'+id+'.json',import.meta.url)));
  const result=JSON.parse(execFileSync(process.execPath,['--input-type=module','-e',code],{input:JSON.stringify({envelope:record.envelope,fixture,suite:goldenSuite,model:COMPARISON_MODEL,version:record.prompt_version}),encoding:'utf8',timeout:60000}));
  assert.equal(result.full_field_pass,id==='SEM25');assert.equal(result.audit.pass,id==='SEM25');
 }
});
