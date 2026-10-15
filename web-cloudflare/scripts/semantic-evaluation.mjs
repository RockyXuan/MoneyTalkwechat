// Synthetic evaluation only. Not imported by the application and never writes a ledger.
import { semanticContext, semanticMessages, semanticJsonSchema, validateSemanticProposal } from '../shared/semantic-proposal.js';
import { compactMessages, validateCompactProposal } from '../shared/semantic-wire.js';
import { denseMessages, validateDenseProposal } from '../shared/semantic-dense.js';
import { groupedMessages, validateGroupedProposal } from '../shared/semantic-groups.js';

export const FREE_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
export const COMPARISON_MODEL = '@cf/qwen/qwen3.8-27b';
export const PROMPT_VERSION = 'synthetic-free-v4';

export function evaluationRequest(fixture, suite, version = PROMPT_VERSION, model = FREE_MODEL) {
  if (![FREE_MODEL, COMPARISON_MODEL].includes(model)) throw Error('模型不在免费评测固定名单');
  if (!['synthetic-free-v1', 'synthetic-free-v3','synthetic-free-v4','synthetic-free-v5','synthetic-free-v6','synthetic-free-v7','synthetic-free-v8','synthetic-free-v9','synthetic-free-v10'].includes(version)) throw Error('提示版本未固定');
  const direct=['synthetic-free-v6','synthetic-free-v7','synthetic-free-v8','synthetic-free-v9','synthetic-free-v10'].includes(version);
  if (direct && model!==COMPARISON_MODEL) throw Error('直接回答对照只允许固定 Qwen3.8');
  const categories = [...suite.categories, ...(fixture.expected.category_override || [])];
  const context = semanticContext(fixture.raw, suite.anchor_day, categories);
  const compact=['synthetic-free-v5','synthetic-free-v6','synthetic-free-v7','synthetic-free-v8','synthetic-free-v9','synthetic-free-v10'].includes(version);
  const messages = version==='synthetic-free-v10' ? denseMessages(context) : ['synthetic-free-v8','synthetic-free-v9','synthetic-free-v10'].includes(version) ? groupedMessages(context) : compact ? compactMessages(context) : semanticMessages(context);
  if (!compact) messages[0].content += '\n/no_think\n必须逐笔保留事实，后文更正替换原项目，不另生成一笔；分类标题作用于后续项目。日期未指定时只给 unspecified/null。金额引文尽量只引用金额原词，不能把型号等无关数字当价格。不要在 ignored 中逐句重复闲聊，可选短代表引文。以下是完整 JSON Schema：' + JSON.stringify(semanticJsonSchema());
  if (['synthetic-free-v3','synthetic-free-v4'].includes(version)) messages[0].content += '\n字段规则：每项顶层 items[].id 用唯一流水编号 p1,p2,p3，不能用分类id代替；category.id 和 category.alternatives 才用提供的分类ID，不写名字或别称。已选已有分类则 suggested_name=null。occurrence 只数【完全相同的 quote 字符串】在 raw 中出现第几次，从0起；不同 quote 各自从0开始，绝不是句子或条目的编号。人群分类、平台、昨天等日期作用于整组购买事实，直到下一次明确切换，不能只作用于第一笔。source 必须保留原文平台。后文更正替换对应项目，金额 evidence 可引用后文更正，项目 evidence 的第一段必须引用原购买位置以保留顺序。已经明确给出实付就用 exact实付，不再从原价减；只给原价和优惠才用 subtract原价优惠；邮费并入实付用 sum实付邮费。不引用凭空算出的差额。单笔 recurrence 必须是 {"cycle":"single","start_month":null,"through_month":null,"ongoing":false,"charge_day":null,"evidence":[]}。没有日期词时 date={"kind":"unspecified","value":null,"evidence":[]}，anchor_day 仅用于换算相对日期，不是发生日期。明确年份月份不加日。日期引文必须包含日期词。循环未知起始月不得写当前月。ignored 只包含闲聊、计划、否定、已记还款，不包含已经提取的消费。陌生人名分类有歧义，id=null,suggested_name=原称呼,alternatives=[推荐分类id]。\n示例（不是此次原文）：raw="孩子的铅笔11，积木24。铅笔改成13。" 应输出两项，顶层id分别p1,p2，均 category.id=kids，source=null，date unspecified/null，均 single；铅笔 evidence=[{"quote":"铅笔11","occurrence":0},{"quote":"铅笔改成13","occurrence":0}]，amount={"method":"exact","terms":[{"value":"13","evidence":{"quote":"铅笔改成13","occurrence":0}}],"stated_total":"13"}；积木 amount exact24，quote="积木24",occurrence=0。另一个示例：昨天淘宝水壶原价46实付31，雨衣22，应为两笔source淘宝、date relative 2026-10-12、引文昨天，amount分别exact31和exact22，绝不是46-31。所有未用数组为[]；所有空值为null，不省略字段。';
  if (version==='synthetic-free-v4') messages[0].content += '\n分类的硬性条件：只要用户明确给了一个分类称呼，先逐字与当前 categories.name 和 aliases 比较；完全没有匹配的，就必须 category.id=null,suggested_name=用户该称呼,alternatives=[你认为合适的已有分类ID]，不能因为含义相近、像孩子名字或猜测关系而自动替用户选定。已有同名分类则用它的ID。商品型号、容量属于 title 内容需要保留，但不是价格。unknown 日期允许引用原文说忘了/不确定的句子，value必须null；循环的 through_month不是单笔发生日期。';
  if (version==='synthetic-free-v7') messages[0].content += '\n组内日期语境必须持续：前天、昨天、今天、明确月份等时间词，不要求每件商品重复说；除非用户明确切换日期、否定或结束这个时间语境，同组后续实际消费必须沿用这个日期并引用原时间词。另一个商品、另外、还有、然后、接着、再看、换平台本身都不代表换日期。不能把第二笔未重复时间词误判为整段无日期而默认本月。分类、来源也沿用至明确替换，收入/支出切换时只选同类型分类。';
  const max_tokens = fixture.id === 'SEM25' || ['SCALE8000','SCALE20000','SCALE50000'].includes(fixture.id) || fixture.id.startsWith('MESSY') ? 11264 :
    fixture.id === 'SCALE80ITEMS' ? 24576 : fixture.id === 'SCALE400ITEMS' ? 131072 : compact ? 3072 : 4096;
  const body = { messages, max_tokens, temperature: 0, seed: 42, stream: false };
  if (model===COMPARISON_MODEL) {
    messages[0].content=messages[0].content.replace('/no_think','');
    body.max_completion_tokens=max_tokens;delete body.max_tokens;
    body.reasoning_effort='low';body.store=false;body.tool_choice='none';
    if (direct) {
      delete body.reasoning_effort;
      body.chat_template_kwargs={enable_thinking:false};
    }
  }
  // UTF-8 byte bound deliberately overestimates input tokens; add template overhead.
  const inputBound = Buffer.byteLength(JSON.stringify(messages)) + 1024;
  if (inputBound + max_tokens > (model===COMPARISON_MODEL?262144:32768)) throw Error('保守上下文上限不足；不能截断原文或宣称完整');
  const reservedNeurons = Math.ceil((inputBound * (model===COMPARISON_MODEL?40909:4625) + max_tokens * (model===COMPARISON_MODEL?290909:30475)) / 1e6);
  if(['synthetic-free-v9','synthetic-free-v10'].includes(version)){body.stream=true;body.stream_options={include_usage:true};}
  return { context, body, reservedNeurons };
}

export function verifyFreeDashboardProof(proof, accountId, now = Date.now()) {
  // Account subscriptions REST is unavailable to this OAuth scope. Use observed dashboard proof.
  const age=now-Date.parse(proof?.checked_at);
  if (!/^[a-f0-9]{32}$/.test(accountId) || proof?.kind!=='observed-dashboard' || proof.account_id!==accountId ||
      proof.current_plan!=='Free' || proof.price!==0 || proof.url!==`https://dash.cloudflare.com/${accountId}/workers/plans` ||
      !Number.isFinite(age) || age<0 || age>=3600000) {
    throw Error('未证明 Workers Free；禁止模型调用，不能把便宜模型当永久免费');
  }
  return true;
}

export function extractCompletion(envelope, expectedModel=FREE_MODEL) {
  if (envelope.success !== true || !envelope.result) throw Error('供应商未返回成功响应');
  const r = envelope.result;
  if (![FREE_MODEL,COMPARISON_MODEL].includes(expectedModel) || r.model !== expectedModel) throw Error('响应模型身份缺失或不一致；不能计为固定模型评测');
  const choice = r.choices?.[0];
  if (!choice || choice.finish_reason !== 'stop' || choice.message?.tool_calls?.length) throw Error('模型输出残缺或尝试工具调用');
  let content = choice.message.content;
  if (typeof content !== 'string') throw Error('模型没有返回文本');
  // A single complete JSON fence is formatting, never repair truncated JSON or execute code.
  const fence = content.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) content = fence[1];
  return { content, usage: r.usage || null, completion_id: r.id || null };
}

export function scoreProposal(proposal, fixture) {
  const e = fixture.expected, failures = [], checked = [];
  const check = (label, pass) => { checked.push(label); if (!pass) failures.push(label); };
  const items = proposal.items;
  const singles = items.filter(i => i.recurrence.cycle === 'single');
  const recurring = items.filter(i => i.recurrence.cycle !== 'single');
  if (!e.recurring) check('没有误增循环候选', recurring.length===0);
  if (e.records) {
    check('单笔数量', singles.length === e.records.length);
    e.records.forEach((want, n) => {
      const got = singles[n];
      for (const [key, value] of Object.entries(want)) {
        let actual = key === 'date' ? got?.occurred_on : key === 'category_id' ? got?.category.id : key === 'suggested_category' ? got?.category.suggested_name : key === 'recommended_ids' ? got?.category.alternatives : got?.[key];
        let pass = key === 'title' ? !!actual && value.split(/\s+/).every(part => actual.includes(part)) : key === 'recommended_ids' ? value.every(id => actual?.includes(id)) : actual === value;
        check(`第${n+1}笔/${key}`, pass);
      }
    });
  }
  if (e.records_count !== undefined) check('候选数量', items.length === e.records_count);
  for (const type of ['expense', 'income']) {
    if (e[type + '_minor'] !== undefined) check(type + '整数分合计', singles.filter(i=>i.type===type).reduce((a,i)=>a+(i.amount_minor??0),0)===e[type+'_minor']);
  }
  if (e.ready_expense_minor !== undefined) check('可预览单笔金额', singles.filter(i=>i.type==='expense').reduce((a,i)=>a+(i.amount_minor??0),0)===e.ready_expense_minor);
  if (e.first_amount_minor !== undefined) check('首笔后文更正', singles[0]?.amount_minor===e.first_amount_minor);
  if (e.date) check('所有日期', items.every(i=>i.occurred_on===e.date));
  if (e.source) check('所有平台', items.every(i=>i.source===e.source));
  if (e.ignored_contains) e.ignored_contains.forEach(t=>check('明确忽略/'+t, proposal.ignored.some(i=>i.evidence.some(r=>r.quote.includes(t)))));
  if (e.recurring) {
    check('循环数量', recurring.length===e.recurring.length);
    e.recurring.forEach((want,n)=> {
      check(`循环${n+1}/monthly`,recurring[n]?.recurrence.cycle==='monthly');
      for(const [key,value] of Object.entries(want)) check(`循环${n+1}/${key}`, (key==='amount_minor'?recurring[n]?.amount_minor:recurring[n]?.recurrence[key])===value);
    });
  }
  if (e.preview_count !== undefined) {
    let count=0,total=0;
    for(const i of recurring) {
      const r=i.recurrence;
      if(r.cycle!=='monthly'||!r.start_month||!r.through_month||r.ongoing) continue;
      const month=v=>Number(v.slice(0,4))*12+Number(v.slice(5));
      const n=month(r.through_month)-month(r.start_month)+1;
      count+=n;total+=n*(i.amount_minor??0);
    }
    check('循环预览数量',count===e.preview_count);
    check('循环预览整数分合计',total===e.preview_expense_minor);
  }
  check('只提出候选，保存笔数为零',proposal.saved_entries===0&&items.every(i=>i.requires_confirmation));
  // These are architectural facts, not a fake measured capability of the model.
  const excluded = Object.keys(e).filter(k=>['tools_called','entries_saved','old_entries_unchanged'].includes(k));
  return { pass: failures.length===0, checked, failures, architectural_invariants: excluded };
}

export function evaluateEnvelope(envelope, fixture, suite, model=FREE_MODEL, version=PROMPT_VERSION) {
  const {context} = evaluationRequest(fixture, suite,version,model);
  const completion=extractCompletion(envelope,model);
  const proposal=version==='synthetic-free-v10' ? validateDenseProposal(completion.content,context) : ['synthetic-free-v8','synthetic-free-v9','synthetic-free-v10'].includes(version) ? validateGroupedProposal(completion.content,context) : ['synthetic-free-v5','synthetic-free-v6','synthetic-free-v7'].includes(version) ? validateCompactProposal(completion.content,context) : validateSemanticProposal(completion.content,context);
  return { ...completion, proposal, score:scoreProposal(proposal,fixture) };
}
