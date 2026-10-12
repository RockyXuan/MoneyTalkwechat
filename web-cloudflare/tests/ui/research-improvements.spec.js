import {test,expect,open,action} from './fixtures.js';
import {parseTextRecords} from '../../shared/text-records.js';
test.use({seed:'empty'});
const detail = page => page.locator('#dialog');
async function make(ledger,extra={}){const created=(await ledger.call('/entries',{type:'expense',category_id:'food',amount_minor:1234,occurred_on:'2026-09',note:'合成常用早餐',...extra})).entry;return (await ledger.call(`/entries/${created.id}`)).entry;}
for(const width of [390,1440]){
 test(`LEARN01 ${width} visible filters independently clear, zero result and refresh preserve context`,async({page,ledger})=>{
  await page.setViewportSize({width,height:950});await make(ledger);
  await open(page,'bills','month=2026-09&type=expense&category_id=food&q=%3C不存在%3E&from=2026-09-01&to=2026-09-30');
  await expect(page.locator('.active-filters button')).toHaveCount(4);await expect(page.locator('.active-filters')).toContainText('<不存在>');await expect(page.locator('.empty-state')).toContainText('没有找到记录');
  await page.locator('[data-action=remove-filter][data-value=q]').click();await expect(page.locator('.active-filters button')).toHaveCount(3);await expect(page.locator('.filter-summary')).toContainText('共 1 笔');
  if(width>=768)await action(page,'filter-type').click();else await page.locator('[data-action=remove-filter][data-value=type]').click();await expect(page).toHaveURL(/category_id=food/);await expect(page.locator('.active-filters button')).toHaveCount(2);
  await page.reload();await expect(page.locator('[data-action=remove-filter][data-value=category_id]')).toBeVisible();
  await page.locator('[data-action=remove-filter][data-value=range]').click();await expect(page).not.toHaveURL(/from=/);
  if(width>=768)await page.locator('[data-action=filter-type][data-value=expense]').click();else await open(page,'bills','month=2026-09&category_id=food&type=expense');await page.locator('[data-action=remove-filter][data-value=type]').click();await expect(page).toHaveURL(/category_id=food/);
  await page.locator('[data-action=remove-filter][data-value=category_id]').click();await expect(page.locator('.active-filters')).toHaveCount(0);
 });
 test(`LEARN02 ${width} current period keeps conditions, clears custom range and pagination`,async({page,ledger})=>{
  await page.setViewportSize({width,height:950});const month=(await ledger.call('/session')).today.slice(0,7);
  await open(page,'bills','month=2025-01&type=expense&q=合成&offset=50&from=2025-01-01&to=2025-01-31');await action(page,'current-period').click();
  await expect(page).toHaveURL(new RegExp(`month=${month}`));await expect(page).toHaveURL(/type=expense/);await expect(page).not.toHaveURL(/offset=|from=/);await expect(page.locator('.active-filters')).toContainText('合成');
  await open(page,'stats','month=2025-01&period=quarter');await action(page,'current-period').click();await expect(page).toHaveURL(new RegExp(`month=${month}&period=quarter`));
  await open(page,'stats','month=2024-01&period=year');await action(page,'current-period').click();await expect(page).toHaveURL(new RegExp(`month=${month}&period=year`));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test(`LEARN03 ${width} copy creates independent month draft, refresh resumes and main input survives`,async({page,ledger})=>{
  await page.setViewportSize({width,height:950});const original=await make(ledger);await open(page);await page.locator('#amount-main').fill('99.99');await page.locator('#note-main').fill('合成未保存原草稿');
  await page.locator(`.record-detail[data-id="${original.id}"]`).click();await action(page,'duplicate-entry',detail(page)).click();
  await expect(detail(page).locator('h2')).toHaveText('再记一笔');await expect(detail(page).locator('[name=occurred_on]')).toHaveValue((await ledger.call('/session')).today.slice(0,7));await expect(detail(page).locator('[name=amount]')).toHaveValue('12.34');expect((await ledger.call('/entries')).totals.count).toBe(1);
  await page.reload();await expect(detail(page).locator('h2')).toHaveText('再记一笔');await detail(page).locator('[name=amount]').fill('15.01');await detail(page).locator('[name=note]').fill('合成复制早餐');
  await detail(page).locator('[type=submit]').click();await expect(detail(page)).not.toBeVisible();await expect(page.locator('#toast')).toContainText('已入账');
  await expect(page.locator('#amount-main')).toHaveValue('99.99');await expect(page.locator('#note-main')).toHaveValue('合成未保存原草稿');const entries=(await ledger.call('/entries')).entries;expect(entries).toHaveLength(2);expect(entries.find(e=>e.id!==original.id).amount_minor).toBe(1501);expect((await ledger.call(`/entries/${original.id}`)).entry).toEqual(original);
 });
 test(`LEARN04 ${width} copying respects dirty edits, cancel and archived category`,async({page,ledger})=>{
  await page.setViewportSize({width,height:950});const original=await make(ledger);const {id,...cat}=(await ledger.call('/categories')).categories.find(c=>c.id==='food');await ledger.call('/categories/food',{...cat,archived:true},'PATCH');await open(page);
  await page.locator(`.record-detail[data-id="${original.id}"]`).click();await detail(page).locator('[name=note]').fill('合成不要丢');await action(page,'duplicate-entry',detail(page)).click();await expect(page.locator('#toast')).toContainText('请先保存或取消');await expect(detail(page).locator('[name=note]')).toHaveValue('合成不要丢');
  await detail(page).locator('[name=note]').fill(original.note);await action(page,'duplicate-entry',detail(page)).click();await expect(detail(page).locator('.field-error')).toContainText('原分类已停用');await expect(detail(page).locator('[aria-pressed=true][data-action=entry-category]')).toHaveCount(0);
  await detail(page).locator('[name=amount]').fill('23');await action(page,'close-dialog',detail(page)).click();await expect(detail(page).locator('h2')).toHaveText('放弃修改？');await action(page,'discard-editing',detail(page)).click();await expect(detail(page)).not.toBeVisible();await page.reload();await expect(detail(page)).not.toBeVisible();expect((await ledger.call('/entries')).totals.count).toBe(1);
 });
}
test('LEARN05 mobile platform tabs keep main draft and extra sources, desktop still displays all',async({page,ledger},info)=>{
 await ledger.call('/text-batches',{original_text:'合成待核对0.01元',items:parseTextRecords('合成待核对0.01元','2026-09-14')});
 await open(page);await page.locator('#amount-main').fill('8.88');await page.locator('#note-main').fill('合成草稿');
 for(const source of ['京东','抖音','淘宝','支付宝','微信','拼多多']){await page.locator(`.platform-tabs [data-source="${source}"]`).click();await expect(page.locator('.platform-card:visible')).toHaveCount(1);await expect(page.locator(`.platform-card[data-platform="${source}"]`)).toBeVisible();await expect(page.locator('#amount-main')).toHaveValue('8.88');}
 await page.locator('.platform-tabs [data-source="口述记录"]').click();await expect(page.locator('.platform-card:visible')).toContainText('合成待核对');await page.emulateMedia({reducedMotion:'reduce'});expect(await page.locator('.platform-card:visible').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await info.attach('mobile-selected-platform',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await page.setViewportSize({width:1440,height:950});await expect(page.locator('.platform-card:visible')).toHaveCount(7);await expect(page.locator('.platform-tabs')).not.toBeVisible();
});
test('LEARN06 copied draft double submit and lost response retry produce one new entry',async({page,ledger})=>{
 const original=await make(ledger);await open(page);await page.locator(`.record-detail[data-id="${original.id}"]`).click();await action(page,'duplicate-entry',detail(page)).click();
 await expect(detail(page).locator('h2')).toHaveText('再记一笔');
 let writes=0;await page.route('**/api/operations/*',route=>route.abort());await page.route('**/api/entries',async route=>{if(route.request().method()!=='POST')return route.continue();writes++;await route.fetch();await route.abort();});
 await page.evaluate(()=>{document.querySelector('#entry-form-dialog').requestSubmit();document.querySelector('#entry-form-dialog').requestSubmit();});
 await expect(detail(page).locator('.field-error')).not.toBeEmpty();expect(writes).toBe(1);expect((await ledger.call('/entries')).totals.count).toBe(2);
 await page.unroute('**/api/entries');await page.unroute('**/api/operations/*');await page.reload();await expect(detail(page).locator('[type=submit]')).toContainText('核对并重试');await detail(page).locator('[type=submit]').click();await expect(detail(page)).not.toBeVisible();expect((await ledger.call('/entries')).totals.count).toBe(2);expect((await ledger.call(`/entries/${original.id}`)).entry).toEqual(original);
 await page.locator(`.record-detail[data-id="${original.id}"]`).click();await action(page,'duplicate-entry',detail(page)).click();await action(page,'close-dialog',detail(page)).click();await expect(detail(page)).not.toBeVisible();await page.reload();await expect(detail(page)).not.toBeVisible();expect((await ledger.call('/entries')).totals.count).toBe(2);
});
test('LEARN07 preparing a copied draft locks old save and returns safely on read failure',async({page,ledger})=>{
 const original=await make(ledger);await open(page);await page.locator(`.record-detail[data-id="${original.id}"]`).click();
 let release,started;const barrier=new Promise(resolve=>release=resolve),ready=new Promise(resolve=>started=resolve);
 await page.route(`**/api/entries/${original.id}`,async route=>{started();await barrier;await route.abort();});
 await action(page,'duplicate-entry',detail(page)).click();await ready;await expect(detail(page).locator('[type=submit]')).toBeDisabled();await expect(detail(page).locator('[type=submit]')).toContainText('正在准备');
 await action(page,'close-dialog',detail(page)).click();await expect(detail(page)).toBeVisible();release();await expect(detail(page).locator('[type=submit]')).toBeEnabled();await expect(page.locator('#toast')).toContainText('暂时无法连接');
 await page.unroute(`**/api/entries/${original.id}`);expect((await ledger.call(`/entries/${original.id}`)).entry).toEqual(original);expect((await ledger.call('/entries')).totals.count).toBe(1);
});
