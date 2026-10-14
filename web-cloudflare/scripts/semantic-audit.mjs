// Evaluation only: replay frozen synthetic responses, never invoke a provider or write a ledger.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { semanticContext, validateSemanticProposal } from '../shared/semantic-proposal.js';
import { validateCompactProposal } from '../shared/semantic-wire.js';
import { validateGroupedProposal } from '../shared/semantic-groups.js';
import { COMPARISON_MODEL, extractCompletion, scoreProposal, PROMPT_VERSION, evaluationRequest } from './semantic-evaluation.mjs';

const directory = new URL('../docs/semantic-intake-20261013/', import.meta.url);
export const audits = JSON.parse(readFileSync(new URL('golden-audits.json', directory)));
export const goldenSuite = JSON.parse(readFileSync(new URL('golden-cases.json', directory)));
export const sha256 = text => createHash('sha256').update(text).digest('hex');

export function auditProposal(proposal, spec) {
  const failures = [], checked = [];
  const check = (label, pass) => { checked.push(label); if (!pass) failures.push(label); };
  if (!spec) return { pass: false, checked: [], failures: ['缺少独立逐项答案'] };
  const singles = proposal.items.filter(i => i.recurrence.cycle === 'single');
  const recurring = proposal.items.filter(i => i.recurrence.cycle !== 'single');
  check('完整单笔数量', singles.length === spec.records.length);
  check('完整循环数量', recurring.length === (spec.recurring_count || 0));
  spec.records.forEach((want, n) => {
    const got = singles[n];
    for (const [key, value] of Object.entries(want)) {
      if (key === 'title' && value === null) continue; // User gave no product name.
      const actual = key === 'date' ? got?.occurred_on : key === 'category_id' ? got?.category.id : key === 'suggested_category' ? got?.category.suggested_name : key === 'recommended_ids' ? got?.category.alternatives : got?.[key];
      const pass = key === 'title' ? typeof actual === 'string' && value.split(/\s+/).every(s => actual.includes(s)) : key === 'recommended_ids' ? value.every(id => actual?.includes(id)) : actual === value;
      check(`完整第${n + 1}项/${key}`, pass);
    }
  });
  recurring.forEach((got, n) => {
    for (const key of ['charge_day', 'ongoing']) if (key in spec) check(`完整循环${n + 1}/${key}`, got.recurrence[key] === spec[key]);
    check(`完整循环${n + 1}/source`, got.source === spec.recurring_source);
    check(`完整循环${n + 1}/type`, got.type === spec.recurring_type);
  });
  check('候选零保存', proposal.saved_entries === 0 && proposal.items.every(i => i.requires_confirmation));
  return { pass: !failures.length, checked, failures };
}

export function replayEvidence(record, fixture, suite = goldenSuite, spec = audits.cases[fixture.id]) {
  try {
    if (record.synthetic_only !== true || record.http_status !== 200 || record.model_requested !== COMPARISON_MODEL || !record.request) throw Error('不是可核对的固定模型虚构响应');
    if (record.fixture_sha256 !== sha256(fixture.raw)) throw Error('原文快照不一致');
    // Python ensure_ascii=False json.dumps separators are deliberately reproducible here.
    const pythonJSON = v => {
      if (Array.isArray(v)) return '[' + v.map(pythonJSON).join(', ') + ']';
      if (v !== null && typeof v === 'object') return '{' + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ': ' + pythonJSON(x)).join(', ') + '}';
      return JSON.stringify(v);
    };
    if (record.request_sha256 !== sha256(pythonJSON(record.request))) throw Error('请求快照校验失败');
    if (JSON.stringify(record.request) !== JSON.stringify(evaluationRequest(fixture, suite, record.prompt_version, COMPARISON_MODEL).body)) throw Error('不是当前固定提示与参数组合，需保留原结果并独立复测');
    const context = semanticContext(fixture.raw, suite.anchor_day, [...suite.categories, ...(fixture.expected.category_override || [])]);
    if (record.request.messages?.[1]?.content !== JSON.stringify(context)) throw Error('实际发送原文或分类不一致');
    const reasoning=['synthetic-free-v6','synthetic-free-v7','synthetic-free-v8'].includes(record.prompt_version) ? record.request.chat_template_kwargs?.enable_thinking===false && !('reasoning_effort' in record.request) : record.request.reasoning_effort==='low';
    if (record.request.tools || record.request.stream !== false || record.request.store !== false || record.request.tool_choice !== 'none' || record.request.temperature !== 0 || record.request.seed !== 42 || !reasoning) throw Error('存储或工具边界或固定参数不符');
    const completion = extractCompletion(record.envelope, COMPARISON_MODEL);
    if (!['synthetic-free-v4', 'synthetic-free-v5','synthetic-free-v6','synthetic-free-v7','synthetic-free-v8'].includes(record.prompt_version)) throw Error('未知提示版本');
    const proposal = record.prompt_version==='synthetic-free-v8' ? validateGroupedProposal(completion.content,context) : ['synthetic-free-v5','synthetic-free-v6','synthetic-free-v7'].includes(record.prompt_version) ? validateCompactProposal(completion.content, context) : validateSemanticProposal(completion.content, context);
    const original = scoreProposal(proposal, fixture), audit = auditProposal(proposal, spec);
    return { pass: original.pass && audit.pass, original, audit, proposal };
  } catch (e) { return { pass: false, validation_error: e.message }; }
}

export function buildCoreReport(root = fileURLToPath(directory), version = PROMPT_VERSION) {
  if (!['synthetic-free-v4','synthetic-free-v5','synthetic-free-v6','synthetic-free-v7','synthetic-free-v8'].includes(version)) throw Error('未知报告版本');
  const prefix = 'free-qwen38-' + version.split('-').at(-1);
  const folders = readdirSync(root).filter(n => n === prefix || n.startsWith(prefix + '-'));
  const rows = goldenSuite.cases.filter(c => c.id.startsWith('SEM')).map(fixture => {
    const attempts = folders.flatMap(folder => {
      const path = `${root}/${folder}/${fixture.id}.json`;
      if (!existsSync(path)) return [];
      const record = JSON.parse(readFileSync(path));
      if (record.prompt_version !== version) return [];
      const replay = replayEvidence(record, fixture);
      const state=JSON.parse(readFileSync(`${root}/${folder}/reservations.json`));
      const utc=state.attempts.find(a=>a.case===fixture.id)?.utc;
      const inferred=record.http_status===200 && record.envelope?.success===true && record.envelope?.result?.model===COMPARISON_MODEL;
      return [{ path: `${folder}/${fixture.id}.json`, seconds: record.seconds, pass: replay.pass,
        inferred, http_status: record.http_status,
        failures: replay.validation_error ? [replay.validation_error] : [...replay.original.failures, ...replay.audit.failures],
        utc, system_sha256: sha256(record.request?.messages?.[0]?.content || ''), model: record.envelope?.result?.model,
        settings: { temperature: record.request?.temperature, seed: record.request?.seed, reasoning_effort: record.request?.reasoning_effort, chat_template_kwargs:record.request?.chat_template_kwargs } }];
    }).sort((a,b)=>(a.utc || '').localeCompare(b.utc || ''));
    // The latest attempt is authoritative; an earlier pass cannot mask a later regression.
    const measured=attempts.filter(a=>a.inferred);
    return { id: fixture.id, requested: attempts.length > 0, attempted: measured.length > 0,
      pass: measured.at(-1)?.pass === true, attempts };
  });
  const attempted = rows.filter(r => r.attempted).length, passed = rows.filter(r => r.pass).length;
  const combinations = new Set(rows.flatMap(r => r.attempts).filter(a=>a.inferred).map(a => JSON.stringify([a.system_sha256, a.model, a.settings])));
  return { generated_at: new Date().toISOString(), model: COMPARISON_MODEL, prompt_version: version,
    audit_version: audits.version, total: rows.length, attempted, passed, untested: rows.filter(r => !r.attempted).map(r => r.id),
    failed: rows.filter(r => r.attempted && !r.pass).map(r => r.id), fixed_combination: combinations.size === 1,
    core_pass: attempted === 25 && passed === 25 && combinations.size === 1,
    website_ready: false, reason: '核心全通过仍需杂乱长段、分类复核及网站完整链路验收', rows };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(buildCoreReport(), null, 2));
