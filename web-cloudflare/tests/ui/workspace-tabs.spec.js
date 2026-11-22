import { test, expect, open } from './fixtures.js';
test('TAB01 internal tabs reuse browser page, preserve draft and close/reopen',async({page,context})=>{
 await open(page);await page.locator('#amount-main').fill('12.34');await page.locator('#note-main').fill('虚构草稿');await page.locator('.mobile-nav [data-route=subscriptions]').click();await expect(page.getByRole('tab',{name:'订阅',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('tab',{name:'记一笔',exact:true}).click();await expect(page.locator('#note-main')).toHaveValue('虚构草稿');await expect(page.locator('#amount-main')).toHaveValue('12.34');await page.locator('.mobile-nav [data-route=subscriptions]').click();await page.locator('.mobile-nav [data-route=subscriptions]').click();await expect(page.getByRole('tab',{name:'订阅',exact:true})).toHaveCount(1);expect(context.pages()).toHaveLength(1);
 await expect(page.locator('.subscriptions-workspace')).toBeVisible();
 await page.waitForLoadState('networkidle');
 await page.reload();await expect(page.getByRole('tab')).toHaveCount(2);await page.getByRole('button',{name:'关闭订阅标签页'}).click();await expect(page.getByRole('tab',{name:'记一笔',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.locator('#note-main')).toHaveValue('虚构草稿');
 await page.locator('.workspace-tab-add summary').click();await page.locator('.workspace-tab-add [data-workspace-page=subscriptions]').click();await page.getByRole('tab',{name:'订阅',exact:true}).press('Delete');await expect(page.getByRole('tab')).toHaveCount(1);
 await page.setViewportSize({width:1440,height:1000});await page.locator('.sidebar nav [data-route=stats]').click();await page.getByRole('tab',{name:'记一笔',exact:true}).focus();await page.keyboard.press('End');await expect(page.getByRole('tab',{name:'统计',exact:true})).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'/private/tmp/moneytalk-workspace-tabs-desktop.png',fullPage:true});
});
test('TAB02 tabs retain bills filters',async({page})=>{
 await open(page,'bills','month=2025-03&q=虚构');await page.locator('.mobile-nav [data-route=subscriptions]').click();await page.getByRole('tab',{name:'账单',exact:true}).click();await expect(page).toHaveURL(/month=2025-03.*q=/);
});
