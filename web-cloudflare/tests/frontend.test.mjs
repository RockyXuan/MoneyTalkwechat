import test from 'node:test';
import assert from 'node:assert/strict';
import { chartData } from '../src/charts.js';
import { mutate, setLedger } from '../src/api.js';
import { convertLegacyRows } from '../scripts/convert-legacy.mjs';

test('three chart modes preserve exact totals, zero days and stable category colors', () => {
  const stats = { bucket: 'day', buckets: ['2026-09-01', '2026-09-02', '2026-09-03'], categories: [{ id: 'a', name: '餐饮', color_key: 'blue', amount_minor: 101 }, { id: 'b', name: '购物', color_key: 'orange', amount_minor: 202 }], series: [{ bucket: '2026-09-01', category_id: 'a', amount_minor: 101 }, { bucket: '2026-09-03', category_id: 'b', amount_minor: 202 }] };
  const bar = chartData(stats, 'bar'), line = chartData(stats, 'line'), pie = chartData(stats, 'pie');
  for (const data of [bar, line, pie]) assert.equal(data.datasets.flatMap(d => d.data).reduce((a, b) => a + b, 0), 303);
  assert.deepEqual(bar.datasets[0].data, [101, 0, 0]);
  assert.equal(line.datasets[0].tension, 0);
  assert.equal(bar.datasets[0].backgroundColor, pie.datasets[0].backgroundColor[0]);
  stats.categories.reverse(); stats.categories[1].name = '新名称';
  assert.equal(chartData(stats, 'line').datasets[1].borderColor, bar.datasets[0].borderColor);
});
test('lost or truncated write responses are resolved by the same operation key', async () => {
  const original = globalThis.fetch, key = 'same-submission-key', result = { entry: { id: 'once' } };
  try {
    for (const failure of ['disconnect', 'truncated', 'gateway']) {
      const calls = []; setLedger('test-ledger');
      globalThis.fetch = async (path, options) => {
        calls.push([path, options]);
        if (path.includes('/operations/')) return Response.json({ found: true, result });
        if (failure === 'disconnect') throw new TypeError('offline');
        if (failure === 'truncated') return new Response('{', { headers: { 'Content-Type': 'application/json' } });
        return new Response('gateway', { status: 502 });
      };
      assert.deepEqual(await mutate('/entries', { amount_minor: 101 }, { key }), result);
      assert.equal(calls.length, 2); assert.equal(calls[1][0], `/api/operations/${key}`);
      assert.equal(calls[0][1].headers['Idempotency-Key'], key);
      assert.equal(calls[1][1].headers['X-Ledger-Id'], 'test-ledger');
    }
  } finally { globalThis.fetch = original; setLedger(null); }
});
test('legacy conversion isolates owners and quarantines missing amounts and bad dates', async () => {
  const row = { id: 'old-1', user_id: 'alice', amount: '12.30', category: '餐饮', expense_date: '2026-02-28', note: '原备注', created_at: '2026-02-28T10:00:00.000Z', updated_at: null };
  const rows = [row, { ...row, id: 'old-2', amount: null }, { ...row, id: 'old-3', expense_date: '2026-02-30' }, { ...row, id: 'other', user_id: 'bob' }];
  const before = JSON.stringify(rows);
  const result = await convertLegacyRows(rows, 'alice');
  assert.equal(result.backup.entries.length, 1); assert.equal(result.backup.entries[0].amount_minor, 1230);
  assert.equal(result.report.issues.length, 2); assert.equal(result.report.other_owner_rows, 1);
  assert.equal(result.report.copied_creation_time, 1); assert.equal(JSON.stringify(rows), before);
});
