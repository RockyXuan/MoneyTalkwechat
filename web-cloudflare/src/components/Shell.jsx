import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icons.jsx';
import { Modal } from './Modal.jsx';
import { EntryModal } from './EntryModal.jsx';
import { NAV_ITEMS, useApp } from '../state/appContext.jsx';
import { request } from '../api.js';

export function MonthControl() {
  const { month, page, period, stepMonth, setSpecificMonth, resetCurrentPeriod } = useApp();
  const currentLabel =
    page === 'stats' && period === 'year'
      ? '本年'
      : page === 'stats' && period === 'quarter'
        ? '本季'
        : '本月';

  return (
    <div class="month-control">
      <button
        type="button"
        class="icon-button"
        aria-label="上一期间"
        data-action="previous-month"
        onClick={() => stepMonth(-1)}
      >
        <Icon name="left" size={17} />
      </button>
      <label class="month-picker">
        <span>{month.replace('-', '年')}月</span>
        <Icon name="down" size={14} />
        <input
          type="month"
          aria-label="选择月份"
          value={month}
          min="1900-01"
          max="2100-12"
          data-action="month"
          onChange={e => setSpecificMonth(e.currentTarget.value)}
        />
      </label>
      <button
        type="button"
        class="icon-button"
        aria-label="下一期间"
        data-action="next-month"
        onClick={() => stepMonth(1)}
      >
        <Icon name="right" size={17} />
      </button>
      <button
        type="button"
        class="current-period"
        data-action="current-period"
        aria-label="返回当前期间"
        onClick={resetCurrentPeriod}
      >
        {currentLabel}
      </button>
    </div>
  );
}

function LedgersModal() {
  const {
    ledgersModalOpen,
    setLedgersModalOpen,
    session,
    activateLedger,
    toast,
  } = useApp();
  const [ledgers, setLedgers] = useState(session?.ledgers || []);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    if (!ledgersModalOpen) return;
    request('/session')
      .then(s => setLedgers(s.ledgers || []))
      .catch(err => toast(err.message));
  }, [ledgersModalOpen, toast]);

  return (
    <Modal
      open={ledgersModalOpen}
      title="我的账本"
      locked={switching}
      onClose={() => setLedgersModalOpen(false)}
    >
      <p class="muted" style={{ margin: 0, fontSize: '13px' }}>
        仅展示当前身份拥有且已通过校验的账本。切换账本不会删除原账本。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {ledgers.map(l => {
          const isCurrent = l.id === session?.ledger?.id;
          return (
            <button
              key={l.id}
              type="button"
              class="bar-row"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderColor: isCurrent ? 'var(--primary)' : undefined,
              }}
              data-action="activate-ledger"
              disabled={switching}
              onClick={async () => {
                if (isCurrent) {
                  setLedgersModalOpen(false);
                  return;
                }
                setSwitching(true);
                try {
                  await activateLedger(l.id);
                } catch (err) {
                  setSwitching(false);
                  toast(err.message);
                }
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600 }}>
                <Icon name="wallet" size={18} />
                {l.name}
              </span>
              {isCurrent ? (
                <span class="status-pill saved">正在使用</span>
              ) : (
                <Icon name="right" size={16} />
              )}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function Shell({ children }) {
  const {
    session,
    page,
    navigate,
    workspacePages,
    closeWorkspaceTab,
    theme,
    setTheme,
    openNewEntryModal,
    setLedgersModalOpen,
    loadError,
    subscriptionWarning,
    fetchData,
  } = useApp();

  const [tabMenuOpen, setTabMenuOpen] = useState(false);
  const addMenuRef = useRef(null);

  useEffect(() => {
    if (!tabMenuOpen) return;
    const close = e => {
      if (!addMenuRef.current?.contains(e.target)) setTabMenuOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [tabMenuOpen]);

  const currentMeta = NAV_ITEMS.find(n => n.id === page) || NAV_ITEMS[0];

  return (
    <div class="app-shell">
      <aside class="sidebar">
        <a
          class="brand"
          href="/stats"
          data-route="stats"
          onClick={e => {
            e.preventDefault();
            navigate('stats');
          }}
        >
          <span class="brand-mark">M</span>
          <span>MoneyTalk</span>
        </a>

        <button
          type="button"
          class="ledger-switch"
          data-action="ledgers"
          onClick={() => setLedgersModalOpen(true)}
        >
          <span>{session?.ledger?.name || '个人账本'}</span>
          <Icon name="down" size={14} />
        </button>

        <nav aria-label="主要导航">
          {NAV_ITEMS.map(item => (
            <a
              key={item.id}
              href={`/${item.id}`}
              data-route={item.id}
              class={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={e => {
                e.preventDefault();
                navigate(item.id);
              }}
            >
              <Icon name={item.icon} size={19} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div class="sidebar-bottom">
          <button
            type="button"
            class="theme-toggle-btn"
            data-action="toggle-theme"
            aria-label={theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={16} />
              {theme === 'dark' ? '深色模式' : '浅色模式'}
            </span>
            <span style={{ fontSize: '11px' }}>切换</span>
          </button>

          <div class="sidebar-note">
            <div>清晰记录每一笔</div>
            <div>{session?.local ? '本地预览 · 独立数据' : '你的私人账本'}</div>
          </div>
        </div>
      </aside>

      <div class="workspace-column">
        <div class="workspace-tabs-shell" aria-label="已打开的工作区页面">
          <div
            role="tablist"
            aria-label="工作区标签"
            class="workspace-tablist"
            onKeyDown={e => {
              const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')];
              const idx = tabs.indexOf(document.activeElement);
              if (idx < 0) return;
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                tabs[(idx + 1) % tabs.length]?.focus();
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                tabs[(idx - 1 + tabs.length) % tabs.length]?.focus();
              } else if (e.key === 'Home') {
                e.preventDefault();
                tabs[0]?.focus();
              } else if (e.key === 'End') {
                e.preventDefault();
                tabs.at(-1)?.focus();
              } else if (e.key === 'Delete' && workspacePages.length > 1) {
                const targetPage = document.activeElement?.dataset?.workspacePage;
                if (targetPage) {
                  e.preventDefault();
                  closeWorkspaceTab(targetPage);
                }
              }
            }}
          >
            {workspacePages.map(tabId => {
              const meta = NAV_ITEMS.find(n => n.id === tabId);
              const selected = tabId === page;
              return (
                <div
                  key={tabId}
                  class={`workspace-tab ${selected ? 'selected' : ''}`}
                >
                  <button
                    type="button"
                    role="tab"
                    id={`workspace-tab-${tabId}`}
                    class="workspace-tab-btn"
                    data-action="workspace-switch"
                    data-workspace-page={tabId}
                    aria-selected={selected}
                    aria-controls="main"
                    onClick={() => navigate(tabId)}
                  >
                    {meta?.label || tabId}
                  </button>
                  {workspacePages.length > 1 && (
                    <button
                      type="button"
                      class="workspace-tab-close"
                      data-action="workspace-close"
                      data-workspace-close={tabId}
                      aria-label={`关闭${meta?.label || tabId}标签页`}
                      onClick={() => closeWorkspaceTab(tabId)}
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div class="workspace-tab-add" ref={addMenuRef}>
            <button
              type="button"
              class="icon-button"
              aria-label="打开页面"
              aria-expanded={tabMenuOpen}
              data-action="workspace-add"
              onClick={() => setTabMenuOpen(v => !v)}
            >
              ＋
            </button>
            {tabMenuOpen && (
              <div class="workspace-tab-add-menu">
                {NAV_ITEMS.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    data-action="workspace-add-page"
                    data-workspace-page={item.id}
                    onClick={() => {
                      setTabMenuOpen(false);
                      navigate(item.id);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <header class="page-header">
          <div>
            <h1>{currentMeta.title}</h1>
            {subscriptionWarning && (
              <p class="pending-note" role="status" style={{ margin: '4px 0 0' }}>
                {subscriptionWarning}
              </p>
            )}
          </div>
          <div class="header-actions">
            {['stats', 'bills'].includes(page) ? (
              <MonthControl />
            ) : (
              <span class="private-label">
                <Icon name="shield" size={15} />
                {session?.local ? '本地预览' : '私人账本'}
              </span>
            )}
            <button
              type="button"
              class="button primary"
              data-action="new-entry"
              onClick={() => openNewEntryModal()}
            >
              <Icon name="plus" size={17} />
              记一笔
            </button>
          </div>
        </header>

        <main
          id="main"
          role="tabpanel"
          aria-labelledby={`workspace-tab-${page}`}
          tabIndex={-1}
          class={`page-content page-${page}`}
        >
          {loadError && (
            <div class="card error-panel" role="alert" style={{ borderColor: 'var(--danger)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <div>
                  <strong style={{ color: 'var(--danger)' }}>暂时没有读取到账本</strong>
                  <p class="muted" style={{ margin: '4px 0 0' }}>{loadError}</p>
                </div>
                <button
                  type="button"
                  class="button secondary"
                  data-action="refresh"
                  onClick={() => fetchData()}
                >
                  重试
                </button>
              </div>
            </div>
          )}
          {children}
        </main>
      </div>

      <nav class="mobile-nav" aria-label="手机导航">
        {NAV_ITEMS.map(item => (
          <a
            key={item.id}
            href={`/${item.id}`}
            data-route={item.id}
            aria-label={item.label}
            class={`nav-item ${page === item.id ? 'active' : ''}`}
            aria-current={page === item.id ? 'page' : undefined}
            onClick={e => {
              e.preventDefault();
              navigate(item.id);
            }}
          >
            <Icon name={item.icon} size={22} />
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      <EntryModal />
      <LedgersModal />
    </div>
  );
}
