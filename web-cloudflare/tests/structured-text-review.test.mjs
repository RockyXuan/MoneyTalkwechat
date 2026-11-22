import assert from 'node:assert/strict';
import test from 'node:test';
import {parseTextIntake} from '../shared/text-records.js';
import {batchSources, sourceTitle} from '../shared/platform-sources.js';

const categories = [
  {id:'food',type:'expense',name:'食物'},
  {id:'care',type:'expense',name:'保健品'},
  {id:'transport',type:'expense',name:'交通'}
];

test('a spoken item list keeps source and classification separate from purchases', () => {
  const raw = [
    '记一下淘宝的账：', '', '• A区纱门：10 元', '• 木衣架：2 元', '• 拼音读物：35 元',
    '• 绘本和录音笔：41 元', '• 小玩具：3.5 元', '',
    '保健品 / 健康类（我自己用的）：', '• 维生素：25 元（算到保健品）', '',
    '食物类：', '• 车厘子：8 元', '• 车厘子：4 元', '',
    '我自己用的个人用品 / 衣服类：', '• 洗发水：12 元', '• 保暖裤：16 元',
    '• 外套：51 元', '• 另一件外套：43 元'
  ].join('\n');
  const {segments,count}=parseTextIntake(raw,'2026-11-22',categories);
  const items=segments.flatMap(segment=>segment.items);
  assert.equal(count,12);
  assert.equal(segments.map(s=>s.original_text).join(''),raw);
  assert.deepEqual(items.map(i=>sourceTitle(i.title)),[
    'A区纱门','木衣架','拼音读物','绘本和录音笔','小玩具','维生素','车厘子','车厘子','洗发水','保暖裤','外套','另一件外套'
  ]);
  assert.deepEqual(items.map(i=>i.amount_minor),[1000,200,3500,4100,350,2500,800,400,1200,1600,5100,4300]);
  assert.ok(batchSources(segments[0]).every(i=>i.source==='淘宝'));
  assert.deepEqual(items.slice(5,8).map(i=>i.category_id),['care','food','food']);
  assert.equal(items[8].category_id,null);
  assert.equal(items[8].category_hint.name,'个人用品 / 衣服');
  assert.ok(items.every(i=>i.occurred_on==='2026-11'));
});

test('a source-only note yields no candidate, but a marked item missing its price remains', () => {
  assert.throws(()=>parseTextIntake('记一下淘宝的账：'),/没有识别到项目/);
  const raw='记一下淘宝的账：\n1. 雨伞：9 元\n2. 雨鞋\n记一下京东的账：\n• 插座：7 元';
  const {segments}=parseTextIntake(raw,'2026-11-22',categories);
  assert.deepEqual(segments[0].items.map(i=>i.amount_minor),[900,null,700]);
  assert.deepEqual(batchSources(segments[0]).map(i=>i.source),['淘宝','淘宝','京东']);
});
