import { test, expect, open, action, textAction, compose, close, write, downloadText } from './fixtures.js';
import { parseTextRecords } from '../../shared/text-records.js';
const card=(page,id)=>page.locator(`.text-candidate[data-item-id="${id}"]`);
const confirm=(page,id)=>card(page,id).locator('[data-text-action="confirm-item"]');
const three='2026年9月淘宝 · 合成首件 0.01元；2026年9月淘宝 · 合成中件 0.02元；2026年9月淘宝 · 合成尾件 0.03元';

test.describe('per-item green confirmation',()=>{
 test.use({seed:'empty'});
 test('BATCH01 saved acknowledgement precedes animation, double click writes once and reload resumes at the gap',async({page,ledger},testInfo)=>{
  await open(page);await compose(page,three);
  await expect(card(page,'item-1').locator('[data-field=occurred_on]')).toHaveValue('2026-09');
  await card(page,'item-1').evaluate(el=>{window.confirmAnimationEvidence=[];new MutationObserver(()=>{if(el.classList.contains('confirmed'))window.confirmAnimationEvidence.push({running:el.getAnimations().some(a=>a.playState==='running'),saved:el.querySelector('button')?.textContent.includes('已保存')});}).observe(el,{attributes:true,attributeFilter:['class']});});
  let release;const gate=new Promise(resolve=>release=resolve);
  await page.route('**/api/text-batches/*/confirm',async route=>{await gate;await route.continue();});
  await confirm(page,'item-1').dblclick();
  await expect(confirm(page,'item-1')).toBeDisabled();
  await expect(card(page,'item-1')).toBeVisible();
  expect((await ledger.call('/entries')).totals.count).toBe(0);
  expect(await card(page,'item-1').evaluate(el=>el.getAnimations().length)).toBe(0);
  release();await expect(card(page,'item-1')).toHaveCount(0);
  expect((await ledger.call('/entries')).totals.count).toBe(1);
  expect(await page.evaluate(()=>window.confirmAnimationEvidence.some(e=>e.running&&e.saved))).toBe(true);
  await expect(page.locator('.batch-progress')).toContainText('已确认 1 / 3 项');
  await expect(confirm(page,'item-2')).toBeFocused();
  await close(page);await page.reload();await page.waitForLoadState('networkidle');
  await expect(page.locator('.batch-history')).toContainText('合成首件');await expect(page.locator('.batch-history')).toContainText('合成尾件');
  await page.locator('.batch-history-row').click();
  await expect(page.locator('.text-candidate')).toHaveCount(2);
  await confirm(page,'item-3').click();await expect(card(page,'item-3')).toHaveCount(0);
  await expect(page.locator('.batch-progress')).toContainText('中间还有未确认项');await expect(page.locator('.batch-progress')).toContainText('下一项：合成中件');
  const p=(await ledger.call('/text-batches')).batches[0].progress;
  expect(p.first_title).toBe('合成首件');expect(p.last_title).toBe('合成尾件');expect(p.continue_after).toBe('合成首件');expect(p.has_gaps).toBe(true);
  await confirm(page,'item-2').click();await expect(page.locator('.flow-success')).toContainText('3 笔');await expect(page.locator('.flow-success')).toContainText('0.06');
  await close(page);await expect(page.locator('.batch-history')).toContainText('3/3 已确认');await expect(page.locator('.batch-history')).toContainText('本批全部已记');
  const entries=(await ledger.call('/entries')).entries;expect(entries).toHaveLength(3);expect(entries.every(e=>e.occurred_on==='2026-09')).toBe(true);
  await testInfo.attach('batch-history',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 });
 test('BATCH02 response lost after commit keeps item for retry, replay reads saved result without duplicates',async({page,ledger})=>{
  await open(page);await compose(page,three);
  let keys=[];await page.route('**/api/operations/*',route=>route.abort('failed'));await page.route('**/api/text-batches/*/confirm',async route=>{keys.push(route.request().headers()['idempotency-key']);await route.fetch();await route.abort('failed');});
  await confirm(page,'item-1').click();await expect(textAction(page,'retry')).toBeVisible();await expect(card(page,'item-1')).toBeVisible();
  expect((await ledger.call('/entries')).totals.count).toBe(1);
  await page.unroute('**/api/operations/*');await page.unroute('**/api/text-batches/*/confirm');await page.route('**/api/text-batches/*/confirm',route=>{keys.push(route.request().headers()['idempotency-key']);return route.continue();});
  await textAction(page,'retry').click();await expect(page.locator('#text-status')).toContainText('不会重复入账');
  await expect(card(page,'item-1')).toHaveCount(0);await expect(page.locator('.text-candidate')).toHaveCount(2);expect(keys).toHaveLength(2);expect(keys[0]).toBe(keys[1]);expect((await ledger.call('/entries')).totals.count).toBe(1);
  await textAction(page,'back-list').click();await expect(page.locator('.text-batch-row')).toContainText('1/3 项');
 });
 test('BATCH03 concurrent change offers reload latest; duplicate needs an explicit separate-consumption acknowledgement',async({page,ledger})=>{
  await open(page);await compose(page,three);await textAction(page,'save').click();
  let b=(await ledger.call('/text-batches')).batches[0];
  await ledger.call(`/text-batches/${b.id}`,{version:b.version,original_text:b.original_text,items:b.items},'PATCH');
  await confirm(page,'item-1').click();await expect(textAction(page,'reload-batch')).toBeVisible();expect((await ledger.call('/entries')).totals.count).toBe(0);
  await textAction(page,'reload-batch').click();await expect(textAction(page,'reload-batch')).toHaveCount(0);
  await ledger.call('/entries',{type:'expense',amount_minor:1,category_id:'other',occurred_on:'2026-09',note:'合成另一笔'});
  await confirm(page,'item-1').click();await expect(card(page,'item-1').locator('[data-duplicate-ack]')).toBeVisible();expect((await ledger.call('/entries')).totals.count).toBe(1);
  await card(page,'item-1').locator('[data-duplicate-ack]').check();await confirm(page,'item-1').click();await expect(card(page,'item-1')).toHaveCount(0);expect((await ledger.call('/entries')).totals.count).toBe(2);
 });
 test('BATCH04 no animation under reduced motion; mixed income receipt is exact',async({page,ledger})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await open(page);await compose(page,'2026年9月合成支出0.01元；2026年9月收入合成奖金0.02元');
  await confirm(page,'item-1').click();await expect(card(page,'item-1')).toHaveCount(0);
  const saved=(await ledger.call('/entries')).entries[0];
  await ledger.call(`/entries/${saved.id}`,{type:saved.type,amount_minor:3,category_id:saved.category_id,occurred_on:saved.occurred_on,note:saved.note,version:saved.version},'PATCH');
  await confirm(page,'item-2').click();await expect(page.locator('.flow-success')).toContainText('支出 ¥ 0.03');await expect(page.locator('.flow-success')).toContainText('收入 ¥ 0.02');
  expect((await ledger.call('/entries')).totals).toMatchObject({count:2,expense_minor:3,income_minor:2});
 });
 test('DATE01 month default and explicit day require choosing a day; month bills/statistics/export remain consistent',async({page,ledger})=>{
  await open(page);await expect(page.locator('#entry-form-main [name=date_precision]')).toHaveValue('month');
  await page.locator('#entry-form-main [name=date_precision]').selectOption('day');await expect(page.locator('#entry-form-main [name=occurred_on]')).toHaveValue('');
  await write(page,{amount:'0.01',date:'2026-09',note:'合成月份消费'});await expect(page.locator('.save-receipt')).toContainText('已入账');
  await action(page,'view-receipt').click();await expect(page.locator('.mobile-bills')).toContainText('日期未指定');await expect(page.locator('.filter-summary')).toContainText('1 笔');
  await action(page,'entry',page.locator('.mobile-bills')).click();await expect(page.locator('#dialog [name=date_precision]')).toHaveValue('month');await expect(page.locator('#dialog [name=occurred_on]')).toHaveValue('2026-09');await close(page);
  await action(page,'filters').click();
  const csv=await downloadText(page,action(page,'export-filter'));
  await close(page);expect(csv).toContain('"2026-09",');expect(csv).not.toContain('"2026-09-01",');
  await open(page,'stats');await expect(page.locator('.chart-data')).toContainText('日期未指定');
  await action(page,'stats-options').click();
  for(const mode of ['line','pie','bar']){await page.locator(`#dialog [data-action=chart][data-value=${mode}]`).click();await expect(page.locator('#expense-chart')).toHaveAttribute('aria-label',/0.01/);}
  await close(page);
  const backup=await ledger.call('/backup');expect(backup.version).toBe(3);expect(backup.entries[0].occurred_on).toBe('2026-09');
 });
 test('DATE02 month recurrence has no fabricated day and explicit date conversion never silently uses day one',async({page,ledger})=>{
  await open(page);await compose(page,'从2026年8月开始每月合成服务0.01元，补记到2026年9月');
  await expect(page.locator('[data-field=cycle_precision]')).toHaveValue('month');await expect(page.locator('[data-field=charge_day]')).toHaveCount(0);
  await confirm(page,'item-1').click();await expect(page.locator('.flow-success')).toContainText('2 笔');expect((await ledger.call('/entries')).entries.map(e=>e.occurred_on).sort()).toEqual(['2026-08','2026-09']);
  await textAction(page,'new').click();await page.locator('#text-raw').fill('2026年9月合成新物品0.03元');await textAction(page,'parse').click();
  await page.locator('[data-field=date_precision]').selectOption('day');await expect(page.locator('[data-field=occurred_on]')).toHaveValue('');
  await confirm(page,'item-1').click();await expect(page.locator('#text-status')).toContainText('日期须');expect((await ledger.call('/entries')).totals.count).toBe(2);
  await page.locator('[data-field=occurred_on]').fill('2026-09-14');await confirm(page,'item-1').click();await expect(page.locator('.flow-success')).toContainText('1 笔');expect((await ledger.call('/entries?q=合成新物品')).entries[0].occurred_on).toBe('2026-09-14');
 });
});

for(const width of [360,390,430,1440,1920])test(`DOCK ${width}px green button, independent scroll and stable context`,async({page,ledger},testInfo)=>{
 await page.setViewportSize({width,height:width<768?844:1000});await open(page);
 const items=parseTextRecords(three+'；'+three.replaceAll('合成','追加合成')+'；'+three.replaceAll('合成','再追加合成'),'2026-10-10');
 const b=(await ledger.call('/text-batches',{original_text:'合成布局批次',items})).batch;await page.reload();await page.waitForLoadState('networkidle');await page.locator(`.batch-history-row[data-batch-id="${b.id}"]`).click();
 const dialog=page.locator('#dialog');await expect(dialog).toBeVisible();await dialog.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));const bounds=await dialog.boundingBox();
 expect(await confirm(page,'item-1').evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
 if(width>=1100){
  await expect(dialog).toHaveAttribute('data-nonmodal','true');expect(bounds.width).toBeLessThanOrEqual(480);expect(bounds.x).toBeGreaterThan(width-510);
  expect(await page.locator('body').evaluate(el=>getComputedStyle(el).overflowY)).not.toBe('hidden');
  await page.locator('#amount-main').fill('1.23');await expect(page.locator('#amount-main')).toHaveValue('1.23');
  const last=page.locator('.text-candidate').last();await last.scrollIntoViewIfNeeded();expect(await page.locator('.dialog-body').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await testInfo.attach(`review-${width}`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  await page.setViewportSize({width:390,height:844});await expect(dialog).toHaveAttribute('data-nonmodal','false');await expect(page.locator('.text-candidate')).toHaveCount(9);
 }else{await expect(dialog).toHaveAttribute('data-nonmodal','false');await testInfo.attach(`review-${width}`,{body:await page.screenshot(),contentType:'image/png'});}
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
});
