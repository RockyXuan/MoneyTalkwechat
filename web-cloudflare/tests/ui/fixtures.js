import { test as base, expect } from '@playwright/test';
import { demoBackup } from '../../shared/demo.js';

export { expect };
export const test = base.extend({
  seed: ['demo', { option: true }],
  ledger: async ({ request, baseURL, seed }, use) => {
    // This destructive acceptance fixture is deliberately confined to its own local server.
    if (baseURL !== 'http://127.0.0.1:8791') throw new Error('UI tests only support the isolated loopback server on 8791');
    const call = async (path, body, method = body === undefined ? 'GET' : 'POST', ledgerId) => {
      const response = await request.fetch(`/api${path}`, { method, data: body, headers: { Origin: baseURL, 'Idempotency-Key': crypto.randomUUID(), ...(ledgerId ? { 'X-Ledger-Id': ledgerId } : {}) } });
      expect(response.ok(), `${method} ${path}: ${await response.text()}`).toBeTruthy();
      return response.json();
    };
    expect((await call('/session')).local).toBe(true);
    const backup = demoBackup();
    backup.ledger.name = `测试-${crypto.randomUUID().slice(0, 12)}`;
    if (seed === 'empty') backup.entries = [];
    if (seed === 'small') backup.entries = backup.entries.slice(0,6);
    if (seed === 'trash') backup.entries = backup.entries.map(e => ({ ...e, deleted_at: '2026-09-15T00:00:00.000Z', version: 2 }));
    const preview = await call('/restores/preview', backup);
    expect(preview.valid).toBe(true);
    const job = await call('/restores', { fingerprint: preview.fingerprint, ledger: backup.ledger, categories: backup.categories, entry_count: backup.entries.length });
    for (let i = 0; i < backup.entries.length; i += 50) await call(`/restores/${job.id}/entries`, { entries: backup.entries.slice(i, i + 50) });
    await call(`/restores/${job.id}/finish`, {});
    await call(`/ledgers/${job.id}/activate`, {});
    await use({ id: job.id, backup, call: (path, body, method) => call(path, body, method, job.id) });
  },
  page: async ({ page, ledger }, use, testInfo) => {
    const errors = [];
    const controls = new Set();
    await page.exposeBinding('recordAcceptanceControl', (_source, value) => controls.add(value));
    await page.addInitScript(() => {
      for (const eventType of ['click', 'submit', 'change']) document.addEventListener(eventType, event => {
        const target = event.target.closest('[data-action],[data-text-action],[data-route],[data-form]');
        if (target) window.recordAcceptanceControl(`${eventType}:${Object.entries(target.dataset).filter(([key]) => ['action', 'textAction', 'route', 'form'].includes(key)).map(([key, value]) => `${key}=${value}`).join(',')}`);
      }, true);
    });
    page.on('pageerror', error => errors.push(error.message));
    await use(page);
    await testInfo.attach('controls-exercised', { body: JSON.stringify([...controls].sort()), contentType: 'application/json' });
    expect(errors, 'uncaught browser errors').toEqual([]);
  },
});
export async function open(page, route = 'record', query = 'month=2026-09') {
  await page.goto(`/${route}${query ? `?${query}` : ''}`);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#main')).toBeVisible();
  await expect(page.locator('.error-panel')).toHaveCount(0);
}
export const action = (page, name, root = page) => root.locator(`[data-action="${name}"]:visible`).first();
export const textAction = (page, name) => page.locator(`[data-action="${name}"]:visible`).first();
export async function close(page) {
  await action(page, 'close-dialog', page.locator('#dialog')).click();
  await expect(page.locator('#dialog')).not.toBeVisible();
}
export async function write(page, { amount = '12.34', note = 'UI虚构测试', date = '2026-09-14' } = {}) {
  const manualForm = page.locator('#manual-form');
  if (!(await manualForm.isVisible())) {
    await action(page, 'record-mode-manual').click();
    await expect(manualForm).toBeVisible();
  }
  await manualForm.locator('[name="amount"]').fill(amount);
  await manualForm.locator('[name="note"]').fill(note);
  await manualForm.locator('[name="date_precision"]').selectOption(date.length === 7 ? 'month' : 'day');
  await manualForm.locator('[name="occurred_on"]').fill(date);
  await action(page, 'manual-save-entry', manualForm).click();
}
export async function compose(page, text) {
  const input = page.locator('#record-text-raw');
  if (!(await input.isVisible())) {
    await action(page, 'record-mode-text').click();
    await expect(input).toBeVisible();
  }
  await input.fill(text);
  await action(page, 'parse-text-records').click();
  await expect(page.locator('[data-item-id]').first()).toBeVisible();
}
export async function downloadText(page, button) {
  const pending = page.waitForEvent('download');
  await button.click();
  const result = await pending;
  const stream = await result.createReadStream();
  let body = '';
  for await (const chunk of stream) body += chunk.toString();
  return body;
}
