import { test, expect, open, action, close, compose } from './fixtures.js';

test.use({ seed: 'empty' });

test('TEXT_INTAKE: @owner mention, 大类/子类 resolution, flat create suggestion, green confirm and draft actions', async ({ page, ledger }) => {
  await ledger.call('/owners');
  await ledger.call('/categories/apply-pack', { pack: 'personal' });
  await open(page);

  // Quick @ mention insert + unknown category suggestion + 大类/子类 hint
  await page.locator('[data-action="insert-owner-mention"]:visible').filter({ hasText: '@老婆' }).click();
  await expect(page.locator('#record-text-raw')).toHaveValue('@老婆 ');

  await compose(
    page,
    '2026年9月10日 京东 · 英文绘本 56元 @老婆（算到购物/图书绘本）；手办盲盒 68元（算到潮玩）；咖啡 32元'
  );

  // Item 1: 图书绘本 + @老婆 resolved -> confirm directly
  const item1 = page.locator('[data-item-id="item-1"]');
  await expect(item1).toContainText('购物 · 图书绘本');
  await expect(item1).toContainText('@老婆');
  await item1.locator('[data-action="review-confirm-item"]').click();
  await expect(item1).toHaveCount(0); // Confirmed item moves to confirmed summary

  // Item 2: flat category create suggestion ("＋ 新建 潮玩")
  const item2 = page.locator('[data-item-id="item-2"]');
  await item2.locator('[data-action="review-suggest-create"]').click();
  await expect(page.locator('[data-item-id="item-2"]')).toContainText('潮玩');

  // Test inline ask-remove -> keep -> confirm remove on item-2
  await item2.locator('[data-action="review-ask-remove"]').click();
  await item2.locator('[data-action="review-keep-item"]').click();
  await item2.locator('[data-action="review-ask-remove"]').click();
  await item2.locator('[data-action="review-remove-item"]').click();
  await expect(item2).toHaveCount(0);

  // Item 3: 1-click popover category/owner selection + accept context date + green confirm -> receipt
  const item3 = page.locator('[data-item-id="item-3"]');
  await item3.locator('[data-action="review-accept-context"]').click();
  await item3.locator('[data-action="review-pick-category"]').click();
  await page.locator('.quick-popover [data-action="popover-choose-major"]').filter({ hasText: '餐饮' }).click();
  await page.locator('.quick-popover [data-action="popover-choose-sub"]').filter({ hasText: '饮料咖啡' }).click();
  await item3.locator('[data-action="review-pick-owner"]').click();
  await page.locator('.quick-popover [data-action="popover-choose-owner"]').filter({ hasText: '@我' }).click();
  await item3.locator('[data-action="review-confirm-item"]').click();

  await expect(page.locator('#main')).toContainText('已入账');
  const entries = (await ledger.call('/entries')).entries;
  expect(entries.some(e => e.subcategory === '图书绘本' && e.owner_id === 'wife')).toBe(true);
  expect(entries.some(e => e.subcategory === '饮料咖啡' && e.owner_id === 'me')).toBe(true);
});

test('RECURRING_DRAFT_PAUSE: month-only button beside green confirm, pause/resume and delete unconfirmed draft', async ({ page, ledger }) => {
  await open(page);
  await compose(page, '每月云存储会员 25元，从2026年8月到2026年9月（算到生活）');

  const card = page.locator('[data-item-id="item-1"]');
  // Require specific day first -> clicking confirm shows 扣款日待确认 right beside button
  await card.locator('select').first().selectOption('day');
  await card.locator('[data-action="review-confirm-item"]').click();
  await expect(card.locator('.candidate-help.has-error')).toContainText('扣款日待确认');

  // Choose month-only right there, pause -> confirms blocked, resume -> confirms succeed
  await card.locator('[data-action="review-month-only"]').click();
  await action(page, 'review-pause-toggle').click();
  await expect(card).toBeVisible();
  await card.locator('[data-action="review-confirm-item"]').click();
  await expect(card.locator('.candidate-help.has-error')).toContainText('已暂停');

  await action(page, 'review-pause-toggle').click();
  await card.locator('[data-action="review-confirm-item"]').click();
  await expect(page.locator('#main')).toContainText('已入账');
  expect((await ledger.call('/entries')).entries).toHaveLength(2);

  // Unconfirmed draft deletion leaves 0 new entries
  await action(page, 'text-new-batch').click();
  await compose(page, '测试废稿 19元');
  await action(page, 'review-delete-draft').click();
  await action(page, 'review-confirm-delete-draft').click();
  await expect(page.locator('#record-text-raw')).toBeVisible();
  expect((await ledger.call('/entries')).entries).toHaveLength(2);
});

test('LONG_INTAKE_AND_LIBRARY: >40 items segment via /api/text-intakes and traverse batch library', async ({ page }) => {
  await open(page);
  const tag = i => String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26));
  const raw = '2026年9月14日，' + Array.from({ length: 41 }, (_, i) => `合成午餐${tag(i)} 1元`).join('；');
  await compose(page, raw);
  await expect(page.locator('#main')).toContainText('第 1 / 2 段');

  // Save draft & open batch library search
  await action(page, 'review-save-draft').click();
  await action(page, 'toggle-batch-library').click();
  await page.locator('[data-action="library-status"]').filter({ hasText: '待核对' }).click();
  await expect(page.locator('#main')).toContainText('40 项');

  // Confirm segment 1 via batch preview and jump straight to segment 2
  await action(page, 'review-accept-context').click();
  await action(page, 'review-preview-all').click();
  await action(page, 'review-confirm-all').click();
  await expect(action(page, 'intake-next')).toBeVisible();
  await action(page, 'intake-next').click();
  await expect(page.locator('#main')).toContainText('第 2 / 2 段');
  await expect(page.locator('#main')).toContainText('合成午餐bo');
});

test('PLATFORM_AND_CALENDAR: Douyin account tracking & 12-month source calendar coverage survive reload', async ({ page, ledger }) => {
  await open(page);
  await page.setViewportSize({ width: 1280, height: 900 });

  // 1. Source Calendar modal on 淘宝
  const taobao = page.locator('.platform-card[data-platform="淘宝"]');
  await taobao.locator('[data-action="open-source-calendar"]').click();
  await expect(page.locator('#dialog-title')).toContainText('淘宝 · 记账日历');
  await action(page, 'source-range-open').click();
  await page.locator('#dialog [name="range_text"]').fill('2025年6月到2025年6月');
  await action(page, 'source-range-parse').click();
  await expect(page.locator('#dialog [name="from"]')).toHaveValue('2025-06-01');
  await expect(page.locator('#dialog [name="to"]')).toHaveValue('2025-06-30');
  await action(page, 'source-range-submit').click();

  await action(page, 'source-calendar-prev').click();
  await expect(page.locator('#dialog [data-month="2025-06"]')).toHaveClass(/complete/);
  await page.locator('#dialog [data-month="2025-06"]').click();
  await expect(page.locator('#dialog .calendar-day.complete')).toHaveCount(30);

  await action(page, 'source-range-remove').first().click();
  await expect(page.locator('#dialog [data-month="2025-06"]')).not.toHaveClass(/complete/);
  await action(page, 'source-calendar-next').click();
  await close(page);

  // 2. Douyin independent account tracking ("抖音（合成账号甲）")
  const douyin = page.locator('.platform-card[data-platform="抖音"]');
  await douyin.locator('[data-action="source-account"]').click();
  await page.locator('#dialog input[placeholder*="差不多轩生"]').fill('合成账号甲');
  await action(page, 'confirm-source-account').click();
  await expect(page.locator('#dialog')).not.toBeVisible();

  await compose(page, '2025年6月 合成购物 5元');
  await page.locator('[data-item-id="item-1"] [data-action="review-pick-category"]').click();
  await page.locator('.quick-popover [data-action="popover-choose-major"]').filter({ hasText: '购物' }).click();
  await page.locator('[data-item-id="item-1"] [data-action="review-confirm-item"]').click();
  await expect(page.locator('#main')).toContainText('已入账');

  const board = (await ledger.call('/text-batches?view=board')).platforms;
  expect(board.find(g => g.source === '抖音（合成账号甲）')?.latest?.progress?.confirmed_items).toBe(1);
  expect(board.find(g => g.source === '抖音')?.latest).toBeNull();

  await action(page, 'view-receipt-bills').click();
  await expect(page).toHaveURL(/\/bills/);
  await expect(page.locator('#main')).toContainText('合成购物');
});
