import { useMemo, useRef, useState } from 'preact/hooks';
import { Icon, ownerColor } from '../components/Icons.jsx';
import { Modal } from '../components/Modal.jsx';
import { useApp } from '../state/appContext.jsx';
import { mutate, request } from '../api.js';
import { subscriptionItem, subscriptionRows } from '../../shared/subscriptions.js';
import { PLATFORMS, sourceTitle } from '../../shared/platform-sources.js';
import { SPENDING_LABELS } from '../../shared/spending-labels.js';
import { money, today } from '../../shared/format.js';

export function SubscriptionsPage() {
  const {
    session,
    categories,
    owners,
    textSummary,
    setPendingBatchId,
    draftBaseKey,
    navigate,
    toast,
    fetchData,
  } = useApp();

  const refToday = session?.today || today();
  const refMonth = refToday.slice(0, 7);
  const pendingStorageKey = `moneytalk:pending-module:${draftBaseKey}:subscription`;

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState('form'); // 'form' | 'review'
  const [form, setForm] = useState(null);
  const [plan, setPlan] = useState(null);
  const [compiledItem, setCompiledItem] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const pendingKeyRef = useRef(crypto.randomUUID());
  const ownerTouchedRef = useRef(false);

  const rows = useMemo(() => {
    if (!textSummary?.batches) return null;
    return subscriptionRows(textSummary.batches, refToday);
  }, [textSummary?.batches, refToday]);

  const ownerMap = useMemo(() => new Map(owners.map(o => [o.id, o])), [owners]);
  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const sourcesList = useMemo(() => {
    const existing = (textSummary?.platforms || []).map(g => g.source);
    return [...new Set([...PLATFORMS, ...existing])];
  }, [textSummary?.platforms]);

  function openNewSubscriptionModal() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingStorageKey) || 'null');
      if (saved?.key && saved?.compiledItem && saved?.plan) {
        setForm(saved.form || null);
        setCompiledItem(saved.compiledItem);
        setPlan(saved.plan);
        pendingKeyRef.current = saved.key;
        setStep('review');
        setUncertain(true);
        setError('上次保存结果尚未核实，请点击下方「重试确认」继续。');
        setModalOpen(true);
        return;
      }
    } catch {
      /* ignore corrupt optional cache */
    }
    const defaultCat = categories.find(c => c.type === 'expense' && !c.archived)?.id || '';
    const catObj = categories.find(c => c.id === defaultCat);
    setForm({
      title: '',
      source: '其他订阅软件',
      cycle: 'monthly',
      amount: '30.00', // Real pre-filled default amount per AGENTS.md rule
      category: defaultCat,
      subcategory: '',
      owner_id: catObj?.default_owner_id || '',
      start: refMonth,
      status: 'ongoing',
      end: refMonth,
    });
    ownerTouchedRef.current = false;
    setPlan(null);
    setCompiledItem(null);
    setStep('form');
    setError('');
    setUncertain(false);
    pendingKeyRef.current = crypto.randomUUID();
    setModalOpen(true);
  }

  async function handleLabelPick(row, labelKey) {
    if (busy) return;
    setBusy(true);
    try {
      const nextVal = row.spending_label === labelKey ? null : labelKey;
      await mutate(
        `/text-batches/${row.batch_id}/spending-label`,
        { version: row.version, item_id: row.id, spending_label: nextVal },
        { method: 'PATCH' }
      );
      await fetchData({ quiet: true });
      toast(nextVal ? `已标记为「${SPENDING_LABELS[nextVal]}」` : '已清除支出标记');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusToggle(row) {
    if (busy) return;
    setBusy(true);
    try {
      const nextStatus = row.paused ? 'active' : 'paused';
      await mutate(`/text-batches/${row.batch_id}/status`, {
        version: row.version,
        status: nextStatus,
      });
      await fetchData({ quiet: true });
      toast(nextStatus === 'paused' ? '订阅已暂停，已记账目保留' : '订阅已恢复');
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePreviewSubmit(e) {
    e.preventDefault();
    if (busy || !form) return;
    setBusy(true);
    setError('');
    try {
      const item = subscriptionItem(form);
      if (!item.category_id) throw new Error('请选择分类');
      const body = { original_text: item.raw, items: [item] };
      const preview = await request('/subscriptions/preview', { method: 'POST', body });
      setCompiledItem(item);
      setPlan(preview);
      setStep('review');
      setUncertain(false);
      pendingKeyRef.current = crypto.randomUUID();
    } catch (err) {
      setError(
        err.code === 'NETWORK' ? '连接中断，输入已保留。请点击下一步重试。' : err.message
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmSubscription() {
    if (busy || !plan || !compiledItem) return;
    setBusy(true);
    setError('');
    const body = {
      original_text: compiledItem.raw,
      items: [compiledItem],
      preview_hash: plan.preview_hash,
      acknowledge_duplicates: plan.overlap_months.length > 0,
    };
    try {
      sessionStorage.setItem(
        pendingStorageKey,
        JSON.stringify({ key: pendingKeyRef.current, form, compiledItem, plan })
      );
    } catch {
      /* optional retry recovery */
    }
    try {
      const res = await mutate('/subscriptions/confirm', body, {
        key: pendingKeyRef.current,
      });
      sessionStorage.removeItem(pendingStorageKey);
      setModalOpen(false);
      await fetchData({ quiet: true });
      toast(`已入账 ${res.count} 笔 · ${money(res.expense_minor)}`);
    } catch (err) {
      const isUncertain =
        err.code === 'NETWORK' || err.status >= 500 || err.code === 'LOGIN_REQUIRED';
      setUncertain(isUncertain);
      if (!isUncertain) {
        sessionStorage.removeItem(pendingStorageKey);
        pendingKeyRef.current = crypto.randomUUID();
      }
      if (['PREVIEW_CHANGED', 'VERSION_CONFLICT'].includes(err.code)) {
        try {
          const fresh = await request('/subscriptions/preview', {
            method: 'POST',
            body: { original_text: compiledItem.raw, items: [compiledItem] },
          });
          setPlan(fresh);
          setError('账本或扣费月份已变化，请重新核对后确认。');
        } catch (refreshErr) {
          setError(refreshErr.message);
        }
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!rows) {
    return (
      <div class="card" role="status">
        正在读取订阅…
      </div>
    );
  }

  const activeExpenseCats = categories.filter(c => c.type === 'expense' && !c.archived);
  const selectedCatObj = categories.find(c => c.id === form?.category);
  const activeOwners = owners.filter(o => !o.archived);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <section class="card">
        <div class="card-heading">
          <h2>
            我的订阅 <small>{rows.length} 项</small>
          </h2>
          <button
            type="button"
            class="button primary"
            data-action="subscription-new"
            onClick={openNewSubscriptionModal}
          >
            <Icon name="plus" size={16} />
            记录订阅
          </button>
        </div>

        {rows.length ? (
          <div class="subscription-grid">
            {rows.map(row => {
              const cat = row.category_id ? catMap.get(row.category_id) : null;
              const owner = row.owner_id ? ownerMap.get(row.owner_id) : null;
              return (
                <article key={`${row.batch_id}-${row.id}`} class="bar-row" style={{ gap: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '15.5px' }}>{row.title}</strong>
                    <span class={`status-pill ${row.paused ? 'paused' : row.due ? 'pending' : 'saved'}`}>
                      {row.status}
                    </span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div class="tabular">
                      <strong style={{ fontSize: '20px' }}>
                        {row.amount_minor ? money(row.amount_minor) : '金额待补'}
                      </strong>
                      <small class="muted">
                        {' '}/ {row.cycle === 'monthly' ? '月' : row.cycle === 'yearly' ? '年' : row.cycle === 'quarterly' ? '季' : '周期待确认'}
                      </small>
                    </div>
                    <div class="tabular" style={{ textAlign: 'right', fontSize: '12.5px' }}>
                      <span class="muted">已记支出 </span>
                      <strong>
                        {row.recorded_expense_minor === null ? '暂不可用' : money(row.recorded_expense_minor)}
                      </strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {cat && (
                      <span class="cat-pill">
                        {cat.name}
                        {row.subcategory ? ` · ${row.subcategory}` : ''}
                      </span>
                    )}
                    {owner && (
                      <span class="owner-pill-sm has-owner">
                        <span class="color-dot" style={{ '--dot-color': ownerColor(owner) }} />
                        <span>@{owner.name}</span>
                      </span>
                    )}
                  </div>

                  {/* Spending Label Color Picks */}
                  <div class="spending-picks" role="group" aria-label={`为${row.title}选择支出标记`}>
                    {Object.entries(SPENDING_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        class={`spending-pick spending-${key}`}
                        data-action="subscription-label"
                        aria-label={label}
                        aria-pressed={row.spending_label === key}
                        title={label}
                        disabled={busy}
                        onClick={() => handleLabelPick(row, key)}
                      >
                        {row.spending_label === key ? '✓' : ''}
                      </button>
                    ))}
                    <span class="muted" style={{ fontSize: '12px' }}>
                      {SPENDING_LABELS[row.spending_label] || '支出标记'}
                    </span>
                  </div>

                  <div class="muted" style={{ fontSize: '12.5px' }}>
                    {row.start || '起始月待补'} →{' '}
                    {row.end ||
                      (row.ongoing
                        ? row.auto_record
                          ? '持续订阅 · 自动记账'
                          : '持续订阅'
                        : '截止月待补')}
                  </div>

                  <div class="muted" style={{ fontSize: '12px' }}>
                    {row.source} · 已记 {row.confirmed} 笔
                    {row.due > 0 ? ` · ${row.due} 笔待核对` : ''}
                    {row.deleted > 0 ? ` · ${row.deleted} 笔已删除` : ''}
                  </div>

                  {row.missing.length > 0 && (
                    <p class="field-error" style={{ margin: 0, fontSize: '12px' }}>
                      {row.missing.join('；')}
                    </p>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '6px' }}>
                    <button
                      type="button"
                      class="button secondary"
                      style={{ minHeight: '34px', padding: '5px 12px', fontSize: '12.5px' }}
                      data-action="subscription-open-batch"
                      onClick={() => {
                        setPendingBatchId(row.batch_id);
                        navigate('record');
                      }}
                    >
                      {row.due ? '继续核对' : '查看或调整'}
                    </button>
                    {row.single_rule && (
                      <button
                        type="button"
                        class="text-button"
                        data-action="subscription-status"
                        disabled={busy}
                        onClick={() => handleStatusToggle(row)}
                      >
                        {row.paused ? '恢复订阅' : '暂停订阅'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 16px' }}>
            <Icon name="calendar" size={34} />
            <h3>把固定扣费放在一起</h3>
            <p class="muted">每月、每年的订阅默认 30 元可改，也能补记前几年的记录。</p>
            <button
              type="button"
              class="button secondary"
              data-action="subscription-empty-text"
              onClick={() => navigate('record')}
            >
              用文字记录订阅
            </button>
          </div>
        )}
      </section>

      <Modal
        open={modalOpen}
        title={step === 'review' ? '确认订阅' : '记录订阅'}
        locked={busy}
        dirty={step === 'form' && Boolean(form?.title?.trim())}
        uncertain={uncertain}
        onBlockedNotice={msg => toast(msg)}
        onClose={() => setModalOpen(false)}
      >
        {step === 'form' && form && (
          <form data-form="subscription" class="standard-form" onSubmit={handlePreviewSubmit}>
            <label>
              订阅名称
              <input
                name="title"
                required
                maxLength={64}
                placeholder="例如：星穹铁道月卡"
                value={form.title}
                onInput={e => setForm(f => ({ ...f, title: e.currentTarget.value }))}
              />
            </label>

            <div class="review-grid">
              <label>
                消费对象
                <select
                  name="source"
                  value={form.source}
                  onChange={e => setForm(f => ({ ...f, source: e.currentTarget.value }))}
                >
                  {sourcesList.map(name => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                扣费周期
                <select
                  name="cycle"
                  value={form.cycle}
                  onChange={e => setForm(f => ({ ...f, cycle: e.currentTarget.value }))}
                >
                  <option value="monthly">每月</option>
                  <option value="yearly">每年</option>
                </select>
              </label>
            </div>

            <div class="review-grid">
              <label>
                每次金额（元）
                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  value={form.amount}
                  onInput={e => setForm(f => ({ ...f, amount: e.currentTarget.value }))}
                />
              </label>

              <label>
                大类
                <select
                  name="category"
                  required
                  value={form.category}
                  onChange={e => {
                    const nextCatId = e.currentTarget.value;
                    const catObj = categories.find(c => c.id === nextCatId);
                    setForm(f => ({
                      ...f,
                      category: nextCatId,
                      subcategory: catObj?.subcategories?.includes(f.subcategory) ? f.subcategory : '',
                      owner_id: !ownerTouchedRef.current ? catObj?.default_owner_id || '' : f.owner_id,
                    }));
                  }}
                >
                  <option value="">请选择</option>
                  {activeExpenseCats.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div class="review-grid">
              {(selectedCatObj?.subcategories?.length || 0) > 0 && (
                <label>
                  二级子类（选填）
                  <select
                    name="subcategory"
                    value={form.subcategory}
                    onChange={e => setForm(f => ({ ...f, subcategory: e.currentTarget.value }))}
                  >
                    <option value="">仅记大类</option>
                    {selectedCatObj.subcategories.map(sub => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label>
                @归属人（选填）
                <select
                  name="owner_id"
                  value={form.owner_id}
                  onChange={e => {
                    ownerTouchedRef.current = true;
                    setForm(f => ({ ...f, owner_id: e.currentTarget.value }));
                  }}
                >
                  <option value="">未指定</option>
                  {activeOwners.map(o => (
                    <option key={o.id} value={o.id}>
                      @{o.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div class="review-grid">
              <label>
                起始月份
                <input
                  name="start"
                  type="month"
                  min="1900-01"
                  max={refMonth}
                  required
                  value={form.start}
                  onInput={e => setForm(f => ({ ...f, start: e.currentTarget.value }))}
                />
              </label>

              <label>
                订阅状态
                <select
                  name="status"
                  value={form.status}
                  onChange={e => setForm(f => ({ ...f, status: e.currentTarget.value }))}
                >
                  <option value="ongoing">仍在订阅 · 每期自动记账</option>
                  <option value="stopped">已经停止</option>
                </select>
              </label>
            </div>

            {form.status === 'stopped' && (
              <label>
                最后扣费月份
                <input
                  name="end"
                  type="month"
                  min="1900-01"
                  max={refMonth}
                  required
                  value={form.end}
                  onInput={e => setForm(f => ({ ...f, end: e.currentTarget.value }))}
                />
              </label>
            )}

            <p class="muted" style={{ margin: 0, fontSize: '12px' }}>
              首次确认会补记到本月，以后每期自动记账，停止时可暂停；未来月份不提前入账。
            </p>

            {error && <p class="field-error" role="alert">{error}</p>}

            <div class="dialog-footer">
              <button
                type="button"
                class="button secondary"
                data-action="close-dialog"
                onClick={() => setModalOpen(false)}
              >
                取消
              </button>
              <button type="submit" class="button primary" data-action="subscription-next" disabled={busy}>
                {busy ? '生成预览…' : '下一步'}
              </button>
            </div>
          </form>
        )}

        {step === 'review' && plan && compiledItem && (
          <div class="standard-form">
            <div class="bar-row">
              <strong>{sourceTitle(compiledItem.title)}</strong>
              <span class="muted">
                每{compiledItem.cycle === 'monthly' ? '月' : '年'} {money(compiledItem.amount_minor)} ·{' '}
                {catMap.get(compiledItem.category_id)?.name || '支出'}
                {compiledItem.subcategory ? ` / ${compiledItem.subcategory}` : ''}
                {compiledItem.owner_id ? ` · @${ownerMap.get(compiledItem.owner_id)?.name || compiledItem.owner_id}` : ''}
              </span>
              <span class="muted">
                {plan.from === plan.to ? plan.from : `${plan.from} 至 ${plan.to}`} · {plan.count} 笔
              </span>
              <strong class="tabular">合计 {money(plan.expense_minor)}</strong>
            </div>

            {compiledItem.ongoing && (
              <p class="muted" style={{ margin: 0, fontSize: '13px' }}>
                确认后，以后每期自动记账。
              </p>
            )}

            {plan.overlap_months.length > 0 && (
              <p class="field-error" style={{ margin: 0 }}>
                这些月份已有同名账目：{plan.overlap_months.join('、')}。如果是同一笔，请返回修改。
              </p>
            )}

            {error && <p class="field-error" role="alert">{error}</p>}

            <div class="dialog-footer">
              <button
                type="button"
                class="button secondary"
                data-action="subscription-back"
                disabled={busy || uncertain}
                onClick={() => {
                  setStep('form');
                  setError('');
                }}
              >
                返回修改
              </button>
              <button
                type="button"
                class="button confirm"
                data-action="subscription-confirm"
                disabled={busy}
                onClick={handleConfirmSubscription}
              >
                {busy
                  ? '正在确认…'
                  : uncertain
                    ? '重试确认'
                    : plan.overlap_months.length > 0
                      ? `确认另记 ${plan.count} 笔`
                      : `确认 ${plan.count} 笔`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
