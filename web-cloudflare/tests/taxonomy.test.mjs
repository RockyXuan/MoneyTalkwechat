import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_OWNERS,
  RECOMMENDED_SUBCATEGORIES,
  RECOMMENDED_NEW_MAJORS,
  STARTER_PACKS,
  recommendedSubcategoriesFor,
} from '../shared/taxonomy.js';
import { parseTextRecords, parseTextIntake, compileTextItems } from '../shared/text-records.js';

const day = '2026-11-22';

const sampleCategories = [
  { id: 'food', name: '餐饮', type: 'expense', color_key: 'blue', subcategories: ['外卖', '饮料咖啡'], default_owner_id: 'me' },
  { id: 'shop', name: '购物', type: 'expense', color_key: 'amber', subcategories: ['服饰鞋包', '图书绘本'] },
  { id: 'med', name: '医疗', type: 'expense', color_key: 'teal', subcategories: ['保健品', '买药看病'], default_owner_id: 'parents' },
  { id: 'salary', name: '工资', type: 'income', color_key: 'green', subcategories: [] },
];

test('shared taxonomy constants and recommendedSubcategoriesFor return expected suggestions', () => {
  assert.equal(DEFAULT_OWNERS.length, 5);
  assert.ok(RECOMMENDED_SUBCATEGORIES['餐饮'].includes('外卖'));
  assert.ok(RECOMMENDED_NEW_MAJORS.some(m => m.id === 'family-care' && m.default_owner_id === 'parents'));
  assert.deepEqual(Object.keys(STARTER_PACKS).sort(), ['family', 'personal']);

  const foodRecs = recommendedSubcategoriesFor(sampleCategories[0]);
  assert.equal(foodRecs.includes('外卖'), false);
  assert.equal(foodRecs.includes('下馆子'), true);

  assert.deepEqual(recommendedSubcategoriesFor(sampleCategories[3]), []);
  assert.deepEqual(recommendedSubcategoriesFor({ name: '家庭人情', type: 'expense', subcategories: ['孝敬父母'] }), ['伴侣礼物', '亲子育儿', '红包礼金']);
});

test('parseTextRecords parses @owner mentions cleanly without matching email addresses', () => {
  const items = parseTextRecords('今天午饭 42元 @老婆；给老爸买鞋 199元 @父母；给孩子买牛奶 35元 @孩子；家庭聚餐 320元 @全家', day, sampleCategories);
  assert.equal(items.length, 4);
  assert.equal(items[0].owner_id, 'wife');
  assert.equal(items[0].title, '午饭');
  assert.equal(items[1].owner_id, 'parents');
  assert.equal(items[2].owner_id, 'kid');
  assert.equal(items[3].owner_id, 'family');

  const emailCase = parseTextRecords('今天续费服务 foo@bar.com 68元 @我', day, sampleCategories);
  assert.equal(emailCase.length, 1);
  assert.equal(emailCase[0].owner_id, 'me');
  assert.match(emailCase[0].title, /foo@bar\.com/);

  const customOwners = [
    ...DEFAULT_OWNERS,
    { id: 'yuefu', name: '岳父母', color_key: 'teal', archived: 0 },
    { id: 'old-member', name: '测试停用', color_key: 'gray', archived: 1 },
  ];
  const noEmailOwners = [{ id: 'bar', name: 'bar.com', color_key: 'blue', archived: 0 }];
  const emailUnmatched = parseTextRecords('联系foo@bar.com 20元', day, sampleCategories, noEmailOwners);
  assert.equal(emailUnmatched[0].owner_id, undefined);

  const customParsed = parseTextRecords('今天买水果 88元 @岳父母；借书 15元 @测试停用', day, sampleCategories, customOwners);
  assert.equal(customParsed[0].owner_id, 'yuefu');
  assert.equal(customParsed[1].owner_id, undefined);
});

test('parseTextIntake resolves 大类/子类, unique subcategory hints, default_owner_id fallback, and override', () => {
  const raw = [
    '京东 · 儿童画册 56元（算到购物/图书绘本）',
    '药店 · 钙片 180元（算到保健品）',
    '给老婆买润肤乳 120元 @老婆（算到购物）',
    '全家维生素 95元 @全家（算到保健品）',
  ].join('；');

  const intake = parseTextIntake(raw, day, sampleCategories, { owners: DEFAULT_OWNERS });
  assert.equal(intake.count, 4);
  const [books, supplement, cream, familyVit] = intake.segments[0].items;

  assert.equal(books.category_id, 'shop');
  assert.equal(books.subcategory, '图书绘本');
  assert.equal(books.owner_id, undefined);

  assert.equal(supplement.category_id, 'med');
  assert.equal(supplement.subcategory, '保健品');
  // Inherits med.default_owner_id when no explicit @owner was specified.
  assert.equal(supplement.owner_id, 'parents');

  assert.equal(cream.category_id, 'shop');
  assert.equal(cream.owner_id, 'wife');

  // Explicit @全家 overrides med.default_owner_id ('parents').
  assert.equal(familyVit.category_id, 'med');
  assert.equal(familyVit.subcategory, '保健品');
  assert.equal(familyVit.owner_id, 'family');

  const plan = compileTextItems([books, supplement, cream, familyVit], day);
  assert.equal(plan.count, 4);
  assert.equal(plan.entries[0].subcategory, '图书绘本');
  assert.equal('owner_id' in plan.entries[0], false);
  assert.equal(plan.entries[1].subcategory, '保健品');
  assert.equal(plan.entries[1].owner_id, 'parents');
  assert.equal(plan.entries[2].owner_id, 'wife');
  assert.equal('subcategory' in plan.entries[2], false);
  assert.equal(plan.entries[3].owner_id, 'family');
});
