import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon, categoryColor, ownerColor } from './Icons.jsx';
import { QuickTagPopover } from './QuickTagPopover.jsx';
import { useApp } from '../state/appContext.jsx';
import { request, mutate } from '../api.js';
import {
  compileDraftItems,
  CYCLES,
} from '../../shared/text-records.js';
import {
  parseAmount,
  decimal,
  money,
  recordDateLabel,
  today,
} from '../../shared/format.js';
import { batchProgress } from '../../shared/batch-progress.js';
import { batchSources, sourceTitle, titleSource } from '../../shared/platform-sources.js';
import { recordedExpense } from '../../shared/subscriptions.js';
import { textItemsSchema } from '../../shared/text-schema.js';

const FIELD_QUESTION_RE =
  /^(起始月未知|扣款日未知|补记截止月或持续循环方式|记账日期未说明|金额或币种待确认|金额无效)/;

export function ReviewStream({
  initialBatch,
  intakeInfo,
  onClearDraft,
  onSelectAnotherBatch,
  onStartNextSource,
}) {
  const {
    session,
    categories,
    setCategories,
    owners,
    toast,
    fetchData,
    openBillsForRange,
  } = useApp();

  const refToday = session?.today || today();

  const [batch, setBatch] = useState(initialBatch);
  const [items, setItems] = useState(initialBatch?.items || []);
  const [slots, setSlots] = useState(initialBatch?.slots || []);
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify({
      original_text: initialBatch?.original_text || '',
      items: initialBatch?.items || [],
    })
  );
  const [precisions, setPrecisions] = useState({});
  const [itemErrors, setItemErrors] = useState({});
  const [duplicateItems, setDuplicateItems] = useState(new Set());
  const [dupAcked, setDupAcked] = useState(new Set());
  const [customCatInputs, setCustomCatInputs] = useState({});
  const [askRemoveId, setAskRemoveId] = useState(null);
  const [deleteDraftPrompt, setDeleteDraftPrompt] = useState(false);
  const [newBatchPrompt, setNewBatchPrompt] = useState(false);
  const [previewPlan, setPreviewPlan] = useState(null);
  const [previewDupAck, setPreviewDupAck] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [statusMsg, setStatusMsg] = useState({ text: '', tone: '' });
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [pendingOp, setPendingOp] = useState(null);
  const [popover, setPopover] = useState(null); // { itemId, mode, rect }
  const amountInputsRef = useRef({});

  useEffect(() => {
    if (!initialBatch) return;
    setBatch(initialBatch);
    setItems(structuredClone(initialBatch.items || []));
    setSlots(initialBatch.slots || []);
    setSavedSnapshot(
      JSON.stringify({
        original_text: initialBatch.original_text || '',
        items: initialBatch.items || [],
      })
    );
    setPrecisions({});
    setItemErrors({});
    setDuplicateItems(new Set());
    setDupAcked(new Set());
    setAskRemoveId(null);
    setDeleteDraftPrompt(false);
    setNewBatchPrompt(false);
    setPreviewPlan(null);
    setReceipt(null);
    setConflict(false);
    setPendingOp(null);
    setStatusMsg(
      initialBatch.status === 'paused'
        ? { text: '此批次已暂停，恢复后才能继续确认。', tone: '' }
        : { text: '', tone: '' }
    );
  }, [initialBatch?.id]);

  const doneIds = useMemo(() => new Set(slots.map(s => s.item_id)), [slots]);

  const localPlan = useMemo(() => {
    return compileDraftItems(
      items.map(i => ({
        ...i,
        questions: (i.questions || []).filter(q => !FIELD_QUESTION_RE.test(q)),
      })),
      refToday,
      slots
    );
  }, [items, refToday, slots]);

  const reviewBatchObj = useMemo(
    () => ({
      items,
      original_text: batch?.original_text || '',
    }),
    [items, batch?.original_text]
  );

  const progress = useMemo(
    () => batchProgress(reviewBatchObj, slots),
    [reviewBatchObj, slots]
  );

  const itemSourcesMap = useMemo(
    () => new Map(batchSources(reviewBatchObj).map(({ item, source }) => [item.id, source])),
    [reviewBatchObj]
  );

  if (!batch && !receipt) return null;

  function cleanQuestions(item) {
    return (item.questions || []).filter(q => {
      if (/^(金额或币种待确认|金额无效)/.test(q)) return !item.amount_minor;
      if (q.startsWith('起始月未知')) return !item.start_month;
      if (q.startsWith('扣款日未知')) return item.date_precision !== 'month' && !item.charge_day;
      if (q.startsWith('补记截止月或持续循环方式')) return !item.through_month && !item.ongoing;
      if (q.startsWith('记账日期未说明')) return !item.occurred_on;
      return true;
    });
  }

  function patchItem(itemId, updater) {
    setItems(prev =>
      prev.map(it => {
        if (it.id !== itemId || doneIds.has(itemId)) return it;
        const next = typeof updater === 'function' ? updater(it) : { ...it, ...updater };
        return { ...next, questions: cleanQuestions(next) };
      })
    );
    setItemErrors(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setPreviewPlan(null);
  }

  async function sendOp(path, body, method = 'POST', meta = {}) {
    const op = pendingOp || { ...meta, path, body, method, key: crypto.randomUUID() };
    setPendingOp(op);
    const val = await mutate(op.path, op.body, { method: op.method, key: op.key });
    setPendingOp(null);
    return val;
  }

  async function saveBatch(nextItems = items) {
    const cleanItems = nextItems.map(it => ({ ...it, questions: cleanQuestions(it) }));
    textItemsSchema.parse(cleanItems);
    const serialized = JSON.stringify({
      original_text: batch.original_text,
      items: cleanItems,
    });
    if (batch && serialized === savedSnapshot) return batch;
    const val = await sendOp(
      `/text-batches/${batch.id}`,
      { original_text: batch.original_text, items: cleanItems, version: batch.version },
      'PATCH'
    );
    let updated = val.batch;
    if (val.repeated) {
      const fresh = await request(`/text-batches/${batch.id}`);
      if (fresh?.batch) updated = fresh.batch;
    }
    setBatch(updated);
    setItems(structuredClone(updated.items));
    setSlots(updated.slots || slots);
    setSavedSnapshot(
      JSON.stringify({ original_text: updated.original_text, items: updated.items })
    );
    return updated;
  }

  function feedbackText(item, row) {
    if (itemErrors[item.id]) return itemErrors[item.id];
    if (row?.missing?.length) {
      return row.missing
        .map(q =>
          q === '请选择“待选择”的分类建议'
            ? '请选择分类，或填写名称新建'
            : q === '扣款日待确认'
              ? '扣款日待确认：填写 1–31 日，或选择不填扣款日按月记'
              : q
        )
        .join('；');
    }
    const cat = categories.find(c => c.id === item.category_id);
    return row?.entries?.length
      ? `${cat ? `已选 ${cat.name}${item.subcategory ? ` / ${item.subcategory}` : ''} · ` : ''}${row.entries.length} 笔 · ${
          item.cycle === 'single'
            ? recordDateLabel(item.occurred_on)
            : item.date_precision === 'month'
              ? '只记月份，不填扣款日'
              : '按已核对周期入账'
        }`
      : '此项未选或已记录';
  }

  async function finishReceipt(val, latestBatchId) {
    try {
      const latest = (await request(`/text-batches/${latestBatchId}`)).batch;
      const activeSlots = (latest.slots || []).filter(s => !s.deleted_at);
      const dates = activeSlots.map(s => s.current_occurred_on || s.occurred_on).sort();
      const sumType = t =>
        activeSlots.filter(s => s.type === t).reduce((n, s) => n + s.amount_minor, 0);
      setReceipt({
        ...val,
        count: activeSlots.length,
        expense_minor: sumType('expense'),
        income_minor: sumType('income'),
        from: dates[0] || val.from,
        to: dates.at(-1) || val.to,
        progress: batchProgress(latest, latest.slots || []),
        batchSource: progress.source === '混合来源' ? '' : progress.source,
      });
    } catch {
      setReceipt({
        ...val,
        progress,
        batchSource: progress.source === '混合来源' ? '' : progress.source,
      });
    }
  }

  async function confirmSingleItem(itemId) {
    if (busy) return;
    const item = items.find(i => i.id === itemId);
    const row = localPlan.rows.find(r => r.item.id === itemId);
    if (!item || !row?.entries?.length) {
      const msg = feedbackText(item || {}, row);
      setItemErrors(prev => ({ ...prev, [itemId]: msg }));
      setStatusMsg({ text: msg, tone: 'error' });
      return;
    }
    if (batch.status === 'paused') {
      const msg = '此批次已暂停，请在下方恢复后确认。';
      setItemErrors(prev => ({ ...prev, [itemId]: msg }));
      setStatusMsg({ text: msg, tone: 'error' });
      return;
    }

    setBusy(true);
    try {
      const synced = await saveBatch();
      const plan = await request(`/text-batches/${synced.id}/preview`, {
        method: 'POST',
        body: { item_ids: [itemId] },
      });
      const ack = dupAcked.has(itemId);
      if (plan.duplicates?.length && !ack) {
        setDuplicateItems(prev => new Set(prev).add(itemId));
        setItemErrors(prev => ({
          ...prev,
          [itemId]: '同日或同月已有同额账目，请勾选上方同额确认后再保存。',
        }));
        setStatusMsg({ text: '同日或同月已有同额账目，请核对是否另一笔。', tone: 'error' });
        setBusy(false);
        return;
      }
      const val = await sendOp(`/text-batches/${synced.id}/confirm`, {
        version: synced.version,
        preview_hash: plan.preview_hash,
        item_ids: [itemId],
        acknowledge_duplicates: ack,
      });
      const addedSlots = plan.entries.map((entry, idx) => ({
        item_id: entry.item_id,
        occurred_on: entry.occurred_on,
        entry_id: val.entry_ids[idx],
        amount_minor: entry.amount_minor,
        type: entry.type,
        created_at: val.recorded_at,
      }));
      const nextSlots = [...slots, ...addedSlots];
      setSlots(nextSlots);
      setBatch(prev => ({ ...prev, version: val.version, status: 'active' }));
      setStatusMsg({
        text: `${val.count} 笔已保存 · ${money(val.expense_minor || val.income_minor)}`,
        tone: 'success',
      });
      await fetchData({ quiet: true });

      const nextPlan = compileDraftItems(items, refToday, nextSlots);
      if (nextPlan.rows.every(r => !r.missing.length && !r.entries.length)) {
        await finishReceipt(val, synced.id);
      }
    } catch (err) {
      setItemErrors(prev => ({ ...prev, [itemId]: err.message }));
      setStatusMsg({ text: err.message, tone: 'error' });
      if (err.code === 'VERSION_CONFLICT' || err.code === 'PREVIEW_CHANGED') setConflict(true);
      if (err.code !== 'NETWORK' && !(err.status >= 500)) setPendingOp(null);
    } finally {
      setBusy(false);
    }
  }

  async function resolveCategoryForItem(itemId, name) {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 32) {
      setItemErrors(prev => ({ ...prev, [itemId]: '请填写 1–32 字的分类名称' }));
      return;
    }
    const item = items.find(i => i.id === itemId);
    if (!item || busy) return;
    setBusy(true);
    try {
      const res = await sendOp(
        '/categories/resolve',
        { name: trimmed, type: item.type },
        'POST',
        { item_id: itemId }
      );
      setCategories(prev =>
        prev.filter(c => c.id !== res.category.id).concat(res.category)
      );
      patchItem(itemId, it => ({
        ...it,
        category_id: res.category.id,
        category_hint: { ...(it.category_hint || {}), resolved: true },
      }));
      setStatusMsg({
        text: res.reused ? '已使用已有分类，尚未入账' : '分类已新建并选中，尚未入账',
        tone: 'success',
      });
    } catch (err) {
      setItemErrors(prev => ({ ...prev, [itemId]: err.message }));
      setStatusMsg({ text: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleBatchPreview() {
    if (busy) return;
    setBusy(true);
    try {
      const synced = await saveBatch();
      const plan = await request(`/text-batches/${synced.id}/preview`, {
        method: 'POST',
        body: {},
      });
      if (plan.count > 0) {
        setPreviewPlan(plan);
        setPreviewDupAck(false);
        setStatusMsg({ text: '', tone: '' });
      } else {
        setStatusMsg({ text: '草稿已保存，0 笔可入账；请先补齐必填字段。', tone: '' });
      }
      await fetchData({ quiet: true });
    } catch (err) {
      setStatusMsg({ text: err.message, tone: 'error' });
      if (err.code === 'VERSION_CONFLICT') setConflict(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmBatchPreview() {
    if (busy || !previewPlan) return;
    setBusy(true);
    try {
      const val = await sendOp(`/text-batches/${batch.id}/confirm`, {
        version: batch.version,
        preview_hash: previewPlan.preview_hash,
        acknowledge_duplicates: previewDupAck,
      });
      const addedSlots = previewPlan.entries.map((entry, idx) => ({
        item_id: entry.item_id,
        occurred_on: entry.occurred_on,
        entry_id: val.entry_ids[idx],
        amount_minor: entry.amount_minor,
        type: entry.type,
        created_at: val.recorded_at,
      }));
      const nextSlots = [...slots, ...addedSlots];
      setSlots(nextSlots);
      setBatch(prev => ({ ...prev, version: val.version, status: 'active' }));
      setPreviewPlan(null);
      await fetchData({ quiet: true });
      const remainPlan = compileDraftItems(items, refToday, nextSlots);
      if (remainPlan.rows.some(r => r.missing.length || r.entries.length)) {
        setStatusMsg({
          text: `${val.count} 笔已保存 · ${money(val.expense_minor || val.income_minor)}；其余项目请继续核对。`,
          tone: 'success',
        });
      } else {
        await finishReceipt(val, batch.id);
      }
    } catch (err) {
      setStatusMsg({ text: err.message, tone: 'error' });
      if (err.code === 'VERSION_CONFLICT' || err.code === 'PREVIEW_CHANGED') setConflict(true);
      if (err.code !== 'NETWORK' && !(err.status >= 500)) setPendingOp(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveDraftItem(itemId) {
    if (busy) return;
    if (doneIds.has(itemId)) {
      toast('此项已有账目，请在账单中处理');
      return;
    }
    setBusy(true);
    try {
      const remaining = items.filter(i => i.id !== itemId);
      if (remaining.length) {
        await saveBatch(remaining);
        setAskRemoveId(null);
        setStatusMsg({ text: '草稿项已删除', tone: 'success' });
      } else {
        await sendOp(`/text-batches/${batch.id}`, { version: batch.version }, 'DELETE');
        onClearDraft?.();
        toast('草稿已删除');
      }
      await fetchData({ quiet: true });
    } catch (err) {
      setStatusMsg({ text: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePause() {
    if (busy || !batch) return;
    setBusy(true);
    try {
      const nextStatus = batch.status === 'paused' ? 'active' : 'paused';
      const val = await sendOp(`/text-batches/${batch.id}/status`, {
        version: batch.version,
        status: nextStatus,
      });
      setBatch(prev => ({ ...prev, version: val.version, status: val.status }));
      setStatusMsg({
        text: nextStatus === 'paused' ? '已暂停，已有账目保留。' : '已恢复，确认后才会入账。',
        tone: '',
      });
      await fetchData({ quiet: true });
    } catch (err) {
      setStatusMsg({ text: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteWholeDraft() {
    if (busy || !batch || slots.length) return;
    setBusy(true);
    try {
      await sendOp(`/text-batches/${batch.id}`, { version: batch.version }, 'DELETE');
      setDeleteDraftPrompt(false);
      await fetchData({ quiet: true });
      onClearDraft?.();
      toast('草稿已删除');
    } catch (err) {
      setStatusMsg({ text: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleReloadLatest() {
    if (!batch?.id) return;
    setBusy(true);
    try {
      const fresh = (await request(`/text-batches/${batch.id}`)).batch;
      setBatch(fresh);
      setItems(structuredClone(fresh.items || []));
      setSlots(fresh.slots || []);
      setConflict(false);
      setStatusMsg({ text: '已载入最新批次内容', tone: 'success' });
    } catch (err) {
      setStatusMsg({ text: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRetryPending() {
    if (!pendingOp || busy) return;
    setBusy(true);
    try {
      const val = await sendOp(pendingOp.path, pendingOp.body, pendingOp.method, pendingOp);
      if (val.batch) {
        setBatch(val.batch);
        setItems(structuredClone(val.batch.items));
        setSlots(val.batch.slots || slots);
      } else {
        await handleReloadLatest();
      }
      setStatusMsg({ text: '保存结果已核对，不会重复入账。', tone: 'success' });
      await fetchData({ quiet: true });
    } catch (err) {
      setStatusMsg({ text: err.message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const popoverItem = popover ? items.find(i => i.id === popover.itemId) : null;

  if (receipt) {
    const nextIntakeId =
      intakeInfo && intakeInfo.index + 1 < intakeInfo.ids.length
        ? intakeInfo.ids[intakeInfo.index + 1]
        : null;
    return (
      <section class="card" aria-label="入账成功回执">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '8px', padding: '12px 0' }}>
          <div style={{ color: 'var(--confirm)' }}>
            <Icon name="checks" size={34} />
          </div>
          <h3 style={{ margin: 0 }}>已入账 · {session?.local ? '本地已保存' : '云端已保存'}</h3>
          <strong class="summary-value tabular">
            {receipt.expense_minor && receipt.income_minor
              ? `支出 ${money(receipt.expense_minor)} · 收入 ${money(receipt.income_minor)}`
              : `${receipt.expense_minor ? '支出' : '收入'} ${money(receipt.expense_minor || receipt.income_minor || 0)}`}
          </strong>
          <p class="muted" style={{ margin: 0 }}>
            {receipt.count} 笔 · {receipt.from}
            {receipt.from !== receipt.to ? ` 至 ${receipt.to}` : ''}
          </p>
        </div>

        <div class="dialog-footer" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
          {nextIntakeId && (
            <button
              type="button"
              class="button primary"
              data-action="intake-next"
              onClick={() => onSelectAnotherBatch?.(nextIntakeId)}
            >
              继续核对第 {intakeInfo.index + 2} 段
            </button>
          )}
          <button
            type="button"
            class={`button ${nextIntakeId ? 'secondary' : 'primary'}`}
            data-action="text-new-batch"
            onClick={() => {
              onClearDraft?.();
              onStartNextSource?.(receipt.batchSource || '');
            }}
          >
            {receipt.batchSource ? `继续 ${receipt.batchSource} · 再记一批` : '再记一批'}
          </button>
          <button
            type="button"
            class="button secondary"
            data-action="view-receipt-bills"
            onClick={() => openBillsForRange({ from: receipt.from, to: receipt.to })}
          >
            查看账单
          </button>
        </div>
      </section>
    );
  }

  const visibleItems = items.filter(
    item => !doneIds.has(item.id) || (localPlan.rows.find(r => r.item.id === item.id)?.entries?.length || 0) > 0
  );
  const confirmedList = items.filter(item => doneIds.has(item.id));
  const isDirty =
    JSON.stringify({ original_text: batch?.original_text || '', items }) !== savedSnapshot;

  return (
    <section class="card" aria-label="逐条核对消费草稿">
      <div class="card-heading">
        <div>
          <h2>逐条核对 · {progress.source}</h2>
          <small class="muted">
            已确认 {progress.confirmed_items} / {progress.total_items} 项 · {progress.first_title} → {progress.last_title}
          </small>
        </div>
        <button
          type="button"
          class="text-button"
          data-action="close-review"
          onClick={() => {
            if (isDirty) setNewBatchPrompt(true);
            else onClearDraft?.();
          }}
        >
          收起核对
        </button>
      </div>

      {intakeInfo && (
        <div class="bar-row" style={{ marginBottom: '10px', fontSize: '12.5px' }}>
          <strong>
            长段分段 · 第 {intakeInfo.index + 1} / {intakeInfo.ids.length} 段
          </strong>
          <span class="muted">分段草稿已存云端 · 确认才入账</span>
        </div>
      )}

      {progress.has_gaps && (
        <p class="pending-note" style={{ margin: '0 0 10px' }}>
          中间还有未确认项，请从「{progress.next_title}」继续。
        </p>
      )}
      {progress.deleted_entries > 0 && (
        <p class="pending-note" style={{ margin: '0 0 10px' }}>
          {progress.deleted_entries} 笔已移入回收站，不会自动补记。
        </p>
      )}

      {statusMsg.text && (
        <div
          class={statusMsg.tone === 'error' ? 'field-error' : 'muted'}
          role="status"
          aria-live="polite"
          style={{ marginBottom: '10px' }}
        >
          {statusMsg.text}
        </div>
      )}

      {previewPlan ? (
        <div class="bar-row" style={{ gap: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>将新增 {previewPlan.count} 笔</strong>
            <strong class="tabular">{money(previewPlan.expense_minor || previewPlan.income_minor)}</strong>
          </div>
          <div style={{ maxHeight: '220px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {previewPlan.entries.map((eRow, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span>{recordDateLabel(eRow.occurred_on)} · {eRow.note}</span>
                <span class="tabular">{money(eRow.amount_minor)}</span>
              </div>
            ))}
          </div>
          {previewPlan.duplicates?.length > 0 && (
            <div>
              <p class="field-error" style={{ margin: '0 0 6px' }}>
                {previewPlan.duplicates.length} 个日期已有同额账目。
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                <input
                  type="checkbox"
                  checked={previewDupAck}
                  onChange={e => setPreviewDupAck(e.currentTarget.checked)}
                />
                这是另外发生的收支
              </label>
            </div>
          )}
          <div class="dialog-footer">
            <button
              type="button"
              class="button secondary"
              data-action="review-back"
              onClick={() => setPreviewPlan(null)}
            >
              返回修改
            </button>
            <button
              type="button"
              class="button confirm"
              data-action="review-confirm-all"
              disabled={busy}
              onClick={handleConfirmBatchPreview}
            >
              确认入账 {previewPlan.count} 笔
            </button>
          </div>
        </div>
      ) : (
        <div class="review-card-list">
          {visibleItems.map(item => {
            const locked = doneIds.has(item.id);
            const row = localPlan.rows.find(r => r.item.id === item.id);
            const cat = categories.find(c => c.id === item.category_id);
            const owner = owners.find(o => o.id === item.owner_id);
            const questions = (item.questions || []).filter(q => !FIELD_QUESTION_RE.test(q));
            const precision =
              precisions[item.id] || (item.occurred_on?.length === 10 ? 'day' : 'month');
            const rangeMode =
              item.ongoing && item.through_month
                ? 'conflict'
                : item.ongoing
                  ? 'ongoing'
                  : 'through';
            const hint = item.category_hint;
            const activeTypeCats = categories.filter(c => c.type === item.type && !c.archived);
            const recCats = hint
              ? activeTypeCats.filter(c => (hint.recommended_ids || []).includes(c.id))
              : [];
            const choices = recCats.length ? recCats : activeTypeCats.slice(0, 5);
            const exactHintCat = hint ? activeTypeCats.find(c => c.name === hint.name) : null;
            const hasIssue = Boolean(itemErrors[item.id] || row?.missing?.length);

            return (
              <article
                key={item.id}
                data-item-id={item.id}
                class={`review-item-card ${locked ? 'confirmed' : ''}`}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {progress.source === '混合来源' && (
                      <span class="status-pill">{itemSourcesMap.get(item.id)}</span>
                    )}
                    {item.cycle !== 'single' && (
                      <span class="status-pill">{CYCLES[item.cycle]}</span>
                    )}
                    <button
                      type="button"
                      class="editable-pill"
                      data-action="review-pick-category"
                      disabled={locked}
                      onClick={e =>
                        setPopover({
                          itemId: item.id,
                          mode: 'category',
                          rect: e.currentTarget.getBoundingClientRect(),
                        })
                      }
                    >
                      <span
                        class="color-dot"
                        style={{ '--dot-color': cat ? categoryColor(cat) : 'var(--warn)' }}
                      />
                      <span>
                        {cat ? cat.name : '选分类'}
                        {item.subcategory ? ` · ${item.subcategory}` : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      class={`owner-pill-sm ${owner ? 'has-owner' : ''}`}
                      data-action="review-pick-owner"
                      disabled={locked}
                      onClick={e =>
                        setPopover({
                          itemId: item.id,
                          mode: 'owner',
                          rect: e.currentTarget.getBoundingClientRect(),
                        })
                      }
                    >
                      {owner && <span class="color-dot" style={{ '--dot-color': ownerColor(owner) }} />}
                      <span>{owner ? `@${owner.name}` : '+ @归属人'}</span>
                    </button>
                  </div>
                  <strong class="tabular" style={{ fontSize: '16px' }}>
                    {item.amount_minor ? money(item.amount_minor) : '待填金额'}
                  </strong>
                </div>

                <div class="review-grid">
                  <label class="field-label-col">
                    名称
                    <input
                      type="text"
                      disabled={locked}
                      maxLength={80 - (titleSource(item.title)?.length ? titleSource(item.title).length + 3 : 0)}
                      value={sourceTitle(item.title)}
                      onInput={e => {
                        const name = e.currentTarget.value.trim();
                        const plat = titleSource(item.title);
                        patchItem(item.id, { title: plat ? `${plat} · ${name}` : name });
                      }}
                    />
                  </label>
                  <label class="field-label-col">
                    金额（元）
                    <input
                      type="text"
                      inputMode="decimal"
                      disabled={locked}
                      defaultValue={item.amount_minor ? decimal(item.amount_minor) : ''}
                      ref={el => {
                        amountInputsRef.current[item.id] = el;
                      }}
                      onChange={e => {
                        const rawVal = e.currentTarget.value.trim();
                        try {
                          patchItem(item.id, {
                            amount_minor: rawVal ? parseAmount(rawVal) : null,
                          });
                        } catch (err) {
                          setItemErrors(prev => ({ ...prev, [item.id]: err.message }));
                        }
                      }}
                    />
                  </label>
                  {item.cycle === 'single' ? (
                    <>
                      <label class="field-label-col">
                        日期精度
                        <select
                          disabled={locked}
                          value={precision}
                          onChange={e => {
                            const nextPrec = e.currentTarget.value;
                            setPrecisions(prev => ({ ...prev, [item.id]: nextPrec }));
                            patchItem(item.id, it => ({
                              ...it,
                              occurred_on:
                                nextPrec === 'month'
                                  ? it.occurred_on?.slice(0, 7) || null
                                  : it.occurred_on?.length === 10
                                    ? it.occurred_on
                                    : null,
                            }));
                          }}
                        >
                          <option value="month">只记月份</option>
                          <option value="day">精确到日</option>
                        </select>
                      </label>
                      <label class="field-label-col">
                        {precision === 'month' ? '记账月份' : '记账日期'}
                        <input
                          type={precision === 'month' ? 'month' : 'date'}
                          max={precision === 'month' ? refToday.slice(0, 7) : refToday}
                          disabled={locked}
                          value={item.occurred_on || ''}
                          onChange={e =>
                            patchItem(item.id, { occurred_on: e.currentTarget.value || null })
                          }
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label class="field-label-col">
                        起始月
                        <input
                          type="month"
                          disabled={locked}
                          value={item.start_month || ''}
                          onChange={e =>
                            patchItem(item.id, { start_month: e.currentTarget.value || null })
                          }
                        />
                      </label>
                      <label class="field-label-col">
                        扣款日
                        <select
                          disabled={locked}
                          value={item.date_precision === 'month' ? 'month' : 'day'}
                          onChange={e =>
                            patchItem(item.id, {
                              date_precision: e.currentTarget.value,
                              ...(e.currentTarget.value === 'month' ? { charge_day: null } : {}),
                            })
                          }
                        >
                          <option value="month">只记月份</option>
                          <option value="day">指定扣款日</option>
                        </select>
                      </label>
                      {item.date_precision !== 'month' && (
                        <label class="field-label-col">
                          每月扣款日
                          <input
                            type="number"
                            min={1}
                            max={31}
                            disabled={locked}
                            value={item.charge_day || ''}
                            onChange={e =>
                              patchItem(item.id, {
                                charge_day: e.currentTarget.value ? Number(e.currentTarget.value) : null,
                              })
                            }
                          />
                        </label>
                      )}
                      <label class="field-label-col">
                        订阅状态
                        <select
                          disabled={locked}
                          value={rangeMode}
                          onChange={e => {
                            const mode = e.currentTarget.value;
                            if (mode === 'ongoing') {
                              patchItem(item.id, { ongoing: true, auto_record: true, through_month: null });
                            } else if (mode === 'through') {
                              patchItem(item.id, { ongoing: false, auto_record: false });
                            }
                          }}
                        >
                          {rangeMode === 'conflict' && <option value="conflict">请选择一种范围</option>}
                          <option value="through">已经停止</option>
                          <option value="ongoing">仍在订阅</option>
                        </select>
                      </label>
                      {rangeMode !== 'ongoing' && (
                        <label class="field-label-col">
                          最后扣费月
                          <input
                            type="month"
                            disabled={locked}
                            value={item.through_month || ''}
                            onChange={e =>
                              patchItem(item.id, { through_month: e.currentTarget.value || null })
                            }
                          />
                        </label>
                      )}
                    </>
                  )}
                </div>

                {hint && !hint.resolved && (
                  <div class="bar-row" style={{ gap: '8px', background: 'var(--surface-subtle)' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 600 }}>
                      {hint.name === '待选择' ? '这笔归到哪一类？' : `口述提及「${hint.name}」· 选已有或直接新建`}
                    </span>
                    <div class="source-chips">
                      {choices.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          class={`chip-btn ${item.category_id === c.id ? 'active' : ''}`}
                          data-action="review-suggest-choose"
                          onClick={() =>
                            patchItem(item.id, it => ({
                              ...it,
                              category_id: c.id,
                              category_hint: { ...(it.category_hint || {}), resolved: true },
                            }))
                          }
                        >
                          归到 {c.name}
                        </button>
                      ))}
                      {!exactHintCat && hint.name !== '待选择' && (
                        <button
                          type="button"
                          class="chip-btn"
                          data-action="review-suggest-create"
                          onClick={() => resolveCategoryForItem(item.id, hint.name)}
                        >
                          ＋ 新建 {hint.name}
                        </button>
                      )}
                    </div>
                    {hint.name === '待选择' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input
                          type="text"
                          placeholder="没有合适的？填写新分类"
                          maxLength={32}
                          value={customCatInputs[item.id] || ''}
                          onInput={e =>
                            setCustomCatInputs(prev => ({
                              ...prev,
                              [item.id]: e.currentTarget.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          class="button secondary"
                          data-action="review-custom-cat"
                          onClick={() =>
                            resolveCategoryForItem(item.id, customCatInputs[item.id] || '')
                          }
                        >
                          新建
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {questions.length > 0 && (
                  <div class="bar-row" style={{ gap: '6px', background: 'var(--warn-soft)' }}>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px' }}>
                      {questions.map((q, idx) => (
                        <li key={idx}>{q}</li>
                      ))}
                    </ul>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      {questions.includes('日期沿用同段前一项，请确认日期语境') && (
                        <button
                          type="button"
                          class="text-button"
                          data-action="review-accept-context"
                          onClick={() => {
                            setItems(prev =>
                              prev.map(it =>
                                doneIds.has(it.id)
                                  ? it
                                  : {
                                      ...it,
                                      questions: (it.questions || []).filter(
                                        q => q !== '日期沿用同段前一项，请确认日期语境'
                                      ),
                                    }
                              )
                            );
                            setStatusMsg({
                              text: '本段沿用日期已核对；其他疑问仍保留，尚未入账。',
                              tone: 'success',
                            });
                          }}
                        >
                          本段沿用日期都正确
                        </button>
                      )}
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px' }}>
                        <input
                          type="checkbox"
                          onChange={e => {
                            if (e.currentTarget.checked) patchItem(item.id, { questions: [] });
                          }}
                        />
                        上述疑问已核对
                      </label>
                    </div>
                  </div>
                )}

                {duplicateItems.has(item.id) && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--warn)' }}>
                    <input
                      type="checkbox"
                      checked={dupAcked.has(item.id)}
                      onChange={e => {
                        const checked = e.currentTarget.checked;
                        setDupAcked(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(item.id);
                          else next.delete(item.id);
                          return next;
                        });
                      }}
                    />
                    同额已存在，这是另一笔消费
                  </label>
                )}

                <div class="candidate-footer">
                  <div class={`candidate-help ${hasIssue ? 'has-error' : ''}`} role="status">
                    <div>{feedbackText(item, row)}</div>
                    {!locked && item.cycle !== 'single' && item.date_precision !== 'month' && (
                      <button
                        type="button"
                        class="text-button"
                        data-action="review-month-only"
                        style={{ paddingLeft: 0 }}
                        onClick={() =>
                          patchItem(item.id, { date_precision: 'month', charge_day: null })
                        }
                      >
                        不填扣款日，按月记
                      </button>
                    )}
                  </div>
                  <div class="candidate-commands">
                    {!locked &&
                      (askRemoveId === item.id ? (
                        <>
                          <button
                            type="button"
                            class="text-button"
                            data-action="review-keep-item"
                            onClick={() => setAskRemoveId(null)}
                          >
                            保留
                          </button>
                          <button
                            type="button"
                            class="text-button danger"
                            data-action="review-remove-item"
                            disabled={busy}
                            onClick={() => handleRemoveDraftItem(item.id)}
                          >
                            确认删除
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          class="text-button danger"
                          data-action="review-ask-remove"
                          disabled={busy}
                          onClick={() => setAskRemoveId(item.id)}
                        >
                          删除
                        </button>
                      ))}
                    <button
                      type="button"
                      class="button confirm"
                      data-action="review-confirm-item"
                      disabled={busy || locked}
                      onClick={() => confirmSingleItem(item.id)}
                    >
                      <Icon name="check" size={16} />
                      {locked
                        ? '已保存'
                        : `确认${(row?.entries?.length || 0) > 1 ? ` ${row.entries.length} 笔` : ''}`}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {confirmedList.length > 0 && !previewPlan && (
        <div class="bar-row" style={{ marginTop: '12px', background: 'var(--confirm-soft)' }}>
          <strong style={{ fontSize: '13px', color: 'var(--confirm)' }}>
            已确认 {progress.confirmed_items} 项
          </strong>
          {confirmedList.map(cItem => {
            const rec = slots.filter(s => s.item_id === cItem.id);
            const total = recordedExpense(rec);
            return (
              <div key={cItem.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px' }}>
                <span>{cItem.title}</span>
                <span class="tabular">
                  已记 {rec.filter(s => !s.deleted_at).length} 笔 · {total === null ? '暂不可用' : money(total)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {newBatchPrompt && (
        <div class="bar-row" style={{ marginTop: '12px', borderColor: 'var(--warn)' }} role="status">
          <strong>还有未保存的核对修改</strong>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              class="button secondary"
              data-action="review-continue"
              onClick={() => setNewBatchPrompt(false)}
            >
              继续核对
            </button>
            <button
              type="button"
              class="button primary"
              data-action="review-save-and-exit"
              disabled={busy}
              onClick={async () => {
                await saveBatch();
                setNewBatchPrompt(false);
                onClearDraft?.();
              }}
            >
              存草稿并退出
            </button>
          </div>
        </div>
      )}

      {!previewPlan && (
        <div class="dialog-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', marginTop: '14px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              class="button secondary"
              data-action="review-save-draft"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await saveBatch();
                  setStatusMsg({
                    text: `草稿已保存，本次 0 笔入账；${localPlan.count} 笔待确认。`,
                    tone: 'success',
                  });
                  await fetchData({ quiet: true });
                } catch (err) {
                  setStatusMsg({ text: err.message, tone: 'error' });
                } finally {
                  setBusy(false);
                }
              }}
            >
              保存修改
            </button>
            {localPlan.count > 0 && localPlan.count <= 120 && (
              <button
                type="button"
                class="button secondary"
                data-action="review-preview-all"
                disabled={busy}
                onClick={handleBatchPreview}
              >
                核对 {localPlan.count} 笔账目
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {conflict && (
              <button
                type="button"
                class="button secondary"
                data-action="review-reload"
                onClick={handleReloadLatest}
              >
                载入最新批次
              </button>
            )}
            {pendingOp && (
              <button
                type="button"
                class="button primary"
                data-action="review-retry"
                onClick={handleRetryPending}
              >
                核对保存结果
              </button>
            )}
            <button
              type="button"
              class="text-button"
              data-action="review-pause-toggle"
              disabled={busy}
              onClick={handleTogglePause}
            >
              {batch.status === 'paused' ? '恢复' : '暂停'}
            </button>
            {!slots.length &&
              (deleteDraftPrompt ? (
                <>
                  <button
                    type="button"
                    class="text-button"
                    data-action="review-cancel-delete-draft"
                    onClick={() => setDeleteDraftPrompt(false)}
                  >
                    保留草稿
                  </button>
                  <button
                    type="button"
                    class="text-button danger"
                    data-action="review-confirm-delete-draft"
                    disabled={busy}
                    onClick={handleDeleteWholeDraft}
                  >
                    确认删除草稿
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  class="text-button danger"
                  data-action="review-delete-draft"
                  disabled={busy}
                  onClick={() => setDeleteDraftPrompt(true)}
                >
                  删除草稿
                </button>
              ))}
          </div>
        </div>
      )}

      {popover && popoverItem && (
        <QuickTagPopover
          anchorRect={popover.rect}
          mode={popover.mode}
          entryType={popoverItem.type}
          currentCategoryId={popoverItem.category_id}
          currentSubcategory={popoverItem.subcategory}
          currentOwnerId={popoverItem.owner_id}
          categories={categories}
          owners={owners}
          onClose={() => setPopover(null)}
          onSelectCategory={(catId, subName) => {
            patchItem(popoverItem.id, it => ({
              ...it,
              category_id: catId,
              subcategory: subName || undefined,
              category_hint: it.category_hint ? { ...it.category_hint, resolved: true } : undefined,
            }));
            setPopover(null);
          }}
          onSelectOwner={ownerId => {
            patchItem(popoverItem.id, { owner_id: ownerId || undefined });
            setPopover(null);
          }}
        />
      )}
    </section>
  );
}
