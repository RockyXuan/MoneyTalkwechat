import { test, expect, open, action } from './fixtures.js';

test('TABS_DESKTOP_AND_MOBILE: desktop has closable tabs preserving state; mobile shows 5-pill bottom nav without top tabs', async ({ page, context }) => {
  // 1. Mobile layout: top workspace tabs hidden, 5-pill floating bottom nav works without horizontal scroll
  await open(page, 'record');
  await expect(page.locator('.workspace-tabs-shell')).not.toBeVisible();
  await expect(page.locator('.mobile-nav [data-route]')).toHaveCount(5);
  await page.locator('#record-text-raw').fill('手机未入账草稿 25元');
  await page.locator('.mobile-nav [data-route="bills"]').click();
  await expect(page.locator('#main.page-bills')).toBeVisible();
  await page.locator('.mobile-nav [data-route="record"]').click();
  await expect(page.locator('#record-text-raw')).toHaveValue('手机未入账草稿 25元');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // 2. Desktop layout: closable workspace tabs + '+' add menu + keyboard End/Delete + bill filters preserved
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('.workspace-tabs-shell')).toBeVisible();

  await action(page, 'workspace-add').click();
  await page.locator('[data-action="workspace-add-page"][data-workspace-page="subscriptions"]').click();
  await expect(page.locator('#workspace-tab-subscriptions')).toHaveAttribute('aria-selected', 'true');
  expect(context.pages()).toHaveLength(1);

  await page.locator('[data-action="workspace-switch"]:visible').filter({ hasText: '账单' }).click();
  await page.locator('form.search-form [name="q"]').fill('午餐');
  await action(page, 'bills-search').click();
  await page.locator('[data-action="workspace-switch"]:visible').filter({ hasText: '统计' }).click();
  await page.locator('[data-action="workspace-switch"]:visible').filter({ hasText: '账单' }).click();
  await expect(page).toHaveURL(/q=/);

  await page.locator('[data-action="workspace-close"][data-workspace-close="subscriptions"]').click();
  await expect(page.locator('#workspace-tab-subscriptions')).toHaveCount(0);

  await page.locator('#workspace-tab-record').focus();
  await page.keyboard.press('End');
  await expect(page.locator('#workspace-tab-stats')).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
