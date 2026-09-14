import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, decimal, money, today, validDate, shiftMonth, periodRange, buckets, validateBackup, digest, backupContent, csvCell } from '../shared/domain.js';
import { demoBackup } from '../shared/demo.js';

test('money parsing preserves cents and accepts well-grouped pasted amounts', () => {
  assert.equal(parseAmount('0.1') + parseAmount('0.20'), 30);
  assert.equal(parseAmount(' 1,234.56 '), 123456);
  assert.equal(parseAmount('99,999,999.99'), 9999999999);
  assert.equal(decimal(-301), '-3.01'); assert.equal(money(1800000), '¥ 18,000.00');
  for (const bad of ['', '0', '-1', '1.001', '1e3', 'NaN', 'Infinity', '1,23.45', '1.2.3', '100000000', '0x10', '¥10']) assert.throws(() => parseAmount(bad), bad);
});
test('Shanghai midnight, leap day and month boundaries', () => {
  assert.equal(today(new Date('2026-09-13T16:30:00Z')), '2026-09-14');
  assert.equal(validDate('2024-02-29'), true); assert.equal(validDate('2025-02-29'), false);
  assert.equal(validDate('2026-04-31'), false);
  assert.equal(shiftMonth('2026-01', 1), '2026-02'); assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.deepEqual(periodRange('2026-09', 'month', '2026-09-14'), { from: '2026-09-01', to: '2026-09-14', bucket: 'day' });
  assert.equal(periodRange('2024-02', 'month', '2026-09-14').to, '2024-02-29');
  assert.equal(buckets('2024-02-01', '2024-02-29', 'day').length, 29);
});
test('synthetic fixture has exact graph totals and preserves zeros only for empty days', async () => {
  const data = demoBackup(), v = validateBackup(data);
  assert.equal(v.valid, true); assert.equal(v.summary.expense_minor, 324800); assert.equal(v.summary.income_minor, 1800000);
  assert.equal(data.entries.filter(e => e.occurred_on === '2026-09-14').reduce((a, e) => a + e.amount_minor, 0), 4100);
  const shuffled = structuredClone(data); shuffled.entries.reverse(); shuffled.categories.reverse();
  assert.equal(await digest(backupContent(data)), await digest(backupContent(shuffled)));
});
test('backup validation rejects duplicate IDs, missing categories and malformed amounts', () => {
  for (const mutate of [b => b.entries.push(b.entries[0]), b => b.entries[0].category_id = 'missing', b => b.entries[0].amount_minor = null, b => b.entries[0].occurred_on = '2026-02-30', b => b.entries[0].note = 'x'.repeat(201), b => b.version = 2]) {
    const b = demoBackup(); mutate(b); assert.equal(validateBackup(b).valid, false);
  }
  const empty = demoBackup(); empty.entries = []; assert.equal(validateBackup(empty).summary.expense_minor, 0);
});
test('CSV quotes text and prevents spreadsheet formula injection', () => {
  assert.equal(csvCell('a,"b"'), '"a,""b"""');
  assert.equal(csvCell('=HYPERLINK("bad")').startsWith('"\''), true);
  assert.equal(csvCell('  +1').startsWith('"\''), true);
  assert.equal(csvCell('\tfoo').startsWith('"\''), true);
});
