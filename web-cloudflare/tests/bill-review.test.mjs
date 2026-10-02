import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBillText, reviewBills, reviewFiles, decodeBill, REVIEW_LIMITS } from '../shared/bill-review.js';
import { DEMO_ALIPAY, DEMO_WECHAT } from '../shared/bill-demo.js';
import { reviewLocalBills } from '../scripts/review-bills.mjs';
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js/lib/zip-core-native.js';
import { readBillZip } from '../shared/bill-zip.js';
import { reviewRows, reviewSummary } from '../src/bill-review-ui.js';

const options = { currentDay: '2026-10-02', account: '本人主账号' };
const a = (text = DEMO_ALIPAY, extra = {}) => parseBillText(text, { ...options, file: '支付宝.csv', ...extra });
const w = (text = DEMO_WECHAT, extra = {}) => parseBillText(text, { ...options, file: '微信.csv', ...extra });
test('native source headers, quoted commas, cents and all three credit repayments are explicit', () => {
  const report = reviewBills([a(), w()]);
  assert.equal(report.read_only, true); assert.equal(report.complete, false);
  assert.equal(report.totals.expense_minor, 123150); // 28.50 + 1200 + 3; ambiguous 5 + 5 excluded.
  assert.equal(report.totals.income_minor, 0);
  assert.equal(report.totals.refund_evidence_minor, 20000);
  assert.equal(report.totals.repayment_unresolved_minor, 24500);
  assert.equal(report.events.find(e => e.transaction_id === 'DEMO-A2').description, '耳机, 黑色');
  assert.equal(report.events.filter(e => e.kind === 'repayment_unknown').length, 3);
  assert.equal(report.issues.length, 1); assert.equal(report.excluded.length, 1);
  assert.equal(report.possible_duplicates.length, 1);
  assert.equal(report.sources.filter(s => !s.observed_count).length, 3);
  assert.ok(report.sources.every(s => s.coverage === 'unverified'));
});
test('duplicate files and overlapping records count once, preserving different source accounts', () => {
  const parsed = a(), before = JSON.stringify(parsed);
  const report = reviewBills([parsed, a(DEMO_ALIPAY, { file: '重叠.csv' })]);
  assert.equal(report.totals.expense_minor, 122850); assert.equal(report.duplicates.length, 5);
  assert.equal(JSON.stringify(parsed), before);
  const twoAccounts = reviewBills([parsed, a(DEMO_ALIPAY, { account: '另一支付宝账号' })]);
  assert.equal(twoAccounts.totals.expense_minor, 245700); assert.equal(twoAccounts.duplicates.length, 0);
});
test('same transaction identity with changed money/status is a conflict, never last-file-wins', () => {
  const report = reviewBills([a(), a(DEMO_ALIPAY.replace('28.50', '29.50'), { file: '冲突.csv' })]);
  assert.equal(report.conflicts.length, 1); assert.equal(report.totals.expense_minor, 120000);
  assert.ok(report.events.filter(e => e.transaction_id === 'DEMO-A1').every(e => e.review_reasons.length));
  const refundState = reviewBills([a(), a(DEMO_ALIPAY.replace('交易成功,DEMO-A2', '已全额退款,DEMO-A2'), { file: '更新.csv' })]);
  assert.equal(refundState.conflicts.length, 1); assert.equal(refundState.totals.expense_minor, 2850);
});
test('same amount/day across payment sources is not blindly merged', () => {
  const wx = DEMO_WECHAT.replace('演示公交,车票,支出,¥3.00', '演示餐馆,午餐,支出,¥28.50').replace('2026-09-08 08:00:00', '2026-09-01 12:00:00');
  const report = reviewBills([a(), w(wx)]);
  assert.equal(report.duplicates.length, 0);
  assert.equal(report.possible_duplicates.length, 2);
  assert.equal(report.events.filter(e => e.merchant === '演示餐馆').length, 2);
});
test('reordered columns work; changed, duplicate or unsupported headers fail closed', () => {
  const lines = DEMO_WECHAT.trimEnd().split('\n');
  const reordered = [lines[0], ...lines.slice(1).map(line => line.split(',').reverse().join(','))].join('\n');
  assert.equal(w(reordered).events.length, 5);
  assert.equal(w(DEMO_WECHAT.replace('金额(元)', '钱')).issues[0].code, 'UNSUPPORTED_TEMPLATE');
  assert.equal(w(DEMO_WECHAT.replace('备注\n', '交易时间\n')).issues[0].code, 'DUPLICATE_HEADER');
  assert.equal(a('白条账单\n日期,本金,服务费\n2026-09-01,100,5').issues[0].code, 'UNSUPPORTED_TEMPLATE');
});
test('malformed amounts, dates and scientific notation IDs are quarantined without truncation', () => {
  for (const value of ['', '-1', '1.234', '1e3', 'NaN', '1,23.00', '100000000']) {
    const parsed = w(DEMO_WECHAT.replace('¥3.00', value));
    assert.ok(parsed.issues.some(i => i.line === 3), value);
    assert.equal(parsed.events.some(e => e.transaction_id === 'DEMO-W1'), false);
  }
  for (const value of ['2025-02-29 08:00:00', '2026-09-08 24:00:00', '2026-09-08 08:60:00', '2026-10-03 08:00:00']) {
    assert.ok(w(DEMO_WECHAT.replace('2026-09-08 08:00:00', value)).issues.some(i => i.line === 3));
  }
  assert.ok(w(DEMO_WECHAT.replace('DEMO-W1', '4.2026E+27')).issues.some(i => i.line === 3));
  assert.equal(w(DEMO_WECHAT.replace('¥3.00', '0.00')).excluded.length, 1);
  assert.equal(w(DEMO_WECHAT.replace('DEMO-W1', '/')).issues.length, 1);
});
test('unknown status, neutral movements and refunded payments do not become invented income/spend', () => {
  for (const status of ['处理中', '已退款(1.00)', '未知成功']) {
    const report = reviewBills([w(DEMO_WECHAT.replace('支付成功,DEMO-W1', `${status},DEMO-W1`))]);
    assert.equal(report.totals.expense_minor, 0);
    assert.ok(report.events.find(e => e.transaction_id === 'DEMO-W1').review_reasons.length);
  }
  const report = reviewBills([a(DEMO_ALIPAY.replace('餐饮美食,演示餐馆', '充值,演示餐馆'))]);
  assert.equal(report.events.find(e => e.transaction_id === 'DEMO-A1').kind, 'transfer');
  assert.equal(report.totals.expense_minor, 120000);
});
test('UTF8 BOM, GB encoded fields, binary formats and malformed CSV have safe boundaries', () => {
  const utf8 = new TextEncoder().encode(`\ufeff${DEMO_WECHAT}`);
  assert.equal(w(decodeBill(utf8).text).events.length, 5);
  assert.deepEqual(decodeBill(new Uint8Array([0xbd, 0xbb, 0xd2, 0xd7])), { text: '交易', encoding: 'GB18030' });
  for (const bytes of [[0x50, 0x4b, 3, 4], [0xd0, 0xcf], [0x25, 0x50]]) assert.throws(() => decodeBill(new Uint8Array(bytes)), /CSV/);
  assert.throws(() => decodeBill(new Uint8Array()));
  assert.throws(() => decodeBill(new Uint8Array(REVIEW_LIMITS.file_bytes + 1)));
  assert.equal(w(`${DEMO_WECHAT}"broken`).issues[0].code, 'MALFORMED_CSV');
});
test('batch preserves failed files instead of showing a misleading complete success', async () => {
  const file = (name, text) => ({ name, size: text.length, arrayBuffer: async () => new TextEncoder().encode(text) });
  const report = await reviewFiles([file('有效.csv', DEMO_WECHAT), file('坏.csv', 'unknown')], options);
  assert.equal(report.files.length, 2); assert.equal(report.issues.length, 1); assert.equal(report.complete, false);
  await assert.rejects(reviewFiles([], options));
  await assert.rejects(reviewFiles(Array(41).fill(file('x', 'x')), options));
  await assert.rejects(reviewFiles([{ size: REVIEW_LIMITS.batch_bytes + 1 }], options));
});
test('long transaction IDs stay strings, formula and HTML text remain inert data', () => {
  const id = '420000000000000000000000000001';
  const parsed = w(DEMO_WECHAT.replace('DEMO-W1', id).replace('车票', '=SUM(1+1)<img src=x>'));
  assert.equal(parsed.events[0].transaction_id, id);
  assert.equal(parsed.events[0].description, '=SUM(1+1)<img src=x>');
  assert.equal(reviewRows(parsed.events).includes('<img src=x>'), false);
  assert.ok(reviewRows(parsed.events).includes('&lt;img src=x&gt;'));
  assert.ok(reviewSummary(reviewBills([parsed])).includes('不能当作完整历史支出'));
});
async function zip(entries, settings = {}) {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false, useCompressionStream: true });
  for (const [name, content] of entries) await writer.add(name, new TextReader(content), settings);
  return writer.close();
}
test('AES and legacy password ZIPs are decoded locally; missing/wrong passwords remain explicit', async () => {
  for (const settings of [{ password: 'synthetic-code', encryptionStrength: 3 }, { password: 'synthetic-code', zipCrypto: true }]) {
    const bytes = await zip([['支付宝.csv', DEMO_ALIPAY], ['微信.csv', DEMO_WECHAT]], settings);
    const file = { name: '虚构压缩账单.zip', size: bytes.byteLength, arrayBuffer: async () => bytes };
    const report = await reviewFiles([file], { ...options, passwordForFile: () => 'synthetic-code' });
    assert.equal(report.totals.expense_minor, 123150); assert.equal(report.files.length, 2);
    assert.ok(report.events.every(e => e.file.startsWith('虚构压缩账单.zip / ')));
    assert.equal(JSON.stringify(report).includes('synthetic-code'), false);
    const missing = await reviewFiles([file], options);
    assert.ok(missing.issues[0].message.includes('解压码')); assert.equal(missing.events.length, 0);
    const wrong = await reviewFiles([file], { ...options, passwordForFile: () => 'wrong' });
    assert.equal(wrong.events.length, 0); assert.ok(wrong.issues[0].message.includes('失败'));
  }
});
test('ZIP expansion limits, unsafe paths, unsupported inner files and corrupted payloads fail safely', async () => {
  const bytes = await zip([['a.csv', DEMO_ALIPAY], ['b.csv', DEMO_WECHAT]]);
  await assert.rejects(readBillZip(bytes, { budget: 20 }), /限额/);
  await assert.rejects(readBillZip(bytes, { maxFileBytes: 20 }), /超过/);
  await assert.rejects(readBillZip(bytes, { maxFiles: 1 }), /过多/);
  const traversal = await zip([['../bad.csv', DEMO_ALIPAY]]);
  await assert.rejects(readBillZip(traversal), /不安全/);
  const mixed = await zip([['a.csv', DEMO_ALIPAY], ['unsupported.xlsx', 'not executed']]);
  const report = await reviewFiles([{ name: 'mixed.zip', size: mixed.byteLength, arrayBuffer: async () => mixed }], options);
  assert.equal(report.issues.length, 2); // Bad amount in CSV plus unsupported attachment.
  assert.ok(report.issues.some(i => i.code === 'UNSUPPORTED_ATTACHMENT'));
  const broken = bytes.slice(), header = new DataView(broken.buffer);
  const bodyOffset = 30 + header.getUint16(26, true) + header.getUint16(28, true);
  broken[bodyOffset + 30] ^= 255; // Corrupt the actual compressed payload, not an optional header.
  const invalid = await reviewFiles([{ name: 'broken.zip', size: broken.byteLength, arrayBuffer: async () => broken }], options);
  assert.equal(invalid.events.length, 0); assert.ok(invalid.issues.length);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(reviewFiles([{ name: 'x', size: 1 }], { ...options, signal: controller.signal }));
});
test('CLI creates private, complete source copies and reports; refuses overwrites and Git tracked output', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'moneytalk-bill-review-'));
  try {
    const input = join(temp, '原始.csv'), output = join(temp, 'review');
    await writeFile(input, DEMO_ALIPAY);
    const report = await reviewLocalBills([input], output, '测试账号');
    assert.equal(report.read_only, true);
    assert.equal(await readFile(join(output, '01-原始.csv'), 'utf8'), DEMO_ALIPAY);
    assert.equal(JSON.parse(await readFile(join(output, 'completed.json'), 'utf8')).read_only, true);
    assert.equal((await stat(join(output, 'review-report.json'))).mode & 0o777, 0o600);
    await assert.rejects(reviewLocalBills([input], output, '测试账号'), /EEXIST/);
    await assert.rejects(reviewLocalBills([input], new URL('../review-private', import.meta.url).pathname, '测试账号'), /Git/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
