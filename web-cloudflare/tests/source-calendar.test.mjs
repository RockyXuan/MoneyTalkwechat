import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarMonths,calendarDays,monthEnd,parseCoverageRange} from '../shared/source-calendar.js';
import {platformBoard} from '../shared/platform-board.js';
import {parseTextRecords} from '../shared/text-records.js';
test('daily color states follow explicit ranges and exact dates without filling gaps or assigning month-only records',()=>{
 const days=calendarDays('2024-02',[{from:'2024-01-30',to:'2024-02-03'},{from:'2024-02-10',to:'2024-02-12'},{from:'2024-02-11',to:'2024-02-14'}],[{date:'2024-02',count:3},{date:'2024-02-07',count:2}], '2024-02-20');
 assert.equal(days.length,29);assert.equal(days.filter(d=>d.status==='complete').length,8);assert.equal(days[6].count,2);assert.equal(days[6].status,'pending');assert.equal(days[7].count,0);assert.equal(days[19].status,'pending');assert.equal(days[20].status,'future');
 assert.equal(calendarDays('2025-02',[],[],'2026-01-01').length,28);assert.equal(calendarDays('2025-04',[],[],'2026-01-01').length,30);assert.equal(calendarDays('2025-05',[],[],'2026-01-01').length,31);
});
test('coverage keeps holes, overlap, leap days and isolated old months honest',()=>{
 const ranges=[{from:'2024-01-01',to:'2024-03-31'},{from:'2024-02-10',to:'2024-02-15'},{from:'2024-09-03',to:'2024-09-05'}];
 const m=calendarMonths(2024,ranges,[{date:'2024-06',count:2}]);assert.equal(m[1].covered,29);assert.equal(m[3].covered,0);assert.equal(m[8].covered,3);assert.equal(m[5].covered,0);assert.equal(m[5].recorded,2);assert.equal(monthEnd('2025-02'),'2025-02-28');
});
test('speech dates only suggest explicit valid past ranges, never save or guess vague years',()=>{
 assert.deepEqual(parseCoverageRange('2025年10月到2025年12月，已经核对了','2026-11-17'),{from:'2025-10-01',to:'2025-12-31'});
 assert.deepEqual(parseCoverageRange('2024年2月28日到2024年2月29日','2026-11-17'),{from:'2024-02-28',to:'2024-02-29'});
 for(const text of ['最近三个月','2025年2月30日','2026年12月','2025年12月到2025年10月','2025年1月、2025年3月、2025年5月'])assert.equal(parseCoverageRange(text,'2026-11-17'),null,text);
});
test('calendar record dots follow current dates and deletions without marking a whole month complete',()=>{
 const items=parseTextRecords('淘宝 · 合成杯子3元','2025-06-01'),b={id:'calendar-test',original_text:'淘宝',items,slots:[{item_id:items[0].id,occurred_on:'2025-06-01',current_occurred_on:'2025-08',entry_id:'e',category_id:'food'}]};
 let c=platformBoard([b]).find(g=>g.source==='淘宝').calendar;assert.deepEqual(c.dates,[{date:'2025-08',count:1}]);assert.equal(c.ranges.length,0);
 b.slots[0].deleted_at='2026-01-01';assert.equal(platformBoard([b]).find(g=>g.source==='淘宝').calendar.dates.length,0);
 const ranges=[{id:'r',source:'抖音（合成账号）',from:'2025-06-01',to:'2025-06-30'}];assert.equal(platformBoard([],ranges).find(g=>g.source==='抖音（合成账号）').calendar.ranges.length,1);assert.equal(platformBoard([],ranges).find(g=>g.source==='抖音').calendar.ranges.length,0);
});
