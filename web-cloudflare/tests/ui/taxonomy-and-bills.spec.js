import { test, expect, open, action, close } from './fixtures.js';

test.use({ seed: 'small' });

test('TAXONOMY_SETTINGS: starter packs, dashed subcategory pills, custom owner and default @ persist', async ({ page, ledger }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'settings');

  // 1. Add custom @owner
  await page.locator('input[placeholder*="新增成员"]').fill('岳父母');
  await action(page, 'settings-add-owner').click();
  await expect(page.locator('#main')).toContainText('@岳父母');

  // Edit owner color/archive
  await page.locator('[data-action="settings-edit-owner"]').filter({ hasText: '@岳父母' }).click();
  await page.locator('#dialog').getByLabel('成员名称').fill('外公外婆');
  await action(page, 'settings-save-owner').click();
  await expect(page.locator('#main')).toContainText('@外公外婆');

  // 2. One-click enable dashed recommended subcategory on 餐饮 -> becomes solid pill with ×
  const foodCard = page.locator('.cat-wall-card').filter({ hasText: '餐饮' }).first();
  await foodCard.locator('[data-action="cat-enable-rec-sub"]').filter({ hasText: '外卖' }).click();
  await expect(foodCard.locator('.sub-pill.active')).toContainText('外卖');

  // 3. Add custom subcategory + remove one
  await foodCard.locator('input[placeholder*="添加自定义子类"]').fill('夜宵烧烤');
  await foodCard.locator('[data-action="cat-add-custom-sub"]').click();
  await expect(foodCard.locator('.sub-pill.active').filter({ hasText: '夜宵烧烤' })).toBeVisible();
  await foodCard.locator('[data-action="cat-remove-sub"][aria-label="移除夜宵烧烤"]').click();
  await expect(foodCard.locator('.sub-pill.active').filter({ hasText: '夜宵烧烤' })).toHaveCount(0);

  // 3b. New major category + edit major category
  await action(page, 'cat-new-major').click();
  await page.locator('#dialog').getByLabel('分类名称').fill('旅行备用');
  await action(page, 'cat-save-modal').click();
  await expect(page.locator('#main')).toContainText('旅行备用');
  const travelCard = page.locator('.cat-wall-card').filter({ hasText: '旅行备用' }).first();
  await travelCard.locator('[data-action="cat-edit-major"]').click();
  await page.locator('#dialog').getByLabel('口述别称（逗号分隔，用于文字智能匹配）').fill('出差,自驾');
  await action(page, 'cat-save-modal').click();

  // 4. Set per-card Default @归属人
  await foodCard.locator('[data-action="cat-default-owner"]').selectOption('wife');
  await expect(foodCard.locator('[data-action="cat-default-owner"]')).toHaveValue('wife');

  // 5. Join recommended major + apply Starter Pack (idempotent)
  await page.locator('.major-rec-card [data-action="cat-join-major"]').first().click();
  await action(page, 'cat-apply-pack-family').click();
  await expect(page.locator('#main')).toContainText('家庭人情');
  await expect(page.locator('#main')).toContainText('学习成长');

  // 6. Reload and confirm server persistence
  await page.reload();
  const cats = (await ledger.call('/categories')).categories;
  const food = cats.find(c => c.id === 'food');
  expect(food.subcategories).toContain('外卖');
  expect(food.default_owner_id).toBe('wife');
  expect(cats.some(c => c.id === 'learning-growth')).toBe(true);
});

test('BILLS_INLINE_TAGGING: persistent @owner bar totals stay invariant; 1-click popover & Undo work', async ({ page, ledger }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'settings');
  await action(page, 'cat-apply-pack-personal').click();

  await ledger.call('/entries', {
    type: 'expense',
    amount_minor: 5200,
    category_id: 'food',
    subcategory: '外卖',
    owner_id: 'me',
    occurred_on: '2026-09-14',
    note: '合成晚餐外卖',
  });
  await ledger.call('/entries', {
    type: 'expense',
    amount_minor: 12000,
    category_id: 'shopping',
    subcategory: '图书绘本',
    owner_id: 'wife',
    occurred_on: '2026-09-14',
    note: '合成绘本礼物',
  });

  await open(page, 'bills', 'month=2026-09');
  const ownerBar = page.locator('.owner-spend-bar');
  await expect(ownerBar).toContainText('@我');
  await expect(ownerBar).toContainText(/52\.00/);
  await expect(ownerBar).toContainText('@老婆');
  await expect(ownerBar).toContainText(/120\.00/);

  // Filter by @老婆 -> list filters to wife only, BUT @我 spend chip on top bar stays ¥ 52.00!
  await ownerBar.locator('[data-action="bills-filter-owner"]').filter({ hasText: '@老婆' }).click();
  await expect(page.locator('.desktop-bills')).toContainText('合成绘本礼物');
  await expect(page.locator('.desktop-bills')).not.toContainText('合成晚餐外卖');
  await expect(ownerBar.locator('[data-action="bills-filter-owner"]').filter({ hasText: '@我' })).toContainText(/52\.00/);
  await action(page, 'bills-filter-owner-all').click();

  // 1-click inline popover on demo-lunch -> set 大类/子类 + @归属人 without confirm button
  const row = page.locator('.desktop-bills [data-entry-id="demo-lunch"]');
  await row.locator('[data-action="bill-quick-category"]').click();
  await expect(page.locator('.quick-popover')).toBeVisible();
  await page.locator('.quick-popover [data-action="popover-choose-major"]').filter({ hasText: '餐饮' }).click();
  await page.locator('.quick-popover [data-action="popover-choose-sub"]').filter({ hasText: '饮料咖啡' }).click();
  await expect(page.locator('.quick-popover')).not.toBeVisible();
  await expect(row).toContainText('餐饮 · 饮料咖啡');

  // Undo toast reverts subcategory cleanly
  await action(page, 'undo-toast').click();
  await expect(row).not.toContainText('饮料咖啡');

  // 1-click @归属人 popover
  await row.locator('[data-action="bill-quick-owner"]').click();
  await page.locator('.quick-popover [data-action="popover-choose-owner"]').filter({ hasText: '@孩子' }).click();
  await expect(row).toContainText('@孩子');
  await page.reload();
  await expect(page.locator('.desktop-bills [data-entry-id="demo-lunch"]')).toContainText('@孩子');
});
