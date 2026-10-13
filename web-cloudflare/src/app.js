import './styles.css';
import './responsive.css';
import './mobile.css';
import './platform-board.css';
import { request, mutate, queryString, setLedger, download } from './api.js';
import { shell, recordPage, statsPage, billsPage, settingsPage, loading, entryForm, categoryManager, categoryEditor } from './views.js';
import { escape as e, icon, iconButton, empty, recordRow, categoryIcon } from './ui.js';
import { today, periodRange, shiftMonth, parseAmount, decimal, money, canonical, validDate, validRecordDate, recordDateLabel, recordRange } from '../shared/format.js';

const root = document.querySelector('#app'), dialog = document.querySelector('#dialog'), toastElement = document.querySelector('#toast');
const storage = { get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Display preferences are optional. */ } } };
const knownPages = ['record', 'bills', 'stats', 'settings'];
const firstPage = () => knownPages.includes(location.pathname.slice(1)) ? location.pathname.slice(1) : matchMedia('(max-width: 767px)').matches ? 'record' : 'stats';
const initialParams=new URLSearchParams(location.search);
const routeFilters = params => ({ type: ['expense', 'income'].includes(params.get('type')) ? params.get('type') : '', category_id: /^[A-Za-z0-9_-]{1,100}$/.test(params.get('category_id') || '') ? params.get('category_id') : '', q: (params.get('q') || '').slice(0, 200) });
const routeOffset = params => { const value = Number(params.get('offset')); return Number.isSafeInteger(value) && value >= 0 && value <= 10000000 ? Math.floor(value / 50) * 50 : 0; };
const initialRange=validDate(initialParams.get('from'))&&validDate(initialParams.get('to'))&&initialParams.get('from')<=initialParams.get('to')?{from:initialParams.get('from'),to:initialParams.get('to')}:null;
const initialMonth=initialParams.get('month')||initialRange?.from.slice(0,7);
const s = { page: firstPage(), month: validDate(`${initialMonth}-01`)?initialMonth:today().slice(0,7), period:['month','quarter','year'].includes(initialParams.get('period'))?initialParams.get('period'):'month', chart: storage.get('moneytalk:chart', 'bar'), density: storage.get('moneytalk:density', 'comfortable'), categories: [], session: null, recent: null, bills: null, stats: null, textSummary:null, platformSource:'', filters: routeFilters(initialParams), billRange: initialRange, offset: routeOffset(initialParams), error: '', draft: null, modal: null };
if (!['bar', 'line', 'pie'].includes(s.chart)) s.chart = 'bar';
let closeTimer, dialogReturnFocus, dialogTrigger, dialogDisposer;
let outsideGesture, dismissedPoint;
let epoch = 0, renderEpoch = 0, chartsModule, toastTimer, undoAction = null;
const baseDraft = () => ({ amount: '', type: 'expense', category_id: s.categories.find(c => c.type === 'expense' && !c.archived)?.id || 'food', occurred_on: (s.session?.today || today()).slice(0,7), note: '', expanded: false, error: '', pending: null });
const draftKey = () => `moneytalk:draft:${s.session.user.id}:${s.session.ledger.id}`;
function saveDraft() { if (!s.session || !s.draft) return; try { const { saving, error, ...draft } = s.draft; sessionStorage.setItem(draftKey(), JSON.stringify(draft)); if(s.modal?.type==='entry'&&s.modal.draft.isCopy){const {saving,error,...copy}=s.modal.draft;sessionStorage.setItem(`${draftKey()}:copy`,JSON.stringify(copy));} } catch { toast('当前浏览器不能保留草稿，请在离开前保存'); } }
function readDraft() { try { s.draft = { ...baseDraft(), ...JSON.parse(sessionStorage.getItem(draftKey()) || '{}'), saving: false, error: '' }; } catch { s.draft = baseDraft(); } }
function clearDrafts() { s.receipt=null; for (let i = sessionStorage.length - 1; i >= 0; i--) { const key = sessionStorage.key(i); if (key?.startsWith('moneytalk:draft:')) sessionStorage.removeItem(key); } }
function currentDraft(context) { return context === 'dialog' ? s.modal?.draft : s.draft; }
function toast(message, undo = null) {
  clearTimeout(toastTimer); undoAction = undo;
  toastElement.innerHTML = `<span>${e(message)}</span>${undo ? '<button data-action="undo-toast">撤销</button>' : ''}`;
  toastElement.classList.add('show'); toastTimer = setTimeout(() => { toastElement.classList.remove('show'); undoAction = null; }, undo ? 10000 : 4800);
}
function render() {
  const focused = document.activeElement;
  const formContext = focused?.closest?.('[data-form="entry"]')?.dataset.context;
  const focusName = focused?.name;
  const selection = focusName && ['amount', 'note'].includes(focusName) ? [focused.selectionStart, focused.selectionEnd] : null;
  chartsModule?.destroyChart();
  const ticket = ++renderEpoch;
  document.documentElement.classList.toggle('compact', s.density === 'compact');
  const content = !s.session || !s.draft ? loading() : ({ record: recordPage, bills: billsPage, stats: statsPage, settings: settingsPage }[s.page])(s);
  const frame=document.createElement('template');frame.innerHTML=shell(s,content);
  const previousMobile=root.querySelector('.mobile-nav'),previousSidebar=root.querySelector('.sidebar');
  const updateLinks=(previous,replacement)=>{for(const link of previous.querySelectorAll('[data-route]')){
    const next=replacement.querySelector(`[data-route="${link.dataset.route}"]`);if(!next)continue;
    link.className=next.className;if(next.hasAttribute('aria-current'))link.setAttribute('aria-current',next.getAttribute('aria-current'));else link.removeAttribute('aria-current');
  }};
  // Never detach navigation during a pointer gesture: even reinserting the same
  // node cancels a native click between pointerdown and pointerup in browsers.
  if(previousMobile&&previousSidebar&&root.querySelector('.app-workspace')){
    updateLinks(previousMobile,frame.content.querySelector('.mobile-nav'));
    updateLinks(previousSidebar.querySelector('nav'),frame.content.querySelector('.sidebar nav'));
    for(const selector of ['.ledger-switch','.sidebar-bottom'])previousSidebar.querySelector(selector).replaceWith(frame.content.querySelector(selector));
    root.querySelector('.app-workspace').replaceWith(frame.content.querySelector('.app-workspace'));
    const tools=root.querySelector('.mobile-tools'),nextTools=frame.content.querySelector('.mobile-tools');
    if(tools&&nextTools)tools.replaceWith(nextTools);else if(tools)tools.remove();else if(nextTools)root.insertBefore(nextTools,previousMobile);
  }else root.replaceChildren(frame.content);
  if(focused?.matches?.('[data-route]')&&focused.isConnected)focused.focus({preventScroll:true});
  if (formContext && focusName && formContext !== 'dialog') {
    const replacement = root.querySelector(`[data-context="${formContext}"] [name="${focusName}"]`);
    replacement?.focus({ preventScroll: true });
    if (selection && replacement) replacement.setSelectionRange(...selection);
  }
  document.title = `${{ record: '记一笔', bills: '账单', stats: '统计', settings: '我的' }[s.page]} · MoneyTalk`;
  if (s.page === 'stats' && s.stats && !s.error) {
    import('./charts.js').then(module => { chartsModule = module; if (ticket !== renderEpoch) return; module.renderChart(document.querySelector('#expense-chart'), s.stats, s.chart, categoryBills); }).catch(() => toast('统计图暂时无法加载，分类金额仍可查看'));
  }
}
async function init() {
  if (sessionStorage.getItem('moneytalk:local-logged-out') === 'true') return showLoggedOut();
  root.innerHTML = '<main class="boot-state" aria-live="polite">正在打开账本…</main>';
  try {
    setLedger(null); s.session = await request('/session'); setLedger(s.session.ledger.id);
    const priorUser = sessionStorage.getItem('moneytalk:last-user');
    if (priorUser && priorUser !== s.session.user.id) clearDrafts();
    sessionStorage.setItem('moneytalk:last-user', s.session.user.id);
    s.categories = (await request('/categories')).categories;
    readDraft();
    if (!knownPages.includes(location.pathname.slice(1))) history.replaceState(null, '', `/${s.page}`);
    render(); await load();
    try{const copy=JSON.parse(sessionStorage.getItem(`${draftKey()}:copy`)||'null');if(copy?.isCopy){s.modal={type:'entry',draft:{...copy,saving:false,error:''},original:entryValues(copy)};updateForm('dialog');}}catch{/* Invalid optional draft cannot prevent opening the ledger. */}
  } catch (error) { showConnectionError(error); }
}
function showConnectionError(error) {
  closeDialog(true); chartsModule?.destroyChart();
  root.innerHTML = `<main class="boot-state"><h1>MoneyTalk</h1><p>${e(error.message)}</p><button class="button primary" data-action="login">${error.code === 'AUTH_NOT_CONFIGURED' ? '重新检查' : '重新打开账本'}</button></main>`;
}
function showLoggedOut() { root.innerHTML = '<main class="boot-state"><h1>已退出本地预览</h1><p>当前浏览器的未保存草稿已清除。本地预览用于验证功能，正式登录由云端访问保护负责。</p><button class="button primary" data-action="login">重新打开本地账本</button></main>'; }
function billQuery() { return { ...(s.billRange || periodRange(s.month, 'month', s.session.today)), ...s.filters, limit: 50, offset: s.offset }; }
async function load({ quiet = false } = {}) {
  if (!s.session) return;
  const routeParams=new URLSearchParams();if(['bills','stats'].includes(s.page)){routeParams.set('month',s.month);if(s.page==='stats')routeParams.set('period',s.period);if(s.page==='bills'&&s.billRange){routeParams.set('from',s.billRange.from);routeParams.set('to',s.billRange.to);}}
  if (s.page === 'bills') { for (const [key, value] of Object.entries(s.filters)) if (value) routeParams.set(key, value); if (s.offset) routeParams.set('offset', String(s.offset)); }
  history.replaceState(null,'',`/${s.page}${routeParams.size?'?'+routeParams:''}`);
  const ticket = ++epoch, page = s.page;
  s.error = '';
  if (!quiet) { if (page === 'bills') s.bills = null; if (page === 'stats') s.stats = null; render(); }
  try {
    const [categories, recent, current, textSummary] = await Promise.all([
      request('/categories'), request('/entries?limit=6'),
      page === 'stats' ? request(`/stats?${queryString(periodRange(s.month, s.period, s.session.today))}`) : page === 'bills' ? request(`/entries?${queryString(billQuery())}`) : Promise.resolve(null),
      request('/text-batches'),
    ]);
    if (ticket !== epoch) return;
    s.categories = categories.categories; s.recent = recent; s.textSummary=textSummary;
    if(!textSummary.platforms?.some(g=>g.source===s.platformSource))s.platformSource=textSummary.platforms?.find(g=>g.resume)?.source||textSummary.platforms?.[0]?.source||'';
    if (page === 'stats') s.stats = current; if (page === 'bills') s.bills = current;
    render();
  } catch (error) {
    if (ticket !== epoch) return;
    if (error.status === 401 || error.status === 403) return showConnectionError(error);
    s.error = error.message; render();
  }
}
function navigate(page, replace = false) {
  if (!knownPages.includes(page)) return;
  closeDialog(true); saveDraft(); s.page = page; s.error = '';
  if (replace) history.replaceState(null, '', `/${page}`); else history.pushState(null, '', `/${page}`);
  window.scrollTo({ top: 0 }); render(); load();
}
function openDialog(title, body, { type = '', wide = false } = {}) {
  clearTimeout(closeTimer);dialog.classList.remove('closing');
  if(dialogDisposer && s.modal?.type!=='text-records'){dialogDisposer();dialogDisposer=null;}
  // WebKit does not focus buttons on pointer activation. Capture the explicit
  // opener so dismissing a sheet returns keyboard users to the same control.
  if(!dialog.open){dialogReturnFocus=dialogTrigger?.isConnected?dialogTrigger:document.activeElement;dialogTrigger=null;}
  dialog.className = wide ? 'entry-dialog' : '';
  dialog.dataset.locked = 'false';
  dialog.dataset.type = type || s.modal?.type || 'general';
  dialog.innerHTML = `<header class="dialog-header"><h2 id="dialog-title">${e(title)}</h2>${iconButton('close', '关闭', 'data-action="close-dialog"')}</header><div class="dialog-body">${body}</div><div class="dialog-bottom-close" ${/data-action="close-dialog"/.test(body)?'hidden':''}><button class="button secondary" data-action="close-dialog">${s.modal?.type==='stats-options'?'完成':s.modal?.type==='discard'?'返回编辑':'关闭'}</button></div>`;
  if (dialog.open && dialog.dataset.nonmodal === 'true') dialog.close();
  const docked=dialog.dataset.type==='text-records'&&matchMedia('(min-width:1100px)').matches;
  dialog.dataset.nonmodal=String(docked);dialog.setAttribute('aria-modal',String(!docked));
  if (!dialog.open) {if(docked)dialog.show();else dialog.showModal();}
  dialog.scrollTop = 0;
  document.body.classList.toggle('dialog-open',!docked);document.body.classList.toggle('text-dock-open',docked);
  if(s.modal && !s.modal.initialControls)s.modal.initialControls=dialogControls();
}
function entryValues(draft) {
  let amount;try{amount=parseAmount(draft.amount);}catch{amount=`invalid:${draft.amount}`;}
  return canonical({type:draft.type,amount,category_id:draft.category_id,occurred_on:draft.occurred_on,
    date_precision:draft.date_precision||(draft.occurred_on.length===7?'month':'day'),note:draft.note.trim()});
}
function dialogControls() {
  return JSON.stringify([...dialog.querySelectorAll('input,select,textarea')].map(control=>[
    control.name||control.id||control.dataset.field||'',control.type,
    control.type==='file'?[...control.files].map(file=>[file.name,file.size,file.lastModified]):
    ['checkbox','radio'].includes(control.type)?control.checked:control.value
  ]));
}
function hasDialogChanges() {
  if(s.modal?.type==='entry')return s.modal.original!==entryValues(s.modal.draft);
  // Text input already persists in this browser session on every edit and on
  // disposal. Closing that dock never discards the user's local draft.
  if(s.modal?.type==='text-records')return false;
  return Boolean(s.modal?.initialControls && s.modal.initialControls!==dialogControls());
}
function returnToEditing() {
  const {previous,suspended}=s.modal;
  s.modal=previous;
  dialog.replaceChildren(suspended.nodes);
  dialog.className=suspended.className;dialog.dataset.type=previous.type;
  if(suspended.nonmodal){dialog.close();dialog.show();}
  dialog.dataset.nonmodal=String(suspended.nonmodal);dialog.setAttribute('aria-modal',String(!suspended.nonmodal));
  document.body.classList.toggle('dialog-open',!suspended.nonmodal);document.body.classList.toggle('text-dock-open',suspended.nonmodal);
  dialog.querySelector('.dialog-body').scrollTop=suspended.scrollTop;
  suspended.focus?.focus({preventScroll:true});
}
function closeDialog(force = false) {
  if(!force&&dialog.classList.contains('closing'))return false;
  if (dialog.dataset.locked === 'true' && !force) { toast('正在处理，请稍候'); return false; }
  if(!force&&s.modal?.type==='discard'){returnToEditing();return false;}
  if(!force&&s.modal?.type==='entry'&&s.modal.draft.pending){toast('保存结果尚未核实，请先重试保存');return false;}
  if(!force&&hasDialogChanges()){
    const previous=s.modal,nodes=document.createDocumentFragment();
    const suspended={nodes,className:dialog.className,nonmodal:dialog.dataset.nonmodal==='true',scrollTop:dialog.querySelector('.dialog-body').scrollTop,focus:dialog.contains(s.modal.lastFocus)?s.modal.lastFocus:dialog.querySelector('[aria-pressed="true"],input:not([type=hidden]),textarea,select')||document.activeElement};
    nodes.append(...dialog.childNodes);s.modal={type:'discard',previous,suspended};
    openDialog('放弃修改？','<p class="dialog-intro">这次修改还没有保存。</p><div class="dialog-footer"><button class="button secondary" data-action="keep-editing">继续编辑</button><button class="button danger-button" data-action="discard-editing">放弃修改</button></div>');return false;
  }
  const finish=()=>{if(s.modal?.type==='entry'&&s.modal.draft.isCopy)sessionStorage.removeItem(`${draftKey()}:copy`);dialogDisposer?.();dialogDisposer=null;if(dialog.open)dialog.close();document.body.classList.remove('dialog-open','text-dock-open');s.modal=null;dialog.dataset.locked='false';dialog.classList.remove('closing');if(dialogReturnFocus?.isConnected)dialogReturnFocus.focus({preventScroll:true});};
  clearTimeout(closeTimer);
  if(!force&&dialog.open&&!matchMedia('(prefers-reduced-motion: reduce)').matches){dialog.classList.add('closing');closeTimer=setTimeout(finish,180);}else finish();
  return true;
}
async function openTextRecords(initialBatchId=null,initialSource='') {
  if(dialog.open)closeDialog(true);
  const modal={type:'text-records',dispose:null};s.modal=modal;
  openDialog('文字与循环记账','<div id="text-record-container">正在打开…</div>',{wide:true});
  try {const module=await import('./text-record-ui.js');if(s.modal!==modal||!dialog.open)return;
    dialogDisposer=modal.dispose=module.mountTextRecords(dialog.querySelector('#text-record-container'),{initialBatchId,initialSource,onStartSource:source=>{s.platformSource=source;openTextRecords(null,source);},categories:s.categories,currentDay:s.session.today,local:s.session.local,draftKey:`moneytalk:draft:text:${s.session.user.id}:${s.session.ledger.id}${initialSource?`:source:${initialSource}`:''}`,lock:busy=>{if(s.modal===modal)dialog.dataset.locked=busy?'true':'false';},onSaved:()=>load({quiet:true}),onCategoriesChanged:next=>{s.categories=next;},onViewBills:range=>{range=recordRange(range.from,range.to);s.filters={q:'',type:'',category_id:''};s.billRange=range;s.month=range.from.slice(0,7);s.offset=0;navigate('bills');}});
  }catch(error){if(s.modal===modal)dialog.querySelector('#text-record-container').textContent=`暂时无法打开：${error.message}`;}
}
function updateForm(context) {
  if (context === 'dialog' && s.modal?.type === 'entry') {
    const { draft, field } = s.modal;
    const activeName = dialog.contains(document.activeElement) ? document.activeElement.name : '';
    const selection = ['amount', 'note'].includes(activeName) ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
    openDialog(field ? `修改${{occurred_on:'日期',note:'备注',category_id:'分类',amount:'金额'}[field]}` : draft.id ? '账单详情' : draft.isCopy?'再记一笔':'记一笔', (draft.isCopy?'<p class="copy-intro">已带入金额、分类和备注。日期默认本月，请核对后保存。</p>':'') + entryForm(draft, s, 'dialog', field) + (draft.id && !field ? `<button class="button secondary duplicate-entry" data-action="duplicate-entry" data-id="${e(draft.id)}" ${draft.saving?'disabled':''}>${icon('plus',17)}再记一笔</button><button class="detail-delete" data-action="delete-entry" data-id="${e(draft.id)}">${icon('trash', 17)}删除这条记录</button><p class="entry-detail-meta">记录日期：${e(draft.occurred_on)}<br>修改保存后同步更新统计。</p>` : ''), { type: 'entry', wide: true });
    dialog.dataset.locked = draft.saving ? 'true' : 'false';
    dialog.classList.toggle('field-edit-dialog', Boolean(field));
    if (activeName && !draft.saving) { const replacement=dialog.querySelector(`[name="${activeName}"]:not([type=hidden])`); replacement?.focus({preventScroll:true}); if(selection && replacement)replacement.setSelectionRange(...selection); }
  } else { saveDraft(); render(); }
}
async function openEntry(id, requestedField = '') {
  const field = ['occurred_on','note','category_id','amount'].includes(requestedField) ? requestedField : '';
  try {
    const { entry } = await request(`/entries/${id}`);
    if (entry.deleted_at) {
      s.modal = { type: 'deleted', entry };
      openDialog('已删除的记录', `<div class="backup-summary"><h3>${e(entry.note || entry.category_name)}</h3><p>${e(entry.occurred_on)} · ${e(entry.category_name)} · ${money(entry.amount_minor)}</p></div><button class="button primary" data-action="restore-entry" data-id="${e(entry.id)}" data-version="${entry.version}">恢复记录</button><p class="dialog-intro">恢复后重新计入对应日期的收支。</p>`); return;
    }
    s.modal = { type: 'entry', field, draft: { ...entry, amount: decimal(entry.amount_minor), expanded: false, error: '', pending: null } };
    s.modal.original=entryValues(s.modal.draft);
    updateForm('dialog');
    if (field) {const control=dialog.querySelector(field==='category_id'?'[aria-pressed="true"]':`[name="${field}"]:not([type=hidden])`); control?.focus({preventScroll:true}); if(field==='amount'||field==='note')control?.select();}
  } catch (error) { toast(error.message); }
}
async function duplicateEntry(id) {
  if(s.modal?.draft?.saving||s.modal?.draft?.pending)return;
  if(hasDialogChanges()){toast('请先保存或取消当前修改，再记一笔');return;}
  const previous=s.modal,originalDraft=previous.draft;originalDraft.saving=true;originalDraft.preparing=true;updateForm('dialog');
  try{
    const {entry}=await request(`/entries/${id}`);
    if(s.modal!==previous)return;
    if(entry.deleted_at){toast('这条记录已删除，请先恢复');return;}
    const category=s.categories.find(c=>c.id===entry.category_id&&!c.archived);
    const draft={...baseDraft(),isCopy:true,type:entry.type,amount:decimal(entry.amount_minor),note:entry.note,category_id:category?.id||'',date_precision:'month',error:category?'':'原分类已停用，请选择新分类'};
    s.modal={type:'entry',draft,original:entryValues(draft)};saveDraft();updateForm('dialog');
  }finally{originalDraft.saving=false;originalDraft.preparing=false;if(s.modal===previous)updateForm('dialog');}
}
function newEntry(date) {
  if (date) { s.draft.date_precision=date.length===7?'month':'day';s.draft.occurred_on = date; saveDraft(); }
  if (matchMedia('(max-width: 767px)').matches) {
    if (s.page !== 'record') navigate('record'); else render();
    document.querySelector('#amount-main')?.focus();
  } else if (s.page === 'record' || (s.page === 'stats' && matchMedia('(min-width: 1440px)').matches)) {
    render(); const field = document.querySelector('[name="amount"]'); field?.scrollIntoView({ block: 'center', behavior: 'smooth' }); field?.focus();
  } else { s.modal = { type: 'entry', draft: s.draft, original:entryValues(s.draft),originalDraft:{...s.draft} }; updateForm('dialog'); }
}
async function saveEntry(form) {
  const context = form.dataset.context, draft = currentDraft(context);
  if (!draft || draft.saving) return;
  try {
    if (!draft.pending) {
      const fields = new FormData(form);
      const body = { type: draft.type, amount_minor: parseAmount(fields.get('amount')), category_id: draft.category_id, occurred_on: fields.get('occurred_on'), note: String(fields.get('note') || '').trim() };
      if (!validRecordDate(body.occurred_on) || body.occurred_on > s.session.today) throw new Error('请选择今天或之前的有效记账日期');
      if (draft.id) body.version = draft.version;
      draft.pending = { key: crypto.randomUUID(), body };
    }
    draft.saving = true; draft.error = ''; draft.conflict = false; if (!draft.id) saveDraft(); updateForm(context);
    const result = await mutate(draft.id ? `/entries/${draft.id}` : '/entries', draft.pending.body, { method: draft.id ? 'PATCH' : 'POST', key: draft.pending.key });
    const wasEdit = Boolean(draft.id), editedField = context === 'dialog' ? s.modal?.field : '';
    if (!wasEdit && !draft.isCopy) { s.draft = { ...baseDraft(), type: draft.type, category_id: draft.category_id, occurred_on: draft.occurred_on }; saveDraft(); }
    else draft.pending = null;
    draft.saving = false;
    if (context === 'dialog') closeDialog(true);
    s.receipt={count:1,expense_minor:draft.type==='expense'?result.entry.amount_minor:0,income_minor:draft.type==='income'?result.entry.amount_minor:0,from:result.entry.occurred_on,to:result.entry.occurred_on};
    toast(wasEdit ? `修改已保存到${s.session.local ? '本地' : '云端'}` : `${money(result.entry.amount_minor)} 已入账 · ${result.entry.occurred_on}`);
    await load({ quiet: true });
    if (wasEdit && editedField) {
      const saved = [...root.querySelectorAll('[data-edit-field]')].find(node => node.dataset.id === draft.id && node.dataset.editField === editedField && node.getClientRects().length);
      saved?.focus({preventScroll:true}); saved?.classList.add('field-saved');
      if(saved)setTimeout(()=>saved.classList.remove('field-saved'),1000);
    }
    return result;
  } catch (error) {
    draft.saving = false; draft.error = error.message;
    if (error.code !== 'NETWORK' && !(error.status >= 500)) draft.pending = null;
    draft.conflict = error.code === 'VERSION_CONFLICT';
    if (!draft.id) saveDraft(); updateForm(context);
    document.querySelector(`#entry-error-${context}`)?.scrollIntoView({ block: 'nearest' });
  }
}
async function confirmDelete(id) {
  try {
    const { entry } = await request(`/entries/${id}`);
    s.modal = { type: 'delete', entry, key: crypto.randomUUID() };
    openDialog('删除这条记录？', `<p class="dialog-intro">记录会移入回收站，之后仍可恢复。</p><div class="backup-summary"><h3>${e(entry.note || entry.category_name)}</h3><p>${e(entry.occurred_on)} · ${e(entry.category_name)}</p><strong class="money">${entry.type === 'expense' ? '−' : '+'}${money(entry.amount_minor)}</strong></div><p id="delete-error" class="field-error" role="alert"></p><div class="dialog-footer"><button class="button secondary" data-action="close-dialog">取消</button><button class="button danger-button" data-action="confirm-delete">移入回收站</button></div>`);
  } catch (error) { toast(error.message); }
}
async function performDelete() {
  const modal = s.modal; if (!modal || modal.busy) return;
  modal.busy = true; dialog.dataset.locked = 'true';
  const entry = modal.entry, ledger = s.session.ledger.id;
  try {
    const result = await mutate(`/entries/${entry.id}/delete`, { version: entry.version }, { key: modal.key });
    s.receipt = null;
    closeDialog(true);
    toast('记录已移入回收站', async () => { if (s.session.ledger.id !== ledger) return toast('请先切回原账本，再恢复这条记录'); await restoreEntry(entry.id, result.version); });
    await load({ quiet: true });
  } catch (error) { modal.busy = false; dialog.dataset.locked = 'false'; document.querySelector('#delete-error').textContent = error.message; }
}
async function restoreEntry(id, version) {
  try { await mutate(`/entries/${id}/restore`, { version: Number(version) }); toast('记录已恢复'); if (dialog.open) { if (s.modal?.type === 'trash') await openTrash(); else closeDialog(true); } await load({ quiet: true }); }
  catch (error) { toast(error.message); }
}
function categoryBills(id) { s.filters = { q: '', type: 'expense', category_id: id }; s.billRange = s.stats ? { from: s.stats.from, to: s.stats.to } : null; s.offset = 0; navigate('bills'); }
function refreshStatsOptions(){if(s.modal?.type!=='stats-options')return;for(const b of dialog.querySelectorAll('[data-action=period],[data-action=chart]')){const active=b.dataset.value===(b.dataset.action==='period'?s.period:s.chart);b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}}
function openFilters() {
  const range = s.billRange || periodRange(s.month, 'month', s.session.today);
  s.modal = { type: 'filters' };
  openDialog('筛选账单', `<form class="standard-form" data-form="filters"><label>搜索<input name="q" placeholder="备注、分类或金额" maxlength="200" value="${e(s.filters.q)}" /></label><label>收支<select name="type"><option value="">全部</option><option value="expense" ${s.filters.type==='expense'?'selected':''}>支出</option><option value="income" ${s.filters.type==='income'?'selected':''}>收入</option></select></label><label>开始日期<input type="date" name="from" required value="${e(range.from)}" /></label><label>结束日期<input type="date" name="to" required value="${e(range.to)}" /></label><label>分类<select name="category_id"><option value="">全部分类</option>${s.categories.map(c => `<option value="${e(c.id)}" ${s.filters.category_id === c.id ? 'selected' : ''}>${e(c.name)}${c.archived ? '（已停用）' : ''}</option>`).join('')}</select></label><p class="field-error" id="filters-error" role="alert"></p><div class="dialog-footer"><button class="button secondary" type="button" data-action="close-dialog">取消</button><button class="button primary" type="submit">应用筛选</button></div></form><button class="button secondary filtered-download" data-action="export-filter">${icon('download', 16)}导出当前显示的 ${s.bills?.totals.count || 0} 笔账单</button>`);
}
function openCategories() { s.modal = { type: 'categories' }; openDialog('分类管理', categoryManager(s)); }
function editCategory(id) { s.modal = { type: 'category', category: s.categories.find(c => c.id === id) || null, key: crypto.randomUUID() }; openDialog(id ? '编辑分类' : '添加分类', categoryEditor(s.modal.category || {})); }
async function saveCategory(form) {
  const modal = s.modal; if (modal.busy) return;
  const fields = new FormData(form), previous = modal.category;
  const body = { aliases:String(fields.get('aliases')||'').split(/[,，;；\n]/).map(x=>x.trim()).filter(Boolean), name: fields.get('name').trim(), type: previous?.type || fields.get('type'), color_key: fields.get('color_key'), icon: fields.get('icon'), sort_order: Number(fields.get('sort_order')), archived: fields.get('archived') === 'on' };
  if (previous) body.version = previous.version;
  if (modal.body && canonical(modal.body) !== canonical(body)) modal.key = crypto.randomUUID();
  modal.body = body; modal.busy = true; dialog.dataset.locked = 'true'; form.querySelector('button[type=submit]').disabled = true;
  try {
    await mutate(previous ? `/categories/${previous.id}` : '/categories', body, { method: previous ? 'PATCH' : 'POST', key: modal.key });
    s.categories = (await request('/categories')).categories; openCategories(); toast('分类已保存，历史记录保持关联'); await load({ quiet: true });
  } catch (error) { modal.busy = false; dialog.dataset.locked = 'false'; form.querySelector('button[type=submit]').disabled = false; document.querySelector('#category-error').textContent = error.message; }
}
async function exportCsv(filtered) {
  try { const blob = await request(`/export.csv${filtered ? `?${queryString(billQuery())}` : ''}`, { raw: true }); download(blob, `MoneyTalk-${filtered ? '筛选账单' : '全部账单'}-${today()}.csv`); toast('导出文件已准备，请检查浏览器下载'); }
  catch (error) { toast(error.message); }
}
function openBackup() {
  s.modal = { type: 'backup', file: null, preview: null, job: null, busy: false };
  openDialog('备份与恢复', `<p class="dialog-intro">完整备份包含分类、有效账目、回收站、文字草稿与循环规则。恢复时创建独立候选账本，当前账本会保留。</p><div class="backup-actions"><button class="button secondary" data-action="download-backup">${icon('file')}下载完整 JSON 备份</button><button class="button secondary" data-action="export-all">${icon('download')}导出全部有效账目 CSV</button></div><label class="upload-area">${icon('upload', 29)}<strong>选择备份文件进行检查</strong><span class="muted">MoneyTalk JSON 备份 · 最大 20 MB</span><input type="file" accept="application/json,.json" id="backup-file" /></label><div id="backup-preview"></div>`);
}
async function downloadBackup() {
  try { const data = await request('/backup'); download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `MoneyTalk-完整备份-${today()}.json`); toast('备份文件已准备，请确认下载完成并妥善保存'); }
  catch (error) { toast(error.message); }
}
function backupSummary(preview) {
  const v = preview.summary;
  return `<div class="backup-summary"><h3>${e(preview.ledger?.name || '备份校验结果')}</h3><dl><dt>有效账目</dt><dd>${v.active} 笔</dd><dt>回收站</dt><dd>${v.deleted} 笔</dd><dt>分类</dt><dd>${v.categories} 个</dd><dt>文字与循环规则</dt><dd>${v.text_batches || 0} 批</dd><dt>支出合计</dt><dd>${money(v.expense_minor)}</dd><dt>收入合计</dt><dd>${money(v.income_minor)}</dd><dt>日期范围</dt><dd>${v.from ? `${e(v.from)}<br>至 ${e(v.to)}` : '空账本'}</dd></dl></div>`;
}
async function previewBackup(file) {
  const modal = s.modal, area = document.querySelector('#backup-preview');
  if (!file || modal.type !== 'backup') return;
  const ticket = (modal.previewTicket || 0) + 1; modal.previewTicket = ticket;
  modal.file = null; modal.preview = null; modal.busy = true;dialog.dataset.locked='true';
  area.innerHTML = '<p class="dialog-intro">正在检查备份内容…</p>';
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error('文件超过 20 MB，请先拆分备份');
    const data = JSON.parse(await file.text());
    const preview = await request('/restores/preview', { method: 'POST', body: data });
    if (s.modal !== modal || modal.previewTicket !== ticket) return;
    if (!preview.valid) { area.innerHTML = `<p class="field-error">备份未通过校验，尚未写入任何账目。</p><ul class="backup-errors">${preview.errors.map(x => `<li>${e(x)}</li>`).join('')}</ul>`; return; }
    modal.file = data; modal.preview = preview;
    area.innerHTML = `${backupSummary(preview)}<p class="dialog-intro">校验通过。下一步写入独立候选账本；当前账本保持不变。</p><button class="button primary" data-action="start-restore">创建并校验候选账本</button><div class="restore-progress" id="restore-progress" role="status"></div>`;
  } catch (error) { if (s.modal === modal && modal.previewTicket === ticket) area.innerHTML = `<p class="field-error" role="alert">${e(error instanceof SyntaxError ? '无法读取 JSON 文件，请选择完整的 MoneyTalk 备份' : error.message)}</p>`; }
  finally { if (s.modal===modal&&modal.previewTicket === ticket){modal.busy = false;dialog.dataset.locked='false';} }
}
async function startRestore() {
  const modal = s.modal; if (!modal?.file || modal.busy) return;
  modal.busy = true; dialog.dataset.locked = 'true';
  const button = dialog.querySelector('[data-action="start-restore"]'); button.disabled = true;
  const fileInput = document.querySelector('#backup-file'); fileInput.disabled = true;
  const progress = document.querySelector('#restore-progress'), data = modal.file;
  try {
    progress.innerHTML = '<p>正在准备候选账本…</p>';
    const job = await request('/restores', { method: 'POST', body: { fingerprint: modal.preview.fingerprint, ledger: data.ledger, categories: data.categories, entry_count: data.entries.length, ...(data.text_batches?{text_batches:data.text_batches,text_slots:data.text_slots||[]}:{} ) } });
    modal.job = job;
    if (!job.complete) {
      for (let i = 0; i < data.entries.length; i += 50) {
        const result = await request(`/restores/${job.id}/entries`, { method: 'POST', body: { entries: data.entries.slice(i, i + 50) } });
        progress.innerHTML = `<progress value="${result.received}" max="${Math.max(1, data.entries.length)}"></progress><p>已核对 ${result.received} / ${data.entries.length} 笔记录</p>`;
      }
    }
    await request(`/restores/${job.id}/finish`, { method: 'POST', body: {} });
    progress.innerHTML = `<div class="success-mark">${icon('checks', 27)}</div><p><strong>${job.repeated ? '已找到并核对同一备份的候选账本' : '候选账本已通过完整校验'}</strong></p><p>分类、记录与备份内容一致，当前账本仍在使用。</p><button class="button primary" data-action="activate-ledger" data-id="${e(job.id)}">切换到已校验的候选账本</button>`;
    button.hidden = true;
    modal.initialControls=dialogControls();
  } catch (error) { progress.innerHTML = `<p class="field-error">${e(error.message)}。当前账本未被替换；可以使用同一备份重试。</p>`; button.textContent = '继续恢复并核对'; button.disabled = false; }
  finally { modal.busy = false; dialog.dataset.locked = 'false'; fileInput.disabled = false; }
}
async function openLedgers() {
  try {
    const session = await request('/session'); s.session.ledgers = session.ledgers;
    s.modal = { type: 'ledgers' };
    openDialog('我的账本', `<p class="dialog-intro">仅展示当前身份拥有且已通过校验的账本。切换账本不会删除原账本。</p>${session.ledgers.map(l => `<button class="ledger-option" data-action="activate-ledger" data-id="${e(l.id)}">${icon('wallet')}<strong>${e(l.name)}</strong>${l.id === s.session.ledger.id ? '<span class="status-tag">正在使用</span>' : icon('right', 16)}</button>`).join('')}`);
  } catch (error) { toast(error.message); }
}
async function activateLedger(id) {
  if (dialog.dataset.locked === 'true') return;
  try {
    dialog.dataset.locked = 'true';
    await request(`/ledgers/${id}/activate`, { method: 'POST', body: {} });
    ++epoch; closeDialog(true); clearDrafts(); undoAction = null; toastElement.classList.remove('show');
    setLedger(id); s.session = await request('/session'); s.categories = (await request('/categories')).categories;
    s.draft = baseDraft(); s.filters = { q: '', type: '', category_id: '' }; s.billRange = null; s.offset = 0;
    saveDraft(); toast('已切换账本'); render(); await load();
  } catch (error) { dialog.dataset.locked = 'false'; toast(error.message); }
}
async function openTrash(offset = 0) {
  try {
    const result = await request(`/entries?deleted=true&limit=50&offset=${offset}`);
    s.modal = { type: 'trash', offset };
    openDialog('回收站', `<p class="dialog-intro">删除的 ${result.totals.count} 笔记录保留在这里，恢复后重新计入统计。</p><div class="trash-list">${result.entries.length ? result.entries.map(x => recordRow(x, { date: true, restore: true })).join('') : empty('回收站是空的', '删除的账目可以在这里找回。')}</div>${result.totals.count > 50 ? `<div class="pagination"><button class="button secondary" data-action="trash-page" data-offset="${Math.max(0, offset - 50)}" ${offset === 0 ? 'disabled' : ''}>上一页</button><button class="button secondary" data-action="trash-page" data-offset="${offset + 50}" ${offset + 50 >= result.totals.count ? 'disabled' : ''}>下一页</button></div>` : ''}`);
  } catch (error) { toast(error.message); }
}
function displaySettings() {
  s.modal = { type: 'display' };
  openDialog('显示设置', `<form data-form="display" class="standard-form"><label>默认统计图<select name="chart"><option value="bar" ${s.chart === 'bar' ? 'selected' : ''}>分类堆叠柱状图</option><option value="line" ${s.chart === 'line' ? 'selected' : ''}>分类折线图</option><option value="pie" ${s.chart === 'pie' ? 'selected' : ''}>分类饼图</option></select></label><label>账单显示密度<select name="density"><option value="comfortable" ${s.density !== 'compact' ? 'selected' : ''}>舒适</option><option value="compact" ${s.density === 'compact' ? 'selected' : ''}>紧凑</option></select></label><p class="dialog-intro">只在本设备保存显示偏好，账本数据仍由服务器保存。</p><button class="button primary" type="submit">保存设置</button></form>`);
}
async function logout() {
  clearDrafts(); ++epoch; closeDialog(true); chartsModule?.destroyChart(); undoAction = null; toastElement.classList.remove('show');
  const local = s.session?.local; s.session = null; s.draft = null; s.bills = null; s.stats = null; s.recent = null;
  setLedger(null);
  if (local) { sessionStorage.setItem('moneytalk:local-logged-out', 'true'); showLoggedOut(); }
  else location.assign('/cdn-cgi/access/logout');
}

function outsideDialog(event) {
  const rect=dialog.getBoundingClientRect();
  return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;
}
dialog.addEventListener('focusin',event=>{if(s.modal&&event.target!==dialog)s.modal.lastFocus=event.target;});
function repeatedDismiss(event) {
  return dismissedPoint && performance.now()-dismissedPoint.time<500 && Math.hypot(event.clientX-dismissedPoint.x,event.clientY-dismissedPoint.y)<12;
}
document.addEventListener('pointerdown',event=>{
  outsideGesture=null;
  if(event.button!==0||!dialog.open||!outsideDialog(event))return;
  if(dialog.dataset.nonmodal==='true'&&event.target.closest('button,a,input,select,textarea,label,[data-route],[data-action]'))return;
  outsideGesture={modal:s.modal,pointerId:event.pointerId,x:event.clientX,y:event.clientY,ready:false};
},true);
document.addEventListener('pointerup',event=>{
  if(outsideGesture)outsideGesture.ready=outsideGesture.pointerId===event.pointerId&&outsideGesture.modal===s.modal&&outsideDialog(event)&&Math.hypot(event.clientX-outsideGesture.x,event.clientY-outsideGesture.y)<8;
},true);
document.addEventListener('pointercancel',()=>{outsideGesture=null;},true);
document.addEventListener('click',event=>{
  // Absorb the second click at the same spot, even if the closing animation
  // has finished. It must not activate the underlying ledger or discard prompt.
  if(repeatedDismiss(event)){event.preventDefault();event.stopImmediatePropagation();return;}
  const gesture=outsideGesture;outsideGesture=null;
  if(!dialog.open||!gesture?.ready||gesture.modal!==s.modal||!outsideDialog(event)){dismissedPoint=null;return;}
  event.preventDefault();event.stopImmediatePropagation();
  // A backdrop click never chooses whether to discard changed content.
  if(s.modal?.type!=='discard'){
    const previous=s.modal,closing=closeDialog();
    if(closing||s.modal!==previous)dismissedPoint={x:event.clientX,y:event.clientY,time:performance.now()};
  }
},true);
document.addEventListener('dblclick',event=>{if(repeatedDismiss(event)){event.preventDefault();event.stopImmediatePropagation();}},true);
document.addEventListener('click', async event => {
  const route = event.target.closest('[data-route]');
  if (route && !event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); navigate(route.dataset.route); return; }
  const target = event.target.closest('[data-action]'); if (!target || target.disabled) return;
  if (!dialog.open) dialogTrigger = target;
  const { action, value, id, context } = target.dataset;
  try {
    if (action === 'login') { sessionStorage.removeItem('moneytalk:local-logged-out'); location.reload(); }
    else if (action === 'refresh') await load();
    else if (action === 'new-entry') newEntry();
    else if (action === 'duplicate-entry') await duplicateEntry(id);
    else if (action === 'platform-select') {s.platformSource=target.dataset.source;render();}
    else if (action === 'entry') await openEntry(id, target.dataset.editField);
    else if (action === 'close-dialog') closeDialog();
    else if(action==='keep-editing')returnToEditing();
    else if(action==='discard-editing'){
      const previous=s.modal.previous;
      if(previous.type==='entry'&&!previous.draft.id&&!previous.draft.isCopy){s.draft={...previous.originalDraft};saveDraft();render();}
      if(previous.type==='entry'&&previous.draft.isCopy)sessionStorage.removeItem(`${draftKey()}:copy`);
      closeDialog(true);
    }
    else if (action === 'entry-type') { const d = currentDraft(context); if (!d || d.pending) return; d.type = value; d.category_id = s.categories.find(c => c.type === value && !c.archived)?.id || ''; d.expanded = false; d.error = ''; updateForm(context); }
    else if (action === 'entry-category') { const d = currentDraft(context); if (!d || d.pending) return; d.category_id = id; updateForm(context); }
    else if (action === 'expand-categories') { const d = currentDraft(context); d.expanded = !d.expanded; updateForm(context); }
    else if (action === 'reload-entry') await openEntry(id, s.modal?.field);
    else if (action === 'delete-entry') await confirmDelete(id);
    else if (action === 'confirm-delete') await performDelete();
    else if (action === 'restore-entry') { target.disabled = true; await restoreEntry(id, target.dataset.version); target.disabled = false; }
    else if (action === 'undo-toast') { const undo = undoAction; undoAction = null; toastElement.classList.remove('show'); if (undo) await undo(); }
    else if (action === 'previous-month' || action === 'next-month') { s.month = shiftMonth(s.month, (action === 'previous-month' ? -1 : 1) * (s.page === 'stats' ? s.period === 'year' ? 12 : s.period === 'quarter' ? 3 : 1 : 1)); s.month = s.month < '1900-01' ? '1900-01' : s.month > '2100-12' ? '2100-12' : s.month; s.offset = 0; s.billRange = null; await load(); }
    else if (action === 'current-period') {s.month=s.session.today.slice(0,7);s.billRange=null;s.offset=0;await load();}
    else if (action === 'remove-filter') {if(value==='range')s.billRange=null;else if(['q','type','category_id'].includes(value))s.filters[value]='';s.offset=0;await load();}
    else if (action === 'period') { s.period = value; await load(); refreshStatsOptions(); }
    else if (action === 'chart') { s.chart = value; storage.set('moneytalk:chart', value); render(); refreshStatsOptions(); }
    else if (action === 'category-bills') categoryBills(id);
    else if (action === 'filters') openFilters();
    else if (action === 'stats-options') {s.modal={type:'stats-options'};openDialog('统计视图',`<p class="dialog-intro">${e(s.month)} · 切换视图不改变金额</p><div class="view-options"><h3>统计周期</h3><div class="segmented">${[['month','月'],['quarter','季度'],['year','年']].map(([v,n])=>`<button data-action="period" data-value="${v}" aria-pressed="${s.period===v}" class="${s.period===v?'active':''}">${n}</button>`).join('')}</div><h3>图表</h3><div class="segmented">${[['bar','柱状'],['line','折线'],['pie','饼图']].map(([v,n])=>`<button data-action="chart" data-value="${v}" aria-pressed="${s.chart===v}" class="${s.chart===v?'active':''}">${icon(v,18)}${n}</button>`).join('')}</div></div>`);}
    else if (action === 'view-receipt') {s.filters={q:'',type:'',category_id:''};s.billRange=recordRange(s.receipt.from,s.receipt.to);s.offset=0;s.month=s.receipt.from.slice(0,7);navigate('bills');}
    else if (action === 'filter-type') { s.filters.type = value; s.offset = 0; if (value && s.categories.find(c => c.id === s.filters.category_id)?.type !== value) s.filters.category_id = ''; await load(); }
    else if (action === 'clear-filters') { s.filters = { q: '', type: '', category_id: '' }; s.billRange = null; s.offset = 0; await load(); }
    else if (action === 'page-prev' || action === 'page-next') { s.offset = Math.max(0, s.offset + (action === 'page-prev' ? -50 : 50)); await load(); window.scrollTo({ top: 0 }); }
    else if (action === 'backdate') newEntry(target.dataset.date);
    else if (action === 'categories') openCategories();
    else if (action === 'new-category') editCategory();
    else if (action === 'edit-category') editCategory(id);
    else if (action === 'export-all') await exportCsv(false);
    else if (action === 'export-filter') await exportCsv(true);
    else if (action === 'backup') openBackup();
    else if (action === 'text-records') await openTextRecords(target.dataset.batchId||null,target.dataset.source||'');
    else if (action === 'download-backup') await downloadBackup();
    else if (action === 'start-restore') await startRestore();
    else if (action === 'activate-ledger') await activateLedger(id);
    else if (action === 'ledgers') await openLedgers();
    else if (action === 'trash') await openTrash();
    else if (action === 'trash-page') await openTrash(Number(target.dataset.offset));
    else if (action === 'display') displaySettings();
    else if (action === 'logout') { s.modal = { type: 'logout' }; openDialog('退出登录？', '<p class="dialog-intro">已保存的账目会保留，当前浏览器的未保存草稿会清除。</p><div class="dialog-footer"><button class="button secondary" data-action="close-dialog">取消</button><button class="button primary" data-action="confirm-logout">退出登录</button></div>'); }
    else if (action === 'confirm-logout') await logout();
  } catch (error) { toast(error.message); }
});
document.addEventListener('input', event => {
  const form = event.target.closest('[data-form="entry"]'); if (!form) return;
  const d = currentDraft(form.dataset.context); if (!d || d.pending) return;
  if (['amount', 'note', 'occurred_on'].includes(event.target.name)) d[event.target.name] = event.target.value;
  if (event.target.name === 'amount') event.target.classList.toggle('long-value', event.target.value.length > 10);
  if (event.target.name === 'note') form.querySelector('.char-count').textContent = `${d.note.length}/200`;
  if (!d.id) saveDraft();
});
document.addEventListener('change', async event => {
  if (event.target.dataset.action === 'month') { if (!/^\d{4}-\d{2}$/.test(event.target.value)) return; s.month = event.target.value; s.billRange = null; s.offset = 0; await load(); }
  if(event.target.name==='date_precision'&&event.target.closest('[data-form="entry"]')){const form=event.target.closest('form'),d=currentDraft(form.dataset.context);if(!d || d.pending)return;d.occurred_on=event.target.value==='month'?d.occurred_on.slice(0,7):d.occurred_on.length===10?d.occurred_on:'';d.date_precision=event.target.value;saveDraft();updateForm(form.dataset.context);return;}
  if (event.target.name === 'occurred_on' && event.target.closest('[data-form="entry"]')) {
    const form = event.target.closest('form'), d = currentDraft(form.dataset.context), label = event.target.closest('.date-control').querySelector('span');
    if (d.occurred_on) label.textContent = recordDateLabel(d.occurred_on);
  }
  if (event.target.id === 'backup-file') await previewBackup(event.target.files?.[0]);
});
document.addEventListener('submit', async event => {
  const form = event.target.closest('[data-form]'); if (!form) return; event.preventDefault();
  try {
    if (form.dataset.form === 'entry') await saveEntry(form);
    if (form.dataset.form === 'search') { s.filters.q = String(new FormData(form).get('q') || '').trim(); s.offset = 0; await load(); }
    if (form.dataset.form === 'category') await saveCategory(form);
    if (form.dataset.form === 'filters') {
      const f = new FormData(form), from = f.get('from'), to = f.get('to');
      if (!from || !to || from > to) { document.querySelector('#filters-error').textContent = '请填写有效日期范围，开始日期不能晚于结束日期'; return; }
      s.billRange = { from, to }; s.filters.category_id = f.get('category_id'); s.filters.q=String(f.get('q')||'').trim();s.filters.type=String(f.get('type')||''); s.offset = 0; closeDialog(true); await load();
    }
    if (form.dataset.form === 'display') { const f = new FormData(form); s.chart = f.get('chart'); s.density = f.get('density'); storage.set('moneytalk:chart', s.chart); storage.set('moneytalk:density', s.density); closeDialog(true); render(); toast('显示设置已保存'); }
  } catch (error) { toast(error.message); }
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&dialog.open&&dialog.dataset.nonmodal==='true'){event.preventDefault();closeDialog();}});
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
window.addEventListener('popstate',()=>{s.page=firstPage();const p=new URLSearchParams(location.search);s.filters=routeFilters(p);s.offset=routeOffset(p);if(validDate(`${p.get('month')}-01`))s.month=p.get('month');s.billRange=validDate(p.get('from'))&&validDate(p.get('to'))&&p.get('from')<=p.get('to')?{from:p.get('from'),to:p.get('to')}:null;if(['month','quarter','year'].includes(p.get('period')))s.period=p.get('period');closeDialog(true);render();load();});
window.addEventListener('beforeunload', event => { const modal=s.modal?.type==='discard'?s.modal.previous:s.modal;if (modal?.type==='entry'&&modal.draft.id&&(modal.original!==entryValues(modal.draft)||modal.draft.pending)) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && s.session && !dialog.open && !s.draft?.saving && !document.activeElement?.matches('input,textarea')) { s.session.today = today(); load({ quiet: true }); } });
window.addEventListener('online', () => { if (s.error) load(); });
function updateViewport() {
  const viewport=window.visualViewport;
  const editing=document.activeElement?.matches('input,textarea,select');
  const keyboard=Boolean(viewport && editing && viewport.scale===1 && window.innerHeight-viewport.height>140);
  document.documentElement.classList.toggle('keyboard-open',keyboard);
  document.documentElement.style.setProperty('--visible-height',`${viewport?.height||window.innerHeight}px`);
  document.documentElement.style.setProperty('--keyboard-inset',`${keyboard?Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop):0}px`);
}
window.visualViewport?.addEventListener('resize',updateViewport);
window.visualViewport?.addEventListener('scroll',updateViewport);
document.addEventListener('focusin',updateViewport);
document.addEventListener('focusout',()=>requestAnimationFrame(updateViewport));
updateViewport();
init();

const dockMedia=matchMedia('(min-width:1100px)');
dockMedia.addEventListener('change',()=>{if(s.modal?.type!=='text-records'||!dialog.open)return;dialog.close();dialog.dataset.nonmodal=String(dockMedia.matches);dialog.setAttribute('aria-modal',String(!dockMedia.matches));document.body.classList.toggle('text-dock-open',dockMedia.matches);document.body.classList.toggle('dialog-open',!dockMedia.matches);if(dockMedia.matches)dialog.show();else dialog.showModal();});
