// Offline decoder only. Native Cloudflare Qwen Chat Completions SSE, no tools/network/ledger writes.
import { createParser } from 'eventsource-parser';
import { COMPARISON_MODEL } from './semantic-evaluation.mjs';
export const STREAM_DECODER_VERSION='native-cf-sse-v2';
const MAX_WIRE_BYTES=8*1024*1024, MAX_CONTENT_BYTES=1024*1024;
export function decodeSemanticStream(raw, expectedModel=COMPARISON_MODEL) {
 if(typeof raw!=='string'||Buffer.byteLength(raw)>MAX_WIRE_BYTES)throw Error('流响应为空或超限');
 let done=false,finish=null,model=null,id=null,content='',usage=null,events=0,usageMode=null,trailer=false;
 const sums={prompt_tokens:0,completion_tokens:0,total_tokens:0,neurons:0};let allNeurons=true;
 function checkedUsage(u){if(!u||!['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)||u.total_tokens!==u.prompt_tokens+u.completion_tokens||('neurons'in u&&(!Number.isFinite(u.neurons)||u.neurons<0)))throw Error('流用量无效');return u;}
 const parser=createParser({maxBufferSize:65536,onError(){throw Error('流协议无效');},onEvent(event){
  if(done)throw Error('流结束后仍有数据');
  if(event.event&&event.event!=='message')throw Error('流返回错误或未知事件');
  if(event.data==='[DONE]'){done=true;return;}
  if(++events>20000)throw Error('流事件过多');
  let c;try{c=JSON.parse(event.data);}catch{throw Error('流事件JSON无效');}
  // Cloudflare's native endpoint adds per-chunk usage and one final wrapper aggregate.
  // Require exact token reconciliation; never count both deltas and aggregate as two calls.
  if(c&&Object.keys(c).every(k=>['response','usage'].includes(k))&&c.response===''){
   if(trailer||finish===null||!model||usageMode!=='delta')throw Error('流汇总顺序无效');
   checkedUsage(c.usage);
   for(const k of ['prompt_tokens','completion_tokens','total_tokens'])if(c.usage[k]!==sums[k])throw Error('流汇总与分段用量不符');
   if(allNeurons&&(!('neurons'in c.usage)||Math.abs(c.usage.neurons-sums.neurons)>0.001))throw Error('流汇总与分段用量不符');
   usage=c.usage;trailer=true;return;
  }
  if(trailer)throw Error('流汇总后仍有候选');
  if(!c||c.error||c.object!=='chat.completion.chunk'||c.model!==expectedModel||typeof c.id!=='string'||!c.id)throw Error('流模型身份或响应结构不符');
  if(id!==null&&id!==c.id)throw Error('流混入另一请求');
  model=c.model;id=c.id;
  if(c.usage!==undefined&&c.usage!==null){
   const u=checkedUsage(c.usage);
   if(usageMode===null)usageMode=finish===null?'delta':'final';
   if(usageMode==='final'){if(usage)throw Error('流用量重复');usage=u;}
   else {for(const k of ['prompt_tokens','completion_tokens','total_tokens'])sums[k]+=u[k];if('neurons'in u)sums.neurons+=u.neurons;else allNeurons=false;}
  }else if(usageMode==='delta')throw Error('流分段缺少用量');
  if(!Array.isArray(c.choices)||c.choices.length>1)throw Error('流候选数量不符');
  if(!c.choices.length){if(!c.usage||finish===null)throw Error('流空事件顺序不符');return;}
  if(finish!==null)throw Error('结束标识后仍有候选');
  const choice=c.choices[0],d=choice.delta;
  if(choice.index!==0||!d||typeof d!=='object'||Array.isArray(d))throw Error('流候选结构无效');
  if((d.role!==undefined&&d.role!=='assistant')||d.tool_calls!=null||d.function_call!=null||d.refusal!=null)throw Error('流不能调用工具或拒绝信息');
  if(d.content!==undefined&&d.content!==null){
   if(typeof d.content!=='string')throw Error('流内容类型无效');content+=d.content;
   if(Buffer.byteLength(content)>MAX_CONTENT_BYTES)throw Error('流内容超限');
  }
  if(choice.finish_reason!==undefined&&choice.finish_reason!==null){
   if(!['stop','length','content_filter'].includes(choice.finish_reason))throw Error('流结束原因无效');
   finish=choice.finish_reason;
  }
 }});
 parser.feed(raw);parser.reset({consume:true});
 if(!done||!model||!id||!finish||!content||(usageMode==='delta'&&!trailer))throw Error('流未完整结束，不能使用半份结果');
 // Keep a real length/content-filter ending as measured, failed output; extractCompletion refuses it.
 return {success:true,errors:[],messages:[],result:{id,model,object:'chat.completion',choices:[{index:0,message:{role:'assistant',content},finish_reason:finish}],...(usage?{usage}:{})}};
}
