import './styles.css';
import './responsive.css';
import { request, mutate, queryString, setLedger, download } from './api.js';
import { shell, recordPage, statsPage, billsPage, settingsPage, loading, entryForm, categoryManager, categoryEditor } from './views.js';
import { escape as e, icon, iconButton, empty, recordRow, categoryIcon } from './ui.js';
import { today, periodRange, shiftMonth, parseAmount, decimal, money, canonical } from '../shared/format.js';

const root = document.querySelector('#app'), dialog = document.querySelector('#dialog'), toastElement = document.querySelector('#toast');
const storage = { get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }, set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Display preferences are optional. */ } } };
const knownPages = ['record', 'bills', 'stats', 'settings'];
const firstPage = () => knownPages.includes(location.pathname.slice(1)) ? location.pathname.slice(1) : matchMedia('(max-width: 767px)').matches ? 'record' : 'stats';
const s = { page: firstPage(), month: today().slice(0, 7), period: 'month', chart: storage.get('moneytalk:chart', 'bar'), density: storage.get('moneytalk:density', 'comfortable'), categories: [], session: null, recent: null, bills: null, stats: null, filters: { type: '', category_id: '', q: '' }, billRange: null, offset: 0, error: '', draft: null, modal: null };
if (!['bar', 'line', 'pie'].includes(s.chart)) s.chart = 'bar';
let epoch = 0, renderEpoch = 0, chartsModule, toastTimer, undoAction = null;
const baseDraft = () => ({ amount: '', type: 'expense', category_id: s.categories.find(c => c.type === 'expense' && !c.archived)?.id || 'food', occurred_on: s.session?.today || today(), note: '', expanded: false, error: '', pending: null });
const draftKey = () => `moneytalk:draft:${s.session.user.id}:${s.session.ledger.id}`;
function saveDraft() { if (!s.session || !s.draft) return; try { const { saving, error, ...draft } = s.draft; sessionStorage.setItem(draftKey(), JSON.stringify(draft)); } catch { toast('当前浏览器不能保留草稿，请在离开前保存'); } }
function readDraft() { try { s.draft = { ...baseDraft(), ...JSON.parse(sessionStorage.getItem(draftKey()) || '{}'), saving: false, error: '' }; } catch { s.draft = baseDraft(); } }
function clearDrafts() { for (let i = sessionStorage.length - 1; i >= 0; i--) { const key = sessionStorage.key(i); if (key?.startsWith('moneytalk:draft:')) sessionStorage.removeItem(key); } }
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
  root.innerHTML = shell(s, content);
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
  const ticket = ++epoch, page = s.page;
  s.error = '';
  if (!quiet) { if (page === 'bills') s.bills = null; if (page === 'stats') s.stats = null; render(); }
  try {
    const [categories, recent, current] = await Promise.all([
      request('/categories'), request('/entries?limit=6'),
      page === 'stats' ? request(`/stats?${queryString(periodRange(s.month, s.period, s.session.today))}`) : page === 'bills' ? request(`/entries?${queryString(billQuery())}`) : Promise.resolve(null),
    ]);
    if (ticket !== epoch) return;
    s.categories = categories.categories; s.recent = recent;
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
  dialog.className = wide ? 'entry-dialog' : '';
  dialog.dataset.locked = 'false';
  dialog.innerHTML = `<header class="dialog-header"><h2 id="dialog-title">${e(title)}</h2>${iconButton('close', '关闭', 'data-action="close-dialog"')}</header><div class="dialog-body">${body}</div>`;
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  if (type) dialog.dataset.type = type;
}
function closeDialog(force = false) {
  if (dialog.dataset.locked === 'true' && !force) { toast('正在处理，请稍候'); return false; }
  if (!force && s.modal?.type === 'entry' && s.modal.draft.id && s.modal.dirty && !window.confirm('当前修改尚未保存，确定放弃这些修改？')) return false;
  if (dialog.open) dialog.close(); s.modal = null; dialog.dataset.locked = 'false'; return true;
}
function updateForm(context) {
  if (context === 'dialog' && s.modal?.type === 'entry') {
    const { draft } = s.modal;
    openDialog(draft.id ? '账单详情' : '记一笔', entryForm(draft, s, 'dialog') + (draft.id ? `<button class="detail-delete" data-action="delete-entry" data-id="${e(draft.id)}">${icon('trash', 17)}删除这条记录</button><p class="entry-detail-meta">记录日期：${e(draft.occurred_on)}<br>修改保存后同步更新统计。</p>` : ''), { type: 'entry', wide: true });
    dialog.dataset.locked = draft.saving ? 'true' : 'false';
  } else { saveDraft(); render(); }
}
async function openEntry(id) {
  try {
    const { entry } = await request(`/entries/${id}`);
    if (entry.deleted_at) {
      s.modal = { type: 'deleted', entry };
      openDialog('已删除的记录', `<div class="backup-summary"><h3>${e(entry.note || entry.category_name)}</h3><p>${e(entry.occurred_on)} · ${e(entry.category_name)} · ${money(entry.amount_minor)}</p></div><button class="button primary" data-action="restore-entry" data-id="${e(entry.id)}" data-version="${entry.version}">恢复记录</button><p class="dialog-intro">恢复后重新计入对应日期的收支。</p>`); return;
    }
    s.modal = { type: 'entry', dirty: false, draft: { ...entry, amount: decimal(entry.amount_minor), expanded: false, error: '', pending: null } };
    updateForm('dialog');
  } catch (error) { toast(error.message); }
}
function newEntry(date) {
  if (date) { s.draft.occurred_on = date; saveDraft(); }
  if (matchMedia('(max-width: 767px)').matches) {
    if (s.page !== 'record') navigate('record'); else render();
    document.querySelector('#amount-main')?.focus();
  } else if (s.page === 'record' || (s.page === 'stats' && matchMedia('(min-width: 1440px)').matches)) {
    render(); const field = document.querySelector('[name="amount"]'); field?.scrollIntoView({ block: 'center', behavior: 'smooth' }); field?.focus();
  } else { s.modal = { type: 'entry', draft: s.draft, dirty: false }; updateForm('dialog'); }
}
async function saveEntry(form) {
  const context = form.dataset.context, draft = currentDraft(context);
  if (!draft || draft.saving) return;
  try {
    if (!draft.pending) {
      const fields = new FormData(form);
      const body = { type: draft.type, amount_minor: parseAmount(fields.get('amount')), category_id: draft.category_id, occurred_on: fields.get('occurred_on'), note: String(fields.get('note') || '').trim() };
      if (!body.occurred_on || body.occurred_on > s.session.today) throw new Error('请选择今天或之前的有效记账日期');
      if (draft.id) body.version = draft.version;
      draft.pending = { key: crypto.randomUUID(), body };
    }
    draft.saving = true; draft.error = ''; draft.conflict = false; if (!draft.id) saveDraft(); updateForm(context);
    const result = await mutate(draft.id ? `/entries/${draft.id}` : '/entries', draft.pending.body, { method: draft.id ? 'PATCH' : 'POST', key: draft.pending.key });
    const wasEdit = Boolean(draft.id);
    if (!wasEdit) { s.draft = { ...baseDraft(), type: draft.type, category_id: draft.category_id, occurred_on: draft.occurred_on }; saveDraft(); }
    else draft.pending = null;
    draft.saving = false;
    if (context === 'dialog') closeDialog(true);
    toast(wasEdit ? '修改已保存，统计已更新' : '记录已保存');
    await load({ quiet: true });
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
function openFilters() {
  const range = s.billRange || periodRange(s.month, 'month', s.session.today);
  s.modal = { type: 'filters' };
  openDialog('筛选账单', `<form class="standard-form" data-form="filters"><label>开始日期<input type="date" name="from" required value="${e(range.from)}" /></label><label>结束日期<input type="date" name="to" required value="${e(range.to)}" /></label><label>分类<select name="category_id"><option value="">全部分类</option>${s.categories.filter(c => !s.filters.type || c.type === s.filters.type).map(c => `<option value="${e(c.id)}" ${s.filters.category_id === c.id ? 'selected' : ''}>${e(c.name)}${c.archived ? '（已停用）' : ''}</option>`).join('')}</select></label><p class="field-error" id="filters-error" role="alert"></p><button class="button primary" type="submit">应用筛选</button></form>`);
}
function openCategories() { s.modal = { type: 'categories' }; openDialog('分类管理', categoryManager(s)); }
function editCategory(id) { s.modal = { type: 'category', category: s.categories.find(c => c.id === id) || null, key: crypto.randomUUID() }; openDialog(id ? '编辑分类' : '添加分类', categoryEditor(s.modal.category || {})); }
async function saveCategory(form) {
  const modal = s.modal; if (modal.busy) return;
  const fields = new FormData(form), previous = modal.category;
  const body = { name: fields.get('name').trim(), type: previous?.type || fields.get('type'), color_key: fields.get('color_key'), icon: fields.get('icon'), sort_order: Number(fields.get('sort_order')), archived: fields.get('archived') === 'on' };
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
  openDialog('备份与恢复', `<p class="dialog-intro">完整备份包含分类、有效账目与回收站。恢复时创建独立候选账本，当前账本会保留。</p><div class="backup-actions"><button class="button secondary" data-action="download-backup">${icon('file')}下载完整 JSON 备份</button><button class="button secondary" data-action="export-all">${icon('download')}导出全部有效账目 CSV</button></div><label class="upload-area">${icon('upload', 29)}<strong>选择备份文件进行检查</strong><span class="muted">MoneyTalk JSON 备份 · 最大 20 MB</span><input type="file" accept="application/json,.json" id="backup-file" /></label><div id="backup-preview"></div>`);
}
async function downloadBackup() {
  try { const data = await request('/backup'); download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), `MoneyTalk-完整备份-${today()}.json`); toast('备份文件已准备，请确认下载完成并妥善保存'); }
  catch (error) { toast(error.message); }
}
function backupSummary(preview) {
  const v = preview.summary;
  return `<div class="backup-summary"><h3>${e(preview.ledger?.name || '备份校验结果')}</h3><dl><dt>有效账目</dt><dd>${v.active} 笔</dd><dt>回收站</dt><dd>${v.deleted} 笔</dd><dt>分类</dt><dd>${v.categories} 个</dd><dt>支出合计</dt><dd>${money(v.expense_minor)}</dd><dt>收入合计</dt><dd>${money(v.income_minor)}</dd><dt>日期范围</dt><dd>${v.from ? `${e(v.from)}<br>至 ${e(v.to)}` : '空账本'}</dd></dl></div>`;
}
async function previewBackup(file) {
  const modal = s.modal, area = document.querySelector('#backup-preview');
  if (!file || modal.type !== 'backup') return;
  const ticket = (modal.previewTicket || 0) + 1; modal.previewTicket = ticket;
  modal.file = null; modal.preview = null; modal.busy = true;
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
  finally { if (modal.previewTicket === ticket) modal.busy = false; }
}
async function startRestore() {
  const modal = s.modal; if (!modal?.file || modal.busy) return;
  modal.busy = true; dialog.dataset.locked = 'true';
  const button = dialog.querySelector('[data-action="start-restore"]'); button.disabled = true;
  const fileInput = document.querySelector('#backup-file'); fileInput.disabled = true;
  const progress = document.querySelector('#restore-progress'), data = modal.file;
  try {
    progress.innerHTML = '<p>正在准备候选账本…</p>';
    const job = await request('/restores', { method: 'POST', body: { fingerprint: modal.preview.fingerprint, ledger: data.ledger, categories: data.categories, entry_count: data.entries.length } });
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

document.addEventListener('click', async event => {
  const route = event.target.closest('[data-route]');
  if (route && !event.metaKey && !event.ctrlKey && !event.shiftKey) { event.preventDefault(); navigate(route.dataset.route); return; }
  const target = event.target.closest('[data-action]'); if (!target || target.disabled) return;
  const { action, value, id, context } = target.dataset;
  try {
    if (action === 'login') { sessionStorage.removeItem('moneytalk:local-logged-out'); location.reload(); }
    else if (action === 'refresh') await load();
    else if (action === 'new-entry') newEntry();
    else if (action === 'entry') await openEntry(id);
    else if (action === 'close-dialog') closeDialog();
    else if (action === 'entry-type') { const d = currentDraft(context); if (!d || d.pending) return; d.type = value; d.category_id = s.categories.find(c => c.type === value && !c.archived)?.id || ''; d.expanded = false; d.error = ''; if (s.modal) s.modal.dirty = true; updateForm(context); }
    else if (action === 'entry-category') { const d = currentDraft(context); if (!d || d.pending) return; d.category_id = id; if (s.modal) s.modal.dirty = true; updateForm(context); }
    else if (action === 'expand-categories') { const d = currentDraft(context); d.expanded = !d.expanded; updateForm(context); }
    else if (action === 'reload-entry') await openEntry(id);
    else if (action === 'delete-entry') await confirmDelete(id);
    else if (action === 'confirm-delete') await performDelete();
    else if (action === 'restore-entry') { target.disabled = true; await restoreEntry(id, target.dataset.version); target.disabled = false; }
    else if (action === 'undo-toast') { const undo = undoAction; undoAction = null; toastElement.classList.remove('show'); if (undo) await undo(); }
    else if (action === 'previous-month' || action === 'next-month') { s.month = shiftMonth(s.month, (action === 'previous-month' ? -1 : 1) * (s.page === 'stats' ? s.period === 'year' ? 12 : s.period === 'quarter' ? 3 : 1 : 1)); s.month = s.month < '1900-01' ? '1900-01' : s.month > '2100-12' ? '2100-12' : s.month; s.offset = 0; s.billRange = null; await load(); }
    else if (action === 'period') { s.period = value; await load(); }
    else if (action === 'chart') { s.chart = value; storage.set('moneytalk:chart', value); render(); }
    else if (action === 'category-bills') categoryBills(id);
    else if (action === 'filters') openFilters();
    else if (action === 'filter-type') { s.filters.type = value; s.offset = 0; if (s.categories.find(c => c.id === s.filters.category_id)?.type !== value) s.filters.category_id = ''; await load(); }
    else if (action === 'clear-filters') { s.filters = { q: '', type: '', category_id: '' }; s.billRange = null; s.offset = 0; await load(); }
    else if (action === 'page-prev' || action === 'page-next') { s.offset = Math.max(0, s.offset + (action === 'page-prev' ? -50 : 50)); await load(); window.scrollTo({ top: 0 }); }
    else if (action === 'backdate') newEntry(target.dataset.date);
    else if (action === 'categories') openCategories();
    else if (action === 'new-category') editCategory();
    else if (action === 'edit-category') editCategory(id);
    else if (action === 'export-all') await exportCsv(false);
    else if (action === 'export-filter') await exportCsv(true);
    else if (action === 'backup') openBackup();
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
  if (s.modal?.type === 'entry') s.modal.dirty = true;
  if (event.target.name === 'amount') event.target.classList.toggle('long-value', event.target.value.length > 10);
  if (event.target.name === 'note') form.querySelector('.char-count').textContent = `${d.note.length}/200`;
  if (!d.id) saveDraft();
});
document.addEventListener('change', async event => {
  if (event.target.dataset.action === 'month') { if (!/^\d{4}-\d{2}$/.test(event.target.value)) return; s.month = event.target.value; s.billRange = null; s.offset = 0; await load(); }
  if (event.target.name === 'occurred_on' && event.target.closest('[data-form="entry"]')) {
    const form = event.target.closest('form'), d = currentDraft(form.dataset.context), label = event.target.closest('.date-control').querySelector('span');
    if (d.occurred_on) label.textContent = `${Number(d.occurred_on.slice(5, 7))}月${Number(d.occurred_on.slice(8))}日`;
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
      s.billRange = { from, to }; s.filters.category_id = f.get('category_id'); s.offset = 0; closeDialog(true); await load();
    }
    if (form.dataset.form === 'display') { const f = new FormData(form); s.chart = f.get('chart'); s.density = f.get('density'); storage.set('moneytalk:chart', s.chart); storage.set('moneytalk:density', s.density); closeDialog(true); render(); toast('显示设置已保存'); }
  } catch (error) { toast(error.message); }
});
dialog.addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
window.addEventListener('popstate', () => { s.page = firstPage(); closeDialog(true); render(); load(); });
window.addEventListener('beforeunload', event => { if (s.modal?.type === 'entry' && s.modal.draft.id && s.modal.dirty) { event.preventDefault(); event.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (!document.hidden && s.session && !dialog.open && !s.draft?.saving && !document.activeElement?.matches('input,textarea')) { s.session.today = today(); load({ quiet: true }); } });
window.addEventListener('online', () => { if (s.error) load(); });
init();
