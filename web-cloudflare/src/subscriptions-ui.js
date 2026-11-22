import { SPENDING_LABELS } from '../shared/spending-labels.js';
import { subscriptionRows } from '../shared/subscriptions.js';
import { PLATFORMS } from '../shared/platform-sources.js';
import { money,today } from '../shared/format.js';
import { escape as e,icon } from './ui.js';
function subscriptionCard(row) {
  return `<article class="card subscription-card">
    <div class="card-heading"><h3>${e(row.title)}</h3><span class="status-pill">${e(row.status)}</span></div>
    <div class="subscription-amounts"><p class="subscription-price">${row.amount_minor?money(row.amount_minor):'金额待补'}<small> / ${row.cycle==='monthly'?'月':row.cycle==='yearly'?'年':row.cycle==='quarterly'?'季':'周期待确认'}</small></p><div class="subscription-total spending-${e(row.spending_label||'unset')}"><span>已记支出</span><strong>${row.recorded_expense_minor===null?'暂不可用':money(row.recorded_expense_minor)}</strong></div></div>
    <div class="spending-picks" role="group" aria-label="为${e(row.title)}选择支出标记">${Object.entries(SPENDING_LABELS).map(([key,label])=>`<button type="button" class="spending-pick spending-${key}" data-action="subscription-label" data-id="${e(row.batch_id)}" data-item-id="${e(row.id)}" data-version="${row.version}" data-value="${key}" aria-label="${e(label)}" aria-pressed="${row.spending_label===key}" title="${e(label)}">${row.spending_label===key?'✓':''}<span class="sr-only">${e(label)}</span></button>`).join('')}<span class="spending-label-name">${e(SPENDING_LABELS[row.spending_label]||'选择支出标记')}</span></div>
    <p class="subscription-period">${e(row.start||'起始月待补')} → ${e(row.end||(row.ongoing?(row.auto_record?'持续订阅 · 自动记账':'持续订阅'):'截止月待补'))}</p>
    <p class="subscription-source">${e(row.source)} · 已记 ${row.confirmed} 笔${row.due?` · ${row.due} 笔待核对`:''}${row.deleted?` · ${row.deleted} 笔已删除`:''}</p>${row.missing.length?`<p class="field-error">${e(row.missing.join('；'))}</p>`:''}<button class="button secondary" data-action="text-records" data-batch-id="${e(row.batch_id)}">${row.due?'继续核对':'查看或调整'}</button>${row.single_rule?`<button class="text-button" data-action="subscription-status" data-id="${e(row.batch_id)}" data-version="${row.version}" data-status="${row.paused?'active':'paused'}">${row.paused?'恢复订阅':'暂停订阅'}</button>`:''}
    <details><summary>已记月份与说明</summary><p>${row.dates.map(d=>e(d)).join('、')||'尚未入账'}</p><p>历史补记按实际月份保存；未来月份不提前入账。暂停和恢复在核对面板内操作。</p></details></article>`;
}

export function subscriptionsPage(state){
 if(!state.textSummary?.batches)return '<p role="status">正在读取订阅…</p>';
 const rows=subscriptionRows(state.textSummary.batches,state.session.today);
 return `<section class="subscriptions-workspace"><div class="card-heading"><h2>我的订阅 <small>${rows.length} 项</small></h2><button class="button primary" data-action="subscription-new">${icon('plus',16)}记录订阅</button></div>${rows.length?`<div class="subscription-grid">${rows.map(subscriptionCard).join('')}</div>`:'<section class="card subscription-empty"><h3>把固定扣费放在一起</h3><p>每月、每年的订阅，也能补记前几年的记录。</p><button class="button secondary" data-action="text-records">用文字记录订阅</button></section>'}</section>`;
}
export function subscriptionForm(state){const sources=[...new Set([...PLATFORMS,...(state.textSummary?.platforms||[]).map(g=>g.source)])];return `<form data-form="subscription" class="standard-form"><label>订阅名称<input name="title" required maxlength="64" placeholder="例如：星穹铁道月卡" /></label><label>消费对象<select name="source">${sources.map(name=>`<option value="${e(name)}" ${name==='其他订阅软件'?'selected':''}>${e(name)}</option>`).join('')}</select></label><div class="subscription-form-pair"><label>扣费周期<select name="cycle"><option value="monthly">每月</option><option value="yearly">每年</option></select></label><label>每次金额（元）<input name="amount" required inputmode="decimal" value="30.00" /></label></div><label>分类<select name="category" required><option value="">请选择</option>${state.categories.filter(c=>c.type==='expense'&&!c.archived).map(c=>`<option value="${e(c.id)}">${e(c.name)}</option>`).join('')}</select></label><div class="subscription-form-pair"><label>起始月份<input name="start" type="month" min="1900-01" max="${today().slice(0,7)}" required /></label></div><label>订阅状态<select name="status"><option value="ongoing">仍在订阅 · 每期自动记账</option><option value="stopped">已经停止</option></select></label><div data-subscription-end hidden><label>最后扣费月份<input name="end" type="month" min="1900-01" max="${today().slice(0,7)}" /></label></div><details><summary>怎样记账？</summary><p>首次确认会补记到本月，以后每期自动记账，停止时可暂停。已停止的订阅只记到最后扣费月份。</p></details><p class="field-error" id="subscription-error" role="alert"></p><div class="dialog-footer"><button type="button" class="button secondary" data-action="close-dialog">取消</button><button class="button primary" type="submit">下一步</button></div></form>`;}

export function subscriptionReview(item,plan,{uncertain=false,message=''}={}){
 const cycle=item.cycle==='monthly'?'月':'年';
 const overlap=plan.overlap_months.length>0;
 const range=plan.from===plan.to?plan.from:`${plan.from} 至 ${plan.to}`;
 return `<form data-form="subscription-confirm" class="standard-form">
   <div class="backup-summary"><h3>${e(plan.title)}</h3><p>每${cycle} ${money(item.amount_minor)} · ${e(plan.category)}</p><p>${e(range)} · ${plan.count} 笔</p><strong>合计 ${money(plan.expense_minor)}</strong></div>
   ${item.ongoing?'<p class="dialog-intro">确认后，以后每期自动记账。</p>':''}
   ${overlap?`<p class="field-error">这些月份已有同名账目：${e(plan.overlap_months.join('、'))}。如果是同一笔，请返回修改。</p>`:''}
   <p class="field-error" id="subscription-error" role="alert">${e(message)}</p>
   <div class="dialog-footer"><button type="button" class="button secondary" data-action="subscription-back" ${uncertain?'disabled':''}>返回修改</button><button class="button primary confirm-one" type="submit">${uncertain?'重试确认':overlap?`确认另记 ${plan.count} 笔`:`确认 ${plan.count} 笔`}</button></div>
 </form>`;
}
