import { useEffect, useRef, useState } from 'preact/hooks';
import { Modal } from './Modal.jsx';
import { Icon } from './Icons.jsx';
import { calendarDays, calendarMonths, parseCoverageRange } from '../../shared/source-calendar.js';
import { mutate } from '../api.js';
import { today } from '../../shared/format.js';
import { useApp } from '../state/appContext.jsx';

export function SourceCalendarModal() {
  const {
    sourceCalendarTarget,
    setSourceCalendarTarget,
    textSummary,
    session,
    toast,
    fetchData,
  } = useApp();

  const refToday = session?.today || today();
  const maxYear = Number(refToday.slice(0, 4));

  const [year, setYear] = useState(maxYear);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [rangeText, setRangeText] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [formMsg, setFormMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const pendingKeyRef = useRef(null);

  useEffect(() => {
    setYear(maxYear);
    setSelectedMonth(null);
    setShowForm(false);
    setRangeText('');
    setFromDate('');
    setToDate('');
    setFormMsg('');
    pendingKeyRef.current = null;
  }, [sourceCalendarTarget, maxYear]);

  if (!sourceCalendarTarget) return null;

  const group = (textSummary?.platforms || []).find(g => g.source === sourceCalendarTarget) || {
    source: sourceCalendarTarget,
    calendar: { ranges: [], dates: [] },
  };
  const { ranges = [], dates = [] } = group.calendar || {};
  const months = calendarMonths(year, ranges, dates);
  const activeMonthObj = months.find(m => m.month === selectedMonth);

  const statusText = m =>
    m.covered === m.days
      ? '已核对'
      : m.covered
        ? '部分核对'
        : m.recorded
          ? '有记录'
          : '未标记';

  function handleParseRangeText() {
    const parsed = parseCoverageRange(rangeText, refToday);
    if (!parsed) {
      setFormMsg('请写明年份和起止月份或日期，或直接填写下方日期；未自动保存。');
      return;
    }
    setFromDate(parsed.from);
    setToDate(parsed.to);
    setFormMsg('已整理时间段，请核对起止日期后确认。');
  }

  async function handleAddRange(e) {
    e.preventDefault();
    if (busy) return;
    if (!fromDate || !toDate || fromDate > toDate || toDate > refToday) {
      setFormMsg('请选择今天或之前的有效起止日期');
      return;
    }
    setBusy(true);
    setFormMsg('');
    const key = pendingKeyRef.current || crypto.randomUUID();
    pendingKeyRef.current = key;
    try {
      await mutate('/source-ranges', { source: sourceCalendarTarget, from: fromDate, to: toDate }, { key });
      pendingKeyRef.current = null;
      setBusy(false);
      setShowForm(false);
      setRangeText('');
      setFromDate('');
      setToDate('');
      toast('已保存核对范围');
      await fetchData({ quiet: true });
    } catch (err) {
      setBusy(false);
      if (err.code !== 'NETWORK' && !(err.status >= 500)) {
        pendingKeyRef.current = null;
      }
      setFormMsg(err.message);
    }
  }

  async function handleRemoveRange(rangeId) {
    if (busy) return;
    setBusy(true);
    try {
      await mutate(`/source-ranges/${rangeId}`, {}, { method: 'DELETE' });
      setBusy(false);
      toast('已撤销核对范围标记');
      await fetchData({ quiet: true });
    } catch (err) {
      setBusy(false);
      toast(err.message);
    }
  }

  const formDirty = Boolean(showForm && (rangeText.trim() || fromDate || toDate));

  return (
    <Modal
      open={Boolean(sourceCalendarTarget)}
      title={`${sourceCalendarTarget} · 记账日历`}
      wide
      locked={busy}
      dirty={formDirty}
      onBlockedNotice={msg => toast(msg)}
      onClose={() => setSourceCalendarTarget(null)}
    >
      <div class="mode-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            class="icon-button"
            aria-label="上一年"
            data-action="source-calendar-prev"
            onClick={() => {
              setYear(y => Math.max(1900, y - 1));
              setSelectedMonth(null);
            }}
          >
            <Icon name="left" size={16} />
          </button>
          <strong aria-live="polite">{year}年</strong>
          <button
            type="button"
            class="icon-button"
            aria-label="下一年"
            data-action="source-calendar-next"
            disabled={year >= maxYear}
            onClick={() => {
              setYear(y => Math.min(maxYear, y + 1));
              setSelectedMonth(null);
            }}
          >
            <Icon name="right" size={16} />
          </button>
        </div>

        <button
          type="button"
          class="button secondary"
          data-action="source-range-open"
          onClick={() => setShowForm(v => !v)}
        >
          <Icon name={showForm ? 'close' : 'plus'} size={15} />
          {showForm ? '收起标记表单' : '标记已核对范围'}
        </button>
      </div>

      {showForm && (
        <form data-form="source-range" class="standard-form bar-row" onSubmit={handleAddRange}>
          <p class="muted" style={{ margin: 0, fontSize: '12.5px' }}>
            为 {sourceCalendarTarget} 标记已逐笔核对完的日期范围。
          </p>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
            <label style={{ flex: 1 }}>
              时间段文字（可选）
              <input
                name="range_text"
                placeholder="例如：2025年10月到2025年12月"
                maxLength={200}
                value={rangeText}
                onInput={e => setRangeText(e.currentTarget.value)}
              />
            </label>
            <button
              type="button"
              class="button secondary"
              data-action="source-range-parse"
              onClick={handleParseRangeText}
            >
              识别时间段
            </button>
          </div>
          <div class="review-grid">
            <label>
              从
              <input
                type="date"
                name="from"
                required
                max={refToday}
                value={fromDate}
                onInput={e => setFromDate(e.currentTarget.value)}
              />
            </label>
            <label>
              到
              <input
                type="date"
                name="to"
                required
                max={refToday}
                value={toDate}
                onInput={e => setToDate(e.currentTarget.value)}
              />
            </label>
          </div>
          {formMsg && (
            <p class={fromDate && toDate ? 'muted' : 'field-error'} role="alert" style={{ margin: 0 }}>
              {formMsg}
            </p>
          )}
          <div class="dialog-footer">
            <button type="submit" class="button primary" data-action="source-range-submit" disabled={busy}>
              {busy ? '保存中…' : '确认这段已核对'}
            </button>
          </div>
        </form>
      )}

      <div class="calendar-months">
        {months.map(m => (
          <button
            key={m.month}
            type="button"
            data-action="source-calendar-month"
            data-month={m.month}
            aria-pressed={selectedMonth === m.month}
            class={`calendar-month ${m.covered === m.days ? 'complete' : m.covered ? 'partial' : ''}`}
            onClick={() => setSelectedMonth(prev => (prev === m.month ? null : m.month))}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{Number(m.month.slice(5))}月</strong>
              {m.recorded > 0 && <small class="muted">{m.recorded}笔</small>}
            </div>
            <div class="calendar-mini" aria-hidden="true">
              {calendarDays(m.month, ranges, dates, refToday).map(d => (
                <span key={d.date} class={`mini-day ${d.status}`} />
              ))}
            </div>
            <small class="muted" style={{ fontSize: '11px' }}>{statusText(m)}</small>
          </button>
        ))}
      </div>

      {activeMonthObj && (
        <div class="bar-row">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{activeMonthObj.month} 每天核对状态</strong>
            <span class="muted" style={{ fontSize: '12px' }}>绿=已核对 · 黄=未标记 · 灰=未来</span>
          </div>
          <div class="calendar-dates">
            {calendarDays(activeMonthObj.month, ranges, dates, refToday).map(d => (
              <div
                key={d.date}
                class={`calendar-day ${d.status}`}
                title={`${d.date} ${d.status === 'complete' ? '已核对' : d.status === 'future' ? '未来日期' : '尚未标记核对'}${d.count ? ` · ${d.count}笔` : ''}`}
              >
                <div>{Number(d.date.slice(8))}</div>
                {d.count > 0 && <small style={{ fontSize: '10px', fontWeight: 700 }}>{d.count}笔</small>}
              </div>
            ))}
          </div>
          {dates.filter(d => d.date === activeMonthObj.month).reduce((n, d) => n + d.count, 0) > 0 && (
            <p class="pending-note" style={{ margin: 0 }}>
              另有 {dates.filter(d => d.date === activeMonthObj.month).reduce((n, d) => n + d.count, 0)} 笔只记月份，未指定某天
            </p>
          )}
        </div>
      )}

      <div>
        <span class="muted" style={{ fontSize: '12.5px', display: 'block', marginBottom: '6px' }}>
          已保存的核对范围
        </span>
        {ranges.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {ranges.map(r => (
              <div
                key={r.id}
                class="bar-row"
                style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}
              >
                <span class="tabular" style={{ fontSize: '13px' }}>{r.from} 至 {r.to}</span>
                <button
                  type="button"
                  class="text-button danger"
                  data-action="source-range-remove"
                  disabled={busy}
                  onClick={() => handleRemoveRange(r.id)}
                >
                  撤销标记
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p class="muted" style={{ fontSize: '12.5px', margin: 0 }}>
            尚未标记已核对范围。绿色为你明确标记已逐笔查完的时段，圆点/笔数仅表示有记录。
          </p>
        )}
      </div>
    </Modal>
  );
}
