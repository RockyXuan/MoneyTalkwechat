import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Modal } from './Modal.jsx';
import { Icon, categoryColor, ownerColor } from './Icons.jsx';
import { useApp } from '../state/appContext.jsx';
import { mutate, request } from '../api.js';
import { decimal, money, parseAmount, recordDateLabel, validRecordDate, today } from '../../shared/format.js';

export function EntryModal() {
  const {
    entryModal,
    setEntryModal,
    categories,
    owners,
    session,
    toast,
    fetchData,
    setReceipt,
  } = useApp();

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hasPendingRetry, setHasPendingRetry] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const pendingOpRef = useRef(null);
  const initialSnapshotRef = useRef('');
  const ownerManuallyPickedRef = useRef(false);

  const refToday = session?.today || today();

  useEffect(() => {
    if (!entryModal?.draft) {
      setForm(null);
      setError('');
      setConflict(false);
      setDeleteConfirm(false);
      setHasPendingRetry(false);
      pendingOpRef.current = null;
      return;
    }
    const d = entryModal.draft;
    const init = {
      id: d.id || null,
      version: d.version || 1,
      type: d.type || 'expense',
      amount: d.amount !== undefined ? String(d.amount) : d.amount_minor ? decimal(d.amount_minor) : '',
      category_id: d.category_id || '',
      subcategory: d.subcategory ?? null,
      owner_id: d.owner_id ?? null,
      occurred_on: d.occurred_on || refToday.slice(0, 7),
      date_precision: d.date_precision || (d.occurred_on?.length === 10 ? 'day' : 'month'),
      note: d.note || '',
      isCopy: Boolean(d.isCopy),
      category_name: d.category_name || '',
      amount_minor: d.amount_minor || 0,
    };
    setForm(init);
    initialSnapshotRef.current = JSON.stringify({
      type: init.type,
      amount: init.amount,
      category_id: init.category_id,
      subcategory: init.subcategory,
      owner_id: init.owner_id,
      occurred_on: init.occurred_on,
      date_precision: init.date_precision,
      note: init.note.trim(),
    });
    ownerManuallyPickedRef.current = Boolean(init.id || init.owner_id);
    setError('');
    setConflict(false);
    setDeleteConfirm(false);
    setHasPendingRetry(false);
    pendingOpRef.current = null;
  }, [entryModal, refToday]);

  const isDirty = useMemo(() => {
    if (!form || entryModal?.isDeleted || deleteConfirm) return false;
    const current = JSON.stringify({
      type: form.type,
      amount: form.amount,
      category_id: form.category_id,
      subcategory: form.subcategory,
      owner_id: form.owner_id,
      occurred_on: form.occurred_on,
      date_precision: form.date_precision,
      note: form.note.trim(),
    });
    return current !== initialSnapshotRef.current;
  }, [form, entryModal, deleteConfirm]);

  const activeForm = entryModal && form ? form : null;

  const field = entryModal?.field || '';
  const visibleCats = activeForm
    ? categories.filter(c => c.type === activeForm.type && (!c.archived || c.id === activeForm.category_id))
    : [];
  const activeCat = activeForm ? categories.find(c => c.id === activeForm.category_id) : null;
  const subList = activeCat?.subcategories || [];
  const activeOwners = activeForm ? owners.filter(o => !o.archived || o.id === activeForm.owner_id) : [];

  function updateField(patch) {
    setForm(prev => (prev ? { ...prev, ...patch } : prev));
    setError('');
    setConflict(false);
    setHasPendingRetry(false);
    pendingOpRef.current = null;
  }

  function changePrecision(nextPrecision) {
    if (!form) return;
    const nextDate =
      nextPrecision === 'month'
        ? (form.occurred_on || refToday).slice(0, 7)
        : form.occurred_on?.length === 10
          ? form.occurred_on
          : '';
    updateField({ date_precision: nextPrecision, occurred_on: nextDate });
  }

  function pickCategory(catId) {
    const targetCat = categories.find(c => c.id === catId);
    const keepSub =
      targetCat?.subcategories?.includes(form.subcategory) ? form.subcategory : null;
    const nextOwner =
      !form.id && !ownerManuallyPickedRef.current && targetCat?.default_owner_id
        ? targetCat.default_owner_id
        : form.owner_id;
    updateField({
      category_id: catId,
      subcategory: keepSub,
      owner_id: nextOwner,
    });
  }

  async function handleSave(event) {
    event?.preventDefault();
    if (saving) return;
    try {
      const amount_minor = parseAmount(form.amount);
      if (!form.category_id) throw new Error('请选择分类');
      if (!validRecordDate(form.occurred_on) || form.occurred_on > refToday) {
        throw new Error('请选择今天或之前的有效记账日期');
      }
      const body = {
        type: form.type,
        amount_minor,
        category_id: form.category_id,
        subcategory: form.subcategory ?? null,
        owner_id: form.owner_id ?? null,
        occurred_on: form.occurred_on,
        note: form.note.trim(),
        ...(form.id ? { version: form.version } : {}),
      };
      const op = pendingOpRef.current || {
        key: crypto.randomUUID(),
        body,
        path: form.id ? `/entries/${form.id}` : '/entries',
        method: form.id ? 'PATCH' : 'POST',
      };
      pendingOpRef.current = op;
      setSaving(true);
      setError('');
      const res = await mutate(op.path, op.body, { method: op.method, key: op.key });
      pendingOpRef.current = null;
      setHasPendingRetry(false);
      setSaving(false);
      setEntryModal(null);
      if (!form.id) {
        setReceipt({
          count: 1,
          expense_minor: form.type === 'expense' ? res.entry.amount_minor : 0,
          income_minor: form.type === 'income' ? res.entry.amount_minor : 0,
          from: res.entry.occurred_on,
          to: res.entry.occurred_on,
        });
      }
      toast(
        form.id
          ? `修改已保存到${session?.local ? '本地' : '云端'}`
          : `${money(res.entry.amount_minor)} 已入账 · ${res.entry.occurred_on}`
      );
      await fetchData({ quiet: true });
    } catch (err) {
      setSaving(false);
      setError(err.message || '保存失败');
      if (err.code !== 'NETWORK' && !(err.status >= 500)) {
        pendingOpRef.current = null;
        setHasPendingRetry(false);
      } else {
        setHasPendingRetry(true);
      }
      setConflict(err.code === 'VERSION_CONFLICT');
    }
  }

  async function handleReloadLatest() {
    if (!form?.id) return;
    try {
      const { entry } = await request(`/entries/${form.id}`);
      setEntryModal({
        field,
        isDeleted: Boolean(entry.deleted_at),
        draft: { ...entry, amount: decimal(entry.amount_minor) },
      });
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDuplicate() {
    if (!form?.id || saving) return;
    const cat = categories.find(c => c.id === form.category_id && !c.archived);
    setEntryModal({
      field: '',
      isDeleted: false,
      draft: {
        id: null,
        type: form.type,
        amount: form.amount,
        category_id: cat?.id || '',
        subcategory: cat ? form.subcategory : null,
        owner_id: form.owner_id,
        occurred_on: refToday.slice(0, 7),
        date_precision: 'month',
        note: form.note,
        isCopy: true,
      },
    });
  }

  async function handleConfirmDelete() {
    if (!form?.id || saving) return;
    setSaving(true);
    setError('');
    try {
      const ledgerId = session?.ledger?.id;
      const deletedId = form.id;
      const result = await mutate(`/entries/${deletedId}/delete`, { version: form.version });
      setSaving(false);
      setEntryModal(null);
      await fetchData({ quiet: true });
      toast('记录已移入回收站', async () => {
        if (session?.ledger?.id !== ledgerId) {
          toast('请先切回原账本，再恢复这条记录');
          return;
        }
        await mutate(`/entries/${deletedId}/restore`, { version: result.version });
        await fetchData({ quiet: true });
        toast('记录已恢复');
      });
    } catch (err) {
      setSaving(false);
      setError(err.message);
    }
  }

  async function handleRestoreDeleted() {
    if (!form?.id || saving) return;
    setSaving(true);
    try {
      await mutate(`/entries/${form.id}/restore`, { version: form.version });
      setSaving(false);
      setEntryModal(null);
      toast('记录已恢复');
      await fetchData({ quiet: true });
    } catch (err) {
      setSaving(false);
      setError(err.message);
    }
  }

  const fieldTitleMap = {
    occurred_on: '修改日期',
    note: '修改备注',
    category_id: '修改分类',
    owner_id: '修改归属人',
    amount: '修改金额',
  };
  const modalTitle = !activeForm
    ? ''
    : entryModal.isDeleted
      ? '已删除的记录'
      : deleteConfirm
        ? '删除这条记录？'
        : field
          ? fieldTitleMap[field] || '修改记录'
          : activeForm.id
            ? '账单详情'
            : activeForm.isCopy
              ? '再记一笔'
              : '记一笔';

  return (
    <Modal
      open={Boolean(activeForm)}
      title={modalTitle}
      wide={Boolean(activeForm && !deleteConfirm && !entryModal?.isDeleted)}
      locked={saving}
      dirty={isDirty}
      uncertain={Boolean(pendingOpRef.current && error)}
      uncertainMessage="保存结果尚未核实，请先重试确认"
      onBlockedNotice={msg => toast(msg)}
      onClose={() => setEntryModal(null)}
    >
      {!activeForm ? null : entryModal.isDeleted ? (
        <div class="standard-form">
          <div class="bar-row">
            <strong>{form.note || form.category_name}</strong>
            <span class="muted">
              {recordDateLabel(form.occurred_on)} · {form.category_name} ·{' '}
              {money(form.amount_minor)}
            </span>
          </div>
          {error && <p class="field-error">{error}</p>}
          <button
            type="button"
            class="button primary"
            data-action="restore-entry"
            disabled={saving}
            onClick={handleRestoreDeleted}
          >
            恢复记录
          </button>
          <p class="muted" style={{ fontSize: '12.5px', margin: 0 }}>
            恢复后重新计入对应日期的收支。
          </p>
        </div>
      ) : deleteConfirm ? (
        <div class="standard-form">
          <p class="muted" style={{ margin: 0 }}>
            记录会移入回收站，之后仍可恢复。
          </p>
          <div class="bar-row">
            <strong>{form.note || form.category_name || '未填备注'}</strong>
            <span class="muted">
              {recordDateLabel(form.occurred_on)} ·{' '}
              {form.type === 'expense' ? '−' : '+'}
              {money(form.amount_minor || Math.round(Number(form.amount || 0) * 100))}
            </span>
          </div>
          {error && <p class="field-error">{error}</p>}
          <div class="dialog-footer">
            <button
              type="button"
              class="button secondary"
              data-action="cancel-delete"
              onClick={() => setDeleteConfirm(false)}
            >
              取消
            </button>
            <button
              type="button"
              class="button danger-button"
              data-action="confirm-delete"
              disabled={saving}
              onClick={handleConfirmDelete}
            >
              移入回收站
            </button>
          </div>
        </div>
      ) : (
        <form class="standard-form" onSubmit={handleSave} novalidate>
          {form.isCopy && (
            <p class="muted" style={{ margin: 0 }}>
              已带入金额、分类、归属人和备注。日期默认本月，请核对后保存。
            </p>
          )}
          {field && (
            <div class="bar-row" style={{ fontSize: '12.5px' }}>
              <strong>{form.note || activeCat?.name || '账目'}</strong>
              <span class="muted">
                {recordDateLabel(form.occurred_on)} · {activeCat?.name}
                {form.subcategory ? ` / ${form.subcategory}` : ''} ·{' '}
                {money(form.amount_minor)}
              </span>
            </div>
          )}

          <fieldset
            disabled={saving || hasPendingRetry}
            style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}
          >
            {!field && (
            <div class="mode-header">
              <div class="segmented" role="group" aria-label="收支类型">
                {['expense', 'income'].map(t => (
                  <button
                    key={t}
                    type="button"
                    data-action="entry-type"
                    aria-pressed={form.type === t}
                    class={form.type === t ? 'active' : ''}
                    onClick={() => {
                      const fallback = categories.find(c => c.type === t && !c.archived)?.id || '';
                      updateField({ type: t, category_id: fallback, subcategory: null });
                    }}
                  >
                    {t === 'expense' ? '支出' : '收入'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(!field || field === 'amount') && (
            <label>
              金额（元）
              <input
                name="amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                autoFocus={field === 'amount' || !field}
                value={form.amount}
                onInput={e => updateField({ amount: e.currentTarget.value })}
              />
            </label>
          )}

          {(!field || field === 'occurred_on') && (
            <div class="review-grid">
              <label class="field-label-col">
                日期精度
                <select
                  name="date_precision"
                  value={form.date_precision}
                  onChange={e => changePrecision(e.currentTarget.value)}
                >
                  <option value="month">只记月份</option>
                  <option value="day">精确到日</option>
                </select>
              </label>
              <label class="field-label-col">
                {form.date_precision === 'month' ? '记账月份' : '记账日期'}
                <input
                  name="occurred_on"
                  type={form.date_precision === 'month' ? 'month' : 'date'}
                  max={form.date_precision === 'month' ? refToday.slice(0, 7) : refToday}
                  min={form.date_precision === 'month' ? '1900-01' : '1900-01-01'}
                  autoFocus={field === 'occurred_on'}
                  value={form.occurred_on}
                  onInput={e => updateField({ occurred_on: e.currentTarget.value })}
                />
              </label>
            </div>
          )}

          {(!field || field === 'category_id') && (
            <div>
              <span class="muted" style={{ fontSize: '12.5px', display: 'block', marginBottom: '6px' }}>
                大类
              </span>
              <div class="source-chips">
                {visibleCats.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    data-action="entry-category"
                    class={`chip-btn ${form.category_id === c.id ? 'active' : ''}`}
                    aria-pressed={form.category_id === c.id}
                    onClick={() => pickCategory(c.id)}
                  >
                    <span class="color-dot" style={{ '--dot-color': categoryColor(c) }} />
                    <span>{c.name}</span>
                  </button>
                ))}
              </div>
              {subList.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <span class="muted" style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>
                    二级子类（选填）
                  </span>
                  <div class="source-chips">
                    <button
                      type="button"
                      data-action="entry-subcategory"
                      class={`chip-btn ${!form.subcategory ? 'active' : ''}`}
                      onClick={() => updateField({ subcategory: null })}
                    >
                      仅记大类
                    </button>
                    {subList.map(sub => (
                      <button
                        key={sub}
                        type="button"
                        data-action="entry-subcategory"
                        class={`chip-btn ${form.subcategory === sub ? 'active' : ''}`}
                        onClick={() => updateField({ subcategory: sub })}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(!field || field === 'owner_id') && (
            <div>
              <span class="muted" style={{ fontSize: '12.5px', display: 'block', marginBottom: '6px' }}>
                @归属人（花给谁）
              </span>
              <div class="source-chips">
                <button
                  type="button"
                  data-action="entry-owner"
                  class={`chip-btn ${!form.owner_id ? 'active' : ''}`}
                  onClick={() => {
                    ownerManuallyPickedRef.current = true;
                    updateField({ owner_id: null });
                  }}
                >
                  未指定
                </button>
                {activeOwners.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    data-action="entry-owner"
                    class={`chip-btn ${form.owner_id === o.id ? 'active' : ''}`}
                    onClick={() => {
                      ownerManuallyPickedRef.current = true;
                      updateField({ owner_id: o.id });
                    }}
                  >
                    <span class="color-dot" style={{ '--dot-color': ownerColor(o) }} />
                    <span>@{o.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {(!field || field === 'note') && (
            <label>
              备注（选填）
              <textarea
                name="note"
                rows={2}
                maxLength={200}
                placeholder="这笔钱用在了哪里？"
                autoFocus={field === 'note'}
                value={form.note}
                onInput={e => updateField({ note: e.currentTarget.value })}
              />
            </label>
          )}
          </fieldset>

          {error && (
            <div class="field-error" role="alert">
              {error}{' '}
              {conflict && (
                <button
                  type="button"
                  class="text-button"
                  data-action="reload-entry"
                  onClick={handleReloadLatest}
                >
                  放弃当前修改，载入最新记录
                </button>
              )}
            </div>
          )}

          <div class="dialog-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {form.id && !field && (
                <>
                  <button
                    type="button"
                    class="button secondary"
                    data-action="duplicate-entry"
                    disabled={saving}
                    onClick={handleDuplicate}
                  >
                    <Icon name="plus" size={16} />
                    再记一笔
                  </button>
                  <button
                    type="button"
                    class="text-button danger"
                    data-action="delete-entry"
                    disabled={saving}
                    onClick={() => setDeleteConfirm(true)}
                  >
                    <Icon name="trash" size={16} />
                    删除这条记录
                  </button>
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                class="button secondary"
                data-action="close-dialog"
                disabled={saving}
                onClick={() => setEntryModal(null)}
              >
                取消
              </button>
              <button
                type="submit"
                class="button primary"
                data-action="save-entry"
                disabled={saving}
              >
                {saving ? '保存中…' : hasPendingRetry ? '核对并重试' : form.id ? '保存修改' : '保存记录'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
