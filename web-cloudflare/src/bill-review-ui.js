import { reviewFiles, reviewBills, parseBillText } from '../shared/bill-review.js';
import { DEMO_ALIPAY, DEMO_WECHAT } from '../shared/bill-demo.js';
import { money, DEFAULT_CATEGORIES } from '../shared/format.js';
import { escape as e } from './ui.js';
import { download } from './api.js';

const kindNames = { expense: '消费', income: '收入候选', refund: '退款证据', repayment_unknown: '还款待拆分', transfer: '资金移动待核对', unknown: '用途待核对', fee: '费用' };
export function reviewSummary(report) {
  const t = report.totals;
  const displayMoney = value => report.issues.length && !report.events.length ? "未取得" : money(value);
  return `<p class="review-notice"><strong>${report.demo ? '虚构演示 · ' : ''}仅完成文件核对，尚未保存到账本。</strong>金额只汇总当前可识别候选，未包含待核对项；不能当作完整历史支出。</p><div class="review-metrics"><div><span>候选消费</span><strong>${displayMoney(t.expense_minor)}</strong></div><div><span>候选收入</span><strong>${displayMoney(t.income_minor)}</strong></div><div><span>退款证据，待关联</span><strong>${displayMoney(t.refund_evidence_minor)}</strong></div><div><span>还款金额，本金／费用未拆清</span><strong>${displayMoney(t.repayment_unresolved_minor)}</strong></div></div><p class="dialog-intro">${t.candidate_count} 笔候选 · ${t.review_count} 笔待核对 · ${report.issues.length} 项文件异常 · ${report.duplicates.length} 行重复证据 · ${report.excluded.length} 行未计入<br>未访问支付账号或邮箱，文件仅在当前浏览器内存处理；关闭后清除。下载报告也含私人消费，请妥善保存。</p><h3>来源与观察范围</h3><div class="review-sources">${report.sources.map(source => `<div><strong>${e(source.name)}</strong><span>${source.observed_count ? `${e(source.observed_from)} 至 ${e(source.observed_to)} · ${source.observed_count} 笔证据` : '尚未取得可识别的原始消费明细'}</span>${source.observed_count ? `<small>${e(source.note)}</small>` : ""}</div>`).join('')}</div>${report.issues.length ? `<h3>文件异常</h3><ul class="backup-errors">${report.issues.slice(0, 30).map(i => `<li>${e(i.file)}${i.line ? ` · 第 ${i.line} 行` : ''}：${e(i.message)}</li>`).join('')}</ul>${report.issues.length > 30 ? '<p class="muted">仅展示前 30 项，完整清单包含在报告中。</p>' : ''}` : ''}<h3>记录核对</h3>`;
}
export function reviewRows(events) {
  return events.map(event => `<article class="review-event"><div><strong>${e(event.description || event.merchant || '未提供描述')}</strong><span class="money">${money(event.amount_minor)}</span></div><p>${e(event.occurred_on)} · ${e(kindNames[event.kind])} · ${e(event.merchant)}<br>${e(event.file)} · 第 ${event.line} 行</p>${event.review_reasons.length ? `<ul>${event.review_reasons.map(reason => `<li>${e(reason)}</li>`).join('')}</ul>` : `<small>分类建议：${e(DEFAULT_CATEGORIES.find(c => c.id === event.category_id)?.name || '待分类')} · ${e(event.basis)}</small>`}</article>`).join('');
}
export function mountBillReview(container) {
  let report = null, page = 0, onlyReview = false, disposed = false, ticket = 0, selectedFiles = [], controller = null;
  container.innerHTML = `<p class="dialog-intro">先核对历史文件，再决定怎样入账。当前支持支付宝手机 CSV、微信 CSV 及包含 CSV 的 ZIP；白条和两种月付原始格式仍待验证，不能用还款记录替代消费。</p><details id="review-file-details" open><summary>选择或更换原始账单</summary><label class="review-account">本批来源账户标记<input id="review-account" value="本人主账号" maxlength="80" /><small>同平台不同账号请分批核对，不填写密码或身份证。</small></label><label class="upload-area"><strong>一次选择多份原始账单</strong><span class="muted">每份 4 MB，解压后单批 20 MB／40 份；Excel 暂未适配</span><input id="bill-review-files" type="file" multiple accept=".csv,.zip,.xlsx,.xls,.pdf" /></label><div id="review-passwords"></div><button class="button secondary" data-review-action="start" hidden>开始核对所选文件</button></details><div class="backup-actions"><button class="button secondary" data-review-action="demo">查看虚构演示</button><button class="button secondary" data-review-action="clear">清除本次核对</button></div><p id="bill-review-status" role="status" aria-live="polite"></p><div id="bill-review-report"></div>`;
  const area = container.querySelector('#bill-review-report'), status = container.querySelector('#bill-review-status'), filesInput = container.querySelector('#bill-review-files');
  function renderReport() {
    if (!report || disposed) return;
    const events = report.events.filter(event => !onlyReview || event.review_reasons.length);
    page = Math.max(0, Math.min(page, Math.ceil(events.length / 30) - 1));
    const selected = events.slice(page * 30, page * 30 + 30);
    area.innerHTML = `${reviewSummary(report)}<div class="review-toolbar"><label><input type="checkbox" id="review-only-issues" ${onlyReview ? 'checked' : ''} />仅看待核对记录</label><button class="button secondary" data-review-action="download">下载完整核对报告</button></div>${selected.length ? reviewRows(selected) : '<p class="muted">当前没有符合筛选条件的记录，文件异常请看上方清单。</p>'}<div class="pagination"><button class="button secondary" data-review-action="prev" ${page === 0 ? 'disabled' : ''}>上一页</button><span>${events.length ? page + 1 : 0} / ${Math.ceil(events.length / 30)} · ${events.length} 笔</span><button class="button secondary" data-review-action="next" ${(page + 1) * 30 >= events.length ? 'disabled' : ''}>下一页</button></div>`;
  }
  async function onFiles(event) {
    if (event.target !== filesInput) return;
    selectedFiles = [...filesInput.files];
    if (!selectedFiles.length) return;
    controller?.abort(); ticket++; report = null; area.replaceChildren();
    const archives = selectedFiles.map((file, index) => ({ file, index })).filter(({ file }) => /\.zip$/i.test(file.name));
    container.querySelector('#review-passwords').innerHTML = archives.map(({ file, index }) => `<label class="review-account">${e(file.name)} 的 ZIP 解压码<input type="password" data-zip-index="${index}" autocomplete="off" maxlength="128" /><small>只填文件解压码，不填支付密码；未加密时可留空。不会上传或保存。</small></label>`).join('');
    container.querySelector('[data-review-action="start"]').hidden = false;
    if (archives.length) { status.textContent = '文件已选择。填写各份 ZIP 的解压码后点击开始核对；无需自行解压。'; return; }
    await processSelected();
  }
  async function processSelected() {
    const files = selectedFiles;
    if (!files.length || disposed) return;
    const run = ++ticket;
    controller?.abort(); controller = new AbortController();
    report = null; area.replaceChildren(); page = 0;
    status.textContent = '正在当前浏览器中核对，尚未上传或写入…';
    filesInput.disabled = true; container.setAttribute('aria-busy', 'true');
    container.querySelector('[data-review-action="start"]').disabled = true;
    const passwords = new Map([...container.querySelectorAll('[data-zip-index]')].map(input => [Number(input.dataset.zipIndex), input.value]));
    try {
      const result = await reviewFiles(files, { account: container.querySelector('#review-account').value, passwordForFile: (_name, index) => passwords.get(index) || '', signal: controller.signal });
      if (disposed || ticket !== run) return;
      report = result; renderReport(); container.querySelector('#review-file-details').open = !result.events.length;
      status.textContent = result.issues.length ? '核对结束，存在文件异常；请查看清单。尚未写入账本。' : '文件核对结束，来源完整性仍待验证；尚未写入账本。';
    } catch (error) { if (!disposed && run === ticket) status.textContent = error.message; }
    finally {
      passwords.clear();
      if (!disposed && run === ticket) {
        filesInput.disabled = false; filesInput.value = ''; container.removeAttribute('aria-busy');
        container.querySelector('[data-review-action="start"]').disabled = false;
        container.querySelectorAll('[data-zip-index]').forEach(input => { input.value = ''; });
      }
    }
  }
  function onClick(event) {
    const button = event.target.closest('[data-review-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.reviewAction;
    if (action === 'start') { processSelected(); return; }
    if (action === 'clear') { controller?.abort(); ticket++; report = null; selectedFiles = []; container.querySelector('#review-file-details').open = true; area.replaceChildren(); container.querySelector('#review-passwords').replaceChildren(); container.querySelector('[data-review-action="start"]').hidden = true; container.querySelector('[data-review-action="start"]').disabled = false; status.textContent = '本次核对已清除，原始文件和账本不受影响。'; filesInput.value = ''; filesInput.disabled = false; container.removeAttribute('aria-busy'); }
    if (action === 'demo') {
      controller?.abort(); ticket++; filesInput.disabled = false; selectedFiles = []; container.querySelector('#review-passwords').replaceChildren(); container.querySelector('[data-review-action="start"]').hidden = true; container.querySelector('[data-review-action="start"]').disabled = false; container.removeAttribute('aria-busy');
      report = { ...reviewBills([parseBillText(DEMO_ALIPAY, { file: '虚构支付宝.csv', currentDay: '2026-10-02' }), parseBillText(DEMO_WECHAT, { file: '虚构微信.csv', currentDay: '2026-10-02' })]), demo: true };
      page = 0; onlyReview = false; renderReport(); container.querySelector('#review-file-details').open = false; status.textContent = '虚构演示，不是真实消费，也不会写入账本。';
    }
    if (action === 'download' && report) download(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }), `${report.demo ? '虚构演示' : 'MoneyTalk'}-历史核对报告.json`);
    if (action === 'prev' || action === 'next') { page += action === 'prev' ? -1 : 1; renderReport(); }
  }
  function onFilter(event) { if (event.target.id === 'review-only-issues') { onlyReview = event.target.checked; page = 0; renderReport(); } }
  container.addEventListener('change', onFiles); container.addEventListener('change', onFilter); container.addEventListener('click', onClick);
  return () => { disposed = true; controller?.abort(); ticket++; report = null; selectedFiles = []; container.removeEventListener('change', onFiles); container.removeEventListener('change', onFilter); container.removeEventListener('click', onClick); container.replaceChildren(); };
}
