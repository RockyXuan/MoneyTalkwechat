import { render } from 'preact';
import './styles/tokens.css';
import './styles/app.css';
import { AppProvider, useApp } from './state/appContext.jsx';
import { Shell } from './components/Shell.jsx';
import { RecordPage } from './pages/RecordPage.jsx';
import { BillsPage } from './pages/BillsPage.jsx';
import { StatsPage } from './pages/StatsPage.jsx';
import { SubscriptionsPage } from './pages/SubscriptionsPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';

function ActivePage() {
  const { session, page, loadError, loggedOut, bootSession } = useApp();

  if (!session) {
    return (
      <main class="boot-state" aria-live="polite">
        {loadError || loggedOut ? (
          <div style={{ textAlign: 'center', padding: '24px' }}>
            <p style={{ color: loadError ? 'var(--danger)' : 'var(--ink-muted)' }}>
              {loadError || '已退出当前会话，未保存草稿已清除。'}
            </p>
            <button
              type="button"
              class="button primary"
              data-action="boot-login"
              onClick={() => bootSession()}
            >
              重新进入账本
            </button>
          </div>
        ) : (
          '正在打开账本…'
        )}
      </main>
    );
  }

  return (
    <Shell>
      {page === 'record' && <RecordPage />}
      {page === 'bills' && <BillsPage />}
      {page === 'stats' && <StatsPage />}
      {page === 'subscriptions' && <SubscriptionsPage />}
      {page === 'settings' && <SettingsPage />}
    </Shell>
  );
}

render(
  <AppProvider>
    <ActivePage />
  </AppProvider>,
  document.querySelector('#app')
);
