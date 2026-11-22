import { useState } from 'preact/hooks';
import { Icon, ownerColor } from '../components/Icons.jsx';
import { Modal } from '../components/Modal.jsx';
import { CategoryWall } from '../components/CategoryWall.jsx';
import { useApp } from '../state/appContext.jsx';
import { download, mutate, request } from '../api.js';
import { restoreBackup } from '../ledger-data.js';
import { money, PALETTE, recordDateLabel, today } from '../../shared/format.js';

export function SettingsPage() {
  const {
    session,
    owners,
    setOwners,
    theme,
    setTheme,
    chart,
    setChart,
    density,
    setDensity,
    setLedgersModalOpen,
    activateLedger,
    logout,
    toast,
    fetchData,
  } = useApp();

  const refToday = session?.today || today();
  const [ownerNameInput, setOwnerNameInput] = useState('');
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [editingOwner, setEditingOwner] = useState(null);

  // Backup modal state
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupData, setBackupData] = useState(null);
  const [backupPreview, setBackupPreview] = useState(null);
  const [backupError, setBackupError] = useState('');
  const [restoreProgress, setRestoreProgress] = useState(null);
  const [restoredJob, setRestoredJob] = useState(null);
  const [backupBusy, setBackupBusy] = useState(false);

  // Trash modal state
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashData, setTrashData] = useState(null);
  const [trashOffset, setTrashOffset] = useState(0);
  const [trashBusy, setTrashBusy] = useState(false);

  // Logout confirm modal
  const [logoutOpen, setLogoutOpen] = useState(false);

  if (!session) return null;

  async function refreshOwners() {
    const res = await request('/owners');
    setOwners(res.owners || []);
    await fetchData({ quiet: true });
  }

  async function handleAddOwner(e) {
    e.preventDefault();
    const name = ownerNameInput.trim();
    if (!name || ownerBusy) return;
    setOwnerBusy(true);
    try {
      await mutate('/owners', {
        name,
        color_key: 'teal',
        sort_order: 90,
      });
      setOwnerNameInput('');
      await refreshOwners();
      toast(`已添加成员 @${name}`);
    } catch (err) {
      toast(err.message);
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handleSaveOwner(e) {
    e.preventDefault();
    if (!editingOwner || ownerBusy) return;
    const name = editingOwner.name.trim();
    if (!name) return;
    setOwnerBusy(true);
    try {
      await mutate(
        `/owners/${editingOwner.id}`,
        {
          name,
          color_key: editingOwner.color_key,
          sort_order: editingOwner.sort_order,
          archived: Boolean(editingOwner.archived),
          version: editingOwner.version,
        },
        { method: 'PATCH' }
      );
      setEditingOwner(null);
      await refreshOwners();
      toast('成员信息已保存');
    } catch (err) {
      toast(err.message);
    } finally {
      setOwnerBusy(false);
    }
  }

  async function handleExportAllCsv() {
    try {
      const blob = await request('/export.csv', { raw: true });
      download(blob, `MoneyTalk-全部账单-${refToday}.csv`);
      toast('导出文件已准备，请检查浏览器下载');
    } catch (err) {
      toast(err.message);
    }
  }

  async function handleDownloadBackup() {
    try {
      const data = await request('/backup');
      download(
        new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
        `MoneyTalk-完整备份-${refToday}.json`
      );
      toast('备份文件已准备，请确认下载完成并妥善保存');
    } catch (err) {
      toast(err.message);
    }
  }

  async function handleBackupFile(file) {
    if (!file) return;
    setBackupBusy(true);
    setBackupData(null);
    setBackupPreview(null);
    setBackupError('');
    setRestoreProgress(null);
    setRestoredJob(null);
    try {
      if (file.size > 20 * 1024 * 1024) {
        throw new Error('文件超过 20 MB，请先拆分备份');
      }
      const parsed = JSON.parse(await file.text());
      const prev = await request('/restores/preview', { method: 'POST', body: parsed });
      if (!prev.valid) {
        setBackupError(`备份未通过校验：${prev.errors.join('；')}`);
        return;
      }
      setBackupData(parsed);
      setBackupPreview(prev);
    } catch (err) {
      setBackupError(
        err instanceof SyntaxError
          ? '无法读取 JSON 文件，请选择完整的 MoneyTalk 备份'
          : err.message
      );
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleStartRestore() {
    if (!backupData || !backupPreview || backupBusy) return;
    setBackupBusy(true);
    setBackupError('');
    setRestoreProgress({ received: 0, total: Math.max(1, backupData.entries.length) });
    try {
      const job = await restoreBackup(backupData, backupPreview.fingerprint, received => {
        setRestoreProgress({ received, total: Math.max(1, backupData.entries.length) });
      });
      setRestoredJob(job);
    } catch (err) {
      setBackupError(`${err.message}。当前账本未被替换；可以使用同一备份重试。`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function loadTrash(nextOffset = 0) {
    setTrashOpen(true);
    setTrashBusy(true);
    try {
      const res = await request(`/entries?deleted=true&limit=50&offset=${nextOffset}`);
      setTrashData(res);
      setTrashOffset(nextOffset);
    } catch (err) {
      toast(err.message);
    } finally {
      setTrashBusy(false);
    }
  }

  async function handleRestoreTrashEntry(entry) {
    setTrashBusy(true);
    try {
      await mutate(`/entries/${entry.id}/restore`, { version: entry.version });
      toast('记录已恢复');
      await loadTrash(trashOffset);
      await fetchData({ quiet: true });
    } catch (err) {
      toast(err.message);
      setTrashBusy(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Profile & Preferences Card */}
      <section class="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span class="summary-icon">
              <Icon name="user" size={24} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '18px' }}>{session.ledger.name}</h2>
              <div class="muted" style={{ fontSize: '12.5px' }}>
                {session.local ? '本地预览身份' : session.user.email} · 人民币（整数分核算）
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div class="segmented" role="group" aria-label="浅色深色切换">
              <button
                type="button"
                data-action="settings-theme-light"
                class={theme === 'light' ? 'active' : ''}
                onClick={() => setTheme('light')}
              >
                <Icon name="sun" size={14} /> 浅色
              </button>
              <button
                type="button"
                data-action="settings-theme-dark"
                class={theme === 'dark' ? 'active' : ''}
                onClick={() => setTheme('dark')}
              >
                <Icon name="moon" size={14} /> 深色
              </button>
            </div>
            <button
              type="button"
              class="button secondary"
              data-action="settings-ledgers"
              onClick={() => setLedgersModalOpen(true)}
            >
              切换账本
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span class="muted">默认统计图</span>
            <select
              value={chart}
              onChange={e => setChart(e.currentTarget.value)}
              style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'var(--surface-solid)' }}
            >
              <option value="bar">柱状图</option>
              <option value="line">折线图</option>
              <option value="pie">饼图</option>
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span class="muted">界面密度</span>
            <select
              value={density}
              onChange={e => setDensity(e.currentTarget.value)}
              style={{ padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border-strong)', background: 'var(--surface-solid)' }}
            >
              <option value="comfortable">舒适</option>
              <option value="compact">紧凑</option>
            </select>
          </label>
        </div>
      </section>

      {/* @归属人 Manager */}
      <section class="card" aria-label="@归属人成员管理">
        <div class="card-heading">
          <div>
            <h2>@归属人（花给谁）维度</h2>
            <small class="muted">独立于分类之外，避免为不同家人重复建几十个相同分类</small>
          </div>
          <form style={{ display: 'flex', gap: '8px' }} onSubmit={handleAddOwner}>
            <input
              type="text"
              maxLength={24}
              placeholder="新增成员（如：岳父母）"
              value={ownerNameInput}
              onInput={e => setOwnerNameInput(e.currentTarget.value)}
              style={{ padding: '7px 11px', borderRadius: '10px', border: '1px solid var(--border-strong)', background: 'var(--surface-solid)' }}
            />
            <button
              type="submit"
              class="button primary"
              data-action="settings-add-owner"
              disabled={ownerBusy}
            >
              ＋ 添加
            </button>
          </form>
        </div>

        <div class="source-chips">
          {owners.map(o => (
            <button
              key={o.id}
              type="button"
              class="owner-chip"
              data-action="settings-edit-owner"
              style={o.archived ? { opacity: 0.55 } : undefined}
              onClick={() => setEditingOwner({ ...o })}
            >
              <span class="color-dot" style={{ '--dot-color': ownerColor(o) }} />
              <span>@{o.name}</span>
              {o.archived && <small>(停用)</small>}
            </button>
          ))}
        </div>
      </section>

      {/* Hierarchical Dashed-Pill Category Wall + Starter Packs + Default @ */}
      <CategoryWall />

      {/* Data, Backup, Trash, Logout */}
      <section class="card">
        <div class="card-heading">
          <h2>数据安全与账本管理</h2>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="button"
            class="button secondary"
            data-action="settings-export-all"
            onClick={handleExportAllCsv}
          >
            <Icon name="download" size={16} />
            导出全部账单 CSV
          </button>
          <button
            type="button"
            class="button secondary"
            data-action="settings-backup"
            onClick={() => {
              setBackupData(null);
              setBackupPreview(null);
              setBackupError('');
              setRestoreProgress(null);
              setRestoredJob(null);
              setBackupOpen(true);
            }}
          >
            <Icon name="upload" size={16} />
            备份与恢复
          </button>
          <button
            type="button"
            class="button secondary"
            data-action="settings-trash"
            onClick={() => loadTrash(0)}
          >
            <Icon name="trash" size={16} />
            回收站
          </button>
          <button
            type="button"
            class="button secondary"
            data-action="settings-logout"
            onClick={() => setLogoutOpen(true)}
          >
            <Icon name="logout" size={16} />
            退出登录
          </button>
        </div>
      </section>

      {/* Edit Owner Modal */}
      <Modal
        open={Boolean(editingOwner)}
        title="编辑成员"
        locked={ownerBusy}
        onClose={() => setEditingOwner(null)}
      >
        {editingOwner && (
          <form class="standard-form" onSubmit={handleSaveOwner}>
            <label>
              成员名称
              <input
                type="text"
                required
                maxLength={24}
                value={editingOwner.name}
                onInput={e => setEditingOwner(o => ({ ...o, name: e.currentTarget.value }))}
              />
            </label>
            <label>
              标签颜色
              <select
                value={editingOwner.color_key}
                onChange={e =>
                  setEditingOwner(o => ({ ...o, color_key: e.currentTarget.value }))
                }
              >
                {Object.keys(PALETTE).map(k => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label class="checkbox-label">
              <input
                type="checkbox"
                checked={Boolean(editingOwner.archived)}
                onChange={e =>
                  setEditingOwner(o => ({ ...o, archived: e.currentTarget.checked }))
                }
              />
              停用该成员（历史归属记录保留）
            </label>
            <div class="dialog-footer">
              <button
                type="button"
                class="button secondary"
                data-action="close-dialog"
                onClick={() => setEditingOwner(null)}
              >
                取消
              </button>
              <button type="submit" class="button primary" data-action="settings-save-owner" disabled={ownerBusy}>
                保存
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Backup & Restore Modal */}
      <Modal
        open={backupOpen}
        title="备份与恢复"
        wide
        locked={backupBusy}
        onClose={() => setBackupOpen(false)}
      >
        <p class="muted" style={{ margin: 0, fontSize: '13px' }}>
          完整备份包含分类、二级子类、@归属人、有效账目、回收站、文字草稿与循环规则。恢复时创建独立候选账本，当前账本会保留。
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            class="button secondary"
            data-action="backup-download-json"
            onClick={handleDownloadBackup}
          >
            <Icon name="file" size={16} />
            下载完整 JSON 备份
          </button>
          <button
            type="button"
            class="button secondary"
            data-action="backup-download-csv"
            onClick={handleExportAllCsv}
          >
            <Icon name="download" size={16} />
            导出全部有效账目 CSV
          </button>
        </div>

        <label class="bar-row" style={{ cursor: 'pointer', alignItems: 'center', borderStyle: 'dashed' }}>
          <strong>选择备份 JSON 文件进行检查（最大 20 MB）</strong>
          <input
            type="file"
            accept="application/json,.json"
            id="backup-file"
            onChange={e => handleBackupFile(e.currentTarget.files?.[0])}
          />
        </label>

        {backupError && <p class="field-error" role="alert">{backupError}</p>}

        {backupPreview && !restoredJob && (
          <div class="bar-row" style={{ gap: '8px' }}>
            <strong>{backupPreview.ledger?.name || '备份校验通过'}</strong>
            <div class="muted" style={{ fontSize: '13px' }}>
              有效 {backupPreview.summary.active} 笔 · 回收站 {backupPreview.summary.deleted} 笔 ·
              支出 {money(backupPreview.summary.expense_minor)} · 收入 {money(backupPreview.summary.income_minor)}
            </div>
            {restoreProgress && (
              <div>
                <progress value={restoreProgress.received} max={restoreProgress.total} style={{ width: '100%' }} />
                <div class="muted" style={{ fontSize: '12px' }}>
                  已核对 {restoreProgress.received} / {backupData.entries.length} 笔记录
                </div>
              </div>
            )}
            <button
              type="button"
              class="button primary"
              data-action="start-restore"
              disabled={backupBusy}
              onClick={handleStartRestore}
            >
              {backupBusy ? '正在校验写入…' : '创建并校验候选账本'}
            </button>
          </div>
        )}

        {restoredJob && (
          <div class="bar-row" style={{ borderColor: 'var(--confirm)', background: 'var(--confirm-soft)' }}>
            <strong>
              {restoredJob.repeated ? '已找到并核对同一备份的候选账本' : '候选账本已通过完整校验'}
            </strong>
            <p class="muted" style={{ margin: 0, fontSize: '13px' }}>
              分类、@归属人、记录与备份内容一致，当前账本仍在使用。
            </p>
            <button
              type="button"
              class="button primary"
              data-action="activate-restored-ledger"
              onClick={() => activateLedger(restoredJob.id)}
            >
              切换到已校验的候选账本
            </button>
          </div>
        )}
      </Modal>

      {/* Trash Modal */}
      <Modal
        open={trashOpen}
        title="回收站"
        wide
        locked={trashBusy}
        onClose={() => setTrashOpen(false)}
      >
        {trashData ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <p class="muted" style={{ margin: 0, fontSize: '13px' }}>
              删除的 {trashData.totals.count} 笔记录保留在这里，恢复后重新计入统计。
            </p>
            {trashData.entries.length ? (
              trashData.entries.map(item => (
                <div
                  key={item.id}
                  class="bar-row"
                  style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <div>
                    <strong>{item.note || item.category_name}</strong>
                    <div class="muted" style={{ fontSize: '12px' }}>
                      {recordDateLabel(item.occurred_on)} · {item.category_name}
                      {item.subcategory ? ` · ${item.subcategory}` : ''} · {money(item.amount_minor)}
                    </div>
                  </div>
                  <button
                    type="button"
                    class="button secondary"
                    data-action="trash-restore-entry"
                    disabled={trashBusy}
                    onClick={() => handleRestoreTrashEntry(item)}
                  >
                    恢复
                  </button>
                </div>
              ))
            ) : (
              <p class="muted">回收站是空的。</p>
            )}
            {trashData.totals.count > 50 && (
              <div class="pagination">
                <button
                  type="button"
                  class="button secondary"
                  data-action="trash-prev"
                  disabled={trashOffset === 0 || trashBusy}
                  onClick={() => loadTrash(Math.max(0, trashOffset - 50))}
                >
                  上一页
                </button>
                <button
                  type="button"
                  class="button secondary"
                  data-action="trash-next"
                  disabled={trashOffset + 50 >= trashData.totals.count || trashBusy}
                  onClick={() => loadTrash(trashOffset + 50)}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        ) : (
          <p class="muted">正在加载回收站…</p>
        )}
      </Modal>

      {/* Logout Confirm Modal */}
      <Modal
        open={logoutOpen}
        title="退出登录？"
        onClose={() => setLogoutOpen(false)}
      >
        <p class="muted" style={{ margin: 0 }}>
          已保存的账目会保留，当前浏览器的未保存草稿会清除。
        </p>
        <div class="dialog-footer">
          <button
            type="button"
            class="button secondary"
            data-action="close-dialog"
            onClick={() => setLogoutOpen(false)}
          >
            取消
          </button>
          <button
            type="button"
            class="button primary"
            data-action="confirm-logout"
            onClick={() => {
              setLogoutOpen(false);
              logout();
            }}
          >
            退出登录
          </button>
        </div>
      </Modal>
    </div>
  );
}
