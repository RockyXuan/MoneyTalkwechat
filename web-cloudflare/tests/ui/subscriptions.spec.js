import { test, expect, open, action } from './fixtures.js';

test.use({ seed: 'empty' });

test('SUB01 pre-filled 30元 default, preview overlap check, spending labels, ongoing auto-record and pause/resume', async ({ page, ledger }) => {
  await ledger.call('/owners');
  await ledger.call('/categories/apply-pack', { pack: 'personal' });
  await ledger.call('/entries', {
    type: 'expense',
    amount_minor: 3000,
    category_id: 'entertainment',
    occurred_on: '2025-01',
    note: '另一张月卡',
  });

  await open(page, 'subscriptions', '');
  await expect(page.locator('[data-action="subscription-empty-text"]')).toBeVisible();

  await action(page, 'subscription-new').click();
  await expect(page.locator('#dialog [name="amount"]')).toHaveValue('30.00');
  await page.locator('#dialog [name="title"]').fill('合成星穹月卡');
  await page.locator('#dialog [name="category"]').selectOption('entertainment');
  await page.locator('#dialog [name="source"]').selectOption('崩坏星穹铁道');
  await page.locator('#dialog [name="owner_id"]').selectOption('me');
  await page.locator('#dialog [name="start"]').fill('2024-01');
  await page.locator('#dialog [name="status"]').selectOption('stopped');
  await page.locator('#dialog [name="end"]').fill('2025-12');

  await action(page, 'subscription-next').click();
  await expect(page.locator('#dialog-title')).toHaveText('确认订阅');
  await expect(page.locator('#dialog')).toContainText(/720\.00/);
  await action(page, 'subscription-back').click();
  await expect(page.locator('#dialog [name="title"]')).toHaveValue('合成星穹月卡');
  await action(page, 'subscription-next').click();
  await action(page, 'subscription-confirm').click();

  await expect(page.locator('#main')).toContainText('已记 24 笔');
  await expect(page.locator('#main')).toContainText(/720\.00/);

  // 4-color spending label persists
  await page.locator('[data-action="subscription-label"][aria-label="想控制"]').click();
  await expect(page.locator('#main')).toContainText('想控制');
  await page.reload();
  await expect(page.locator('[data-action="subscription-label"][aria-label="想控制"]')).toHaveAttribute('aria-pressed', 'true');

  // Create ongoing subscription & pause/resume
  await action(page, 'subscription-new').click();
  await page.locator('#dialog [name="title"]').fill('合成持续会员');
  await page.locator('#dialog [name="category"]').selectOption('other');
  await page.locator('#dialog [name="amount"]').fill('68');
  await page.locator('#dialog [name="start"]').fill('2026-08');
  await action(page, 'subscription-next').click();
  await expect(page.locator('#dialog')).toContainText('以后每期自动记账');
  await action(page, 'subscription-confirm').click();
  await expect(page.locator('#main')).toContainText('持续订阅 · 自动记账');

  const ongoingCard = page.locator('#main article.bar-row').filter({ hasText: '合成持续会员' });
  await ongoingCard.locator('[data-action="subscription-status"]').filter({ hasText: '暂停订阅' }).click();
  await expect(ongoingCard).toContainText('已暂停');
  await ongoingCard.locator('[data-action="subscription-status"]').filter({ hasText: '恢复订阅' }).click();
  await expect(ongoingCard).not.toContainText('已暂停');
});

test('SUB02 failed confirm preserves retry token across reload & settle 503 leaves bills readable', async ({ page, ledger }) => {
  await ledger.call('/entries', {
    type: 'expense',
    amount_minor: 2800,
    category_id: 'other',
    occurred_on: '2026-09-18',
    note: '虚构回归账单',
  });

  await open(page, 'subscriptions', '');
  await action(page, 'subscription-new').click();
  await page.locator('#dialog [name="title"]').fill('合成年订阅');
  await page.locator('#dialog [name="category"]').selectOption('other');
  await page.locator('#dialog [name="cycle"]').selectOption('yearly');
  await page.locator('#dialog [name="amount"]').fill('99');
  await page.locator('#dialog [name="start"]').fill('2023-12');
  await page.locator('#dialog [name="status"]').selectOption('stopped');
  await page.locator('#dialog [name="end"]').fill('2025-12');
  await action(page, 'subscription-next').click();

  await page.route('**/api/subscriptions/confirm', route => route.abort('failed'));
  await action(page, 'subscription-confirm').click();
  await expect(page.locator('#dialog')).toContainText('重试确认');
  await page.unroute('**/api/subscriptions/confirm');
  await page.reload();
  await action(page, 'subscription-new').click();
  await expect(page.locator('#dialog')).toContainText('合成年订阅');
  await action(page, 'subscription-confirm').click();
  await expect(page.locator('#main')).toContainText('合成年订阅');
  expect((await ledger.call('/entries')).totals.count).toBe(4);

  // Settle outage on bills shows warning without breaking bills list
  await page.route('**/api/subscriptions/settle', route =>
    route.fulfill({ status: 503, body: 'Unavailable' })
  );
  await open(page, 'bills', 'month=2026-09');
  await expect(page.locator('#main')).toContainText('虚构回归账单');
  await expect(page.getByText('订阅续记结果尚未核实', { exact: false })).toBeVisible();
  await page.unroute('**/api/subscriptions/settle');
});
