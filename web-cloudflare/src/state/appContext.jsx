import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { readPageData } from '../ledger-data.js';
import { queryString, request, mutate, setLedger } from '../api.js';
import { today, periodRange, shiftMonth, validDate, recordRange, money } from '../../shared/format.js';

export const NAV_ITEMS = [
  { id: 'record', icon: 'pencil', label: '记一笔', title: '记一笔' },
  { id: 'bills', icon: 'receipt', label: '账单', title: '账单' },
  { id: 'stats', icon: 'stats', label: '统计', title: '收支概览' },
  { id: 'subscriptions', icon: 'calendar', label: '订阅', title: '我的订阅' },
  { id: 'settings', icon: 'user', label: '我的', title: '我的账本' },
];

const VALID_PAGES = new Set(NAV_ITEMS.map(n => n.id));

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Display preferences are optional. */
  }
}

function initialRouteState() {
  const pathPage = typeof location !== 'undefined' ? location.pathname.slice(1) : '';
  const isMobile = typeof matchMedia === 'function' && matchMedia('(max-width: 767px)').matches;
  const page = VALID_PAGES.has(pathPage) ? pathPage : isMobile ? 'record' : 'stats';
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const range =
    validDate(params.get('from')) &&
    validDate(params.get('to')) &&
    params.get('from') <= params.get('to')
      ? { from: params.get('from'), to: params.get('to') }
      : null;
  const monthCandidate = params.get('month') || range?.from.slice(0, 7);
  const month = validDate(`${monthCandidate}-01`) ? monthCandidate : today().slice(0, 7);
  const period = ['month', 'quarter', 'year'].includes(params.get('period'))
    ? params.get('period')
    : 'month';
  const filters = {
    type: ['expense', 'income'].includes(params.get('type')) ? params.get('type') : '',
    category_id: /^[A-Za-z0-9_-]{1,100}$/.test(params.get('category_id') || '')
      ? params.get('category_id')
      : '',
    owner_id: /^[A-Za-z0-9_-]{1,64}$/.test(params.get('owner_id') || '')
      ? params.get('owner_id')
      : '',
    subcategory: (params.get('subcategory') || '').slice(0, 32),
    q: (params.get('q') || '').slice(0, 200),
  };
  const offsetRaw = Number(params.get('offset'));
  const offset =
    Number.isSafeInteger(offsetRaw) && offsetRaw >= 0 && offsetRaw <= 10000000
      ? Math.floor(offsetRaw / 50) * 50
      : 0;
  return { page, month, period, filters, billRange: range, offset };
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const initial = useMemo(() => initialRouteState(), []);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState(initial.page);
  const [workspacePages, setWorkspacePages] = useState(() => {
    const base = [initial.page];
    for (const p of ['record', 'bills', 'stats']) {
      if (!base.includes(p)) base.push(p);
    }
    return base;
  });
  const [month, setMonth] = useState(initial.month);
  const [period, setPeriod] = useState(initial.period);
  const [billRange, setBillRange] = useState(initial.billRange);
  const [filters, setFilters] = useState(initial.filters);
  const [offset, setOffset] = useState(initial.offset);

  const [theme, setThemeState] = useState(() => {
    const saved = readStorage('moneytalk:theme', 'light');
    return saved === 'dark' ? 'dark' : 'light';
  });
  const [chart, setChartState] = useState(() => {
    const saved = readStorage('moneytalk:chart', 'bar');
    return ['bar', 'line', 'pie'].includes(saved) ? saved : 'bar';
  });
  const [density, setDensityState] = useState(() => {
    const saved = readStorage('moneytalk:density', 'comfortable');
    return saved === 'compact' ? 'compact' : 'comfortable';
  });
  const [statsView, setStatsViewState] = useState(() => {
    const saved = readStorage('moneytalk:statsView', 'bars');
    return ['bars', 'matrix', 'drilldown'].includes(saved) ? saved : 'bars';
  });

  const [categories, setCategories] = useState([]);
  const [owners, setOwners] = useState([]);
  const [recent, setRecent] = useState(null);
  const [bills, setBills] = useState(null);
  const [stats, setStats] = useState(null);
  const [textSummary, setTextSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loggedOut, setLoggedOut] = useState(false);
  const [subscriptionWarning, setSubscriptionWarning] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [platformSource, setPlatformSource] = useState('');
  const [recordMode, setRecordMode] = useState('text'); // 'text' | 'manual'
  const [pendingBatchId, setPendingBatchId] = useState(null);
  const [sourceCalendarTarget, setSourceCalendarTarget] = useState(null);

  // Modal slots managed cleanly in React state
  const [entryModal, setEntryModal] = useState(null); // { draft, field }
  const [ledgersModalOpen, setLedgersModalOpen] = useState(false);

  const toastTimerRef = useRef(null);
  const undoCallbackRef = useRef(null);
  const abortRef = useRef(null);
  const epochRef = useRef(0);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.toggle('compact', density === 'compact');
  }, [density]);

  useEffect(() => {
    const meta = NAV_ITEMS.find(n => n.id === page);
    document.title = `${meta?.label || 'MoneyTalk'} · MoneyTalk`;
  }, [page]);

  const setTheme = useCallback(next => {
    const v = next === 'dark' ? 'dark' : 'light';
    setThemeState(v);
    writeStorage('moneytalk:theme', v);
  }, []);

  const setChart = useCallback(next => {
    if (!['bar', 'line', 'pie'].includes(next)) return;
    setChartState(next);
    writeStorage('moneytalk:chart', next);
  }, []);

  const setDensity = useCallback(next => {
    const v = next === 'compact' ? 'compact' : 'comfortable';
    setDensityState(v);
    writeStorage('moneytalk:density', v);
  }, []);

  const setStatsView = useCallback(next => {
    if (!['bars', 'matrix', 'drilldown'].includes(next)) return;
    setStatsViewState(next);
    writeStorage('moneytalk:statsView', next);
  }, []);

  const toast = useCallback((message, undoFn = null) => {
    const toastEl = document.querySelector('#toast');
    if (!toastEl) return;
    clearTimeout(toastTimerRef.current);
    undoCallbackRef.current = typeof undoFn === 'function' ? undoFn : null;
    toastEl.replaceChildren();
    const span = document.createElement('span');
    span.textContent = message;
    toastEl.append(span);
    if (undoCallbackRef.current) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.action = 'undo-toast';
      btn.textContent = '撤销';
      btn.addEventListener('click', async () => {
        const fn = undoCallbackRef.current;
        undoCallbackRef.current = null;
        toastEl.classList.remove('show');
        if (fn) await fn();
      });
      toastEl.append(btn);
    }
    toastEl.classList.add('show');
    toastTimerRef.current = setTimeout(() => {
      toastEl.classList.remove('show');
      undoCallbackRef.current = null;
    }, undoCallbackRef.current ? 10000 : 4800);
  }, []);

  const syncUrl = useCallback(
    (nextState, replace = false) => {
      const p = nextState.page ?? page;
      const m = nextState.month ?? month;
      const per = nextState.period ?? period;
      const br = 'billRange' in nextState ? nextState.billRange : billRange;
      const flt = nextState.filters ?? filters;
      const off = nextState.offset ?? offset;
      const params = new URLSearchParams();
      if (m !== today().slice(0, 7)) params.set('month', m);
      if (p === 'stats' && per !== 'month') params.set('period', per);
      if (p === 'bills') {
        if (br) {
          params.set('from', br.from);
          params.set('to', br.to);
        }
        if (flt.type) params.set('type', flt.type);
        if (flt.category_id) params.set('category_id', flt.category_id);
        if (flt.owner_id) params.set('owner_id', flt.owner_id);
        if (flt.subcategory) params.set('subcategory', flt.subcategory);
        if (flt.q) params.set('q', flt.q);
        if (off) params.set('offset', String(off));
      }
      const url = '/' + p + (params.toString() ? '?' + params.toString() : '');
      history[replace ? 'replaceState' : 'pushState'](null, '', url);
    },
    [page, month, period, billRange, filters, offset]
  );

  const fetchData = useCallback(
    async ({ targetPage = page, targetMonth = month, targetPeriod = period, targetBillRange = billRange, targetFilters = filters, targetOffset = offset, quiet = false } = {}) => {
      if (!session) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const myEpoch = epochRef.current;
      if (!quiet) setLoading(true);
      setLoadError('');
      try {
        const refDay = session.today || today();
        const statsRange = periodRange(targetMonth, targetPeriod, refDay);
        const billsPeriodRange = targetBillRange || periodRange(targetMonth, 'month', refDay);
        const query =
          targetPage === 'stats'
            ? { ...statsRange, bucket: targetPeriod === 'month' ? 'day' : 'month' }
            : targetPage === 'bills'
              ? {
                  from: billsPeriodRange.from,
                  to: billsPeriodRange.to,
                  type: targetFilters.type || undefined,
                  category_id: targetFilters.category_id || undefined,
                  owner_id: targetFilters.owner_id || undefined,
                  subcategory: targetFilters.subcategory || undefined,
                  q: targetFilters.q || undefined,
                  limit: 50,
                  offset: targetOffset,
                }
              : {};
        const data = await readPageData(targetPage, query, ctrl.signal);
        if (ctrl.signal.aborted || epochRef.current !== myEpoch) return;
        setCategories(data.categories || []);
        setOwners(data.owners || []);
        setRecent(data.recent || null);
        setTextSummary(data.textSummary || null);
        if (targetPage === 'bills') setBills(data.current || null);
        if (targetPage === 'stats') setStats(data.current || null);
      } catch (err) {
        if (ctrl.signal.aborted || epochRef.current !== myEpoch) return;
        if (err.code === 'LOGIN_REQUIRED') {
          setSession(null);
          return;
        }
        if (targetPage === 'stats') setStats(null);
        setLoadError(err.message || '读取账本失败，请重试');
      } finally {
        if (!ctrl.signal.aborted && epochRef.current === myEpoch) {
          setLoading(false);
        }
      }
    },
    [session, page, month, period, billRange, filters, offset]
  );

  const bootSession = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setLoggedOut(false);
    setSubscriptionWarning('');
    try {
      const s = await request('/session');
      setLedger(s.ledger.id);
      setSession(s);
      request('/subscriptions/settle', { method: 'POST', body: {} })
        .then(res => {
          if (res?.settled_count > 0) fetchData({ quiet: true });
        })
        .catch(() => {
          setSubscriptionWarning('订阅续记结果尚未核实，已有账目不受影响');
        });
    } catch (err) {
      setLoadError(err.message || '暂时无法打开账本');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!VALID_PAGES.has(location.pathname.slice(1))) {
      syncUrl({ page: initial.page }, true);
    }
    bootSession();
  }, [bootSession]);

  useEffect(() => {
    if (session) {
      fetchData();
    }
  }, [session, page, month, period, billRange, filters, offset]);

  useEffect(() => {
    const onPop = () => {
      const next = initialRouteState();
      setPage(next.page);
      setMonth(next.month);
      setPeriod(next.period);
      setFilters(next.filters);
      setBillRange(next.billRange);
      setOffset(next.offset);
      setWorkspacePages(prev => (prev.includes(next.page) ? prev : [...prev, next.page]));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback(
    (nextPage, { replace = false, nextFilters = null, nextBillRange = undefined, nextOffset = undefined } = {}) => {
      if (!VALID_PAGES.has(nextPage)) return;
      const updatedFilters = nextFilters ?? filters;
      const updatedRange = nextBillRange !== undefined ? nextBillRange : billRange;
      const updatedOffset = nextOffset !== undefined ? nextOffset : nextPage === page ? offset : 0;
      setPage(nextPage);
      setWorkspacePages(prev => (prev.includes(nextPage) ? prev : [...prev, nextPage]));
      if (nextFilters) setFilters(nextFilters);
      if (nextBillRange !== undefined) setBillRange(nextBillRange);
      if (nextOffset !== undefined || nextPage !== page) setOffset(updatedOffset);
      syncUrl(
        {
          page: nextPage,
          filters: updatedFilters,
          billRange: updatedRange,
          offset: updatedOffset,
        },
        replace
      );
    },
    [filters, billRange, offset, page, syncUrl]
  );

  const closeWorkspaceTab = useCallback(
    tabPage => {
      setWorkspacePages(prev => {
        if (prev.length <= 1) return prev;
        const idx = prev.indexOf(tabPage);
        const remaining = prev.filter(p => p !== tabPage);
        if (page === tabPage) {
          const fallback = remaining[Math.max(0, idx - 1)] || remaining[0];
          navigate(fallback, { replace: true });
        }
        return remaining;
      });
    },
    [page, navigate]
  );

  const stepMonth = useCallback(
    delta => {
      const step = page === 'stats' && period === 'year' ? 12 * delta : page === 'stats' && period === 'quarter' ? 3 * delta : delta;
      const nextMonth = shiftMonth(month, step);
      setMonth(nextMonth);
      setBillRange(null);
      setOffset(0);
      syncUrl({ month: nextMonth, billRange: null, offset: 0 });
    },
    [page, period, month, syncUrl]
  );

  const setSpecificMonth = useCallback(
    value => {
      if (!validDate(`${value}-01`)) return;
      setMonth(value);
      setBillRange(null);
      setOffset(0);
      syncUrl({ month: value, billRange: null, offset: 0 });
    },
    [syncUrl]
  );

  const resetCurrentPeriod = useCallback(() => {
    const currentM = (session?.today || today()).slice(0, 7);
    setMonth(currentM);
    setBillRange(null);
    setOffset(0);
    syncUrl({ month: currentM, billRange: null, offset: 0 });
  }, [session, syncUrl]);

  const changePeriod = useCallback(
    nextPeriod => {
      if (!['month', 'quarter', 'year'].includes(nextPeriod)) return;
      setPeriod(nextPeriod);
      syncUrl({ period: nextPeriod });
    },
    [syncUrl]
  );

  const quickUpdateEntry = useCallback(
    async (entry, patch, description = '修改已保存') => {
      const prevSnapshot = {
        type: entry.type,
        amount_minor: entry.amount_minor,
        category_id: entry.category_id,
        subcategory: entry.subcategory ?? null,
        owner_id: entry.owner_id ?? null,
        occurred_on: entry.occurred_on,
        note: entry.note ?? '',
      };
      const nextBody = {
        ...prevSnapshot,
        ...patch,
        version: entry.version,
      };
      try {
        const res = await mutate(`/entries/${entry.id}`, nextBody, { method: 'PATCH' });
        await fetchData({ quiet: true });
        toast(description, async () => {
          try {
            await mutate(
              `/entries/${entry.id}`,
              { ...prevSnapshot, version: res.entry.version },
              { method: 'PATCH' }
            );
            await fetchData({ quiet: true });
            toast('已撤销修改');
          } catch (undoErr) {
            toast(`撤销失败：${undoErr.message}`);
          }
        });
        return res.entry;
      } catch (err) {
        if (err.code === 'VERSION_CONFLICT') {
          toast('这条记录已被其他操作修改，已刷新最新内容');
          await fetchData({ quiet: true });
        } else {
          toast(err.message || '保存修改失败');
        }
        throw err;
      }
    },
    [fetchData, toast]
  );

  const openEntryById = useCallback(
    async (id, field = '') => {
      try {
        const { entry } = await request(`/entries/${id}`);
        if (entry.deleted_at) {
          setEntryModal({ draft: entry, field: '', isDeleted: true });
          return;
        }
        setEntryModal({
          draft: {
            ...entry,
            amount: (entry.amount_minor / 100).toFixed(2).replace(/\.00$/, ''),
          },
          field,
          isDeleted: false,
        });
      } catch (err) {
        toast(err.message);
      }
    },
    [toast]
  );

  const openNewEntryModal = useCallback(
    (initialDate = null) => {
      const defaultCat = categories.find(c => c.type === 'expense' && !c.archived)?.id || 'food';
      const dateStr = initialDate || (session?.today || today()).slice(0, 7);
      setEntryModal({
        field: '',
        isDeleted: false,
        draft: {
          id: null,
          type: 'expense',
          amount: '',
          category_id: defaultCat,
          subcategory: null,
          owner_id: null,
          occurred_on: dateStr,
          note: '',
        },
      });
    },
    [categories, session]
  );

  const openBillsForRange = useCallback(
    range => {
      const normalized = recordRange(range.from, range.to);
      navigate('bills', {
        nextFilters: { q: '', type: '', category_id: '', owner_id: '', subcategory: '' },
        nextBillRange: normalized,
        nextOffset: 0,
      });
      setMonth(normalized.from.slice(0, 7));
    },
    [navigate]
  );

  const activateLedger = useCallback(
    async id => {
      await request(`/ledgers/${id}/activate`, { method: 'POST', body: {} });
      setLedger(id);
      setLedgersModalOpen(false);
      setEntryModal(null);
      ++epochRef.current;
      location.replace('/' + page);
    },
    [page]
  );

  const logout = useCallback(async () => {
    for (const [store, prefix] of [
      [localStorage, 'moneytalk:input-cache:'],
      [sessionStorage, 'moneytalk:draft:'],
      [sessionStorage, 'moneytalk:pending-module:'],
    ]) {
      for (let i = store.length - 1; i >= 0; i--) {
        const k = store.key(i);
        if (k?.startsWith(prefix)) store.removeItem(k);
      }
    }
    ++epochRef.current;
    setEntryModal(null);
    setReceipt(null);
    setBills(null);
    setStats(null);
    setRecent(null);
    setLoadError('');
    setLoggedOut(true);
    const wasLocal = session?.local;
    setSession(null);
    toast(wasLocal ? '已清除本机预览会话与未保存草稿' : '已清除浏览器草稿');
  }, [session, toast]);

  const draftBaseKey = session ? `${session.user.id}:${session.ledger.id}` : 'anon';

  const value = {
    session,
    setSession,
    page,
    navigate,
    workspacePages,
    closeWorkspaceTab,
    month,
    period,
    changePeriod,
    stepMonth,
    setSpecificMonth,
    resetCurrentPeriod,
    billRange,
    setBillRange,
    filters,
    setFilters,
    offset,
    setOffset,
    syncUrl,
    theme,
    setTheme,
    chart,
    setChart,
    density,
    setDensity,
    statsView,
    setStatsView,
    categories,
    setCategories,
    owners,
    setOwners,
    recent,
    bills,
    stats,
    textSummary,
    loading,
    loadError,
    loggedOut,
    subscriptionWarning,
    receipt,
    setReceipt,
    platformSource,
    setPlatformSource,
    recordMode,
    setRecordMode,
    pendingBatchId,
    setPendingBatchId,
    sourceCalendarTarget,
    setSourceCalendarTarget,
    entryModal,
    setEntryModal,
    ledgersModalOpen,
    setLedgersModalOpen,
    toast,
    bootSession,
    fetchData,
    openEntryById,
    openNewEntryModal,
    openBillsForRange,
    quickUpdateEntry,
    activateLedger,
    logout,
    draftBaseKey,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
