import { recordedExpense } from '../shared/subscriptions.js';
import { intakeCategoryOptions } from '../shared/intake-category-options.js';
import { parseTextIntake, compileDraftItems, CYCLES, LONG_TEXT_LIMIT } from '../shared/text-records.js';
import { parseAmount, decimal, money, recordDateLabel } from '../shared/format.js';
import { batchProgress } from '../shared/batch-progress.js';
import { PLATFORMS, tagPlatformItems, batchSources, sourceTitle, titleSource } from '../shared/platform-sources.js';
import { batchPage, batchState } from '../shared/batch-library.js';
import { textItemsSchema } from '../shared/text-schema.js';
import { request, mutate } from './api.js';
import { escape as e, icon } from './ui.js';

const fieldQuestion=/^(起始月未知|扣款日未知|补记截止月或持续循环方式|记账日期未说明|金额或币种待确认|金额无效)/;
export function mountTextRecords(container,{categories,currentDay,draftKey,local=false,lock,onSaved,onCategoriesChanged=()=>{},onViewBills,initialBatchId=null,initialSource='',onStartSource=null,embedded=false,batchOverlay=false}) {
 let disposed=false,busy=false,batch=null,items=[],original='',slots=[],preview=null,pending=null,view='compose',receipt=null,rawValue='',deletePrompt=false,conflict=false;
 let intake=null;
 let source=initialSource&&initialSource.length<=64?initialSource:'';
 let listData=null,listTicket=0,newPrompt=false,removePrompt=null,savedContents='';
 const fieldId=name=>batchOverlay?`batch-${name}`:name;
 const contents=()=>JSON.stringify({original_text:original,items});
 const library={source:initialSource||'',status:'all',q:'',page:0};
 try{const saved=JSON.parse(sessionStorage.getItem(`${draftKey}:library`)||'null');if(saved){if(['all','review','done','paused'].includes(saved.status))library.status=saved.status;if(typeof saved.source==='string'&&saved.source.length<=32)library.source=saved.source;if(typeof saved.q==='string')library.q=saved.q.slice(0,200);if(Number.isSafeInteger(saved.page)&&saved.page>=0)library.page=saved.page;}}catch{/* Optional display preferences cannot block accounting. */}
 const cacheKey=`moneytalk:input-cache:${draftKey}`;
 let batchDraft;
 let precisions={},duplicateItems=new Set(),focusAfter=false,choiceFocus=null,itemErrors=new Map();
 try {const saved=JSON.parse(sessionStorage.getItem(draftKey)||'null');if(batchOverlay&&saved?.batch?.id===initialBatchId&&(saved.pending||saved.savedContents!==JSON.stringify({original_text:saved.original,items:saved.items})))batchDraft=saved;if(!saved&&!initialBatchId){const input=JSON.parse(sessionStorage.getItem(`${draftKey}:input`)||'null');if(input){rawValue=input.rawValue||'';source=input.source??source;}}if(saved&&!initialBatchId){({batch,items,original,slots,pending}=saved);rawValue=saved.rawValue??original;precisions=saved.precisions||{};savedContents=saved.savedContents||'';intake=saved.intake||null;source=saved.source??source;view=items.length?'review':'compose';if(saved.view==='result'&&saved.receipt){view='result';receipt=saved.receipt;}}}catch{sessionStorage.removeItem(draftKey);}
 if(!rawValue&&!items.length&&!initialBatchId){try{const cached=JSON.parse(localStorage.getItem(cacheKey)||'null');if(cached){rawValue=cached.rawValue||'';source=cached.source??source;}}catch{/* A broken optional cache cannot block opening. */}}
 container.className='text-flow';
 container.innerHTML=`<div id="${fieldId('text-flow-heading')}"></div><div id="${fieldId('text-status')}" role="status" aria-live="polite"></div><div id="${fieldId('text-work')}"></div><div id="${fieldId('text-batch-list')}"></div><div id="${fieldId('text-preview')}"></div><div id="${fieldId('text-actions')}" class="flow-actions"></div>`;
 if(embedded){const history=document.createElement('details');history.className='inline-history';history.innerHTML='<summary>历史草稿与批次</summary>';container.querySelector(`#${fieldId('text-batch-list')}`).before(history);history.append(container.querySelector(`#${fieldId('text-batch-list')}`));}
 const heading=container.querySelector(`#${fieldId('text-flow-heading')}`),status=container.querySelector(`#${fieldId('text-status')}`),list=container.querySelector(`#${fieldId('text-batch-list')}`),work=container.querySelector(`#${fieldId('text-work')}`),result=container.querySelector(`#${fieldId('text-preview')}`),actions=container.querySelector(`#${fieldId('text-actions')}`);
 function message(text,tone=''){status.textContent=text;status.className=tone;}
 function forgetInput(text){
  try{for(const [store,key] of [[sessionStorage,`${draftKey}:input`],[localStorage,cacheKey]]){const cached=JSON.parse(store.getItem(key)||'null');if(cached?.rawValue===text)store.removeItem(key);}}catch{/* A confirmed cloud save cannot fail because optional cache cleanup failed. */}
 }
 function cacheInput(){try{localStorage.setItem(cacheKey,JSON.stringify({rawValue,source,updated_at:new Date().toISOString()}));const state=work.querySelector(`#${fieldId('text-draft-state')}`);if(state)state.textContent='已存此浏览器 · 点保存并解析后同步';}catch{message('此浏览器未能保存输入，请先复制原文，避免刷新后丢失。','error');}}
 function persist(){if(disposed)return;try{sessionStorage.setItem(draftKey,JSON.stringify({batch,items,original,rawValue,slots,pending,precisions,source,savedContents,intake,view,receipt}));if(view==='compose'&&!items.length){sessionStorage.setItem(`${draftKey}:input`,JSON.stringify({rawValue,source}));cacheInput();}}catch{message('浏览器无法保留草稿，请保存后再离开。','error');}}
 function suggestionHtml(item){
  const hint=item.category_hint;if(!hint)return '';
  const active=categories.filter(c=>c.type===item.type&&!c.archived),recommended=active.filter(c=>hint.recommended_ids.includes(c.id));
  const choices=recommended.length?recommended:active.slice(0,5);
  const exact=active.find(c=>c.name===hint.name);
  return `<section class="category-suggestion ${hint.resolved?'is-resolved':''}" aria-label="分类建议"><p><strong>${hint.name==='待选择'?'这笔归到哪里？':`分类：${e(hint.name)}`}</strong><span>${hint.resolved?'已选择，可改选':hint.name==='待选择'?'请选择或新建':'归到哪里？'}</span></p><div class="category-choices">${choices.map(c=>`<button type="button" class="category-choice ${recommended.includes(c)?'recommended':''}" data-text-action="choose-category" data-item="${e(item.id)}" data-category="${e(c.id)}" aria-pressed="${hint.resolved&&item.category_id===c.id}">${icon(c.icon,16)}归到 ${e(c.name)}${recommended.includes(c)?'<small>推荐</small>':''}${hint.resolved&&item.category_id===c.id?icon('check',16):''}</button>`).join('')}${exact&&!choices.some(c=>c.id===exact.id)?`<button type="button" class="category-choice" data-text-action="choose-category" data-item="${e(item.id)}" data-category="${e(exact.id)}" aria-pressed="${hint.resolved&&item.category_id===exact.id}">使用 ${e(hint.name)}</button>`:!exact&&hint.name!=='待选择'?`<button type="button" class="category-choice create-choice" data-text-action="create-category" data-item="${e(item.id)}">${icon('plus',16)}新建 ${e(hint.name)}</button>`:''}</div>${hint.name==='待选择'?`<div class="category-custom-create"><input data-new-category maxlength="32" aria-label="新分类名称" placeholder="没有合适的？填写新分类"/><button type="button" class="button secondary" data-text-action="create-custom-category" data-item="${e(item.id)}">新建</button></div>`:''}<small>选分类后，再点绿色确认入账</small></section>`;
 }
 function renderChoice(id){const scroller=container.closest('.dialog-body'),top=scroller?.scrollTop||0;render();if(scroller)scroller.scrollTop=top;choiceFocus=id;}
 function applyCreatedCategory(value,id){const item=items.find(i=>i.id===id);if(!item)throw new Error('分类已处理，请重新打开原草稿选择');categories=categories.filter(c=>c.id!==value.category.id).concat(value.category);onCategoriesChanged(categories);item.category_id=value.category.id;item.category_hint.resolved=true;itemErrors.delete(id);preview=null;persist();renderChoice(id);message(value.reused?'已使用已有分类，尚未入账':'分类已新建并选中，尚未入账','success');}
 const lockedIds=()=>new Set(slots.map(s=>s.item_id));
 const localPlan=()=>compileDraftItems(items.map(i=>({...i,questions:i.questions.filter(q=>!fieldQuestion.test(q))})),currentDay,slots);
 function feedbackText(item,row){
  if(itemErrors.has(item.id))return itemErrors.get(item.id);
  if(row?.missing.length)return row.missing.map(q=>q==='请选择“待选择”的分类建议'?'请选择分类，或填写名称新建':q==='扣款日待确认'?'扣款日待确认：填写 1–31 日，或选择只记月份。':q).join('；');
  return row?.entries.length?`${item.category_hint?.resolved?`已选 ${categories.find(c=>c.id===item.category_id)?.name||'分类'} · `:''}${row.entries.length} 笔 · ${item.cycle==='single'?recordDateLabel(item.occurred_on):item.date_precision==='month'?'只记月份，不填扣款日':'按已核对周期入账'}`:'此项未选或已记录';
 }
 function footerHtml(item,row,locked){const issue=itemErrors.has(item.id)||Boolean(row?.missing.length),feedbackId=`candidate-feedback-${item.id}`;
  return `<div class="candidate-footer"><div class="candidate-help"><div id="${e(feedbackId)}" class="candidate-feedback ${issue?'has-error':''}" role="status" aria-live="polite">${e(feedbackText(item,row))}${item.ongoing&&item.auto_record?' · 以后每期自动记账':''}</div>${!locked&&item.questions.includes('日期沿用同段前一项，请确认日期语境')?'<button class="month-only-button" data-text-action="accept-context">本段沿用日期都正确</button>':''}${!locked&&item.cycle!=='single'&&item.date_precision!=='month'?`<button class="month-only-button" data-text-action="month-only" data-item="${e(item.id)}">不填扣款日，按月记</button>`:''}</div><div class="candidate-commands">${locked?'':removePrompt===item.id?`<button type="button" class="text-button" data-text-action="keep-item" data-item="${e(item.id)}">保留</button><button type="button" class="text-button remove-candidate" data-text-action="remove-item" data-item="${e(item.id)}">确认删除</button>`:`<button type="button" class="text-button remove-candidate" data-text-action="ask-remove-item" data-item="${e(item.id)}" aria-label="删除草稿项 ${e(sourceTitle(item.title))}">删除</button>`}<button class="confirm-one" data-text-action="confirm-item" data-item="${e(item.id)}" aria-describedby="${e(feedbackId)}" aria-label="确认 ${e(item.title)}">${icon('check',17)}确认${row?.entries.length>1?` ${row.entries.length} 笔`:''}</button></div></div>`;
 }
 function itemIssue(id,text){itemErrors.set(id,text);const feedback=work.querySelector(`[data-item-id="${id}"] .candidate-feedback`);if(feedback){feedback.textContent=text;feedback.classList.add('has-error');}}
 function refreshCandidateFeedback(){const plan=localPlan();for(const item of items){const card=work.querySelector(`[data-item-id="${item.id}"]`);if(!card)continue;const row=plan.rows.find(r=>r.item.id===item.id),feedback=card.querySelector('.candidate-feedback');feedback.textContent=feedbackText(item,row);feedback.classList.toggle('has-error',itemErrors.has(item.id)||Boolean(row?.missing.length));card.querySelector('.candidate-amount').textContent=item.amount_minor?money(item.amount_minor):'待填金额';card.querySelector('.confirm-one').setAttribute('aria-label',`确认 ${item.title}`);card.querySelector('.confirm-one').lastChild.textContent=`确认${row?.entries.length>1?` ${row.entries.length} 笔`:''}`;}}
 function controls(){container.querySelectorAll('button,input,select,textarea').forEach(el=>{el.disabled=busy||Boolean(pending)||el.dataset.unavailable==='true';});container.querySelector('[data-text-action=retry]')?.toggleAttribute('disabled',busy);for(const id of lockedIds())container.querySelector(`[data-item-id="${id}"] fieldset`)?.setAttribute('disabled','');lock(busy);}
 function progressHtml(progress){return `<section class="batch-progress" aria-label="批次进度"><div><span class="source-badge">${e(progress.source)}</span><strong>已确认 ${progress.confirmed_items} / ${progress.total_items} 项</strong></div><progress max="${Math.max(1,progress.total_items)}" value="${progress.confirmed_items}" aria-label="确认进度"></progress><p>本批：${e(progress.first_title)} → ${e(progress.last_title)}</p>${progress.next_title?`<p class="resume-hint">${progress.continue_after?`连续记到：${e(progress.continue_after)}；`:'从第一项开始核对；'}下一项：${e(progress.next_title)}</p>`:'<p class="resume-hint">本批全部已记录，可以继续往前翻。</p>'}${progress.has_gaps?'<p class="pending-note">中间还有未确认项，请从下一项继续。</p>':''}${progress.deleted_entries?`<p class="pending-note">${progress.deleted_entries} 笔已移入回收站，不会自动补记。</p>`:''}</section>`;}
 function dateField(item){const precision=precisions[item.id]||(item.occurred_on?.length===10?'day':'month');return `<label>日期精度<select data-field="date_precision"><option value="month" ${precision==='month'?'selected':''}>只记月份</option><option value="day" ${precision==='day'?'selected':''}>精确到日</option></select></label><label>${precision==='month'?'记账月份':'记账日期'}<input type="${precision==='month'?'month':'date'}" max="${precision==='month'?currentDay.slice(0,7):currentDay}" data-field="occurred_on" value="${e(item.occurred_on||'')}"/></label>`;}
 function continuationHtml(){
  const group=listData?.platforms?.find(g=>g.source===source),row=group?.latest;
  if(!row)return '';
  const p=row.progress,resume=group.resume;
  return `<section class="compose-continuation" aria-label="${e(source)}续记位置"><div><strong>${e(source)} · 上次记到这里</strong>${resume?`<button class="text-button" data-text-action="open" data-id="${e(resume.id)}">继续待核对 ${icon('right',14)}</button>`:''}</div><p>${e(p.first_title)} <span>……</span> ${e(p.last_title)}</p><small>${p.continue_after?`连续记到：${e(p.continue_after)}`:'本批尚未连续确认'}${p.next_title?` · 下一项：${e(p.next_title)}`:' · 本批已处理'}${p.has_gaps?' · 中间有未确认项':''}${p.deleted_entries?' · 有删除记录，不自动补记':''}${row.status==='paused'?' · 已暂停':''}</small></section>`;
 }
 function sourcePickerHtml(){
  const names=[...new Set([...PLATFORMS,source,...(listData?.platforms||[]).map(g=>g.source)])].filter(Boolean),top=[...new Set([source,...PLATFORMS.slice(0,6)])].filter(Boolean);
  const button=name=>`<button type="button" data-text-action="source" data-source="${e(name)}" aria-pressed="${name===source}">${e(name||'自动识别')}</button>`;
  return `<div class="source-picker" aria-label="本批来源"><span>本批来源</span><div>${['',...top].map(button).join('')}</div><details class="picker-more"><summary>更多来源</summary><div>${names.filter(n=>!top.includes(n)).map(button).join('')}</div></details></div>`;
 }
 function renderList(){
  if(!listData)return;
  const page=batchPage(listData.batches,library);library.page=page.page;try{sessionStorage.setItem(`${draftKey}:library`,JSON.stringify(library));}catch{/* Optional display preference only. */}
  const sources=[...new Set(listData.platforms.map(g=>g.source))];
  const labels={review:'待核对',done:'已记完',paused:'暂停'};
  list.innerHTML=`<section class="batch-library" aria-label="查找记账批次"><div class="card-heading"><h3>记账批次</h3><small>${page.count} 批${library.source?` · ${e(library.source)}`:''}</small></div><div class="batch-status-filters" aria-label="批次状态">${[['all','全部'],['review','待核对'],['done','已记完'],['paused','暂停']].map(([key,label])=>`<button type="button" data-text-action="library-status" data-status="${key}" aria-pressed="${library.status===key}">${label}</button>`).join('')}</div><div class="batch-source-filters" aria-label="批次平台"><button type="button" data-text-action="library-source" data-source="" aria-pressed="${!library.source}">全部平台</button>${sources.map(name=>`<button type="button" data-text-action="library-source" data-source="${e(name)}" aria-pressed="${library.source===name}">${e(name)}</button>`).join('')}</div><form data-batch-search class="batch-search"><label><span class="sr-only">搜索批次商品或原文</span><input name="batch-q" aria-label="搜索批次商品或原文" maxlength="200" placeholder="找商品或口述内容" value="${e(library.q)}"/></label><button type="button" aria-label="搜索批次" data-text-action="library-search">${icon('search',18)}</button>${library.q?'<button type="button" aria-label="清除批次搜索" data-text-action="library-clear">'+icon('close',16)+'</button>':''}</form><div class="batch-library-rows">${page.batches.length?page.batches.map(b=>{const p=b.progress||batchProgress(b);return `<button class="text-batch-row" data-text-action="open" data-id="${e(b.id)}"><span><strong>${e(p.source)}${b.intake?` · 长段 ${b.intake.index+1}/${b.intake.total}`:''} · ${p.confirmed_items}/${p.total_items} 项</strong><small>${e(p.first_title)} …… ${e(p.last_title)}</small><small>${p.recorded_at?`${e(recordDateLabel(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(p.recorded_at))))}记过；`:''}${p.next_title?`下一项：${e(p.next_title)}`:'本批已处理'}${p.has_gaps?' · 中间有未确认项':''}${p.deleted_entries?' · 有删除记录':''}</small></span><span class="status-pill ${batchState(b)==='paused'?'paused':batchState(b)==='done'?'saved':''}">${labels[batchState(b)]}</span>${icon('right',16)}</button>`;}).join(''):'<p class="batch-library-empty" role="status">没有符合条件的批次，试试其他平台或条件。</p>'}</div>${page.pages>1?`<div class="batch-pagination"><button type="button" data-text-action="library-prev" data-unavailable="${!page.page}" ${!page.page?'disabled':''}>上一页</button><span>${page.page+1} / ${page.pages} 页</span><button type="button" data-text-action="library-next" data-unavailable="${page.page+1===page.pages}" ${page.page+1===page.pages?'disabled':''}>下一页</button></div>`:''}</section>`;
  controls();
 }
 function render(){
  heading.innerHTML=`<div class="flow-heading"><span class="step-number">${view==='result'?icon('check',20):icon('receipt',20)}</span><div><h3>${view==='compose'?'把收支告诉我':view==='result'?'这批已记录':'逐条核对，确认一条记一条'}</h3><p>${view==='compose'?'先理解、再确认；没说日子就只记月份':view==='result'?'已由服务器确认保存':'绿色按钮保存本项，其他条目保留'}</p></div></div>`;
  list.hidden=view!=='compose';work.replaceChildren();result.replaceChildren();actions.replaceChildren();deletePrompt=false;
  if(intake&&view!=='compose')heading.insertAdjacentHTML('beforeend',`<div class="intake-progress" role="status"><strong>长段 · 第 ${intake.index+1} / ${intake.ids.length} 段</strong><span>分段草稿已存云端 · 确认才入账</span><progress max="${intake.ids.length}" value="${intake.index+(view==='result'?1:0)}" aria-label="长段核对进度"></progress></div>`);
  if(view==='compose'){
   work.innerHTML=`<div class="input-zone">${continuationHtml()}${sourcePickerHtml()}<label class="text-input-label">记账文字<textarea id="${fieldId('text-raw')}" rows="${embedded?8:4}" placeholder="直接粘贴手机语音转写，或在这里输入这段时间的消费记录…">${e(rawValue)}</textarea></label><details class="input-help"><summary>输入说明</summary><p>长文字先存待核对，确认后才入账。复杂口述仍可能需要在聊天中整理；未知金额和日期请保留待补。</p></details><small id="${fieldId('text-draft-state')}" class="draft-cache-state">${rawValue?'输入已保留在此浏览器':'输入时自动保存在此浏览器'}</small><small id="${fieldId('text-length')}">${rawValue.length.toLocaleString()} / 50,000 字 · 原文不截断</small></div>`;
   actions.innerHTML=`<button class="button primary" data-text-action="parse">${embedded?'保存并解析':'下一步 · 核对'}</button>`;
  }else if(view==='result'){
   result.innerHTML=`<section class="flow-success" role="status"><span class="success-mark">${icon('checks',32)}</span><h3>已入账 · ${local?'本地已保存':'云端已保存'}</h3><strong class="preview-total money">${receipt.expense_minor&&receipt.income_minor?`支出 ${money(receipt.expense_minor)}<br>收入 ${money(receipt.income_minor)}`:`${receipt.expense_minor?'支出':'收入'} ${money(receipt.expense_minor||receipt.income_minor)}`}</strong><p>${receipt.count} 笔</p><p>${e(receipt.from)}${receipt.from!==receipt.to?` 至 ${e(receipt.to)}`:''}</p>${receipt.from?.length===7||receipt.to?.length===7?'<p>只记月份 · 日期未指定</p>':''}</section>${receipt.progress?progressHtml(receipt.progress):''}`;
   actions.innerHTML=`${intake&&intake.index+1<intake.ids.length?`<button class="button primary" data-text-action="intake-next">继续核对第 ${intake.index+2} 段 ${icon('right',18)}</button>`:''}<button class="button ${intake&&intake.index+1<intake.ids.length?'secondary':'primary'}" data-text-action="new">${source?`继续${e(source)} · 再记一批`:'再记一批'}</button><button class="button secondary" data-text-action="view-bills">查看账单</button><div class="next-platforms" aria-label="换个平台继续记"><small>换个平台继续记</small>${PLATFORMS.filter(name=>name!==source).map(name=>`<button type="button" data-text-action="next-source" data-source="${e(name)}">${e(name)}</button>`).join('')}</div>`;
  }else if(view==='preview'){
   const plan=preview;
   result.innerHTML=`<section class="text-preview-card"><h3>将新增 ${plan.count} 笔</h3><strong class="preview-total money">${money(plan.expense_minor||plan.income_minor)}</strong><p>支出 ${money(plan.expense_minor)} · 收入 ${money(plan.income_minor)}</p><div class="preview-list">${plan.entries.map(i=>`<p><span>${e(recordDateLabel(i.occurred_on))} · ${e(i.note)}</span><b class="money">${money(i.amount_minor)}</b></p>`).join('')}</div>${plan.pending_count?`<p class="pending-note">另有 ${plan.pending_count} 项待补全，不会入账</p>`:''}${plan.duplicates?.length?`<p class="field-error">${plan.duplicates.length} 个日期已有同额账目。</p><label class="checkbox-label"><input type="checkbox" id="${fieldId('text-ack-duplicates')}"/>这是另外发生的收支</label>`:''}</section>`;
   actions.innerHTML=`<button class="button secondary" data-text-action="edit">返回修改</button><button class="button primary" data-text-action="confirm">确认入账 ${plan.count} 笔</button>`;
  }else{
   const plan=localPlan(),done=lockedIds(),reviewBatch={items,original_text:original},progress=batchProgress(reviewBatch,slots);
   const sources=new Map(batchSources(reviewBatch).map(({item,source})=>[item.id,source]));
   work.innerHTML=progressHtml(progress)+items.filter(item=>!done.has(item.id)||plan.rows.find(r=>r.item.id===item.id)?.entries.length).map(item=>{
    const locked=done.has(item.id),row=plan.rows.find(r=>r.item.id===item.id),questions=item.questions.filter(q=>!fieldQuestion.test(q));
    const rangeMode=item.ongoing&&item.through_month?'conflict':item.ongoing?'ongoing':'through';
    return `<article class="text-candidate" data-item-id="${e(item.id)}"><fieldset ${locked?'disabled':''}><div class="candidate-top"><label class="candidate-name"><span>名称${item.cycle==='single'?'':` · ${e(CYCLES[item.cycle])}`}</span><input data-field="title" maxlength="${80-(titleSource(item.title)?.length?titleSource(item.title).length+3:0)}" value="${e(sourceTitle(item.title))}"/></label><div class="candidate-value"><span class="candidate-amount">${item.amount_minor?money(item.amount_minor):'待填金额'}</span>${progress.source==='混合来源'?`<small>${e(sources.get(item.id))}</small>`:''}</div></div><div class="text-fields"><label>金额（元）<input inputmode="decimal" data-field="amount_minor" value="${item.amount_minor?decimal(item.amount_minor):''}"/></label><label>分类<select data-field="category_id"><option value="">请选择</option>${categories.filter(c=>c.type===item.type&&(!c.archived||c.id===item.category_id)).map(c=>`<option value="${e(c.id)}" ${c.id===item.category_id?'selected':''}>${e(c.name)}</option>`).join('')}</select></label>${item.cycle==='single'?(embedded?'':dateField(item)):`<label>起始月<input type="month" data-field="start_month" value="${e(item.start_month||'')}"/></label><label>日期精度<select data-field="cycle_precision"><option value="month" ${item.date_precision==='month'?'selected':''}>只记月份</option><option value="day" ${item.date_precision!=='month'?'selected':''}>精确到日</option></select></label>${item.date_precision!=='month'?`<label>每月扣款日<input type="number" min="1" max="31" data-field="charge_day" value="${item.charge_day||''}"/></label>`:''}<label class="full-field">订阅状态<select data-field="range_mode"><option value="conflict" ${rangeMode==='conflict'?'selected':''} ${rangeMode!=='conflict'?'hidden':''}>请选择一种范围</option><option value="through" ${rangeMode==='through'?'selected':''}>已经停止</option><option value="ongoing" ${rangeMode==='ongoing'?'selected':''}>仍在订阅</option></select></label>${rangeMode==='ongoing'?`<label class="checkbox-label full-field"><input type="checkbox" data-field="auto_record" ${item.auto_record?'checked':''}/>以后每期自动记账</label>`:''}${rangeMode!=='ongoing'?`<label class="full-field">最后扣费月份<input type="month" data-field="through_month" value="${e(item.through_month||'')}"/></label>`:''}`}</div>${suggestionHtml(item)}<details class="candidate-details" ${embedded&&item.cycle==='single'&&!item.occurred_on?'open':''}><summary>${embedded&&item.cycle==='single'?`${e(recordDateLabel(item.occurred_on)||'待选日期')} · 日期与原文`:'更多选项与原文'}</summary>${embedded&&item.cycle==='single'?`<div class="text-fields">${dateField(item)}</div>`:''}<label class="checkbox-label"><input type="checkbox" data-field="selected" ${item.selected?'checked':''}/>纳入本次记账</label>${item.cycle!=='single'&&item.date_precision!=='month'?`<label class="checkbox-label"><input type="checkbox" data-field="short_month" ${item.short_month==='last_day'?'checked':''}/>不足扣款日的月份使用月末</label>`:''}<p>${e(item.raw)}</p></details>${questions.length?`<ul class="text-questions">${questions.map(q=>`<li>${e(q)}</li>`).join('')}</ul><label class="checkbox-label"><input type="checkbox" data-field="resolve_questions"/>上述疑问已核对</label>`:''}</fieldset>${duplicateItems.has(item.id)?'<label class="checkbox-label duplicate-ack"><input type="checkbox" data-duplicate-ack/>同额已存在，这是另一笔消费</label>':''}${footerHtml(item,row,locked)}</article>`;
   }).join('');
   if(done.size){
    const confirmed=items.filter(item=>done.has(item.id));
    work.insertAdjacentHTML('beforeend',`<section class="confirmed-items" aria-label="已确认消费"><h3>${icon('checks',16)}已确认 ${progress.confirmed_items} 项</h3>${confirmed.map(item=>{
      const recorded=slots.filter(slot=>slot.item_id===item.id),total=recordedExpense(recorded);
      return `<p><span class="confirmed-title">${e(item.title)}</span><span>已记 ${recorded.filter(slot=>!slot.deleted_at).length} 笔 · 已记支出 ${total===null?'暂不可用':money(total)}</span></p>`;
    }).join('')}</section>`);
   }
   actions.innerHTML=`${batchOverlay&&!plan.count&&progress.total_items>0&&progress.confirmed_items===progress.total_items?'':`<button class="button secondary" data-text-action="save">保存修改</button><button class="button secondary" data-text-action="preview" ${plan.count>120?`disabled data-unavailable="true" aria-describedby="${fieldId('bulk-limit-note')}"`:''}>${plan.count>120?'请逐条确认':`核对 ${plan.count} 笔账目`}</button>${plan.count>120?`<small id="${fieldId('bulk-limit-note')}" class="pending-note">本批将产生 ${plan.count} 笔，请用绿色按钮逐项确认；一次最多保存 120 笔。</small>`:''}`}<button class="text-button" data-text-action="back-list">批次列表</button><button class="text-button" data-text-action="new">新一批</button>${batch?`<button class="text-button" data-text-action="${batch.status==='paused'?'resume':'pause'}">${batch.status==='paused'?'恢复':'暂停'}</button>${!slots.length?'<button class="text-button delete-draft" data-text-action="delete">删除草稿</button>':''}`:''}`;
  }
  if(conflict)actions.insertAdjacentHTML('beforeend','<button class="button secondary" data-text-action="reload-batch">载入最新批次</button>');
  if(newPrompt)actions.innerHTML='<div class="new-batch-prompt" role="status"><strong>还有未确认内容</strong><p>先保存这批草稿，再开始下一批。不会提前入账。</p><div><button class="button secondary" data-text-action="cancel-new">继续核对</button><button class="button primary" data-text-action="save-new">存草稿并继续</button></div></div>';
  if(pending)actions.innerHTML='<button class="button primary" data-text-action="retry">核对保存结果</button>';
  renderList();controls();
 }
 function readItems(monthOnlyId=null,omitId=null){
  for(const item of items){const card=work.querySelector(`[data-item-id="${item.id}"]`);if(!card||lockedIds().has(item.id)||item.id===omitId)continue;
   for(const input of card.querySelectorAll('[data-field]')){const field=input.dataset.field;
    if(field==='cycle_precision'){item.date_precision=input.value;continue;}
    if(field==='date_precision'){precisions[item.id]=input.value;continue;}
    if(field==='resolve_questions'){if(input.checked)item.questions=[];continue;}
    if(field==='auto_record'){item.auto_record=input.checked;continue;}
    if(field==='range_mode'){if(input.value==='through'){item.ongoing=false;item.auto_record=false;}else if(input.value==='ongoing'){item.ongoing=true;item.auto_record=true;item.through_month=null;}continue;}
    if(field==='selected')item.selected=input.checked;
    else if(field==='title'){
     const name=input.value.trim(),platform=titleSource(item.title);
     if(!name)throw new Error('请填写名称');
     if(name!==sourceTitle(item.title))item.title=platform?`${platform} · ${name}`:name;
    }
    else if(field==='short_month')item.short_month=input.checked?'last_day':'pending';
    else if(field==='amount_minor')item.amount_minor=input.value.trim()?parseAmount(input.value):null;
    else if(field==='charge_day')item.charge_day=input.value?Number(input.value):null;
    else item[field]=input.value||(['category_id','occurred_on','start_month','through_month'].includes(field)?null:'');
   }
   if(card.querySelector('[data-field=range_mode]')?.value==='ongoing')item.through_month=null;
   if(item.id===monthOnlyId)item.date_precision='month';
   if(item.date_precision==='month')item.charge_day=null;
   if(item.charge_day!==null&&(!Number.isInteger(item.charge_day)||item.charge_day<1||item.charge_day>31))throw new Error('扣款日须为 1–31 的整数；也可选择不填扣款日，按月记。');
   item.questions=item.questions.filter(question=>{
    if(/^(金额或币种待确认|金额无效)/.test(question))return !item.amount_minor;
    if(question.startsWith('起始月未知'))return !item.start_month;
    if(question.startsWith('扣款日未知'))return item.date_precision!=='month'&&!item.charge_day;
    if(question.startsWith('补记截止月或持续循环方式'))return !item.through_month&&!item.ongoing;
    if(question.startsWith('记账日期未说明'))return !item.occurred_on;
    return true;
   });
  }
  textItemsSchema.parse(omitId?items.filter(i=>i.id!==omitId):items);persist();
 }
 function selectBatch(b){if(b.intake){const ids=intake?.id===b.intake.id?intake.ids:(listData?.batches||[]).filter(x=>x.intake?.id===b.intake.id).sort((a,b)=>a.intake.index-b.intake.index).map(x=>x.id);intake={id:b.intake.id,ids,index:ids.indexOf(b.id),anchor_day:b.intake.anchor_day};if(intake.index<0){intake.ids=[b.id];intake.index=0;}}else intake=null;newPrompt=false;const sources=[...new Set(batchSources(b).map(x=>x.source))];source=sources.length===1&&sources[0]!=='口述记录'&&sources[0].length<=64?sources[0]:'';itemErrors.clear();batch=b;items=b.items;slots=b.slots||[];original=b.original_text;rawValue=original;preview=null;conflict=false;precisions={};view='review';savedContents=contents();message(b.status==='paused'?'此批次已暂停，恢复后才能继续确认。':'');persist();render();}
 async function loadList(){const ticket=++listTicket;try{
   const data=await request('/text-batches');if(disposed||ticket!==listTicket)return;listData=data;renderList();
   if(initialBatchId){
    const id=initialBatchId,found=(await request(`/text-batches/${id}`)).batch;
    if(disposed||ticket!==listTicket)return;
    initialBatchId=null;
    if(batchDraft){
     ({batch,items,original,slots,pending,precisions,source,savedContents,intake,rawValue}=batchDraft);
     batchDraft=null;view='review';
     if(batch.version!==found.version&&!pending){conflict=true;message('这批记录已有更新。本机修改仍在，请核对后选择是否载入最新批次。','error');}
     render();
    }else selectBatch(found);
   }
   else if(view==='compose'){const zone=work.querySelector('.compose-continuation');if(zone)zone.remove();work.querySelector('.input-zone')?.insertAdjacentHTML('afterbegin',continuationHtml());}
   controls();
  }catch(error){if(!disposed&&ticket===listTicket)(initialBatchId&&batchOverlay?work:list).innerHTML=`<p class="field-error">文字记录暂未取得：${e(error.message)}</p><button class="button secondary" data-text-action="list-retry">重试</button>`;}}
 async function beginNew(nextSource=source){
  localStorage.removeItem(cacheKey);sessionStorage.removeItem(`${draftKey}:input`);
  newPrompt=false;intake=null;
  if(onStartSource){view='result';onStartSource(nextSource);return;}
  itemErrors.clear();batch=null;items=[];original='';rawValue='';slots=[];preview=null;view='compose';receipt=null;precisions={};source=nextSource;duplicateItems.clear();conflict=false;message('');sessionStorage.removeItem(draftKey);render();await loadList();
 }
 async function send(path,body,method='POST',meta={}){const op=pending||{...meta,path,body,method,key:crypto.randomUUID()};pending=op;persist();controls();const value=await mutate(op.path,op.body,{method:op.method,key:op.key});pending=null;persist();return value;}
 async function save(nextItems){if(!nextItems)readItems();if(batch&&!nextItems&&savedContents===contents())return;const body={original_text:original,items:nextItems||items};const value=await send(batch?`/text-batches/${batch.id}`:'/text-batches',batch?{...body,version:batch.version}:body,batch?'PATCH':'POST');batch=value.batch;items=batch.items;forgetInput(original);savedContents=contents();if(value.repeated){const latest=(await request(`/text-batches/${batch.id}`)).batch;if(latest){batch=latest;items=latest.items;slots=latest.slots||[];}}persist();}
 async function refreshAfterWrite(){try{await onSaved();}catch{message('保存已完成，账单暂未刷新；请重新打开查看。','error');}}
 function applyConfirmation(value,plan){slots.push(...plan.entries.map((entry,index)=>({item_id:entry.item_id,occurred_on:entry.occurred_on,entry_id:value.entry_ids[index],amount_minor:entry.amount_minor,type:entry.type,created_at:value.recorded_at})));batch.version=value.version;batch.status='active';persist();}
 async function showSuccess(value){receipt={...value,progress:batch?batchProgress(batch,slots):null};view='result';batch=null;items=[];slots=[];preview=null;original='';rawValue='';sessionStorage.removeItem(draftKey);if(intake)persist();message('');render();await refreshAfterWrite();}
 async function finishBatch(value){
   try{const latest=(await request(`/text-batches/${batch.id}`)).batch;if(!latest)throw new Error('批次不存在');batch=latest;slots=latest.slots;const active=slots.filter(s=>!s.deleted_at),dates=active.map(s=>s.current_occurred_on).sort();const sum=type=>active.filter(s=>s.type===type).reduce((n,s)=>n+s.amount_minor,0);await showSuccess({...value,count:active.length,expense_minor:sum('expense'),income_minor:sum('income'),from:dates[0]||value.from,to:dates.at(-1)||value.to});}
   catch{await showSuccess(value);message('本次已保存；批次合计暂未取得，请刷新账单核对。','error');}
 }
 async function confirmItem(id){
  readItems();const row=localPlan().rows.find(r=>r.item.id===id);
  if(!row?.entries.length){const text=feedbackText(items.find(i=>i.id===id),row);itemIssue(id,text);message(text,'error');return;}
  if(batch?.status==='paused'){itemIssue(id,'此批次已暂停，请在下方恢复后确认。');message('此批次已暂停，请先恢复。','error');return;}
  const ack=Boolean(work.querySelector(`[data-item-id="${id}"] [data-duplicate-ack]`)?.checked);
  await save();if(!localPlan().rows.find(r=>r.item.id===id)?.entries.length){message('本项已记录，不会重复入账。','success');render();await refreshAfterWrite();return;}const plan=await request(`/text-batches/${batch.id}/preview`,{method:'POST',body:{item_ids:[id]}});
  if(plan.duplicates.length&&!ack){duplicateItems.add(id);itemErrors.set(id,'同日或同月已有同额账目，请勾选上方同额确认后再保存。');message('同日或同月已有同额账目，请核对是否另一笔。','error');render();return;}
  const value=await send(`/text-batches/${batch.id}/confirm`,{version:batch.version,preview_hash:plan.preview_hash,item_ids:[id],acknowledge_duplicates:ack});
  applyConfirmation(value,plan);
  const card=work.querySelector(`[data-item-id="${id}"]`),scroller=container.closest('.dialog-body');
  if(card){card.classList.add('confirmed');card.querySelector('.confirm-one').innerHTML=`${icon('checks',17)}已保存`;message(`${value.count} 笔已保存 · ${money(value.expense_minor||value.income_minor)}`,'success');
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches){await card.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(36px)'}],{duration:230,easing:'cubic-bezier(.2,.8,.2,1)',fill:'forwards'}).finished.catch(()=>{});await card.animate([{height:`${card.offsetHeight}px`,marginBottom:'14px',paddingTop:'14px',paddingBottom:'14px'},{height:'0px',marginBottom:'0px',paddingTop:'0px',paddingBottom:'0px',borderWidth:'0px'}],{duration:170,easing:'ease-out',fill:'forwards'}).finished.catch(()=>{});}
  }
  if(disposed)return;
  if(localPlan().rows.every(r=>!r.missing.length&&!r.entries.length)){
   await finishBatch(value);
  }else{const top=scroller?.scrollTop||0;render();if(scroller)scroller.scrollTop=top;focusAfter=true;await refreshAfterWrite();}
 }
 function installIntake(value){forgetInput(rawValue);intake={id:value.batches[0].intake.id,ids:value.batches.map(b=>b.id),index:0,anchor_day:value.batches[0].intake.anchor_day};sessionStorage.removeItem(`${draftKey}:input`);selectBatch(value.batches[0]);}
 async function handle(event){const button=event.target.closest('[data-text-action]');if(!button||button.disabled||busy)return;const action=button.dataset.textAction;if(pending&&action!=='retry')return;busy=true;controls();
  try{
   if(action==='source'){rawValue=work.querySelector(`#${fieldId('text-raw')}`).value;source=button.dataset.source;library.source=source;library.page=0;persist();render();}
   if(action==='parse'){itemErrors.clear();rawValue=work.querySelector(`#${fieldId('text-raw')}`).value;persist();const parsed=parseTextIntake(rawValue,currentDay,categories,{inheritPlatform:!source}),segments=parsed.segments.map(s=>({...s,items:tagPlatformItems(embedded?s.items.map(i=>intakeCategoryOptions(i,categories)):s.items,source)}));
    if(segments.length>1){message(`正在保存 ${segments.length} 段待核对草稿，尚未入账`);const value=await send('/text-intakes',{segments,anchor_day:parsed.anchor_day});installIntake(value);message(`${segments.length} 段草稿已存云端 · 0 笔入账`,'success');await loadList();await refreshAfterWrite();}
    else{const next=segments[0];const value=await send('/text-batches',next);forgetInput(next.original_text);selectBatch(value.batch);message('草稿已同步 · 确认后才入账','success');await loadList();await refreshAfterWrite();}}
   if(action==='intake-next'){const nextId=intake?.ids[intake.index+1];if(!nextId)throw new Error('下一段已不存在，请从批次列表查看');const next=(await request(`/text-batches/${nextId}`)).batch;selectBatch(next);}
   if(action==='new'){if(view!=='result'&&items.length)readItems();if(view!=='result'&&items.length&&localPlan().rows.some(r=>r.missing.length||r.entries.length)&&!(batch&&savedContents===contents())){newPrompt=true;render();}else{sessionStorage.removeItem(draftKey);await beginNew();}}
   if(action==='cancel-new'){newPrompt=false;render();}
   if(action==='save-new'){await save();await refreshAfterWrite();sessionStorage.removeItem(draftKey);await beginNew();}
   if(action==='next-source'){sessionStorage.removeItem(draftKey);await beginNew(button.dataset.source);}
   if(action==='library-status'){library.status=button.dataset.status;library.page=0;renderList();}
   if(action==='library-source'){library.source=button.dataset.source;library.page=0;renderList();}
   if(action==='library-search'){library.q=list.querySelector('[name=batch-q]').value.trim();library.page=0;renderList();}
   if(action==='library-clear'){library.q='';library.page=0;renderList();}
   if(action==='library-prev'||action==='library-next'){library.page+=action==='library-next'?1:-1;renderList();}
   if(action==='back-list'){view='compose';message('');render();await loadList();}
   if(action==='open'||action==='reload-batch'){const b=(await request(`/text-batches/${action==='open'?button.dataset.id:batch?.id}`)).batch;if(!b)throw new Error('记录已不存在，请刷新列表');selectBatch(b);}
   if(action==='choose-category'){readItems();const item=items.find(i=>i.id===button.dataset.item),cat=categories.find(c=>c.id===button.dataset.category&&c.type===item.type&&!c.archived);if(!cat)throw new Error('分类已变化，请重新打开核对');item.category_id=cat.id;item.category_hint.resolved=true;itemErrors.delete(item.id);preview=null;persist();message('');renderChoice(item.id);}
   if(action==='create-custom-category'){readItems();const item=items.find(i=>i.id===button.dataset.item),name=work.querySelector(`[data-item-id="${item.id}"] [data-new-category]`).value.trim();if(!name||name.length>32)throw new Error('请填写1–32字的新分类名称');const value=await send('/categories/resolve',{name,type:item.type},'POST',{item_id:item.id});applyCreatedCategory(value,item.id);}
   if(action==='create-category'){readItems();const item=items.find(i=>i.id===button.dataset.item);const value=await send('/categories/resolve',{name:item.category_hint.name,type:item.type},'POST',{item_id:item.id});applyCreatedCategory(value,item.id);}
   if(action==='confirm-item'){itemErrors.delete(button.dataset.item);await confirmItem(button.dataset.item);}
   if(action==='month-only'){const id=button.dataset.item,scroller=container.closest('.dialog-body'),top=scroller?.scrollTop||0;readItems(id);itemErrors.delete(id);preview=null;message('');persist();render();if(scroller)scroller.scrollTop=top;focusAfter=id;}
   if(action==='accept-context'){readItems();for(const item of items)if(!lockedIds().has(item.id))item.questions=item.questions.filter(q=>q!=='日期沿用同段前一项，请确认日期语境');itemErrors.clear();preview=null;persist();render();message('本段沿用日期已核对；其他疑问仍保留，尚未入账。','success');}
   if(action==='edit'){view='review';preview=null;message('');render();}
   if(action==='save'||action==='preview'){await save();if(action==='preview'){preview=await request(`/text-batches/${batch.id}/preview`,{method:'POST',body:{}});if(preview.count){view='preview';message('');}else{view='review';message('草稿已保存，0 笔入账；请补齐信息。');}}else{view='review';message(`草稿已保存，本次 0 笔入账；${localPlan().count} 笔待确认。`);}render();await loadList();await refreshAfterWrite();}
   if(action==='confirm'){if(!preview||!batch)throw new Error('请重新核对日期和金额');const value=await send(`/text-batches/${batch.id}/confirm`,{version:batch.version,preview_hash:preview.preview_hash,acknowledge_duplicates:Boolean(container.querySelector(`#${fieldId('text-ack-duplicates')}`)?.checked)});applyConfirmation(value,preview);if(localPlan().rows.some(r=>r.missing.length||r.entries.length)){preview=null;view='review';render();message(`${value.count} 笔已保存 · ${money(value.expense_minor||value.income_minor)}；其余项目继续核对。`,'success');await refreshAfterWrite();}else await finishBatch(value);}
   if(action==='view-bills'&&receipt)onViewBills({from:receipt.from,to:receipt.to});
   if(action==='pause'||action==='resume'){const value=await send(`/text-batches/${batch.id}/status`,{version:batch.version,status:action==='pause'?'paused':'active'});batch.version=value.version;batch.status=value.status;message(action==='pause'?'已暂停，已有账目保留。':'已恢复，确认后才会入账。');persist();render();await refreshAfterWrite();}
   if(action==='ask-remove-item'||action==='keep-item'){
    const previous=removePrompt,id=button.dataset.item;
    removePrompt=action==='ask-remove-item'?id:null;
    const rows=localPlan().rows;
    for(const candidateId of new Set([previous,id].filter(Boolean))){
     const item=items.find(i=>i.id===candidateId);
     const footer=work.querySelector(`[data-item-id="${candidateId}"] .candidate-footer`);
     if(item&&footer)footer.outerHTML=footerHtml(item,rows.find(r=>r.item.id===candidateId),false);
    }
    work.querySelector(`[data-item-id="${id}"] [data-text-action="${removePrompt?'keep-item':'ask-remove-item'}"]`)?.focus();
   }
   if(action==='remove-item'&&removePrompt===button.dataset.item){
    const id=removePrompt;
    if(lockedIds().has(id))throw new Error('此项已有账目，请在账单中处理');
    const remaining=items.filter(i=>i.id!==id);
    if(remaining.length){
     readItems(null,id);await save(remaining);itemErrors.delete(id);duplicateItems.delete(id);preview=null;
    }else{
     if(batch)await send(`/text-batches/${batch.id}`,{version:batch.version},'DELETE');
     forgetInput(original);batch=null;items=[];slots=[];original='';rawValue='';intake=null;view='compose';savedContents='';sessionStorage.removeItem(draftKey);
    }
    removePrompt=null;message('草稿项已删除','success');render();await loadList();await refreshAfterWrite();
   }
   if(action==='delete'){deletePrompt=true;message('删除这份未入账草稿？不会删除任何账单。');actions.innerHTML='<button class="button secondary" data-text-action="cancel-delete">保留草稿</button><button class="button danger-button" data-text-action="confirm-delete">删除草稿</button>';}
   if(action==='cancel-delete'){message('');render();}
   if(action==='confirm-delete'&&deletePrompt){await send(`/text-batches/${batch.id}`,{version:batch.version},'DELETE');batch=null;items=[];slots=[];original='';rawValue='';view='compose';sessionStorage.removeItem(draftKey);message('草稿已删除');render();await loadList();await refreshAfterWrite();}
   if(action==='retry'){const op=pending;const value=await send(op.path,op.body,op.method);if(op.path==='/text-intakes'){installIntake(value);message('分段草稿已保存，尚未入账。','success');await loadList();await refreshAfterWrite();}else if(op.path==='/categories/resolve'){applyCreatedCategory(value,op.item_id);}else if(op.path.endsWith('/confirm')){initialBatchId=batch.id;view='compose';render();await loadList();message('保存结果已核对，不会重复入账。','success');await refreshAfterWrite();}else if(value.batch){if(op.method==='POST'){forgetInput(value.batch.original_text);selectBatch(value.batch);}else{batch=value.batch;items=batch.items;original=batch.original_text;rawValue=original;view='review';newPrompt=false;savedContents=contents();persist();}message('草稿已保存，尚未入账。');render();await loadList();await refreshAfterWrite();}else{batch=null;items=[];slots=[];original='';rawValue='';view='compose';sessionStorage.removeItem(draftKey);message('提交结果已核对');render();await loadList();await refreshAfterWrite();}}
   if(action==='list-retry')await loadList();
  }catch(error){if(button.dataset.item)itemIssue(button.dataset.item,error.message);message(error.message,'error');if(error.code==='VERSION_CONFLICT'||error.code==='PREVIEW_CHANGED')conflict=true;if(error.code!=='NETWORK'&&!(error.status>=500))pending=null;persist();if(conflict||pending){render();message(error.message,'error');}}
  finally{busy=false;if(!disposed){controls();if(choiceFocus){work.querySelector(`[data-item-id="${choiceFocus}"] .category-choice[aria-pressed="true"]`)?.focus({preventScroll:true});choiceFocus=null;}if(focusAfter){const next=typeof focusAfter==='string'?work.querySelector(`[data-item-id="${focusAfter}"] .confirm-one`):work.querySelector('.confirm-one');focusAfter=false;next?.focus({preventScroll:true});next?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}}}
 }
 function change(event){if(event.target.matches('[data-new-category]')||event.target.hasAttribute('data-duplicate-ack'))return;if(event.target.id===fieldId('text-raw')){rawValue=event.target.value;persist();return;}if(event.target.closest('[data-item-id]')){try{
   const id=event.target.closest('[data-item-id]').dataset.itemId,precision=event.target.value;
   itemErrors.delete(id);readItems();if(event.target.dataset.field==='category_id'){const item=items.find(i=>i.id===id);if(item.category_hint)item.category_hint.resolved=Boolean(item.category_id);}
   if(event.target.dataset.field==='date_precision'){const item=items.find(i=>i.id===id);item.occurred_on=precision==='month'?item.occurred_on?.slice(0,7)||null:item.occurred_on?.length===10?item.occurred_on:null;}
   preview=null;message('');persist();if(['cycle_precision','date_precision','range_mode','resolve_questions','category_id'].includes(event.target.dataset.field)){
    const restoreDetails=Boolean(event.target.closest('details[open]'));render();
    if(restoreDetails)work.querySelector(`[data-item-id="${id}"] .candidate-details`)?.setAttribute('open','');
   }else refreshCandidateFeedback();
  }catch(error){itemIssue(event.target.closest('[data-item-id]').dataset.itemId,error.message);message(error.message,'error');}}}
 function input(event){if(event.target.id===fieldId('text-raw')){rawValue=event.target.value;persist();const count=work.querySelector(`#${fieldId('text-length')}`);if(count){count.textContent=`${rawValue.length.toLocaleString()} / 50,000 字 · 原文不截断`;count.classList.toggle('field-error',rawValue.length>LONG_TEXT_LIMIT);}}else if(event.target.matches('[data-field="title"]')&&event.target.value.trim()){try{readItems();refreshCandidateFeedback();}catch{/* Show field validation on change or submission. */}}}
 const submit=event=>{if(event.target.matches('[data-batch-search]')){event.preventDefault();handle({target:event.target.querySelector('[data-text-action=library-search]')});}};
 container.addEventListener('submit',submit);container.addEventListener('click',handle);container.addEventListener('change',change);container.addEventListener('input',input);if(batchOverlay)work.textContent='正在读取批次…';else render();loadList();
 return ()=>{if(view!=='result'&&!(batchOverlay&&initialBatchId))persist();disposed=true;container.removeEventListener('submit',submit);container.removeEventListener('click',handle);container.removeEventListener('change',change);container.removeEventListener('input',input);container.replaceChildren();};
}
