import test from 'node:test';
import assert from 'node:assert/strict';
import { chartData } from '../src/charts.js';
import { mutate, setLedger } from '../src/api.js';

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

test('unknown day is separate in daily charts while year/quarter lines retain monthly data',()=>{
 const stats={bucket:'day',buckets:['2026-09-01','2026-09-02','2026-09'],categories:[{id:'food',name:'餐饮',color_key:'blue',amount_minor:300}],series:[{bucket:'2026-09-02',category_id:'food',amount_minor:100},{bucket:'2026-09',category_id:'food',amount_minor:200}]};
 const bar=chartData(stats,'bar'),line=chartData(stats,'line'),pie=chartData(stats,'pie');
 assert.deepEqual(bar.datasets[0].data,[0,100,200]);assert.deepEqual(line.datasets[0].data,[0,100,null]);assert.deepEqual(line.datasets[1].data,[null,null,200]);assert.equal(line.datasets[1].showLine,false);assert.match(line.labels[2],/日期未指定/);assert.equal(pie.datasets[0].data[0],300);
 const year=chartData({...stats,bucket:'month',buckets:['2026-09'],series:[{bucket:'2026-09',category_id:'food',amount_minor:300}]},'line');assert.equal(year.datasets.length,1);assert.deepEqual(year.datasets[0].data,[300]);
});
