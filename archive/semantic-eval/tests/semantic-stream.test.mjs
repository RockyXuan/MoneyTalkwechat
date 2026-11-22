import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {decodeSemanticStream} from '../scripts/semantic-stream.mjs';
import {COMPARISON_MODEL,evaluationRequest,extractCompletion} from '../scripts/semantic-evaluation.mjs';
import {replayEvidence,goldenSuite} from '../scripts/semantic-audit.mjs';
const chunk=(delta,finish_reason=null)=>({id:'synthetic-stream',object:'chat.completion.chunk',model:COMPARISON_MODEL,choices:[{index:0,delta,finish_reason}]});
const frame=c=>'data: '+JSON.stringify(c)+'\n\n';
const usage={prompt_tokens:10,completion_tokens:20,total_tokens:30,neurons:6.3};
const end=()=>frame({...chunk({}),choices:[],usage})+'data: [DONE]\n\n';
const wire=()=>': heartbeat\n\n'+frame(chunk({role:'assistant',content:'{"值":'}))+frame(chunk({content:'1}'},'stop'))+end();
test('complete SSE preserves Unicode, one identity, stop and provider usage; no network or write',()=>{
 const e=decodeSemanticStream(wire());assert.equal(e.result.choices[0].message.content,'{"值":1}');assert.deepEqual(e.result.usage,usage);assert.equal(extractCompletion(e,COMPARISON_MODEL).content,'{"值":1}');
 assert.equal(decodeSemanticStream(wire().replaceAll('\n','\r\n')).result.model,COMPARISON_MODEL);
});
test('disconnects, missing terminators, partial JSON, provider errors, changed identity, tools and refusals fail closed',()=>{
 const base=wire();const bads=[base.replace('data: [DONE]\n\n',''),base.replace(/data: \[DONE\]\n\n$/,'data: [DONE]'),base.replace('"stop"','null'),base.replaceAll(COMPARISON_MODEL,'wrong-model'),base+frame(chunk({content:'extra'})),frame({...chunk({content:'x'}),id:'other'})+base,frame(chunk({tool_calls:[]}))+base,frame(chunk({refusal:'no'}))+base,frame({error:{message:'provider failed'}}),base.replace('"total_tokens":30','"total_tokens":31'),base.replace('"index":0','"index":1'),frame(chunk({content:'x'}))+frame({choices:[],usage})+end()];
 for(const raw of bads)assert.throws(()=>decodeSemanticStream(raw));
 assert.throws(()=>decodeSemanticStream('data: '+'x'.repeat(70000)),/流|buffer/i);
 assert.throws(()=>decodeSemanticStream('x'.repeat(8*1024*1024+1)),/超限/);
});
test('a provider length ending is measured but rejected by existing completion gate; no guessed salvage',()=>{
 const e=decodeSemanticStream(wire().replace('"stop"','"length"'));assert.equal(e.result.choices[0].finish_reason,'length');assert.throws(()=>extractCompletion(e,COMPARISON_MODEL));
 const noUsage=frame(chunk({content:'{}'},'stop'))+'data: [DONE]\n\n';assert.equal(decodeSemanticStream(noUsage).result.usage,undefined);
});
test('v9 changes transport only; v8 frozen evidence still replays and original guards remain',()=>{
 const f=goldenSuite.cases.find(f=>f.id==='SEM01'),a=evaluationRequest(f,goldenSuite,'synthetic-free-v8',COMPARISON_MODEL),b=evaluationRequest(f,goldenSuite,'synthetic-free-v9',COMPARISON_MODEL);
 const {stream,stream_options,...remaining}=b.body;assert.equal(stream,true);assert.deepEqual(stream_options,{include_usage:true});assert.deepEqual(remaining,Object.fromEntries(Object.entries(a.body).filter(([k])=>k!=='stream')));assert.equal(a.reservedNeurons,b.reservedNeurons);
 const r=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v8-full-core/SEM01.json',import.meta.url)));
 assert.equal(replayEvidence(r,f).pass,true);
 const raw=frame(chunk({content:r.envelope.result.choices[0].message.content},'stop'))+end();
 const request=b.body;const pythonJSON=v=>Array.isArray(v)?'['+v.map(pythonJSON).join(', ')+']':v!==null&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>JSON.stringify(k)+': '+pythonJSON(x)).join(', ')+'}':JSON.stringify(v);
 const hash=s=>createHash('sha256').update(s).digest('hex');
 const record={...r,prompt_version:'synthetic-free-v9',request,request_sha256:hash(pythonJSON(request)),stream_base64:Buffer.from(raw).toString('base64'),stream_sha256:hash(raw),envelope:decodeSemanticStream(raw)};
 assert.equal(replayEvidence(record,f).pass,true);record.stream_sha256='bad';assert.match(replayEvidence(record,f).validation_error,/快照/);
});

test('native Cloudflare per-token usage reconciles exactly with final wrapper; raw frozen response replays offline',()=>{
 const r=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v9-full-core/SEM01.json',import.meta.url)));
 const raw=Buffer.from(r.stream_base64,'base64').toString('utf8'),e=decodeSemanticStream(raw);
 assert.equal(e.result.model,COMPARISON_MODEL);assert.equal(e.result.usage.prompt_tokens,2006);assert.equal(e.result.usage.completion_tokens,833);assert.equal(e.result.choices[0].finish_reason,'stop');
 assert.throws(()=>decodeSemanticStream(raw.replace('"prompt_tokens":2006,"completion_tokens":833','"prompt_tokens":2005,"completion_tokens":833')));
 assert.throws(()=>decodeSemanticStream(raw.replace(/data: \{"response":"","usage"[^\n]+\n\n/,'')));
 assert.throws(()=>decodeSemanticStream(raw.replace('data: [DONE]',frame(chunk({content:'late'}))+'data: [DONE]')));
});

test('observed Cloudflare network-loss stream is incomplete, not a completed model answer or settled usage',()=>{
 const r=JSON.parse(fs.readFileSync(new URL('../docs/semantic-intake-20261013/free-qwen38-v10-full-core/SEM25.json',import.meta.url)));const raw=Buffer.from(r.stream_base64,'base64').toString('utf8');
 assert.equal(r.http_status,200);assert.ok(raw.includes('$error: Error: Network connection lost.'));assert.ok(!raw.includes('data: [DONE]'));assert.equal(r.envelope,undefined);assert.throws(()=>decodeSemanticStream(raw));
});
