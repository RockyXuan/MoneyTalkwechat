import { test, expect, open, action } from './fixtures.js';

test.use({ seed: 'empty' });

test('STATS_THREE_VIEWS: switchable bars, cross-pivot matrix and ring drilldown all expand inline without modals', async ({ page, ledger }) => {
  await ledger.call('/owners');
  await ledger.call('/categories/apply-pack', { pack: 'family' });
  await ledger.call('/entries', {
    type: 'expense',
    amount_minor: 4500,
    category_id: 'food',
    subcategory: '外卖',
    owner_id: 'me',
    occurred_on: '2026-09-10',
    note: '合成工作餐',
  });
  await ledger.call('/entries', {
    type: 'expense',
    amount_minor: 8000,
    category_id: 'food',
    subcategory: '下馆子',
    owner_id: 'wife',
    occurred_on: '2026-09-12',
    note: '合成双人火锅',
  });
  await ledger.call('/entries', {
    type: 'expense',
    amount_minor: 2000,
    category_id: 'transport',
    subcategory: null,
    owner_id: null,
    occurred_on: '2026-09-13',
    note: '合成未指定成员地铁',
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await open(page, 'stats', 'month=2026-09');
  await expect(page.locator('.summary-card.expense')).toContainText(/145\.00/);

  // Switch periods (quarter -> year -> month) preserving exact totals
  await page.locator('[data-action="stats-period"]').filter({ hasText: '按年' }).click();
  await expect(page.locator('.summary-card.expense')).toContainText(/145\.00/);
  await page.locator('[data-action="stats-period"]').filter({ hasText: '按月' }).click();

  // 1. View 1: 分类长条 (expand category -> see subcategories incl. 未细分 -> toggle @归属人 -> switch charts)
  await page.locator('[data-action="stats-bar-expand"]').filter({ hasText: '餐饮' }).click();
  await expect(page.locator('#main')).toContainText('下馆子');
  await expect(page.locator('#main')).toContainText('外卖');
  await page.locator('[data-action="stats-bar-sub-pick"]').filter({ hasText: '外卖' }).click();
  await expect(page.locator('#main')).toContainText('合成工作餐');

  await action(page, 'stats-bar-dim-owner').click();
  await expect(page.locator('#main')).toContainText('@老婆');
  await expect(page.locator('#main')).toContainText('@我');
  await page.locator('[data-action="stats-owner-bar-pick"]').filter({ hasText: '@老婆' }).click();
  await expect(page.locator('#main')).toContainText('合成双人火锅');
  await action(page, 'stats-bar-dim-cat').click();

  // Chart modes persist
  await page.locator('[data-action="stats-chart-mode"]').filter({ hasText: '饼图' }).click();
  await expect(page.locator('#expense-chart')).toHaveAttribute('aria-label', /145\.00/);
  await page.locator('.page-stats details summary').click();
  await expect(page.locator('.page-stats details table')).toContainText('餐饮');

  // 2. View 2: 交叉透视表 (expand sub rows -> click cell -> inline bills below table, NO dialog)
  await page.locator('[data-action="stats-view"]').filter({ hasText: '交叉透视表' }).click();
  await page.locator('[data-action="stats-matrix-toggle-cat"]').filter({ hasText: '餐饮' }).click();
  await expect(page.locator('.pivot-table')).toContainText('├ 外卖');
  await page.locator('.pivot-table [data-action="stats-matrix-cell"]').filter({ hasText: '80.00' }).first().click();
  await expect(page.locator('#dialog')).not.toBeVisible();
  await expect(page.locator('#main')).toContainText('明细：餐饮');
  await expect(page.locator('#main')).toContainText('合成双人火锅');

  // 3. View 3: 环图下钻 (fixed donut + major cards -> click card or slice -> inline subcategory + @owner + bills below)
  await page.locator('[data-action="stats-view"]').filter({ hasText: '环图下钻' }).click();
  await expect(page.locator('.drilldown-top')).toBeVisible();
  await expect(page.locator('.drilldown-panel')).toContainText('下馆子');
  await expect(page.locator('.drilldown-panel')).toContainText('@老婆');
  await expect(page.locator('.drilldown-panel')).toContainText('合成工作餐');
  await expect(page.locator('#dialog')).not.toBeVisible();

  await page.locator('.drilldown-panel [data-action="stats-drilldown-sub"]').filter({ hasText: '外卖' }).click();
  await expect(page.locator('.drilldown-panel')).toContainText('合成工作餐');
  await expect(page.locator('.drilldown-panel')).not.toContainText('合成双人火锅');
  await action(page, 'stats-drilldown-reset').click();

  await page.locator('.drilldown-panel [data-action="stats-drilldown-owner"]').filter({ hasText: '@老婆' }).click();
  await expect(page.locator('.drilldown-panel')).toContainText('合成双人火锅');
  await expect(page.locator('.drilldown-panel')).not.toContainText('合成工作餐');
  await action(page, 'stats-drilldown-reset').click();

  await page.locator('[data-action="stats-drilldown-cat"]').filter({ hasText: '交通' }).click();
  await expect(page.locator('.drilldown-panel')).toContainText('未细分');
  await expect(page.locator('.drilldown-panel')).toContainText('未指定成员');
  await expect(page.locator('.drilldown-panel')).toContainText('合成未指定成员地铁');

  // Header month input & return to current period button
  await page.locator('[data-action="month"]').fill('2026-08');
  await expect(page.locator('.summary-card.expense')).toContainText(/0\.00/);
  await action(page, 'current-period').click();
  await expect(page.locator('[data-action="month"]')).not.toHaveValue('2026-08');
  await expect(page.locator('[data-action="month"]')).toHaveValue(/^\d{4}-\d{2}$/);
});
