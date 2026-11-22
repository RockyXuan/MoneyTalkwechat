import {test,expect,open,close,action} from './fixtures.js';
test.use({seed:'empty'});
test('SUB01 create two years monthly history from subscriptions; one confirmation, refresh, retry and backup keep 24 months',async({page,ledger},info)=>{
 await open(page,'subscriptions','');await expect(page.locator('.subscription-empty')).toBeVisible();
 await ledger.call('/entries',{type:'expense',amount_minor:3000,category_id:'entertainment',occurred_on:'2025-01',note:'另一张月卡'});
 await action(page,'subscription-new').click();
 await page.locator('[name=title]').fill('合成星穹月卡');await page.locator('#dialog [name=category]').selectOption('entertainment');await page.locator('[name=source]').selectOption('崩坏星穹铁道');await expect(page.locator('#dialog [name=amount]')).toHaveValue('30.00');await page.locator('[name=start]').fill('2024-01');await page.locator('[name=status]').selectOption('stopped');await page.locator('[name=end]').fill('2025-12');
 await page.getByRole('button',{name:'下一步',exact:true}).click();
 await expect(page.getByRole('heading',{name:'确认订阅'})).toBeVisible();
 await expect(page.locator('#dialog')).toContainText('合计 ¥ 720.00');
 await expect(page.locator('#dialog .duplicate-ack')).toHaveCount(0);
 await expect(page.locator('.subscription-card')).toHaveCount(0);
 expect((await ledger.call('/text-batches')).batches).toHaveLength(0);
 expect((await ledger.call('/entries')).totals.count).toBe(1);
 await page.getByRole('button',{name:'返回修改'}).click();
 await expect(page.locator('[name=title]')).toHaveValue('合成星穹月卡');
 await page.getByRole('button',{name:'下一步',exact:true}).click();
 await page.getByRole('button',{name:'确认 24 笔',exact:true}).click();
 await expect(page.locator('.subscription-card')).toContainText('已记 24 笔');
 await expect(page.locator('.subscription-total')).toContainText('¥ 720.00');
 await expect(page.locator('.subscription-card')).toContainText('2024-01 → 2025-12');
 await page.reload();await expect(page.locator('.subscription-card')).toHaveCount(1);
 await page.getByRole('button',{name:'想控制',exact:true}).click();await expect(page.locator('.subscription-total')).toHaveClass(/spending-red/);await page.reload();await expect(page.getByRole('button',{name:'想控制',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.locator('.subscription-card')).toContainText('想控制');
 const entries=await ledger.call('/entries?limit=100');expect(entries.totals.expense_minor).toBe(75000);expect(entries.totals.count).toBe(25);expect(entries.entries.every(e=>e.occurred_on.length===7)).toBe(true);
 await page.locator('.subscription-card details summary').click();await expect(page.locator('.subscription-card details')).toContainText('2025-12');await info.attach('subscriptions-mobile',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await page.locator('.subscription-card [data-action=text-records]').click();await expect(page.locator('.confirm-one')).toHaveCount(0);await expect(page.locator('#dialog')).toContainText('已记支出 ¥ 720.00');await close(page);
 const backup=await ledger.call('/backup'),preview=await ledger.call('/restores/preview',backup),manifest={fingerprint:preview.fingerprint,ledger:backup.ledger,categories:backup.categories,entry_count:backup.entries.length,text_batches:backup.text_batches,text_slots:backup.text_slots};const job=await ledger.call('/restores',manifest);await ledger.call(`/restores/${job.id}/entries`,{entries:backup.entries});await ledger.call(`/restores/${job.id}/finish`,{});const response=await page.request.get('/api/backup',{headers:{'X-Ledger-Id':job.id}});const restored=await response.json();expect(restored.entries).toHaveLength(25);expect(restored.text_batches[0].items[0].spending_label).toBe('red');
 const changed=entries.entries.find(entry=>entry.note.includes('合成星穹月卡'));await ledger.call(`/entries/${changed.id}`,{type:changed.type,amount_minor:4500,category_id:changed.category_id,occurred_on:changed.occurred_on,note:changed.note,version:changed.version},'PATCH');await page.reload();await expect(page.locator('.subscription-total')).toContainText('¥ 735.00');
 await ledger.call(`/entries/${changed.id}/delete`,{version:changed.version+1});await page.reload();await expect(page.locator('.subscription-card')).toContainText('已记 23 笔');await expect(page.locator('.subscription-total')).toContainText('¥ 690.00');await page.locator('.subscription-card [data-action=text-records]').click();await expect(page.locator('#dialog')).toContainText('已记支出 ¥ 690.00');

});
test('SUB02 record page shares yearly entry; bad ranges and failed save keep inputs',async({page,ledger})=>{
 await open(page);await page.locator('.record-subscription-entry [data-action=subscription-new]').click();await page.locator('[name=title]').fill('合成年订阅');await page.locator('#dialog [name=category]').selectOption('other');await page.locator('#dialog [name=amount]').fill('99');await page.locator('[name=cycle]').selectOption('yearly');await page.locator('[name=start]').fill('2025-12');await page.locator('[name=status]').selectOption('stopped');await page.locator('[name=end]').fill('2024-12');await page.getByRole('button',{name:'下一步'}).click();await expect(page.locator('#subscription-error')).toContainText('开始不能晚于结束');
 await page.locator('[name=start]').fill('2023-12');
 await page.locator('[name=end]').fill('2025-12');
 await page.getByRole('button',{name:'下一步'}).click();
 await expect(page.getByRole('button',{name:'确认 3 笔'})).toBeVisible();
 await page.route('**/api/subscriptions/confirm',route=>route.abort());
 await page.getByRole('button',{name:'确认 3 笔'}).click();
 await expect(page.locator('#subscription-error')).toContainText('连接中断');
 expect((await ledger.call('/text-batches')).batches).toHaveLength(0);
 await page.reload();
 await page.locator('.record-subscription-entry [data-action=subscription-new]').click();
 await expect(page.locator('#dialog')).toContainText('合成年订阅');
 await expect(page.getByRole('button',{name:'重试确认'})).toBeVisible();
 await page.unroute('**/api/subscriptions/confirm');
 await page.getByRole('button',{name:'重试确认'}).click();
 await expect(page.locator('.subscription-card')).toContainText('/ 年');
 expect((await ledger.call('/entries')).totals.count).toBe(3);
});
test('SUB03 ongoing has no required end, preview includes current month, first confirmation enables automation and direct pause/resume',async({page,ledger})=>{
 await open(page,'subscriptions','');await action(page,'subscription-new').click();await expect(page.locator('[name=end]')).toBeHidden();await page.locator('[name=title]').fill('合成持续月卡');await page.locator('#dialog [name=category]').selectOption('other');await page.locator('#dialog [name=amount]').fill('68');await page.locator('[name=start]').fill('2025-11');await page.getByRole('button',{name:'下一步',exact:true}).click();await expect(page.locator('#dialog')).toContainText('以后每期自动记账');
 const session=await ledger.call('/session');const months=(Number(session.today.slice(0,4))-2025)*12+Number(session.today.slice(5,7))-11+1;await expect(page.locator('.confirm-one')).toContainText(`${months} 笔`);await page.locator('.confirm-one').click();await expect(page.locator('.subscription-card')).toContainText('自动记账');await page.getByRole('button',{name:'暂停订阅',exact:true}).click();await expect(page.locator('.subscription-card')).toContainText('已暂停');await page.getByRole('button',{name:'恢复订阅',exact:true}).click();await expect(page.locator('.subscription-card')).not.toContainText('已暂停');await page.reload();await page.waitForLoadState('networkidle');expect((await ledger.call('/entries')).totals.count).toBe(months);
});

test('SUB04 category spending label remains separate from its chart color and survives refresh',async({page,ledger})=>{
 await open(page,'settings');await action(page,'categories').click();await page.locator('.manage-category[data-id="entertainment"]').click();await page.locator('#dialog [name=spending_label]').selectOption('yellow');await page.getByRole('button',{name:'保存分类'}).click();await expect(page.locator('.manage-category[data-id="entertainment"]')).toContainText('有节约空间');
 const category=(await ledger.call('/categories')).categories.find(c=>c.id==='entertainment');expect(category.spending_label).toBe('yellow');expect(category.color_key).toBe('pink');await close(page);await page.reload();await action(page,'categories').click();await expect(page.locator('.manage-category[data-id="entertainment"]')).toContainText('有节约空间');
});

test('subscription check outage leaves saved bills readable with a visible warning', async ({page,ledger}) => {
  await ledger.call('/entries', {type:'expense', amount_minor:2800, category_id:'other', occurred_on:'2026-09-18', note:'虚构午餐回归'});
  await page.route('**/api/subscriptions/settle', route => route.fulfill({status:503,body:'Unavailable'}));
  await open(page, 'bills', 'month=2026-09');
  await expect(page.locator('.bills-card')).toContainText('虚构午餐回归');
  await expect(page.getByText('订阅续记结果尚未核实', {exact:false})).toBeVisible();
  await expect(page.locator('.mobile-nav [data-route="bills"]')).toHaveAttribute('aria-current','page');
  await expect(page.locator('#main .error-panel')).toHaveCount(0);
  await page.unroute('**/api/subscriptions/settle');
  await page.reload();
  await expect(page.getByText('订阅续记结果尚未核实', {exact:false})).toHaveCount(0);
});

test('SUB05 desktop review docks without a backdrop and dismissal leaves no subscription',async({page,ledger},info)=>{
 await page.setViewportSize({width:1440,height:900});
 await open(page,'subscriptions','');
 await action(page,'subscription-new').click();
 await expect(page.locator('#dialog:modal')).toBeVisible();
 await page.locator('#dialog [name=title]').fill('示例月卡');
 await page.locator('#dialog [name=category]').selectOption('entertainment');
 await page.locator('#dialog [name=start]').fill('2024-07');
 await page.getByRole('button',{name:'下一步',exact:true}).click();
 const panel=page.locator('#dialog[data-type=subscription-review]');
 await expect(panel).toBeVisible();
 await expect(page.locator('#dialog:modal')).toHaveCount(0);
 await info.attach('desktop-subscription-review',{body:await page.screenshot(),contentType:'image/png'});
 const bounds=await panel.boundingBox();
 expect(bounds.x+bounds.width).toBeGreaterThan(1400);
 await page.keyboard.press('Escape');
 await expect(panel).not.toBeVisible();
 await page.reload();
 await expect(page.locator('.subscription-empty')).toBeVisible();
 expect((await ledger.call('/text-batches')).batches).toHaveLength(0);
 expect((await ledger.call('/entries')).totals.count).toBe(0);
});
