import { useMemo, useState } from 'preact/hooks';
import { Icon, categoryColor, ownerColor } from '../components/Icons.jsx';
import { QuickTagPopover } from '../components/QuickTagPopover.jsx';
import { Modal } from '../components/Modal.jsx';
import { useApp } from '../state/appContext.jsx';
import { download, queryString, request } from '../api.js';
import { money, periodRange, recordDateLabel, today } from '../../shared/format.js';
import { SPENDING_LABELS } from '../../shared/spending-labels.js';

function dayLabelText(day) {
  if (day.length === 7) return recordDateLabel(day);
  const [, m, d] = day.split('-');
  const weekday = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    weekday: 'long',
  }).format(new Date(`${day}T12:00:00+08:00`));
  return `${Number(m)}月${Number(d)}日 ${weekday}`;
}

export function BillsPage() {
  const {
    session,
    bills,
    categories,
    owners,
    month,
    billRange,
    setBillRange,
    filters,
    setFilters,
    offset,
    setOffset,
    syncUrl,
    quickUpdateEntry,
    openEntryById,
    openNewEntryModal,
    toast,
    loading,
  } = useApp();

  const [searchInput, setSearchInput] = useState(filters.q || '');
  const [popover, setPopover] = useState(null); // { entry, mode, rect }
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState(null);

  const refToday = session?.today || today();
  const effectiveRange = billRange || periodRange(month, 'month', refToday);

  const ownerTotalsMap = useMemo(() => {
    const map = new Map();
    for (const row of bills?.owner_totals || []) {
      map.set(row.owner_id ?? '__none__', row);
    }
    return map;
  }, [bills?.owner_totals]);

  const ownerById = useMemo(() => new Map(owners.map(o => [o.id, o])), [owners]);
  const catById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories]);

  const groupedMobileDays = useMemo(() => {
    if (!bills?.entries?.length) return [];
    const groups = new Map();
    for (const entry of bills.entries) {
      if (!groups.has(entry.occurred_on)) groups.set(entry.occurred_on, []);
      groups.get(entry.occurred_on).push(entry);
    }
    return [...groups.entries()];
  }, [bills?.entries]);

  if (!bills && loading) {
    return (
      <div class="card" aria-label="正在加载账单">
        正在读取账单…
      </div>
    );
  }
  if (!bills) return null;

  function applyFilterPatch(nextPatch, nextRange = billRange) {
    const nextFilters = { ...filters, ...nextPatch };
    setFilters(nextFilters);
    if (nextRange !== billRange) setBillRange(nextRange);
    setOffset(0);
    syncUrl({ page: 'bills', filters: nextFilters, billRange: nextRange, offset: 0 });
  }

  function openFiltersModal() {
    setModalDraft({
      q: filters.q || '',
      type: filters.type || '',
      category_id: filters.category_id || '',
      owner_id: filters.owner_id || '',
      from: effectiveRange.from,
      to: effectiveRange.to,
    });
    setFilterModalOpen(true);
  }

  async function handleExportFiltered() {
    try {
      const qs = queryString({
        from: effectiveRange.from,
        to: effectiveRange.to,
        type: filters.type || undefined,
        category_id: filters.category_id || undefined,
        owner_id: filters.owner_id || undefined,
        subcategory: filters.subcategory || undefined,
        q: filters.q || undefined,
      });
      const blob = await request(`/export.csv?${qs}`, { raw: true });
      download(blob, `MoneyTalk-筛选账单-${refToday}.csv`);
      toast('导出文件已准备，请检查浏览器下载');
    } catch (err) {
      toast(err.message);
    }
  }

  const hasFilters = Boolean(
    billRange || filters.q || filters.type || filters.category_id || filters.owner_id || filters.subcategory
  );
  const unassignedTotal = ownerTotalsMap.get('__none__');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Persistent Top @Owner Member Spend Bar (Architecture 2) */}
      <section class="owner-spend-bar" aria-label="按 @归属人 快速查看和筛选花费">
        <button
          type="button"
          class="owner-chip"
          aria-pressed={!filters.owner_id}
          data-action="bills-filter-owner-all"
          onClick={() => applyFilterPatch({ owner_id: '' })}
        >
          <span>全部成员</span>
        </button>

        {owners
          .filter(o => !o.archived || ownerTotalsMap.has(o.id) || filters.owner_id === o.id)
          .map(o => {
            const stat = ownerTotalsMap.get(o.id);
            const active = filters.owner_id === o.id;
            return (
              <button
                key={o.id}
                type="button"
                class="owner-chip"
                aria-pressed={active}
                data-action="bills-filter-owner"
                onClick={() => applyFilterPatch({ owner_id: active ? '' : o.id })}
              >
                <span class="color-dot" style={{ '--dot-color': ownerColor(o) }} />
                <span>@{o.name}</span>
                <small>{stat ? money(stat.expense_minor) : '¥0.00'}</small>
              </button>
            );
          })}

        {unassignedTotal && unassignedTotal.count > 0 && (
          <button
            type="button"
            class="owner-chip"
            aria-pressed={filters.owner_id === 'none'}
            data-action="bills-filter-owner-none"
            onClick={() =>
              applyFilterPatch({ owner_id: filters.owner_id === 'none' ? '' : 'none' })
            }
          >
            <span>未指定</span>
            <small>{money(unassignedTotal.expense_minor)}</small>
          </button>
        )}
      </section>

      {/* Summary KPI */}
      <div class="summary-cards">
        <div class="summary-card expense">
          <span class="summary-icon">
            <Icon name="wallet" size={22} />
          </span>
          <div>
            <span class="summary-label">{hasFilters ? '筛选支出' : '本月支出'}</span>
            <strong class="summary-value money">{money(bills.totals.expense_minor)}</strong>
          </div>
        </div>
        <div class="summary-card income">
          <span class="summary-icon">
            <Icon name="income" size={22} />
          </span>
          <div>
            <span class="summary-label">{hasFilters ? '筛选收入' : '本月收入'}</span>
            <strong class="summary-value money">{money(bills.totals.income_minor)}</strong>
          </div>
        </div>
        <div class="summary-card balance">
          <span class="summary-icon">
            <Icon name="pie" size={22} />
          </span>
          <div>
            <span class="summary-label">{hasFilters ? '筛选结余' : '本月结余'}</span>
            <strong class="summary-value money">
              {money(bills.totals.income_minor - bills.totals.expense_minor)}
            </strong>
          </div>
        </div>
      </div>

      {/* Main Bills Card */}
      <section class="card">
        <div class="bills-toolbar">
          <div class="segmented" role="group" aria-label="收支筛选">
            {[['', '全部'], ['expense', '支出'], ['income', '收入']].map(([val, label]) => (
              <button
                key={val}
                type="button"
                data-action="bills-filter-type"
                aria-pressed={filters.type === val}
                class={filters.type === val ? 'active' : ''}
                onClick={() => applyFilterPatch({ type: val })}
              >
                {label}
              </button>
            ))}
          </div>

          <form
            class="search-form"
            onSubmit={e => {
              e.preventDefault();
              applyFilterPatch({ q: searchInput.trim() });
            }}
          >
            <Icon name="search" size={16} />
            <input
              type="search"
              name="q"
              maxLength={200}
              aria-label="搜索备注、大类、子类或 @成员"
              placeholder="搜备注、大类/子类或 @成员…"
              value={searchInput}
              onInput={e => setSearchInput(e.currentTarget.value)}
            />
            <button type="submit" class="icon-button" aria-label="搜索" data-action="bills-search">
              <Icon name="arrow" size={16} />
            </button>
          </form>

          <button
            type="button"
            class="button secondary"
            data-action="bills-open-filters"
            onClick={openFiltersModal}
          >
            <Icon name="filter" size={15} />
            筛选
          </button>

          <button
            type="button"
            class="button secondary"
            data-action="bills-export-filter"
            onClick={handleExportFiltered}
          >
            <Icon name="download" size={15} />
            导出 CSV
          </button>
        </div>

        {hasFilters && (
          <div class="active-filters" aria-label="当前筛选条件">
            {filters.q && (
              <button
                type="button"
                class="filter-chip"
                data-action="bills-clear-q"
                onClick={() => {
                  setSearchInput('');
                  applyFilterPatch({ q: '' });
                }}
              >
                <span>搜索：{filters.q}</span>
                <Icon name="close" size={13} />
              </button>
            )}
            {filters.type && (
              <button
                type="button"
                class="filter-chip"
                data-action="bills-clear-type"
                onClick={() => applyFilterPatch({ type: '' })}
              >
                <span>{filters.type === 'expense' ? '支出' : '收入'}</span>
                <Icon name="close" size={13} />
              </button>
            )}
            {filters.category_id && (
              <button
                type="button"
                class="filter-chip"
                data-action="bills-clear-category"
                onClick={() => applyFilterPatch({ category_id: '', subcategory: '' })}
              >
                <span>
                  分类：{catById.get(filters.category_id)?.name || filters.category_id}
                  {filters.subcategory ? ` / ${filters.subcategory}` : ''}
                </span>
                <Icon name="close" size={13} />
              </button>
            )}
            {filters.owner_id && (
              <button
                type="button"
                class="filter-chip"
                data-action="bills-clear-owner"
                onClick={() => applyFilterPatch({ owner_id: '' })}
              >
                <span>
                  成员：{filters.owner_id === 'none' ? '未指定' : `@${ownerById.get(filters.owner_id)?.name || filters.owner_id}`}
                </span>
                <Icon name="close" size={13} />
              </button>
            )}
            {billRange && (
              <button
                type="button"
                class="filter-chip"
                data-action="bills-clear-range"
                onClick={() => applyFilterPatch({}, null)}
              >
                <span>期间：{billRange.from} 至 {billRange.to}</span>
                <Icon name="close" size={13} />
              </button>
            )}
            <button
              type="button"
              class="text-button"
              data-action="bills-clear-all"
              onClick={() => {
                setSearchInput('');
                applyFilterPatch(
                  { q: '', type: '', category_id: '', owner_id: '', subcategory: '' },
                  null
                );
              }}
            >
              清除全部筛选
            </button>
          </div>
        )}

        <div class="filter-summary">
          <span>
            共 {bills.totals.count} 笔记录
            {bills.totals.month_precision_count > 0 && ' · 含只记月份记录'}
          </span>
          <span>点分类或 @归属人 可直接 1-click 改分类或成员</span>
        </div>

        {bills.entries.length ? (
          <>
            {/* Desktop Table */}
            <div class="desktop-bills table-scroll">
              <table class="entries-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>备注</th>
                    <th>大类 · 子类</th>
                    <th>@归属人</th>
                    <th class="numeric">金额</th>
                    <th class="numeric">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.entries.map(entry => {
                    const cat = catById.get(entry.category_id);
                    const owner = entry.owner_id ? ownerById.get(entry.owner_id) : null;
                    return (
                      <tr key={entry.id} data-entry-id={entry.id}>
                        <td>
                          <button
                            type="button"
                            class="editable-field"
                            data-action="bill-edit-date"
                            aria-label={`修改日期：${recordDateLabel(entry.occurred_on)}`}
                            onClick={() => openEntryById(entry.id, 'occurred_on')}
                          >
                            <span>{recordDateLabel(entry.occurred_on)}</span>
                            {entry.occurred_on.length === 7 && (
                              <span class="month-badge">仅记月份</span>
                            )}
                          </button>
                        </td>
                        <td>
                          <button
                            type="button"
                            class="editable-field"
                            data-action="bill-edit-note"
                            aria-label={`修改备注：${entry.note || '无备注'}`}
                            onClick={() => openEntryById(entry.id, 'note')}
                          >
                            <span>{entry.note || <span class="muted">添加备注</span>}</span>
                          </button>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              class="editable-pill"
                              data-action="bill-quick-category"
                              aria-label={`修改分类：${entry.category_name}${entry.subcategory ? ` · ${entry.subcategory}` : ''}`}
                              onClick={e =>
                                setPopover({
                                  entry,
                                  mode: 'category',
                                  rect: e.currentTarget.getBoundingClientRect(),
                                })
                              }
                            >
                              <span
                                class="color-dot"
                                style={{ '--dot-color': categoryColor(cat || entry) }}
                              />
                              <span>
                                {entry.category_name}
                                {entry.subcategory ? ` · ${entry.subcategory}` : ''}
                              </span>
                            </button>
                            {entry.spending_label && SPENDING_LABELS[entry.spending_label] && (
                              <span class={`spending-tag spending-${entry.spending_label}`}>
                                {SPENDING_LABELS[entry.spending_label]}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            class={`owner-pill-sm ${owner ? 'has-owner' : ''}`}
                            data-action="bill-quick-owner"
                            aria-label={`修改归属人：${owner ? `@${owner.name}` : '未指定'}`}
                            onClick={e =>
                              setPopover({
                                entry,
                                mode: 'owner',
                                rect: e.currentTarget.getBoundingClientRect(),
                              })
                            }
                          >
                            {owner && (
                              <span
                                class="color-dot"
                                style={{ '--dot-color': ownerColor(owner) }}
                              />
                            )}
                            <span>{owner ? `@${owner.name}` : '+ @'}</span>
                          </button>
                        </td>
                        <td class="numeric">
                          <button
                            type="button"
                            class="editable-field tabular"
                            style={{ marginLeft: 'auto', fontWeight: 650 }}
                            data-action="bill-edit-amount"
                            aria-label={`修改金额：${money(entry.amount_minor)}`}
                            onClick={() => openEntryById(entry.id, 'amount')}
                          >
                            <span class={entry.type === 'income' ? 'income-text' : ''}>
                              {entry.type === 'income' ? '+' : '−'}
                              {money(entry.amount_minor, false)}
                            </span>
                          </button>
                        </td>
                        <td>
                          <div class="table-actions">
                            <button
                              type="button"
                              class="icon-button"
                              title="详情与编辑"
                              aria-label="详情与编辑"
                              data-action="bill-open-detail"
                              onClick={() => openEntryById(entry.id)}
                            >
                              <Icon name="pencil" size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Grouped List */}
            <div class="mobile-bills">
              {groupedMobileDays.map(([day, entries]) => {
                const dayTotal = bills.days.find(d => d.occurred_on === day);
                return (
                  <section key={day} class="day-group">
                    <div class="day-heading">
                      <button
                        type="button"
                        data-action="bills-backdate"
                        onClick={() => openNewEntryModal(day)}
                      >
                        {dayLabelText(day)}
                      </button>
                      <span class="tabular">
                        {dayTotal?.expense_minor ? `支出 ${money(dayTotal.expense_minor)}` : ''}
                        {dayTotal?.income_minor ? ` 收入 ${money(dayTotal.income_minor)}` : ''}
                      </span>
                    </div>

                    {entries.map(entry => {
                      const cat = catById.get(entry.category_id);
                      const owner = entry.owner_id ? ownerById.get(entry.owner_id) : null;
                      return (
                        <div key={entry.id} class="record-row" data-entry-id={entry.id}>
                          <button
                            type="button"
                            class="category-icon"
                            style={{ '--category': categoryColor(cat || entry) }}
                            aria-label="查看账单详情"
                            data-action="bill-open-detail"
                            onClick={() => openEntryById(entry.id)}
                          >
                            <Icon name={entry.icon || 'ellipsis'} size={18} />
                          </button>
                          <div class="record-body">
                            <button
                              type="button"
                              class="editable-field"
                              style={{ fontWeight: 600, padding: '2px 4px' }}
                              data-action="bill-edit-note"
                              onClick={() => openEntryById(entry.id, 'note')}
                            >
                              {entry.note || entry.category_name}
                            </button>
                            <div class="record-metadata">
                              <button
                                type="button"
                                class="editable-pill"
                                style={{ minHeight: '30px', padding: '2px 8px', fontSize: '11.5px' }}
                                data-action="bill-quick-category"
                                onClick={e =>
                                  setPopover({
                                    entry,
                                    mode: 'category',
                                    rect: e.currentTarget.getBoundingClientRect(),
                                  })
                                }
                              >
                                <span
                                  class="color-dot"
                                  style={{ '--dot-color': categoryColor(cat || entry) }}
                                />
                                <span>
                                  {entry.category_name}
                                  {entry.subcategory ? ` · ${entry.subcategory}` : ''}
                                </span>
                              </button>
                              <button
                                type="button"
                                class={`owner-pill-sm ${owner ? 'has-owner' : ''}`}
                                style={{ minHeight: '30px', padding: '2px 8px', fontSize: '11.5px' }}
                                data-action="bill-quick-owner"
                                onClick={e =>
                                  setPopover({
                                    entry,
                                    mode: 'owner',
                                    rect: e.currentTarget.getBoundingClientRect(),
                                  })
                                }
                              >
                                <span>{owner ? `@${owner.name}` : '+ @'}</span>
                              </button>
                              <button
                                type="button"
                                class="editable-field muted"
                                style={{ fontSize: '11.5px', padding: '2px 4px' }}
                                data-action="bill-edit-date"
                                onClick={() => openEntryById(entry.id, 'occurred_on')}
                              >
                                {recordDateLabel(entry.occurred_on)}
                              </button>
                            </div>
                          </div>
                          <button
                            type="button"
                            class="editable-field tabular"
                            style={{ fontWeight: 700, fontSize: '15px' }}
                            data-action="bill-edit-amount"
                            onClick={() => openEntryById(entry.id, 'amount')}
                          >
                            <span class={entry.type === 'income' ? 'income-text' : ''}>
                              {entry.type === 'income' ? '+' : '−'}
                              {money(entry.amount_minor, false)}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </section>
                );
              })}
            </div>

            <div class="pagination">
              <span>
                第 {Math.floor(offset / 50) + 1} / {Math.max(1, Math.ceil(bills.totals.count / 50))} 页
              </span>
              <button
                type="button"
                class="button secondary"
                data-action="bills-page-prev"
                disabled={offset === 0}
                onClick={() => {
                  const nextOff = Math.max(0, offset - 50);
                  setOffset(nextOff);
                  syncUrl({ page: 'bills', offset: nextOff });
                }}
              >
                上一页
              </button>
              <button
                type="button"
                class="button secondary"
                data-action="bills-page-next"
                disabled={offset + 50 >= bills.totals.count}
                onClick={() => {
                  const nextOff = offset + 50;
                  setOffset(nextOff);
                  syncUrl({ page: 'bills', offset: nextOff });
                }}
              >
                下一页
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: '36px 16px' }}>
            <Icon name="folder" size={34} />
            <h3>没有找到记录</h3>
            <p class="muted">
              {hasFilters ? '试试调整筛选条件，或查看其他月份。' : '这个月还没有账目，先记下第一笔。'}
            </p>
            <button
              type="button"
              class="button primary"
              data-action="bills-empty-new"
              onClick={() => openNewEntryModal()}
            >
              记一笔
            </button>
          </div>
        )}
      </section>

      {/* Inline 1-Click Quick Tag Popover */}
      {popover && (
        <QuickTagPopover
          anchorRect={popover.rect}
          mode={popover.mode}
          entryType={popover.entry.type}
          currentCategoryId={popover.entry.category_id}
          currentSubcategory={popover.entry.subcategory}
          currentOwnerId={popover.entry.owner_id}
          categories={categories}
          owners={owners}
          onClose={() => setPopover(null)}
          onSelectCategory={async (categoryId, subcategory) => {
            const target = popover.entry;
            setPopover(null);
            await quickUpdateEntry(
              target,
              { category_id: categoryId, subcategory: subcategory ?? null },
              `已更新分类为 ${catById.get(categoryId)?.name || ''}${subcategory ? ` · ${subcategory}` : ''}`
            );
          }}
          onSelectOwner={async ownerId => {
            const target = popover.entry;
            setPopover(null);
            const ownerObj = ownerId ? ownerById.get(ownerId) : null;
            await quickUpdateEntry(
              target,
              { owner_id: ownerId ?? null },
              ownerObj ? `已标记为 @${ownerObj.name}` : '已取消 @归属人标记'
            );
          }}
        />
      )}

      {/* Full Filters Modal */}
      <Modal
        open={filterModalOpen}
        title="筛选账单"
        onClose={() => setFilterModalOpen(false)}
      >
        {modalDraft && (
          <form
            class="standard-form"
            onSubmit={e => {
              e.preventDefault();
              if (!modalDraft.from || !modalDraft.to || modalDraft.from > modalDraft.to) {
                toast('开始日期不能晚于结束日期');
                return;
              }
              setSearchInput(modalDraft.q.trim());
              setFilterModalOpen(false);
              applyFilterPatch(
                {
                  q: modalDraft.q.trim(),
                  type: modalDraft.type,
                  category_id: modalDraft.category_id,
                  owner_id: modalDraft.owner_id,
                },
                { from: modalDraft.from, to: modalDraft.to }
              );
            }}
          >
            <label>
              搜索
              <input
                name="q"
                type="text"
                maxLength={200}
                placeholder="备注、分类、子类或 @成员"
                value={modalDraft.q}
                onInput={e => setModalDraft(d => ({ ...d, q: e.currentTarget.value }))}
              />
            </label>
            <div class="review-grid">
              <label>
                收支类型
                <select
                  name="type"
                  value={modalDraft.type}
                  onChange={e => setModalDraft(d => ({ ...d, type: e.currentTarget.value }))}
                >
                  <option value="">全部</option>
                  <option value="expense">支出</option>
                  <option value="income">收入</option>
                </select>
              </label>
              <label>
                大类
                <select
                  name="category_id"
                  value={modalDraft.category_id}
                  onChange={e =>
                    setModalDraft(d => ({ ...d, category_id: e.currentTarget.value }))
                  }
                >
                  <option value="">全部分类</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.archived ? '（已停用）' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              @归属人
              <select
                name="owner_id"
                value={modalDraft.owner_id}
                onChange={e => setModalDraft(d => ({ ...d, owner_id: e.currentTarget.value }))}
              >
                <option value="">全部成员</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>
                    @{o.name}
                    {o.archived ? '（已停用）' : ''}
                  </option>
                ))}
                <option value="none">未指定成员</option>
              </select>
            </label>
            <div class="review-grid">
              <label>
                开始日期
                <input
                  name="from"
                  type="date"
                  required
                  value={modalDraft.from}
                  onInput={e => setModalDraft(d => ({ ...d, from: e.currentTarget.value }))}
                />
              </label>
              <label>
                结束日期
                <input
                  name="to"
                  type="date"
                  required
                  value={modalDraft.to}
                  onInput={e => setModalDraft(d => ({ ...d, to: e.currentTarget.value }))}
                />
              </label>
            </div>
            <div class="dialog-footer">
              <button
                type="button"
                class="button secondary"
                data-action="close-dialog"
                onClick={() => setFilterModalOpen(false)}
              >
                取消
              </button>
              <button type="submit" class="button primary" data-action="apply-filters">
                应用筛选
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
