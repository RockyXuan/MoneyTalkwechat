import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Icon, categoryColor, ownerColor } from '../components/Icons.jsx';
import { useApp } from '../state/appContext.jsx';
import { queryString, request } from '../api.js';
import { destroyChart, renderChart } from '../charts.js';
import { money, recordDateLabel } from '../../shared/format.js';
import { SPENDING_LABELS } from '../../shared/spending-labels.js';

function InlineBillsList({ scope, from, to, catMap, ownerMap, onEditEntry, onClear, onOpenBillsPage }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!scope) {
      setRows([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError('');
    const qs = queryString({
      from,
      to,
      type: 'expense',
      category_id: scope.category_id || undefined,
      subcategory: scope.subcategory !== undefined ? (scope.subcategory === null ? 'none' : scope.subcategory) : undefined,
      owner_id: scope.owner_id !== undefined ? (scope.owner_id === null ? 'none' : scope.owner_id) : undefined,
      limit: 50,
    });
    request(`/entries?${qs}`, { signal: ctrl.signal })
      .then(res => {
        if (!ctrl.signal.aborted) {
          setRows(res.entries || []);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!ctrl.signal.aborted) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => ctrl.abort();
  }, [
    from,
    to,
    scope?.category_id,
    scope?.subcategory,
    scope?.owner_id,
  ]);

  if (!scope) return null;

  return (
    <div class="bar-row" style={{ background: 'var(--surface-subtle)', gap: '10px', marginTop: '12px' }} aria-label="下钻消费明细">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
        <strong style={{ fontSize: '14px' }}>明细：{scope.label}</strong>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            class="text-button"
            data-action="stats-open-scope-bills"
            onClick={() => onOpenBillsPage(scope)}
          >
            在账单页打开 <Icon name="right" size={14} />
          </button>
          {onClear && (
            <button
              type="button"
              class="text-button"
              data-action="stats-clear-drill"
              onClick={onClear}
            >
              收起明细
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <span class="muted" style={{ fontSize: '13px' }}>正在加载明细…</span>
      ) : error ? (
        <span class="field-error">{error}</span>
      ) : rows.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {rows.map(entry => {
            const cat = catMap.get(entry.category_id);
            const owner = entry.owner_id ? ownerMap.get(entry.owner_id) : null;
            return (
              <button
                key={entry.id}
                type="button"
                class="record-row"
                style={{ width: '100%', textAlign: 'left', padding: '8px 12px' }}
                data-action="stats-drill-edit-entry"
                onClick={() => onEditEntry(entry.id)}
              >
                <div class="record-body">
                  <strong>{entry.note || cat?.name || entry.category_name}</strong>
                  <div class="muted" style={{ fontSize: '12px' }}>
                    {recordDateLabel(entry.occurred_on)} · {entry.category_name}
                    {entry.subcategory ? ` · ${entry.subcategory}` : ''}
                    {owner ? ` · @${owner.name}` : ''}
                  </div>
                </div>
                <strong class="tabular">−{money(entry.amount_minor, false)}</strong>
              </button>
            );
          })}
        </div>
      ) : (
        <span class="muted" style={{ fontSize: '13px' }}>该组合当期暂无明细记录。</span>
      )}
    </div>
  );
}

export function StatsPage() {
  const {
    stats,
    categories,
    owners,
    recent,
    period,
    changePeriod,
    chart,
    setChart,
    statsView,
    setStatsView,
    openEntryById,
    openNewEntryModal,
    navigate,
    setMonth,
    loading,
  } = useApp();

  const [barDim, setBarDim] = useState('category'); // 'category' | 'owner'
  const [expandedBarCats, setExpandedBarCats] = useState({});
  const [expandedMatrixCats, setExpandedMatrixCats] = useState({});
  const [inlineScope, setInlineScope] = useState(null);
  const [selectedDrillCatId, setSelectedDrillCatId] = useState(null);
  const [drillFilterSub, setDrillFilterSub] = useState(undefined); // undefined=all, null='none', string
  const [drillFilterOwner, setDrillFilterOwner] = useState(undefined);
  const canvasRef = useRef(null);

  const catMap = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);
  const ownerMap = useMemo(() => new Map(owners.map(o => [o.id, o])), [owners]);

  // Default selected major category for Ring Drilldown
  useEffect(() => {
    if (!stats?.categories?.length) {
      setSelectedDrillCatId(null);
      return;
    }
    if (!selectedDrillCatId || !stats.categories.some(c => c.id === selectedDrillCatId)) {
      setSelectedDrillCatId(stats.categories[0].id);
      setDrillFilterSub(undefined);
      setDrillFilterOwner(undefined);
    }
  }, [stats?.categories]);

  // Chart.js lifecycle when Bars view is visible
  useEffect(() => {
    if (statsView !== 'bars' || !stats?.totals?.expense_minor || !canvasRef.current) {
      destroyChart();
      return;
    }
    renderChart(canvasRef.current, stats, chart, catId => {
      openBillsWithFilter({ category_id: catId });
    });
    return () => destroyChart();
  }, [stats, chart, statsView]);

  const ownerColumns = useMemo(() => {
    const usedIds = new Set((stats?.owner_totals || []).map(o => o.owner_id));
    const list = owners
      .filter(o => !o.archived || usedIds.has(o.id))
      .map(o => ({ id: o.id, name: `@${o.name}`, color: ownerColor(o) }));
    if (usedIds.has(null)) {
      list.push({ id: null, name: '未指定', color: '#94A3B8' });
    }
    return list;
  }, [owners, stats?.owner_totals]);

  if (!stats && loading) {
    return <div class="card">正在计算统计数据…</div>;
  }
  if (!stats) return null;

  const prefix = period === 'month' ? '本月' : period === 'quarter' ? '本季' : '本年';
  const totalExp = stats.totals.expense_minor;

  function openBillsWithFilter(extra) {
    navigate('bills', {
      nextBillRange: { from: stats.from, to: stats.to },
      nextFilters: {
        q: '',
        type: 'expense',
        category_id: extra.category_id || '',
        subcategory: extra.subcategory !== undefined ? (extra.subcategory === null ? 'none' : extra.subcategory) : '',
        owner_id: extra.owner_id !== undefined ? (extra.owner_id === null ? 'none' : extra.owner_id) : '',
      },
      nextOffset: 0,
    });
    setMonth(stats.from.slice(0, 7));
  }

  // Build SVG Donut slices cleanly using circumference dasharray
  const donutRadius = 64;
  const donutCircumference = 2 * Math.PI * donutRadius;
  let runningOffset = 0;
  const donutSegments = (stats.categories || []).map(cat => {
    const frac = totalExp > 0 ? cat.amount_minor / totalExp : 0;
    const dash = frac * donutCircumference;
    const seg = {
      ...cat,
      frac,
      dash,
      offset: -runningOffset,
    };
    runningOffset += dash;
    return seg;
  });

  const activeDrillCat =
    stats.categories.find(c => c.id === selectedDrillCatId) || stats.categories[0] || null;
  const drillSubs = activeDrillCat
    ? (stats.subcategories || []).filter(s => s.category_id === activeDrillCat.id)
    : [];
  const drillOwners = useMemo(() => {
    if (!activeDrillCat) return [];
    const byOwner = new Map();
    for (const m of stats.matrix || []) {
      if (m.category_id !== activeDrillCat.id) continue;
      const key = m.owner_id ?? '__none__';
      const prev = byOwner.get(key) || { owner_id: m.owner_id, amount_minor: 0, count: 0 };
      prev.amount_minor += m.amount_minor;
      prev.count += m.count;
      byOwner.set(key, prev);
    }
    return [...byOwner.values()].sort((a, b) => b.amount_minor - a.amount_minor);
  }, [activeDrillCat?.id, stats.matrix]);

  const drillScope = activeDrillCat
    ? {
        category_id: activeDrillCat.id,
        ...(drillFilterSub !== undefined ? { subcategory: drillFilterSub } : {}),
        ...(drillFilterOwner !== undefined ? { owner_id: drillFilterOwner } : {}),
        label: [
          activeDrillCat.name,
          drillFilterSub !== undefined ? (drillFilterSub === null ? '未细分' : drillFilterSub) : null,
          drillFilterOwner !== undefined
            ? drillFilterOwner === null
              ? '未指定成员'
              : `@${ownerMap.get(drillFilterOwner)?.name || drillFilterOwner}`
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Period + 3 Stats View Switcher */}
      <div class="stats-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div class="segmented" role="group" aria-label="统计周期">
            {[['month', '按月'], ['quarter', '按季'], ['year', '按年']].map(([id, label]) => (
              <button
                key={id}
                type="button"
                data-action="stats-period"
                class={period === id ? 'active' : ''}
                aria-pressed={period === id}
                onClick={() => changePeriod(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div class="segmented" role="tablist" aria-label="统计视图切换">
            {[
              ['bars', '分类长条'],
              ['matrix', '交叉透视表'],
              ['drilldown', '环图下钻'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                data-action="stats-view"
                class={statsView === id ? 'active' : ''}
                aria-selected={statsView === id}
                onClick={() => {
                  setStatsView(id);
                  setInlineScope(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <span class="muted tabular" style={{ fontSize: '13px' }}>
          {stats.from} — {stats.to}
        </span>
      </div>

      {/* 3 KPI Summary Cards */}
      <div class="summary-cards">
        <div class="summary-card expense">
          <span class="summary-icon">
            <Icon name="wallet" size={22} />
          </span>
          <div>
            <span class="summary-label">{prefix}支出</span>
            <strong class="summary-value money">{money(stats.totals.expense_minor)}</strong>
          </div>
        </div>
        <div class="summary-card income">
          <span class="summary-icon">
            <Icon name="income" size={22} />
          </span>
          <div>
            <span class="summary-label">{prefix}收入</span>
            <strong class="summary-value money">{money(stats.totals.income_minor)}</strong>
          </div>
        </div>
        <div class="summary-card balance">
          <span class="summary-icon">
            <Icon name="pie" size={22} />
          </span>
          <div>
            <span class="summary-label">{prefix}结余</span>
            <strong class="summary-value money">
              {money(stats.totals.income_minor - stats.totals.expense_minor)}
            </strong>
          </div>
        </div>
      </div>

      {!totalExp ? (
        <section class="card" style={{ textAlign: 'center', padding: '40px 16px' }}>
          <Icon name="folder" size={34} />
          <h3>这段时间还没有支出</h3>
          <p class="muted">记下一笔，三种统计视图就会自动生成。</p>
          <button
            type="button"
            class="button primary"
            data-action="stats-empty-new"
            onClick={() => openNewEntryModal()}
          >
            记一笔
          </button>
        </section>
      ) : (
        <>
          {/* VIEW 1: 分类长条 + @归属人切换 + Chart.js 趋势卡 */}
          {statsView === 'bars' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <section class="card" aria-label="可展开分类长条与归属人分布">
                <div class="card-heading">
                  <h2>{barDim === 'category' ? '支出排行（点大类展开二级子类）' : '成员消费分布（点成员查明细）'}</h2>
                  <div class="segmented" role="group" aria-label="排行维度">
                    <button
                      type="button"
                      data-action="stats-bar-dim-cat"
                      class={barDim === 'category' ? 'active' : ''}
                      onClick={() => {
                        setBarDim('category');
                        setInlineScope(null);
                      }}
                    >
                      按大类 / 子类
                    </button>
                    <button
                      type="button"
                      data-action="stats-bar-dim-owner"
                      class={barDim === 'owner' ? 'active' : ''}
                      onClick={() => {
                        setBarDim('owner');
                        setInlineScope(null);
                      }}
                    >
                      按 @归属人
                    </button>
                  </div>
                </div>

                {barDim === 'category' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {stats.categories.map((cat, idx) => {
                      const pct = ((cat.amount_minor / totalExp) * 100).toFixed(1);
                      const maxAmount = stats.categories[0]?.amount_minor || 1;
                      const expanded = Boolean(expandedBarCats[cat.id]);
                      const childSubs = (stats.subcategories || []).filter(
                        s => s.category_id === cat.id
                      );
                      return (
                        <div key={cat.id} class="bar-row">
                          <button
                            type="button"
                            data-action="stats-bar-expand"
                            aria-expanded={expanded}
                            style={{
                              border: 0,
                              background: 'transparent',
                              padding: 0,
                              textAlign: 'left',
                              width: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                            onClick={() =>
                              setExpandedBarCats(prev => ({ ...prev, [cat.id]: !prev[cat.id] }))
                            }
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span class="muted tabular" style={{ fontSize: '12px', width: '18px' }}>
                                  {idx + 1}
                                </span>
                                <span
                                  class="color-dot"
                                  style={{ '--dot-color': categoryColor(cat) }}
                                />
                                <strong>{cat.name}</strong>
                                {cat.spending_label && SPENDING_LABELS[cat.spending_label] && (
                                  <span class={`spending-tag spending-${cat.spending_label}`}>
                                    {SPENDING_LABELS[cat.spending_label]}
                                  </span>
                                )}
                                <Icon name={expanded ? 'down' : 'right'} size={14} />
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <strong class="tabular">{money(cat.amount_minor)}</strong>
                                <span class="muted tabular" style={{ fontSize: '12px', minWidth: '42px', textAlign: 'right' }}>
                                  {pct}%
                                </span>
                              </div>
                            </div>
                            <div class="bar-track">
                              <div
                                class="bar-fill"
                                style={{
                                  width: `${(cat.amount_minor / maxAmount) * 100}%`,
                                  background: categoryColor(cat),
                                }}
                              />
                            </div>
                          </button>

                          {expanded && (
                            <div class="sub-bar-list">
                              {childSubs.map(sub => {
                                const subName = sub.subcategory ?? null;
                                const label = subName || '未细分';
                                const subPct = ((sub.amount_minor / Math.max(1, cat.amount_minor)) * 100).toFixed(1);
                                return (
                                  <button
                                    key={label}
                                    type="button"
                                    data-action="stats-bar-sub-pick"
                                    style={{
                                      border: 0,
                                      background: 'transparent',
                                      padding: '5px 8px',
                                      borderRadius: '8px',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      fontSize: '13px',
                                      width: '100%',
                                      textAlign: 'left',
                                    }}
                                    onClick={() =>
                                      setInlineScope({
                                        category_id: cat.id,
                                        subcategory: subName,
                                        label: `${cat.name} · ${label}`,
                                      })
                                    }
                                  >
                                    <span>
                                      {label} <small class="muted">({sub.count} 笔 · 占大类 {subPct}%)</small>
                                    </span>
                                    <strong class="tabular">{money(sub.amount_minor)}</strong>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {(stats.owner_totals || []).map(row => {
                      const owner = row.owner_id ? ownerMap.get(row.owner_id) : null;
                      const pct = ((row.amount_minor / totalExp) * 100).toFixed(1);
                      const label = owner ? `@${owner.name}` : '未指定成员';
                      return (
                        <button
                          key={row.owner_id ?? '__none__'}
                          type="button"
                          class="bar-row"
                          style={{ width: '100%', textAlign: 'left' }}
                          data-action="stats-owner-bar-pick"
                          onClick={() =>
                            setInlineScope({
                              owner_id: row.owner_id,
                              label,
                            })
                          }
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span
                                class="color-dot"
                                style={{ '--dot-color': owner ? ownerColor(owner) : '#94A3B8' }}
                              />
                              <strong>{label}</strong>
                              <small class="muted">{row.count} 笔</small>
                            </span>
                            <span style={{ display: 'flex', gap: '10px' }}>
                              <strong class="tabular">{money(row.amount_minor)}</strong>
                              <span class="muted tabular">{pct}%</span>
                            </span>
                          </div>
                          <div class="bar-track">
                            <div
                              class="bar-fill"
                              style={{
                                width: `${pct}%`,
                                background: owner ? ownerColor(owner) : '#94A3B8',
                              }}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <InlineBillsList
                  scope={inlineScope}
                  from={stats.from}
                  to={stats.to}
                  catMap={catMap}
                  ownerMap={ownerMap}
                  onEditEntry={id => openEntryById(id)}
                  onClear={() => setInlineScope(null)}
                  onOpenBillsPage={openBillsWithFilter}
                />
              </section>

              {/* Trend Chart Card (Chart.js) */}
              <section class="card" aria-label="支出趋势图">
                <div class="card-heading">
                  <h2>{chart === 'bar' ? `${prefix}支出趋势` : chart === 'line' ? '分类变化' : '支出分布'}</h2>
                  <div class="segmented" role="group" aria-label="图表类型">
                    {[['bar', '柱状'], ['line', '折线'], ['pie', '饼图']].map(([mode, lbl]) => (
                      <button
                        key={mode}
                        type="button"
                        data-action="stats-chart-mode"
                        class={chart === mode ? 'active' : ''}
                        aria-pressed={chart === mode}
                        onClick={() => setChart(mode)}
                      >
                        <Icon name={mode} size={15} />
                        <span>{lbl}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div class={`chart-wrap ${chart === 'pie' ? 'pie-wrap' : ''}`}>
                  <canvas
                    ref={canvasRef}
                    id="expense-chart"
                    role="img"
                    aria-label={`${prefix}支出合计 ${money(totalExp)}`}
                  />
                </div>
                <details style={{ marginTop: '12px', fontSize: '12.5px' }}>
                  <summary class="muted" style={{ cursor: 'pointer' }}>查看图表数据</summary>
                  <div class="table-scroll" style={{ marginTop: '8px' }}>
                    <table class="entries-table">
                      <thead>
                        <tr>
                          <th>时间</th>
                          <th>分类</th>
                          <th class="numeric">金额</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.series.map((pt, idx) => (
                          <tr key={idx}>
                            <td>{stats.bucket === 'month' ? `${pt.bucket.slice(0, 4)}年${Number(pt.bucket.slice(5))}月` : recordDateLabel(pt.bucket)}</td>
                            <td>{stats.categories.find(c => c.id === pt.category_id)?.name}</td>
                            <td class="numeric tabular">{money(pt.amount_minor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>
            </div>
          )}

          {/* VIEW 2: 二维交叉透视表（分类 × @归属人，点数字直接在表下出明细，绝无弹窗） */}
          {statsView === 'matrix' && (
            <section class="card" aria-label="分类与 @归属人 交叉透视表">
              <div class="card-heading">
                <h2>分类 × @归属人 交叉透视表</h2>
                <small class="muted">点 ▶ 展开二级子类；点任意非零金额，直接在表下方展开明细</small>
              </div>
              <div class="table-scroll">
                <table class="pivot-table">
                  <thead>
                    <tr>
                      <th>大类 / 二级子类</th>
                      {ownerColumns.map(col => (
                        <th key={col.id ?? '__none__'} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {col.name}
                        </th>
                      ))}
                      <th style={{ textAlign: 'right' }}>合计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.categories.map(cat => {
                      const isExpanded = Boolean(expandedMatrixCats[cat.id]);
                      const childSubs = (stats.subcategories || []).filter(
                        s => s.category_id === cat.id
                      );
                      const cellSum = (subFilter, ownerId) =>
                        (stats.matrix || [])
                          .filter(
                            m =>
                              m.category_id === cat.id &&
                              (ownerId === undefined ? true : m.owner_id === ownerId) &&
                              (subFilter === undefined ? true : m.subcategory === subFilter)
                          )
                          .reduce((sum, m) => sum + m.amount_minor, 0);

                      const rows = [
                        {
                          key: cat.id,
                          isMajor: true,
                          subFilter: undefined,
                          title: cat.name,
                          total: cat.amount_minor,
                        },
                        ...(isExpanded
                          ? childSubs.map(s => ({
                              key: `${cat.id}::${s.subcategory ?? '__none__'}`,
                              isMajor: false,
                              subFilter: s.subcategory ?? null,
                              title: s.subcategory || '未细分',
                              total: s.amount_minor,
                            }))
                          : []),
                      ];

                      return rows.map(r => (
                        <tr
                          key={r.key}
                          style={r.isMajor ? { fontWeight: 600 } : { background: 'var(--surface-subtle)' }}
                        >
                          <td>
                            {r.isMajor ? (
                              <button
                                type="button"
                                data-action="stats-matrix-toggle-cat"
                                style={{
                                  border: 0,
                                  background: 'transparent',
                                  padding: '2px 4px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontWeight: 650,
                                }}
                                onClick={() =>
                                  setExpandedMatrixCats(prev => ({
                                    ...prev,
                                    [cat.id]: !prev[cat.id],
                                  }))
                                }
                              >
                                <Icon name={isExpanded ? 'down' : 'right'} size={14} />
                                <span
                                  class="color-dot"
                                  style={{ '--dot-color': categoryColor(cat) }}
                                />
                                <span>{r.title}</span>
                              </button>
                            ) : (
                              <span style={{ paddingLeft: '24px', color: 'var(--ink-muted)' }}>
                                ├ {r.title}
                              </span>
                            )}
                          </td>

                          {ownerColumns.map(col => {
                            const val = cellSum(r.subFilter, col.id);
                            const isSelected =
                              inlineScope &&
                              inlineScope.category_id === cat.id &&
                              inlineScope.subcategory === r.subFilter &&
                              inlineScope.owner_id === col.id;
                            return (
                              <td key={col.id ?? '__none__'} style={{ textAlign: 'right' }}>
                                {val > 0 ? (
                                  <button
                                    type="button"
                                    class={`pivot-cell-btn ${isSelected ? 'active' : ''}`}
                                    data-action="stats-matrix-cell"
                                    onClick={() =>
                                      setInlineScope({
                                        category_id: cat.id,
                                        ...(r.subFilter !== undefined ? { subcategory: r.subFilter } : {}),
                                        owner_id: col.id,
                                        label: `${cat.name}${r.isMajor ? '' : ` · ${r.title}`} · ${col.name}`,
                                      })
                                    }
                                  >
                                    {money(val, false)}
                                  </button>
                                ) : (
                                  <span class="muted">—</span>
                                )}
                              </td>
                            );
                          })}

                          <td style={{ textAlign: 'right' }} class="tabular">
                            <button
                              type="button"
                              class="pivot-cell-btn"
                              style={{ fontWeight: 700 }}
                              data-action="stats-matrix-row-total"
                              onClick={() =>
                                setInlineScope({
                                  category_id: cat.id,
                                  ...(r.subFilter !== undefined ? { subcategory: r.subFilter } : {}),
                                  label: `${cat.name}${r.isMajor ? '' : ` · ${r.title}`}`,
                                })
                              }
                            >
                              {money(r.total, false)}
                            </button>
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 700 }}>
                      <td>合计</td>
                      {ownerColumns.map(col => {
                        const oRow = (stats.owner_totals || []).find(o => o.owner_id === col.id);
                        return (
                          <td key={col.id ?? '__none__'} style={{ textAlign: 'right' }} class="tabular">
                            {oRow ? money(oRow.amount_minor, false) : '—'}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'right' }} class="tabular">
                        {money(totalExp)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <InlineBillsList
                scope={inlineScope}
                from={stats.from}
                to={stats.to}
                catMap={catMap}
                ownerMap={ownerMap}
                onEditEntry={id => openEntryById(id)}
                onClear={() => setInlineScope(null)}
                onOpenBillsPage={openBillsWithFilter}
              />
            </section>
          )}

          {/* VIEW 3: 环图下钻（固定顶环 + 点击直接在下方展开二级子类、花给了谁、明细，绝无弹窗） */}
          {statsView === 'drilldown' && (
            <section class="card" aria-label="环图下钻剥洋葱统计">
              <div class="card-heading">
                <h2>点任意大类「剥洋葱」下钻（同页直接展开，不弹框）</h2>
                <small class="muted">先看总盘，点谁就直接在下面看它的子类、@成员与明细</small>
              </div>

              <div class="drilldown-top">
                <svg
                  width="172"
                  height="172"
                  viewBox="0 0 172 172"
                  aria-label="各分类占比圆环"
                  style={{ flexShrink: 0 }}
                >
                  <circle
                    cx="86"
                    cy="86"
                    r={donutRadius}
                    fill="none"
                    stroke="var(--surface-subtle)"
                    strokeWidth="24"
                  />
                  {donutSegments.map(seg => {
                    const isSelected = activeDrillCat?.id === seg.id;
                    return (
                      <circle
                        key={seg.id}
                        cx="86"
                        cy="86"
                        r={donutRadius}
                        fill="none"
                        stroke={categoryColor(seg)}
                        strokeWidth={isSelected ? '28' : '22'}
                        strokeDasharray={`${seg.dash} ${donutCircumference}`}
                        strokeDashoffset={seg.offset}
                        transform="rotate(-90 86 86)"
                        style={{ cursor: 'pointer', transition: 'stroke-width 0.18s ease' }}
                        data-action="stats-donut-slice"
                        onClick={() => {
                          setSelectedDrillCatId(seg.id);
                          setDrillFilterSub(undefined);
                          setDrillFilterOwner(undefined);
                        }}
                      />
                    );
                  })}
                  <text
                    x="86"
                    y="80"
                    textAnchor="middle"
                    fill="var(--ink-muted)"
                    fontSize="11"
                  >
                    总支出
                  </text>
                  <text
                    x="86"
                    y="100"
                    textAnchor="middle"
                    fill="var(--ink)"
                    fontSize="14"
                    fontWeight="700"
                  >
                    {money(totalExp)}
                  </text>
                </svg>

                <div class="donut-major-grid">
                  {stats.categories.map(cat => {
                    const active = activeDrillCat?.id === cat.id;
                    const pct = ((cat.amount_minor / totalExp) * 100).toFixed(1);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        class={`donut-major-card ${active ? 'active' : ''}`}
                        aria-pressed={active}
                        data-action="stats-drilldown-cat"
                        onClick={() => {
                          setSelectedDrillCatId(cat.id);
                          setDrillFilterSub(undefined);
                          setDrillFilterOwner(undefined);
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600 }}>
                            <span class="color-dot" style={{ '--dot-color': categoryColor(cat) }} />
                            {cat.name}
                          </span>
                          <small class="muted">{pct}%</small>
                        </div>
                        <strong class="tabular" style={{ fontSize: '15px' }}>
                          {money(cat.amount_minor)}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeDrillCat && (
                <div class="drilldown-panel" aria-label={`${activeDrillCat.name} 下钻展开区`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span class="color-dot" style={{ '--dot-color': categoryColor(activeDrillCat) }} />
                      <span>{activeDrillCat.name} 下钻分析</span>
                      <span class="tabular" style={{ color: 'var(--primary)' }}>
                        {money(activeDrillCat.amount_minor)}
                      </span>
                    </h3>
                    {(drillFilterSub !== undefined || drillFilterOwner !== undefined) && (
                      <button
                        type="button"
                        class="text-button"
                        data-action="stats-drilldown-reset"
                        onClick={() => {
                          setDrillFilterSub(undefined);
                          setDrillFilterOwner(undefined);
                        }}
                      >
                        重置子类 / 成员筛选
                      </button>
                    )}
                  </div>

                  <div class="review-grid">
                    {/* Subcategories breakdown */}
                    <div class="bar-row">
                      <strong style={{ fontSize: '13.5px', marginBottom: '4px' }}>二级子类分布（点一下过滤下方明细）</strong>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {drillSubs.map(s => {
                          const subVal = s.subcategory ?? null;
                          const selected = drillFilterSub === subVal;
                          const pct = ((s.amount_minor / Math.max(1, activeDrillCat.amount_minor)) * 100).toFixed(1);
                          return (
                            <button
                              key={subVal ?? '__none__'}
                              type="button"
                              data-action="stats-drilldown-sub"
                              class="chip-btn"
                              aria-pressed={selected}
                              style={{ justifyContent: 'space-between', width: '100%', borderRadius: '10px', padding: '7px 10px' }}
                              onClick={() => setDrillFilterSub(selected ? undefined : subVal)}
                            >
                              <span>
                                {s.subcategory || '未细分'} <small>({s.count} 笔 · {pct}%)</small>
                              </span>
                              <strong class="tabular">{money(s.amount_minor)}</strong>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* @Owner breakdown */}
                    <div class="bar-row">
                      <strong style={{ fontSize: '13.5px', marginBottom: '4px' }}>花给了谁（@归属人分解）</strong>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {drillOwners.map(o => {
                          const ownerObj = o.owner_id ? ownerMap.get(o.owner_id) : null;
                          const selected = drillFilterOwner === o.owner_id;
                          const pct = ((o.amount_minor / Math.max(1, activeDrillCat.amount_minor)) * 100).toFixed(1);
                          return (
                            <button
                              key={o.owner_id ?? '__none__'}
                              type="button"
                              data-action="stats-drilldown-owner"
                              class="chip-btn"
                              aria-pressed={selected}
                              style={{ justifyContent: 'space-between', width: '100%', borderRadius: '10px', padding: '7px 10px' }}
                              onClick={() => setDrillFilterOwner(selected ? undefined : o.owner_id)}
                            >
                              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span
                                  class="color-dot"
                                  style={{ '--dot-color': ownerObj ? ownerColor(ownerObj) : '#94A3B8' }}
                                />
                                <span>{ownerObj ? `@${ownerObj.name}` : '未指定成员'}</span>
                                <small>({o.count} 笔 · {pct}%)</small>
                              </span>
                              <strong class="tabular">{money(o.amount_minor)}</strong>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <InlineBillsList
                    scope={drillScope}
                    from={stats.from}
                    to={stats.to}
                    catMap={catMap}
                    ownerMap={ownerMap}
                    onEditEntry={id => openEntryById(id)}
                    onOpenBillsPage={openBillsWithFilter}
                  />
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* Recent Records Snapshot */}
      {(recent?.entries?.length || 0) > 0 && (
        <section class="card" aria-label="最近账单">
          <div class="card-heading">
            <h2>
              最近账单 <small>仅显示最近 6 笔，非完整账单</small>
            </h2>
            <a
              href="/bills"
              class="text-button"
              data-route="bills"
              onClick={e => {
                e.preventDefault();
                navigate('bills');
              }}
            >
              查看全部 <Icon name="right" size={14} />
            </a>
          </div>
          <div class="table-scroll">
            <table class="entries-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>备注</th>
                  <th>大类 · 子类</th>
                  <th>@成员</th>
                  <th class="numeric">金额</th>
                </tr>
              </thead>
              <tbody>
                {recent.entries.slice(0, 6).map(entry => (
                  <tr key={entry.id}>
                    <td>
                      <button
                        type="button"
                        class="editable-field"
                        data-action="stats-recent-date"
                        onClick={() => openEntryById(entry.id, 'occurred_on')}
                      >
                        {recordDateLabel(entry.occurred_on)}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="editable-field"
                        data-action="stats-recent-note"
                        onClick={() => openEntryById(entry.id, 'note')}
                      >
                        {entry.note || <span class="muted">添加备注</span>}
                      </button>
                    </td>
                    <td>
                      <span class="cat-pill">
                        <span
                          class="color-dot"
                          style={{ '--dot-color': categoryColor(catMap.get(entry.category_id) || entry) }}
                        />
                        {entry.category_name}
                        {entry.subcategory ? ` · ${entry.subcategory}` : ''}
                      </span>
                    </td>
                    <td>
                      <span class="muted" style={{ fontSize: '12.5px' }}>
                        {entry.owner_name ? `@${entry.owner_name}` : '—'}
                      </span>
                    </td>
                    <td class="numeric">
                      <button
                        type="button"
                        class="editable-field tabular"
                        style={{ marginLeft: 'auto', fontWeight: 650 }}
                        data-action="stats-recent-amount"
                        onClick={() => openEntryById(entry.id, 'amount')}
                      >
                        <span class={entry.type === 'income' ? 'income-text' : ''}>
                          {entry.type === 'income' ? '+' : '−'}
                          {money(entry.amount_minor, false)}
                        </span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
