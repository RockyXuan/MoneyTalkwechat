import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon, categoryColor, ownerColor } from '../components/Icons.jsx';
import { Modal } from '../components/Modal.jsx';
import { ReviewStream } from '../components/ReviewStream.jsx';
import { SourceCalendarModal } from '../components/SourceCalendarModal.jsx';
import { useApp } from '../state/appContext.jsx';
import { request, mutate } from '../api.js';
import { parseTextIntake, LONG_TEXT_LIMIT } from '../../shared/text-records.js';
import { intakeCategoryOptions } from '../../shared/intake-category-options.js';
import { PLATFORMS, PRIMARY_PLATFORMS, tagPlatformItems, batchSources } from '../../shared/platform-sources.js';
import { platformBoard } from '../../shared/platform-board.js';
import { batchPage, batchState } from '../../shared/batch-library.js';
import { batchProgress } from '../../shared/batch-progress.js';
import { money, parseAmount, recordDateLabel, today, validRecordDate } from '../../shared/format.js';

const PLATFORM_COLORS = {
  淘宝: '#f07d30',
  支付宝: '#2685dc',
  微信: '#21996b',
  拼多多: '#d75a6a',
  京东: '#b05b75',
  抖音: '#565d82',
};

const recordedDateText = val =>
  val
    ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(new Date(val))
    : '';

export function RecordPage() {
  const {
    session,
    categories,
    owners,
    recent,
    textSummary,
    receipt,
    setReceipt,
    platformSource,
    setPlatformSource,
    recordMode,
    setRecordMode,
    pendingBatchId,
    setPendingBatchId,
    setSourceCalendarTarget,
    draftBaseKey,
    toast,
    fetchData,
    navigate,
    openEntryById,
    openBillsForRange,
  } = useApp();

  const refToday = session?.today || today();
  const cacheKey = `moneytalk:input-cache:moneytalk:draft:text:${draftBaseKey}`;

  // Text intake state
  const [rawText, setRawText] = useState('');
  const rawTextRef = useRef('');
  const hydratedKeyRef = useRef('');
  const [textBusy, setTextBusy] = useState(false);
  const [textError, setTextError] = useState('');
  const [showMoreSources, setShowMoreSources] = useState(false);
  const [activeBatch, setActiveBatch] = useState(null);
  const [intakeInfo, setIntakeInfo] = useState(null);
  const textareaRef = useRef(null);

  // Batch library search/filter state
  const [showLibrary, setShowLibrary] = useState(false);
  const [libFilter, setLibFilter] = useState({ source: '', status: 'all', q: '', page: 0 });
  const [batchesList, setBatchesList] = useState(null);

  // Douyin account modal
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [accountInput, setAccountInput] = useState('');

  // Manual entry form state
  const manualDraftKey = `moneytalk:draft:manual:${draftBaseKey}`;
  const defaultExpenseCat = useMemo(
    () => categories.find(c => c.type === 'expense' && !c.archived)?.id || 'food',
    [categories]
  );
  const [manual, setManual] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(manualDraftKey) || 'null');
      if (saved) return saved;
    } catch {
      /* ignore */
    }
    return {
      type: 'expense',
      amount: '',
      category_id: defaultExpenseCat,
      subcategory: null,
      owner_id: null,
      date_precision: 'month',
      occurred_on: refToday.slice(0, 7),
      note: '',
    };
  });
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');
  const manualPendingRef = useRef(null);
  const manualOwnerTouchedRef = useRef(Boolean(manual.owner_id));

  // Restore text draft ONCE per user/ledger key so source switching never wipes typed text
  useEffect(() => {
    if (!session || hydratedKeyRef.current === cacheKey) return;
    hydratedKeyRef.current = cacheKey;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      const next = cached?.rawValue || '';
      rawTextRef.current = next;
      setRawText(next);
    } catch {
      rawTextRef.current = '';
      setRawText('');
    }
  }, [cacheKey, session]);

  useEffect(() => {
    if (!session || activeBatch) return;
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ rawValue: rawText, source: platformSource, updated_at: new Date().toISOString() })
      );
    } catch {
      /* Optional cache */
    }
  }, [rawText, platformSource, cacheKey, session, activeBatch]);

  useEffect(() => {
    if (!session) return;
    try {
      sessionStorage.setItem(manualDraftKey, JSON.stringify(manual));
    } catch {
      /* ignore */
    }
  }, [manual, manualDraftKey, session]);

  // Open pending batch if triggered from another page (e.g. Subscriptions)
  useEffect(() => {
    if (!pendingBatchId) return;
    let cancelled = false;
    request(`/text-batches/${pendingBatchId}`)
      .then(res => {
        if (!cancelled && res?.batch) {
          setActiveBatch(res.batch);
          setRecordMode('text');
          setPendingBatchId(null);
        }
      })
      .catch(err => {
        if (!cancelled) {
          toast(err.message);
          setPendingBatchId(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pendingBatchId]);

  const board = useMemo(
    () => textSummary?.platforms || platformBoard(textSummary?.batches || []),
    [textSummary]
  );

  const selectedMobilePlatform = useMemo(() => {
    if (platformSource && board.some(g => g.source === platformSource)) return platformSource;
    return board.find(g => g.resume)?.source || board[0]?.source || '淘宝';
  }, [board, platformSource]);

  const activeOwners = useMemo(() => owners.filter(o => !o.archived), [owners]);

  function insertMention(name) {
    const token = `@${name} `;
    const el = textareaRef.current;
    if (!el) {
      setRawText(prev => (prev ? `${prev.trimEnd()} ${token}` : token));
      return;
    }
    const start = el.selectionStart ?? rawText.length;
    const end = el.selectionEnd ?? rawText.length;
    const before = rawText.slice(0, start);
    const needSpace = before.length > 0 && !/[\s，,；;]$/.test(before);
    const insertion = (needSpace ? ' ' : '') + token;
    const next = before + insertion + rawText.slice(end);
    setRawText(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = before.length + insertion.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function openBatchById(id) {
    setTextBusy(true);
    try {
      const res = await request(`/text-batches/${id}`);
      if (res?.batch) {
        setActiveBatch(res.batch);
        setRecordMode('text');
        if (res.batch.intake) {
          const allBatches = batchesList || textSummary?.batches || [];
          const ids = allBatches
            .filter(x => x.intake?.id === res.batch.intake.id)
            .sort((a, b) => a.intake.index - b.intake.index)
            .map(x => x.id);
          setIntakeInfo({
            id: res.batch.intake.id,
            ids: ids.length ? ids : [res.batch.id],
            index: ids.length ? Math.max(0, ids.indexOf(res.batch.id)) : 0,
          });
        } else {
          setIntakeInfo(null);
        }
      }
    } catch (err) {
      toast(err.message);
    } finally {
      setTextBusy(false);
    }
  }

  async function handleParseText() {
    if (textBusy) return;
    const currentRaw = textareaRef.current?.value ?? rawTextRef.current ?? rawText;
    if (currentRaw !== rawText) {
      rawTextRef.current = currentRaw;
      setRawText(currentRaw);
    }
    if (!currentRaw.trim()) {
      setTextError('请先输入或粘贴这段时间的消费文字');
      return;
    }
    setTextBusy(true);
    setTextError('');
    try {
      const parsed = parseTextIntake(currentRaw, refToday, categories, {
        inheritPlatform: !platformSource,
        owners: activeOwners,
      });
      const segments = parsed.segments.map(s => ({
        ...s,
        items: tagPlatformItems(
          s.items.map(i => intakeCategoryOptions(i, categories)),
          platformSource
        ),
      }));

      if (segments.length > 1) {
        const res = await mutate('/text-intakes', {
          segments,
          anchor_day: parsed.anchor_day,
        });
        localStorage.removeItem(cacheKey);
        setIntakeInfo({
          id: res.batches[0].intake.id,
          ids: res.batches.map(b => b.id),
          index: 0,
        });
        setActiveBatch(res.batches[0]);
        toast(`${segments.length} 段草稿已存云端 · 0 笔入账`);
      } else {
        const res = await mutate('/text-batches', segments[0]);
        localStorage.removeItem(cacheKey);
        setIntakeInfo(null);
        setActiveBatch(res.batch);
        toast('草稿已同步 · 确认后才入账');
      }
      await fetchData({ quiet: true });
    } catch (err) {
      setTextError(err.message);
    } finally {
      setTextBusy(false);
    }
  }

  async function handleSaveManual(e) {
    e.preventDefault();
    if (manualSaving) return;
    try {
      const amount_minor = parseAmount(manual.amount);
      if (!manual.category_id) throw new Error('请选择分类');
      if (!validRecordDate(manual.occurred_on) || manual.occurred_on > refToday) {
        throw new Error('请选择今天或之前的有效记账日期');
      }
      const body = {
        type: manual.type,
        amount_minor,
        category_id: manual.category_id,
        subcategory: manual.subcategory ?? null,
        owner_id: manual.owner_id ?? null,
        occurred_on: manual.occurred_on,
        note: manual.note.trim(),
      };
      const op = manualPendingRef.current || { key: crypto.randomUUID(), body };
      manualPendingRef.current = op;
      setManualSaving(true);
      setManualError('');
      const res = await mutate('/entries', op.body, { method: 'POST', key: op.key });
      manualPendingRef.current = null;
      setManualSaving(false);
      setReceipt({
        count: 1,
        expense_minor: manual.type === 'expense' ? res.entry.amount_minor : 0,
        income_minor: manual.type === 'income' ? res.entry.amount_minor : 0,
        from: res.entry.occurred_on,
        to: res.entry.occurred_on,
      });
      setManual(prev => ({ ...prev, amount: '', note: '' }));
      toast(`${money(res.entry.amount_minor)} 已入账 · ${res.entry.occurred_on}`);
      await fetchData({ quiet: true });
    } catch (err) {
      setManualSaving(false);
      setManualError(err.message);
      if (err.code !== 'NETWORK' && !(err.status >= 500)) {
        manualPendingRef.current = null;
      }
    }
  }

  async function toggleBatchLibrary() {
    const next = !showLibrary;
    setShowLibrary(next);
    if (next && !batchesList) {
      try {
        const res = await request('/text-batches');
        setBatchesList(res.batches || []);
      } catch (err) {
        toast(err.message);
      }
    }
  }

  const manualCats = categories.filter(c => c.type === manual.type && !c.archived);
  const manualActiveCat = manualCats.find(c => c.id === manual.category_id) || manualCats[0];
  const continuationGroup = board.find(g => g.source === platformSource);
  const libraryData = useMemo(() => {
    const list = batchesList || textSummary?.batches || [];
    return batchPage(list, libFilter);
  }, [batchesList, textSummary, libFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div class={`record-shell ${activeBatch ? 'has-stream' : ''}`}>
        {/* Unified Main Card: Speech/Text (default) ⇄ Manual Entry */}
        <section class="card unified-record-card" aria-label="统一记账主入口">
          <div class="mode-header">
            <div class="segmented" role="group" aria-label="切换记账方式">
              <button
                type="button"
                data-action="record-mode-text"
                aria-pressed={recordMode === 'text'}
                class={recordMode === 'text' ? 'active' : ''}
                onClick={() => setRecordMode('text')}
              >
                语音 / 文字记账
              </button>
              <button
                type="button"
                data-action="record-mode-manual"
                aria-pressed={recordMode === 'manual'}
                class={recordMode === 'manual' ? 'active' : ''}
                onClick={() => setRecordMode('manual')}
              >
                手记一笔
              </button>
            </div>
            <button
              type="button"
              class="text-button"
              data-action="open-subscriptions-link"
              onClick={() => navigate('subscriptions')}
            >
              管理定期订阅 <Icon name="right" size={14} />
            </button>
          </div>

          {recordMode === 'text' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <span class="muted" style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                  消费对象 / 来源
                </span>
                <div class="source-chips">
                  <button
                    type="button"
                    class={`chip-btn ${platformSource === '' ? 'active' : ''}`}
                    aria-pressed={platformSource === ''}
                    data-action="record-source-pick"
                    onClick={() => setPlatformSource('')}
                  >
                    自动识别
                  </button>
                  {[...new Set([platformSource, ...PRIMARY_PLATFORMS].filter(Boolean))].map(src => (
                    <button
                      key={src}
                      type="button"
                      class={`chip-btn ${platformSource === src ? 'active' : ''}`}
                      aria-pressed={platformSource === src}
                      data-action="record-source-pick"
                      onClick={() => setPlatformSource(src)}
                    >
                      {src}
                    </button>
                  ))}
                  <button
                    type="button"
                    class="text-button"
                    data-action="record-source-more"
                    onClick={() => setShowMoreSources(v => !v)}
                  >
                    {showMoreSources ? '收起' : '更多'}
                  </button>
                </div>
                {showMoreSources && (
                  <div class="source-chips" style={{ marginTop: '6px' }}>
                    {PLATFORMS.filter(p => !PRIMARY_PLATFORMS.includes(p)).map(src => (
                      <button
                        key={src}
                        type="button"
                        class={`chip-btn ${platformSource === src ? 'active' : ''}`}
                        aria-pressed={platformSource === src}
                        data-action="record-source-pick"
                        onClick={() => setPlatformSource(src)}
                      >
                        {src}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {continuationGroup?.latest && (
                <div class="bar-row" style={{ background: 'var(--surface-subtle)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong style={{ fontSize: '13px' }}>{platformSource} · 上次记到这里</strong>
                    {continuationGroup.resume && (
                      <button
                        type="button"
                        class="text-button"
                        data-action="resume-platform-batch"
                        onClick={() => openBatchById(continuationGroup.resume.id)}
                      >
                        继续待核对 <Icon name="right" size={14} />
                      </button>
                    )}
                  </div>
                  <div style={{ fontSize: '13px' }}>
                    {continuationGroup.latest.progress.first_title} …… {continuationGroup.latest.progress.last_title}
                  </div>
                  <small class="muted">
                    {continuationGroup.latest.progress.continue_after
                      ? `连续记到：${continuationGroup.latest.progress.continue_after}`
                      : '本批尚未连续确认'}
                    {continuationGroup.latest.progress.next_title
                      ? ` · 下一项：${continuationGroup.latest.progress.next_title}`
                      : ''}
                  </small>
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap', gap: '6px' }}>
                  <span class="muted" style={{ fontSize: '12px' }}>快速插入 @归属人</span>
                  <div class="source-chips">
                    {activeOwners.map(o => (
                      <button
                        key={o.id}
                        type="button"
                        class="owner-pill-sm has-owner"
                        data-action="insert-owner-mention"
                        onClick={() => insertMention(o.name)}
                      >
                        <span class="color-dot" style={{ '--dot-color': ownerColor(o) }} />
                        <span>@{o.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <label class="sr-only" htmlFor="record-text-raw">记账文字</label>
                <textarea
                  ref={textareaRef}
                  id="record-text-raw"
                  class="text-input-area"
                  rows={5}
                  placeholder="直接粘贴语音转写或输入一段消费，例如：昨天外卖 45元 @我；给老婆买化妆品 299元 @老婆；从2026年9月开始每月25元云会员…"
                  value={rawText}
                  onInput={e => {
                    const v = e.currentTarget.value;
                    rawTextRef.current = v;
                    setRawText(v);
                    setTextError('');
                  }}
                />
                <div class="draft-meta-row" style={{ marginTop: '6px' }}>
                  <span>{rawText ? '输入已保留在此浏览器' : '先识别成草稿，绿色确认才入账'}</span>
                  <span class={`tabular ${rawText.length > LONG_TEXT_LIMIT ? 'field-error' : ''}`}>
                    {rawText.length.toLocaleString()} / 50,000 字
                  </span>
                </div>
              </div>

              {textError && (
                <p class="field-error" role="alert" style={{ margin: 0 }}>
                  {textError}
                </p>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  class="button primary"
                  data-action="parse-text-records"
                  disabled={textBusy}
                  onClick={handleParseText}
                >
                  <Icon name="sparkles" size={16} />
                  {textBusy ? '正在解析…' : '保存并解析 · 去核对'}
                </button>
              </div>
            </div>
          ) : (
            <form id="manual-form" class="standard-form" onSubmit={handleSaveManual} novalidate>
              <fieldset
                disabled={manualSaving || Boolean(manualPendingRef.current && manualError)}
                style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}
              >
              <div class="mode-header">
                <div class="segmented" role="group" aria-label="收支类型">
                  {['expense', 'income'].map(t => (
                    <button
                      key={t}
                      type="button"
                      data-action="manual-entry-type"
                      aria-pressed={manual.type === t}
                      class={manual.type === t ? 'active' : ''}
                      onClick={() => {
                        const fallback = categories.find(c => c.type === t && !c.archived)?.id || '';
                        setManual(prev => ({
                          ...prev,
                          type: t,
                          category_id: fallback,
                          subcategory: null,
                        }));
                      }}
                    >
                      {t === 'expense' ? '支出' : '收入'}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <select
                    name="date_precision"
                    aria-label="日期精度"
                    value={manual.date_precision}
                    onChange={e => {
                      const prec = e.currentTarget.value;
                      setManual(prev => ({
                        ...prev,
                        date_precision: prec,
                        occurred_on:
                          prec === 'month'
                            ? (prev.occurred_on || refToday).slice(0, 7)
                            : prev.occurred_on?.length === 10
                              ? prev.occurred_on
                              : refToday,
                      }));
                    }}
                  >
                    <option value="month">只记月份</option>
                    <option value="day">精确到日</option>
                  </select>
                  <input
                    name="occurred_on"
                    aria-label="记账日期"
                    type={manual.date_precision === 'month' ? 'month' : 'date'}
                    max={manual.date_precision === 'month' ? refToday.slice(0, 7) : refToday}
                    value={manual.occurred_on}
                    onInput={e =>
                      setManual(prev => ({ ...prev, occurred_on: e.currentTarget.value }))
                    }
                  />
                </div>
              </div>

              <label>
                金额（元）
                <input
                  name="amount"
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={manual.amount}
                  onInput={e => {
                    manualPendingRef.current = null;
                    setManualError('');
                    setManual(prev => ({ ...prev, amount: e.currentTarget.value }));
                  }}
                />
              </label>

              <div>
                <span class="muted" style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                  大类
                </span>
                <div class="source-chips">
                  {manualCats.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      class={`chip-btn ${manual.category_id === c.id ? 'active' : ''}`}
                      data-action="manual-pick-category"
                      onClick={() => {
                        const keepSub = c.subcategories?.includes(manual.subcategory)
                          ? manual.subcategory
                          : null;
                        const autoOwner =
                          !manualOwnerTouchedRef.current && c.default_owner_id
                            ? c.default_owner_id
                            : manual.owner_id;
                        setManual(prev => ({
                          ...prev,
                          category_id: c.id,
                          subcategory: keepSub,
                          owner_id: autoOwner,
                        }));
                      }}
                    >
                      <span class="color-dot" style={{ '--dot-color': categoryColor(c) }} />
                      <span>{c.name}</span>
                    </button>
                  ))}
                </div>
                {(manualActiveCat?.subcategories?.length || 0) > 0 && (
                  <div class="source-chips" style={{ marginTop: '6px' }}>
                    <button
                      type="button"
                      class={`chip-btn ${!manual.subcategory ? 'active' : ''}`}
                      data-action="manual-pick-subcategory"
                      onClick={() => setManual(prev => ({ ...prev, subcategory: null }))}
                    >
                      仅记大类
                    </button>
                    {manualActiveCat.subcategories.map(sub => (
                      <button
                        key={sub}
                        type="button"
                        class={`chip-btn ${manual.subcategory === sub ? 'active' : ''}`}
                        data-action="manual-pick-subcategory"
                        onClick={() => setManual(prev => ({ ...prev, subcategory: sub }))}
                      >
                        {sub}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <span class="muted" style={{ fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                  @归属人（花给谁）
                </span>
                <div class="source-chips">
                  <button
                    type="button"
                    class={`chip-btn ${!manual.owner_id ? 'active' : ''}`}
                    data-action="manual-pick-owner"
                    onClick={() => {
                      manualOwnerTouchedRef.current = true;
                      setManual(prev => ({ ...prev, owner_id: null }));
                    }}
                  >
                    未指定
                  </button>
                  {activeOwners.map(o => (
                    <button
                      key={o.id}
                      type="button"
                      class={`chip-btn ${manual.owner_id === o.id ? 'active' : ''}`}
                      data-action="manual-pick-owner"
                      onClick={() => {
                        manualOwnerTouchedRef.current = true;
                        setManual(prev => ({ ...prev, owner_id: o.id }));
                      }}
                    >
                      <span class="color-dot" style={{ '--dot-color': ownerColor(o) }} />
                      <span>@{o.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label>
                备注（选填）
                <input
                  name="note"
                  type="text"
                  maxLength={200}
                  placeholder="这笔钱用在了哪里？"
                  value={manual.note}
                  onInput={e => setManual(prev => ({ ...prev, note: e.currentTarget.value }))}
                />
              </label>
              </fieldset>

              {manualError && <p id="manual-error" class="field-error" style={{ margin: 0 }}>{manualError}</p>}

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="submit"
                  class="button primary"
                  data-action="manual-save-entry"
                  disabled={manualSaving}
                >
                  {manualSaving ? '正在保存…' : manualPendingRef.current ? '核对并重试' : '保存记录'}
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Active Inline Review Stream */}
        {activeBatch && (
          <ReviewStream
            initialBatch={activeBatch}
            intakeInfo={intakeInfo}
            onClearDraft={() => {
              setActiveBatch(null);
              setIntakeInfo(null);
            }}
            onSelectAnotherBatch={id => openBatchById(id)}
            onStartNextSource={nextSrc => {
              setActiveBatch(null);
              setIntakeInfo(null);
              setPlatformSource(nextSrc || '');
            }}
          />
        )}
      </div>

      {receipt && (
        <section class="card" role="status" style={{ borderColor: 'var(--confirm)', background: 'var(--confirm-soft)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Icon name="checks" size={22} />
              <div>
                <strong>已入账 · {session?.local ? '本地已保存' : '云端已保存'}</strong>
                <div class="muted" style={{ fontSize: '12.5px' }}>
                  {receipt.from}
                  {receipt.to !== receipt.from ? ` 至 ${receipt.to}` : ''} · {receipt.count} 笔
                </div>
              </div>
            </div>
            <button
              type="button"
              class="button secondary"
              data-action="view-receipt"
              onClick={() => openBillsForRange({ from: receipt.from, to: receipt.to })}
            >
              查看账单 <Icon name="right" size={14} />
            </button>
          </div>
        </section>
      )}

      {/* Platform Resume Board */}
      <section class="card" aria-label="分平台记账进度">
        <div class="card-heading">
          <h2>分平台记账进度</h2>
          <button
            type="button"
            class="text-button"
            data-action="toggle-batch-library"
            onClick={toggleBatchLibrary}
          >
            {showLibrary ? '收起全部批次' : '全部历史批次'}
            <Icon name={showLibrary ? 'up' : 'right'} size={14} />
          </button>
        </div>

        {/* Mobile Platform Selector Bar B */}
        <div class="platform-mobile-tabs" role="tablist" aria-label="快速切换平台">
          {board.map(group => (
            <button
              key={group.source}
              type="button"
              class={`chip-btn ${selectedMobilePlatform === group.source ? 'active' : ''}`}
              aria-pressed={selectedMobilePlatform === group.source}
              data-action="platform-select-mobile"
              onClick={() => setPlatformSource(group.source)}
            >
              <span>{group.source}</span>
              {group.review_batches > 0 && (
                <small style={{ fontSize: '10.5px' }}>· {group.review_batches}</small>
              )}
            </button>
          ))}
        </div>

        <div class="platform-grid">
          {board.map(group => {
            const row = group.latest;
            const target = group.resume || row;
            const markColor = PLATFORM_COLORS[group.source] || '#64748b';
            const isMobileSelected = group.source === selectedMobilePlatform;

            return (
              <article
                key={group.source}
                data-platform={group.source}
                class={`bar-row platform-card ${isMobileSelected ? '' : 'is-hidden-mobile'}`}
              >
                <div class="platform-card-head">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span class="platform-mark" style={{ background: markColor }}>
                      {group.source[0]}
                    </span>
                    <strong>{group.source}</strong>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {group.source === '抖音' && (
                      <button
                        type="button"
                        class="text-button"
                        data-action="source-account"
                        onClick={() => {
                          setAccountInput('');
                          setAccountModalOpen(true);
                        }}
                      >
                        按账号记
                      </button>
                    )}
                    <button
                      type="button"
                      class="icon-button"
                      title="打开记账日历"
                      aria-label={`打开${group.source}记账日历`}
                      data-action="open-source-calendar"
                      onClick={() => setSourceCalendarTarget(group.source)}
                    >
                      <Icon name="calendar" size={16} />
                    </button>
                  </div>
                </div>

                {row ? (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px' }}>
                      <span class={`status-pill ${row.status === 'paused' ? 'paused' : !group.resume ? 'saved' : 'pending'}`}>
                        {row.status === 'paused'
                          ? '已暂停'
                          : `${row.progress.confirmed_items}/${row.progress.total_items} 已确认`}
                      </span>
                      <span class="muted">
                        {recordedDateText(row.progress.recorded_at || row.created_at)}
                      </span>
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 550 }}>
                      {row.progress.first_title} …… {row.progress.last_title}
                    </div>
                    {group.batches.length > 1 && (
                      <details style={{ fontSize: '12px' }}>
                        <summary class="muted" style={{ cursor: 'pointer' }}>
                          查看 {group.batches.length} 批记录
                        </summary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                          {group.batches.map(b => (
                            <button
                              key={b.id}
                              type="button"
                              class="text-button"
                              style={{ justifyContent: 'space-between', padding: '4px 6px' }}
                              data-action="platform-open-history-batch"
                              onClick={() => openBatchById(b.id)}
                            >
                              <span>{b.progress.first_title}…{b.progress.last_title}</span>
                              <small>{b.progress.confirmed_items}/{b.progress.total_items}</small>
                            </button>
                          ))}
                        </div>
                      </details>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '6px' }}>
                      <button
                        type="button"
                        class={`button ${group.resume ? 'primary' : 'secondary'}`}
                        style={{ minHeight: '34px', padding: '6px 12px', fontSize: '12.5px' }}
                        data-action="platform-continue-batch"
                        onClick={() => openBatchById(target.id)}
                      >
                        {group.resume ? '继续核对' : '查看本批'}
                      </button>
                      <button
                        type="button"
                        class="text-button"
                        data-action="platform-new-batch"
                        onClick={() => {
                          setActiveBatch(null);
                          setPlatformSource(group.source === '口述记录' ? '' : group.source);
                          setRecordMode('text');
                          textareaRef.current?.focus();
                        }}
                      >
                        ＋ 再记一批
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span class="muted" style={{ fontSize: '12.5px' }}>
                      {group.calendar?.ranges?.length ? '有核对标记，暂无文字批次' : '尚未记录'}
                    </span>
                    <button
                      type="button"
                      class="button secondary"
                      style={{ marginTop: 'auto' }}
                      data-action="platform-start-batch"
                      onClick={() => {
                        setActiveBatch(null);
                        setPlatformSource(group.source);
                        setRecordMode('text');
                        textareaRef.current?.focus();
                      }}
                    >
                      ＋ 记录 {group.source}
                    </button>
                  </>
                )}
              </article>
            );
          })}
        </div>

        {showLibrary && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div class="segmented">
                {[['all', '全部'], ['review', '待核对'], ['done', '已记完'], ['paused', '暂停']].map(([k, lbl]) => (
                  <button
                    key={k}
                    type="button"
                    data-action="library-status"
                    class={libFilter.status === k ? 'active' : ''}
                    onClick={() => setLibFilter(prev => ({ ...prev, status: k, page: 0 }))}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              <input
                type="search"
                placeholder="搜商品或原文…"
                value={libFilter.q}
                onInput={e => setLibFilter(prev => ({ ...prev, q: e.currentTarget.value, page: 0 }))}
                style={{ padding: '7px 11px', borderRadius: '10px', border: '1px solid var(--border-strong)', background: 'var(--surface-solid)' }}
              />
            </div>

            {libraryData.batches.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {libraryData.batches.map(b => {
                  const p = b.progress || batchProgress(b);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      class="bar-row"
                      style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      data-action="library-open-batch"
                      onClick={() => openBatchById(b.id)}
                    >
                      <div>
                        <strong>{p.source} · {p.confirmed_items}/{p.total_items} 项</strong>
                        <div class="muted" style={{ fontSize: '12px' }}>
                          {p.first_title} …… {p.last_title}
                        </div>
                      </div>
                      <span class="status-pill">{batchState(b) === 'paused' ? '暂停' : batchState(b) === 'done' ? '已记完' : '待核对'}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p class="muted">没有符合条件的批次。</p>
            )}

            {libraryData.pages > 1 && (
              <div class="pagination">
                <button
                  type="button"
                  class="button secondary"
                  data-action="library-prev"
                  disabled={libraryData.page === 0}
                  onClick={() => setLibFilter(prev => ({ ...prev, page: Math.max(0, prev.page - 1) }))}
                >
                  上一页
                </button>
                <span>{libraryData.page + 1} / {libraryData.pages} 页</span>
                <button
                  type="button"
                  class="button secondary"
                  data-action="library-next"
                  disabled={libraryData.page + 1 >= libraryData.pages}
                  onClick={() => setLibFilter(prev => ({ ...prev, page: prev.page + 1 }))}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Recent Preview */}
      {(recent?.entries?.length || 0) > 0 && (
        <section class="card" aria-label="最近记过">
          <div class="card-heading">
            <h2>最近记过</h2>
            <a
              href="/bills"
              class="text-button"
              data-route="bills"
              onClick={e => {
                e.preventDefault();
                navigate('bills');
              }}
            >
              查看全部账单 <Icon name="right" size={14} />
            </a>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {recent.entries.slice(0, 4).map(entry => (
              <button
                key={entry.id}
                type="button"
                class="record-row"
                style={{ width: '100%', textAlign: 'left' }}
                data-action="recent-entry-detail"
                onClick={() => openEntryById(entry.id)}
              >
                <div class="record-body">
                  <strong>{entry.note || entry.category_name}</strong>
                  <div class="muted" style={{ fontSize: '12px' }}>
                    {recordDateLabel(entry.occurred_on)} · {entry.category_name}
                    {entry.subcategory ? ` · ${entry.subcategory}` : ''}
                    {entry.owner_name ? ` · @${entry.owner_name}` : ''}
                  </div>
                </div>
                <strong class={`tabular ${entry.type === 'income' ? 'income-text' : ''}`}>
                  {entry.type === 'income' ? '+' : '−'}
                  {money(entry.amount_minor, false)}
                </strong>
              </button>
            ))}
          </div>
        </section>
      )}

      <SourceCalendarModal />

      {/* Douyin Account Picker Modal */}
      <Modal
        open={accountModalOpen}
        title="按抖音账号分别续记"
        dirty={Boolean(accountInput.trim())}
        onClose={() => setAccountModalOpen(false)}
      >
        <form
          class="standard-form"
          onSubmit={e => {
            e.preventDefault();
            const val = accountInput.trim();
            if (!val) return;
            setAccountModalOpen(false);
            setPlatformSource(`抖音（${val}）`);
            setRecordMode('text');
          }}
        >
          <p class="muted" style={{ margin: 0, fontSize: '13px' }}>
            为不同抖音账号分别保留进度（如：差不多轩生、张可乐爸爸）。
          </p>
          <label>
            账号名称
            <input
              type="text"
              required
              maxLength={58}
              placeholder="例如：差不多轩生"
              list="douyin-accounts-datalist"
              value={accountInput}
              onInput={e => setAccountInput(e.currentTarget.value)}
            />
            <datalist id="douyin-accounts-datalist">
              {board
                .filter(g => g.source.startsWith('抖音（'))
                .map(g => (
                  <option key={g.source} value={g.source.slice(3, -1)} />
                ))}
            </datalist>
          </label>
          <div class="dialog-footer">
            <button
              type="button"
              class="button secondary"
              data-action="close-dialog"
              onClick={() => setAccountModalOpen(false)}
            >
              取消
            </button>
            <button type="submit" class="button primary" data-action="confirm-source-account">
              用这个账号继续记
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
