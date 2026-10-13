import {test,expect,open,close,textAction,action} from './fixtures.js';
import {parseTextRecords} from '../../shared/text-records.js';
test.use({seed:'empty'});
const tile=(page,source)=>page.locator(`.platform-card[data-platform="${source}"]`);
async function create(ledger,text){return (await ledger.call('/text-batches',{original_text:text,items:parseTextRecords(text,'2026-10-11')})).batch;}
async function confirm(ledger,b,item){const p=await ledger.call(`/text-batches/${b.id}/preview`,{item_ids:[item]});return ledger.call(`/text-batches/${b.id}/confirm`,{version:b.version,preview_hash:p.preview_hash,item_ids:[item],acknowledge_duplicates:true});}
for(const width of [360,390,430,768,1440,1920])test(`PLAT01 ${width}px six clear platforms and left desktop form, responsive readable ranges`,async({page,ledger},info)=>{
 await page.setViewportSize({width,height:width<768?844:1000});const b=await create(ledger,'淘宝 · 合成首件0.01元；淘宝 · 合成尾件0.02元');await confirm(ledger,b,'item-1');await open(page);
 await expect(page.locator('.platform-card')).toHaveCount(6);if(width<768){await expect(page.locator('.platform-tabs button')).toHaveCount(6);await expect(page.locator('.platform-card:visible')).toHaveCount(1);for(const button of await page.locator('.platform-tabs button').all())expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);}else await expect(page.locator('.platform-card:visible')).toHaveCount(6);await expect(tile(page,'淘宝').locator('.platform-range')).toContainText('合成首件');await expect(tile(page,'淘宝').locator('.platform-range')).toContainText('合成尾件');await expect(tile(page,'淘宝')).toContainText('下一项：合成尾件');await expect(tile(page,'京东')).toContainText('尚未记录');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const entry=await page.locator('.record-entry-column').boundingBox(),board=await page.locator('.platform-board').boundingBox(),main=await page.locator('#main').boundingBox();
 if(width>=768){expect(Math.abs(entry.x-main.x)).toBeLessThan(2);expect(board.x).toBeGreaterThan(entry.x+entry.width-2);}else expect(board.y).toBeLessThan(entry.y);
 if(width===390||width===1920)await info.attach(`platform-board-${width}`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
test('PLAT02 one click source, confirmed range, interrupted batch resume and next platform stay independent',async({page,ledger})=>{
 await open(page);await tile(page,'淘宝').getByRole('button',{name:'记录淘宝',exact:true}).click();await expect(page.locator('.source-picker [data-source="淘宝"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('#text-raw').fill('合成首件0.01元；合成中件0.02元；合成尾件0.03元');await textAction(page,'parse').click();await page.locator('[data-item-id="item-3"] .confirm-one').click();await expect(page.locator('[data-item-id="item-3"]')).toHaveCount(0);await close(page);await page.reload();await page.waitForLoadState('networkidle');
 await expect(tile(page,'淘宝')).toContainText('中间有未确认项');await expect(tile(page,'淘宝').locator('.platform-confirmed')).toContainText('合成尾件');await expect(tile(page,'淘宝')).toContainText('下一项：合成首件');await tile(page,'淘宝').getByRole('button',{name:/继续核对/}).click();await expect(page.locator('.text-candidate')).toHaveCount(2);
 await page.locator('[data-item-id="item-1"] .confirm-one').click();await expect(page.locator('[data-item-id="item-1"]')).toHaveCount(0);await page.locator('[data-item-id="item-2"] .confirm-one').click();await expect(page.locator('.flow-success')).toBeVisible();await expect(page.locator('#text-actions button').first()).toBeEnabled();await close(page);
 await page.locator('.platform-tabs [data-source="京东"]').click();await tile(page,'京东').getByRole('button',{name:'记录京东',exact:true}).click();await expect(page.locator('.source-picker [data-source="京东"]')).toHaveAttribute('aria-pressed','true');await page.locator('#text-raw').fill('合成新件0.04元');await textAction(page,'parse').click();await page.locator('.confirm-one').click();await expect(page.locator('.flow-success')).toBeVisible();await expect(page.locator('#text-actions button').first()).toBeEnabled();await close(page);
 await expect(tile(page,'淘宝')).toContainText('3/3 已确认');await expect(tile(page,'京东')).toContainText('1/1 已确认');await expect(tile(page,'抖音')).toContainText('尚未记录');expect((await ledger.call('/entries')).totals.count).toBe(4);
});
test('PLAT03 older unfinished batch remains visible beyond six batches and opens in one click',async({page,ledger})=>{
 const first=await create(ledger,'淘宝 · 合成早期1元');
 for(const name of ['甲','乙','丙','丁','戊','己','庚']){const b=await create(ledger,`淘宝 · 合成${name}2元`);await confirm(ledger,b,'item-1');}
 await open(page);await expect(tile(page,'淘宝')).toContainText('另有 1 批待核对');await tile(page,'淘宝').getByRole('button',{name:/继续较早批次/}).click();await expect(page.locator('.text-candidate h3')).toContainText('合成早期');await close(page);
 await tile(page,'淘宝').locator('summary').click();await expect(tile(page,'淘宝').locator('.platform-history-row')).toHaveCount(8);await tile(page,'淘宝').locator(`.platform-history-row[data-batch-id="${first.id}"]`).click();await expect(page.locator('.text-candidate h3')).toContainText('合成早期');
});
test('PLAT04 mixed platforms, real category changes, deletion and reduced motion stay honest',async({page,ledger})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const b=await create(ledger,'淘宝 · 合成甲0.01元；京东 · 合成乙0.02元');const value=await confirm(ledger,b,'item-1');const entry=(await ledger.call(`/entries/${value.entry_ids[0]}`)).entry;
 await ledger.call(`/entries/${entry.id}`,{type:entry.type,amount_minor:entry.amount_minor,category_id:'transport',occurred_on:entry.occurred_on,note:entry.note,version:entry.version},'PATCH');await open(page);
 await expect(tile(page,'淘宝').locator('.platform-categories')).toContainText('交通');await expect(tile(page,'京东')).toContainText('这批尚未入账');expect(await tile(page,'淘宝').evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
 await ledger.call(`/entries/${entry.id}/delete`,{version:2});await page.reload();await page.waitForLoadState('networkidle');await expect(tile(page,'淘宝')).toContainText('1 笔已删除');await expect(tile(page,'淘宝').locator('.platform-categories')).toHaveCount(0);expect((await ledger.call('/entries')).totals.count).toBe(0);
});
test('PLAT05 source buttons keep input and explicit different platform, failure never looks empty',async({page,ledger})=>{
 await open(page);await page.locator('.platform-tabs [data-source="抖音"]').click();await tile(page,'抖音').getByRole('button',{name:'记录抖音',exact:true}).click();await page.locator('#text-raw').fill('京东 · 合成明确0.01元；合成默认0.02元');await page.locator('.source-picker [data-source=""]').click();await close(page);await tile(page,'抖音').getByRole('button',{name:'记录抖音',exact:true}).click();await expect(page.locator('.source-picker [data-source=""]')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#text-raw')).toHaveValue('京东 · 合成明确0.01元；合成默认0.02元');await page.locator('.source-picker [data-source="淘宝"]').click();await expect(page.locator('#text-raw')).toHaveValue('京东 · 合成明确0.01元；合成默认0.02元');await textAction(page,'parse').click();await textAction(page,'save').click();await expect(page.locator('#text-status')).toContainText('草稿已保存');await expect(page.locator('.confirm-one').first()).toBeEnabled();await close(page);
 const batches=(await ledger.call('/text-batches')).batches;expect(batches[0].items.map(i=>i.title)).toEqual(['京东 · 合成明确','淘宝 · 合成默认']);expect((await ledger.call('/entries')).totals.count).toBe(0);
 await page.route('**/api/text-batches?view=board',route=>route.abort());await page.reload();await expect(page.locator('.error-panel')).toBeVisible();await expect(page.locator('.platform-card')).toHaveCount(0);
});
