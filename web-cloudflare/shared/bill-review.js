import { parse } from 'csv-parse/browser/esm/sync';
import { parseAmount, validDate, today, canonical } from './format.js';

// Read-only source candidates. This module has no HTTP, storage or ledger writes.
export const REVIEW_LIMITS = { file_bytes: 4 * 1024 * 1024, batch_bytes: 20 * 1024 * 1024, files: 40, rows: 20000 };
export const SOURCE_NAMES = { alipay: '支付宝', wechat: '微信支付', jd_baitiao: '京东白条', meituan_monthly: '美团月付', douyin_monthly: '抖音月付' };
const requiredSources = ['alipay', 'wechat', 'jd_baitiao', 'meituan_monthly', 'douyin_monthly'];
const profiles = [
  { source: 'alipay', required: ['交易时间', '交易分类', '交易对方', '商品说明', '收/支', '收付款方式', '交易状态', '交易订单号'], fields: { date: '交易时间', kind: '交易分类', merchant: '交易对方', description: '商品说明', direction: '收/支', method: '收付款方式', status: '交易状态', id: '交易订单号', order: '商家订单号' } },
  { source: 'wechat', required: ['交易时间', '交易类型', '交易对方', '商品', '收/支', '支付方式', '当前状态', '交易单号'], fields: { date: '交易时间', kind: '交易类型', merchant: '交易对方', description: '商品', direction: '收/支', method: '支付方式', status: '当前状态', id: '交易单号', order: '商户单号' } },
];
const clean = v => String(v ?? '').trim();
const normalizedHeader = v => clean(v).replace(/[（(]元[）)]$/, '');
const issue = (file, line, code, message) => ({ file, line, code, message });
const idValue = v => {
  const id = clean(v);
  if (!id || id === '/' || id === '-') return '';
  if (/^[+-]?\d+(?:\.\d+)?[eE][+-]?\d+$/.test(id) || !/^[A-Za-z0-9_-]{1,180}$/.test(id)) throw new Error('交易号／订单号无效或已被科学计数法破坏，请使用原始文件');
  return id;
};
function eventDate(value, currentDay) {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(clean(value));
  if (!match || !validDate(match[1]) || (match[2] && (+match[2] > 23 || +match[3] > 59 || +match[4] > 59))) throw new Error('日期／时间无效，不从文件名或今天猜测');
  if (match[1] > currentDay) throw new Error('记录日期在今天之后，需要核查');
  return { occurred_on: match[1], local_time: match[2] ? `${match[2]}:${match[3]}:${match[4]}` : null };
}
function amountValue(value) {
  const text = clean(value).replace(/^[¥￥]\s*/, '');
  if (/^0(?:\.0{1,2})?$/.test(text)) return 0;
  return parseAmount(text);
}
export function decodeBill(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > REVIEW_LIMITS.file_bytes) throw new Error('每份原始 CSV 最大 4 MB');
  if (!bytes.byteLength) throw new Error('文件为空');
  if ((bytes[0] === 0x50 && bytes[1] === 0x4b) || (bytes[0] === 0xd0 && bytes[1] === 0xcf) || (bytes[0] === 0x25 && bytes[1] === 0x50)) throw new Error('当前先支持原始 CSV；ZIP、Excel、PDF 需后续适配，不能直接改扩展名');
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder('utf-16le', { fatal: true }).decode(bytes), encoding: 'UTF-16LE' };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'UTF-8' }; }
  catch { return { text: new TextDecoder('gb18030', { fatal: true }).decode(bytes), encoding: 'GB18030' }; }
}
function classification(event) {
  if (!['expense', 'fee'].includes(event.kind)) return { category_id: null, basis: '此事件不直接作为消费分类' };
  if (event.kind === 'fee') return { category_id: 'other', basis: '已明确标为费用，暂归其他' };
  const name = event.source_category;
  const categories = { '餐饮美食': 'food', '餐饮': 'food', '交通出行': 'transport', '交通': 'transport', '服饰装扮': 'shopping', '数码电器': 'shopping', '购物': 'shopping', '文化休闲': 'entertainment', '医疗健康': 'medical', '医疗': 'medical', '教育培训': 'education', '教育': 'education', '住房物业': 'housing', '生活缴费': 'living' };
  return categories[name] ? { category_id: categories[name], basis: `来源分类：${name}（仅建议）` } : { category_id: null, basis: '商品／商户用途待确认，不仅凭平台名称分类' };
}
function inferKind(event) {
  const text = `${event.source_category} ${event.description} ${event.merchant}`;
  if (/白条还款|月付还款|花呗还款|信用卡还款|还信用卡/.test(text)) return { kind: 'repayment_unknown', review: '还款记录未拆分本金与费用，也不能据此还原原始消费' };
  if (/退款|退货/.test(event.source_category) || (event.direction === '收入' && /退款/.test(text))) return { kind: 'refund', review: '退款需关联原交易并核对是否冲抵欠款，不能作为普通收入' };
  if (/转账|红包|亲属卡/.test(event.source_category)) return { kind: 'unknown', review: '转账／红包／亲属卡需确认用途，不能假定为本人中性转账' };
  if (/充值|提现/.test(event.source_category)) return { kind: 'transfer', review: '充值／提现不作为消费；需确认来源及后续实际消费覆盖' };
  if (!['支出', '收入'].includes(event.direction)) return { kind: 'unknown', review: '不计收支或未知方向需核对用途' };
  if (/退款|退还/.test(event.status)) return { kind: event.direction === '支出' ? 'expense' : 'refund', review: '支付行标为已退款，保留原金额；缺少独立退款日期／金额时不猜测净支出' };
  if (!['交易成功', '支付成功', '已到账', '收款成功', '已收钱', '对方已收钱', '已存入零钱'].includes(event.status)) return { kind: 'unknown', review: `未识别交易状态“${event.status || '空'}”，不能当作已消费` };
  return { kind: event.direction === '支出' ? 'expense' : 'income', review: '' };
}
export function parseBillText(text, { file = '原始账单.csv', account = '本人主账号', currentDay = today() } = {}) {
  if (!account.trim() || account.length > 80) throw new Error('来源账户标记须为 1–80 字');
  if (new TextEncoder().encode(text).byteLength > REVIEW_LIMITS.file_bytes) throw new Error('每份原始 CSV 最大 4 MB');
  let rows;
  try { rows = parse(text, { bom: true, skip_empty_lines: true, relax_column_count: true, max_record_size: 16384, info: true }); }
  catch { return { file, source: null, events: [], excluded: [], issues: [issue(file, null, 'MALFORMED_CSV', 'CSV 结构损坏、引号未闭合或单行过长；整份文件未计入')] }; }
  if (rows.length > REVIEW_LIMITS.rows + 100) throw new Error('单批最多 20,000 行，请按月份拆分');
  let profile, headerIndex = -1, header;
  for (let i = 0; i < Math.min(rows.length, 100); i++) {
    const candidate = rows[i].record.map(normalizedHeader);
    profile = profiles.find(p => p.required.every(k => candidate.includes(k)) && candidate.includes('金额'));
    if (profile) { headerIndex = i; header = candidate; break; }
  }
  if (!profile) return { file, source: null, events: [], excluded: [], issues: [issue(file, null, 'UNSUPPORTED_TEMPLATE', '尚未识别的原始格式；目前适配支付宝手机 CSV 与微信 CSV，白条／月付须按真实样本适配')] };
  while (header.at(-1) === '') header.pop();
  if (new Set(header).size !== header.length) return { file, source: profile.source, events: [], excluded: [], issues: [issue(file, rows[headerIndex].info.lines, 'DUPLICATE_HEADER', '表头重复，不能确定字段含义')] };
  const events = [], excluded = [], issues = [];
  for (const { record, info } of rows.slice(headerIndex + 1)) {
    const row = record.map(clean), line = info.lines;
    // Known separator/footer patterns only. Unknown trailing content is an issue.
    if (/^-{3,}/.test(row[0]) || /^(?:共\d+笔记录|导出时间[:：]|注[:：])/.test(row[0])) { excluded.push({ file, line, reason: '文件说明／汇总分隔行' }); continue; }
    while (row.length > header.length && row.at(-1) === '') row.pop();
    if (row.length !== header.length) { issues.push(issue(file, line, 'COLUMN_COUNT', '本行列数与表头不一致，未计入')); continue; }
    const fields = Object.fromEntries(header.map((key, i) => [key, row[i]]));
    try {
      const pick = key => fields[profile.fields[key]] || '';
      const event = { source: profile.source, account: account.trim(), file, line, source_category: pick('kind'), merchant: pick('merchant'), description: pick('description'), direction: pick('direction'), payment_method: pick('method'), status: pick('status'), transaction_id: idValue(pick('id')), merchant_order_id: idValue(pick('order')), amount_minor: amountValue(fields['金额']), ...eventDate(pick('date'), currentDay) };
      if (/^(交易关闭|支付失败|未支付|订单取消|已取消)$/.test(event.status)) { excluded.push({ file, line, reason: `未成功支付：${event.status}` }); continue; }
      if (!event.amount_minor) { excluded.push({ file, line, reason: '零金额，不生成正式消费' }); continue; }
      if (!event.transaction_id) throw new Error('缺少原始交易号，不能可靠去重');
      const { kind, review } = inferKind(event);
      Object.assign(event, { kind, review_reasons: review ? [review] : [], ...classification({ ...event, kind }) });
      event.key = canonical([event.source, event.account, event.transaction_id, event.kind]);
      events.push(event);
    } catch (error) { issues.push(issue(file, line, 'INVALID_ROW', error.message)); }
  }
  return { file, source: profile.source, events, excluded, issues, data_rows: rows.length - headerIndex - 1 };
}
function financialSignature(event) {
  const { file, line, review_reasons, ...fields } = event;
  return canonical(fields);
}
export function reviewBills(results) {
  const allEvents = results.flatMap(r => r.events), issues = results.flatMap(r => r.issues), excluded = results.flatMap(r => r.excluded);
  if (results.length > REVIEW_LIMITS.files || results.reduce((n, r) => n + (r.data_rows || r.events.length), 0) > REVIEW_LIMITS.rows) throw new Error('单批最多 40 份文件、20,000 行');
  const groups = new Map(), events = [], duplicates = [], conflicts = [];
  for (const event of allEvents) {
    const group = groups.get(event.key) || [];
    group.push(event); groups.set(event.key, group);
  }
  for (const group of groups.values()) {
    const byContent = new Map();
    for (const row of group) {
      const signature = financialSignature(row);
      if (byContent.has(signature)) duplicates.push({ file: row.file, line: row.line, same_as: { file: byContent.get(signature).file, line: byContent.get(signature).line } });
      else byContent.set(signature, row);
    }
    const variants = [...byContent.values()].map(row => ({ ...row, review_reasons: [...row.review_reasons] }));
    if (variants.length > 1) {
      variants.forEach(row => row.review_reasons.push('同一来源交易号存在不同金额／日期／状态，不能自动覆盖'));
      conflicts.push({ key: group[0].key, locations: variants.map(({ file, line }) => ({ file, line })) });
    }
    events.push(...variants);
  }
  const possibleGroups = new Map();
  for (const event of events) {
    if (!['expense', 'income', 'refund'].includes(event.kind)) continue;
    const key = canonical([event.account, event.kind, event.occurred_on, event.amount_minor, event.merchant]);
    const group = possibleGroups.get(key) || [];
    group.push(event); possibleGroups.set(key, group);
  }
  const possible_duplicates = [];
  for (const group of possibleGroups.values()) {
    if (group.length < 2 || new Set(group.map(row => row.key)).size < 2) continue;
    group.forEach(row => row.review_reasons.push('同日同额同商户：可能重复，也可能是两笔真实消费；未自动合并'));
    possible_duplicates.push(group.map(({ file, line }) => ({ file, line })));
  }
  const by_month = new Map(), totals = { expense_minor: 0, income_minor: 0, refund_evidence_minor: 0, repayment_unresolved_minor: 0, review_count: 0, candidate_count: 0 };
  for (const event of events) {
    if (event.kind === 'refund') totals.refund_evidence_minor += event.amount_minor;
    if (event.kind === 'repayment_unknown') totals.repayment_unresolved_minor += event.amount_minor;
    if (event.review_reasons.length) { totals.review_count++; continue; }
    totals.candidate_count++;
    const month = event.occurred_on.slice(0, 7), row = by_month.get(month) || { month, expense_minor: 0, income_minor: 0, count: 0 };
    row.count++;
    if (event.kind === 'expense') { totals.expense_minor += event.amount_minor; row.expense_minor += event.amount_minor; }
    if (event.kind === 'income') { totals.income_minor += event.amount_minor; row.income_minor += event.amount_minor; }
    by_month.set(month, row);
  }
  const sources = requiredSources.map(source => {
    const matched = events.filter(row => row.source === source), dates = matched.map(row => row.occurred_on).sort();
    return { source, name: SOURCE_NAMES[source], observed_count: matched.length, observed_from: dates[0] || null, observed_to: dates.at(-1) || null, coverage: 'unverified', note: matched.length ? '仅为文件中观察到的日期，不证明完整覆盖' : '未取得可识别的原始消费明细' };
  });
  return { format: 'moneytalk-bill-review', version: 1, read_only: true, complete: false, timezone: 'Asia/Shanghai', currency: 'CNY', files: results.map(({ file, source, encoding }) => ({ file, source, encoding: encoding || 'text' })), totals, by_month: [...by_month.values()].sort((a, b) => a.month.localeCompare(b.month)), sources, events, issues, excluded, duplicates, conflicts, possible_duplicates, limitations: ['这是候选证据报告，未保存到云端账本，不能作为完整收支统计。', '退款／还款及弱重复未核对前不计入候选消费总额；报告不计算最终净支出。', '白条、美团月付、抖音月付格式尚未取得真实样本；支付宝／微信还款不代表原始消费。', '分类仅为来源分类建议；尚未匹配 MoneyTalk 手录记录，也未访问邮箱或购物账号。'] };
}
export async function reviewFiles(files, options = {}) {
  if (!files.length || files.length > REVIEW_LIMITS.files) throw new Error('请选择 1–40 份原始 CSV');
  if (files.reduce((n, file) => n + file.size, 0) > REVIEW_LIMITS.batch_bytes) throw new Error('单批文件合计最大 20 MB');
  const results = []; let expandedBytes = 0;
  const parseFile = (name, bytes) => {
    expandedBytes += bytes.byteLength;
    if (expandedBytes > REVIEW_LIMITS.batch_bytes) throw new Error('解压后的本批文件超过 20 MB');
    const { text, encoding } = decodeBill(bytes);
    return { ...parseBillText(text, { ...options, file: name }), encoding };
  };
  for (const [index, file] of files.entries()) {
    options.signal?.throwIfAborted();
    const beforeExpanded = expandedBytes;
    try {
      if (file.size > REVIEW_LIMITS.file_bytes) throw new Error('每份原始 CSV 最大 4 MB');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.byteLength > REVIEW_LIMITS.file_bytes) throw new Error('每份原始文件最大 4 MB');
      if (bytes[0] === 0x50 && bytes[1] === 0x4b && !/\.xlsx$/i.test(file.name)) {
        const { readBillZip } = await import('./bill-zip.js');
        const password = options.passwordForFile ? await options.passwordForFile(file.name, index) : '';
        const entries = await readBillZip(bytes, { password, budget: REVIEW_LIMITS.batch_bytes - expandedBytes, maxFiles: REVIEW_LIMITS.files - results.length, signal: options.signal });
        const archiveResults = [];
        for (const entry of entries) {
          const name = `${file.name} / ${entry.name}`;
          archiveResults.push(entry.error ? { file: name, source: null, events: [], excluded: [], issues: [issue(name, null, 'UNSUPPORTED_ATTACHMENT', entry.error)] } : parseFile(name, entry.bytes));
        }
        results.push(...archiveResults);
      } else results.push(parseFile(file.name, bytes));
    } catch (error) { expandedBytes = beforeExpanded; options.signal?.throwIfAborted(); results.push({ file: file.name, source: null, events: [], excluded: [], issues: [issue(file.name, null, 'FILE_ERROR', error.message)] }); }
  }
  return reviewBills(results);
}
