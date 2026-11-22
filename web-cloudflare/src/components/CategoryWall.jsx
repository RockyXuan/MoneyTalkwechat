import { useState } from 'preact/hooks';
import { Icon, categoryColor } from './Icons.jsx';
import { Modal } from './Modal.jsx';
import { useApp } from '../state/appContext.jsx';
import { mutate, request } from '../api.js';
import {
  RECOMMENDED_NEW_MAJORS,
  STARTER_PACKS,
  recommendedSubcategoriesFor,
} from '../../shared/taxonomy.js';
import { ICONS, PALETTE } from '../../shared/format.js';
import { SPENDING_LABELS } from '../../shared/spending-labels.js';

export function CategoryWall() {
  const { categories, setCategories, owners, toast, fetchData } = useApp();
  const [busy, setBusy] = useState(false);
  const [customInputs, setCustomInputs] = useState({});
  const [showArchived, setShowArchived] = useState(false);
  const [editModal, setEditModal] = useState(null); // null | category object (new if !id)
  const [modalError, setModalError] = useState('');

  const activeOwners = owners.filter(o => !o.archived);
  const existingNames = new Set(categories.map(c => c.name));
  const recommendedMajors = RECOMMENDED_NEW_MAJORS.filter(
    m => !categories.some(c => c.id === m.id || c.name === m.name)
  );

  async function syncCategories() {
    const res = await request('/categories');
    setCategories(res.categories || []);
    await fetchData({ quiet: true });
  }

  async function patchCategory(cat, patch, notice) {
    if (busy) return;
    setBusy(true);
    try {
      const body = {
        name: patch.name ?? cat.name,
        type: cat.type,
        color_key: patch.color_key ?? cat.color_key,
        icon: patch.icon ?? cat.icon,
        sort_order: patch.sort_order ?? cat.sort_order,
        archived: patch.archived ?? Boolean(cat.archived),
        aliases: patch.aliases ?? cat.aliases ?? [],
        spending_label:
          patch.spending_label !== undefined ? patch.spending_label : (cat.spending_label ?? null),
        subcategories: patch.subcategories ?? cat.subcategories ?? [],
        default_owner_id:
          patch.default_owner_id !== undefined
            ? patch.default_owner_id
            : (cat.default_owner_id ?? null),
        version: cat.version,
      };
      await mutate(`/categories/${cat.id}`, body, { method: 'PATCH' });
      await syncCategories();
      if (notice) toast(notice);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleEnableSub(cat, subName) {
    const trimmed = subName.trim();
    if (!trimmed || trimmed.length > 32) {
      toast('二级分类名称请控制在 1–32 字');
      return;
    }
    const existing = cat.subcategories || [];
    if (existing.includes(trimmed)) return;
    if (existing.length >= 24) {
      toast('每个大类最多添加 24 个二级子类');
      return;
    }
    await patchCategory(cat, { subcategories: [...existing, trimmed] }, `已添加子类「${trimmed}」`);
  }

  async function handleRemoveSub(cat, subName) {
    const nextSubs = (cat.subcategories || []).filter(s => s !== subName);
    await patchCategory(cat, { subcategories: nextSubs }, `已移除子类「${subName}」`);
  }

  async function handleApplyPack(packId) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await mutate('/categories/apply-pack', { pack: packId });
      setCategories(res.categories || []);
      await fetchData({ quiet: true });
      toast(
        `已应用「${STARTER_PACKS[packId].label}」：新增 ${res.added_categories} 个大类，补充 ${res.updated_subcategories} 组子类`
      );
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddRecommendedMajor(template) {
    if (busy) return;
    setBusy(true);
    try {
      await mutate('/categories', {
        name: template.name,
        type: template.type,
        color_key: template.color_key,
        icon: template.icon,
        sort_order: 85,
        archived: false,
        subcategories: template.subcategories,
        default_owner_id: template.default_owner_id || null,
      });
      await syncCategories();
      toast(`已加入推荐大类「${template.name}」`);
    } catch (err) {
      toast(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openEditor(cat = null) {
    setModalError('');
    setEditModal(
      cat
        ? {
            ...cat,
            aliasesText: (cat.aliases || []).join('、'),
          }
        : {
            id: null,
            name: '',
            type: 'expense',
            color_key: 'blue',
            icon: ICONS[0] || 'utensils',
            sort_order: 50,
            archived: false,
            spending_label: '',
            aliasesText: '',
            subcategories: [],
            default_owner_id: '',
          }
    );
  }

  async function handleSaveModal(e) {
    e.preventDefault();
    if (busy || !editModal) return;
    const name = editModal.name.trim();
    if (!name) {
      setModalError('请填写分类名称');
      return;
    }
    setBusy(true);
    setModalError('');
    try {
      const body = {
        name,
        type: editModal.type,
        color_key: editModal.color_key,
        icon: editModal.icon,
        sort_order: Number(editModal.sort_order) || 50,
        archived: Boolean(editModal.archived),
        spending_label: editModal.spending_label || null,
        aliases: String(editModal.aliasesText || '')
          .split(/[,，;；、\n]/)
          .map(x => x.trim())
          .filter(Boolean),
        subcategories: editModal.subcategories || [],
        default_owner_id: editModal.default_owner_id || null,
        ...(editModal.id ? { version: editModal.version } : {}),
      };
      await mutate(editModal.id ? `/categories/${editModal.id}` : '/categories', body, {
        method: editModal.id ? 'PATCH' : 'POST',
      });
      setEditModal(null);
      await syncCategories();
      toast('分类已保存，历史记录保持关联');
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const visibleCats = categories.filter(c => showArchived || !c.archived);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Starter Packs Banner */}
      <section class="card starter-pack-banner" aria-label="财务常识一键模板包">
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: '15.5px' }}>财务常识一键模板包</h3>
          <p class="muted" style={{ margin: 0, fontSize: '12.5px' }}>
            按常见记账财务常识自动补齐大类与推荐二级子类；只增不删，已有分类完全保留。
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            class="button secondary"
            data-action="cat-apply-pack-personal"
            disabled={busy}
            title={STARTER_PACKS.personal.description}
            onClick={() => handleApplyPack('personal')}
          >
            <Icon name="sparkles" size={15} />
            补全个人标准包
          </button>
          <button
            type="button"
            class="button primary"
            data-action="cat-apply-pack-family"
            disabled={busy}
            title={STARTER_PACKS.family.description}
            onClick={() => handleApplyPack('family')}
          >
            <Icon name="sparkles" size={15} />
            补全家庭精细包
          </button>
        </div>
      </section>

      {/* Category Wall */}
      <section class="card" aria-label="大类与二级分类墙">
        <div class="card-heading">
          <div>
            <h2>分类与二级子类 <small>实心为已启用，虚线点一下即添加</small></h2>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {categories.some(c => c.archived) && (
              <button
                type="button"
                class="text-button"
                data-action="cat-toggle-archived"
                onClick={() => setShowArchived(v => !v)}
              >
                {showArchived ? '隐藏已停用' : '显示已停用'}
              </button>
            )}
            <button
              type="button"
              class="button secondary"
              data-action="cat-new-major"
              onClick={() => openEditor(null)}
            >
              <Icon name="plus" size={15} />
              新建大类
            </button>
          </div>
        </div>

        <div class="cat-wall-grid">
          {visibleCats.map(cat => {
            const activeSubs = cat.subcategories || [];
            const recSubs = recommendedSubcategoriesFor(cat);
            return (
              <article key={cat.id} class="cat-wall-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                    <span class="color-dot" style={{ '--dot-color': categoryColor(cat) }} />
                    <strong style={{ fontSize: '15px' }}>{cat.name}</strong>
                    <small class="muted">{cat.type === 'income' ? '收入' : `${activeSubs.length} 子类`}</small>
                    {cat.archived && <span class="status-pill">已停用</span>}
                  </div>
                  <button
                    type="button"
                    class="icon-button"
                    aria-label={`编辑${cat.name}`}
                    data-action="cat-edit-major"
                    onClick={() => openEditor(cat)}
                  >
                    <Icon name="pencil" size={15} />
                  </button>
                </div>

                {/* Per-card Default @Owner Dropdown (Architecture 3) */}
                {cat.type === 'expense' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px' }}>
                    <span class="muted">默认 @</span>
                    <select
                      aria-label={`${cat.name}默认归属人`}
                      data-action="cat-default-owner"
                      disabled={busy}
                      value={cat.default_owner_id || ''}
                      onChange={e =>
                        patchCategory(
                          cat,
                          { default_owner_id: e.currentTarget.value || null },
                          e.currentTarget.value
                            ? `「${cat.name}」记账时将默认归到 @${activeOwners.find(o => o.id === e.currentTarget.value)?.name || ''}`
                            : `已取消「${cat.name}」的默认归属人`
                        )
                      }
                      style={{
                        padding: '4px 8px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-strong)',
                        background: 'var(--surface-subtle)',
                        fontSize: '12.5px',
                      }}
                    >
                      <option value="">不自动指定</option>
                      {activeOwners.map(o => (
                        <option key={o.id} value={o.id}>
                          @{o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Solid active + Dashed recommended Subcategory Pills */}
                <div class="sub-pill-wrap">
                  {activeSubs.map(sub => (
                    <span key={sub} class="sub-pill active">
                      <span>{sub}</span>
                      <button
                        type="button"
                        aria-label={`移除${sub}`}
                        data-action="cat-remove-sub"
                        disabled={busy}
                        style={{ border: 0, background: 'transparent', padding: 0, display: 'inline-flex', color: 'inherit' }}
                        onClick={() => handleRemoveSub(cat, sub)}
                      >
                        ×
                      </button>
                    </span>
                  ))}

                  {recSubs.map(sub => (
                    <button
                      key={sub}
                      type="button"
                      class="sub-pill rec"
                      data-action="cat-enable-rec-sub"
                      disabled={busy}
                      onClick={() => handleEnableSub(cat, sub)}
                    >
                      ＋ {sub}
                    </button>
                  ))}
                </div>

                {/* Inline Custom Subcategory Input */}
                <form
                  style={{ display: 'flex', gap: '6px', marginTop: 'auto' }}
                  onSubmit={async e => {
                    e.preventDefault();
                    const val = (customInputs[cat.id] || '').trim();
                    if (!val) return;
                    await handleEnableSub(cat, val);
                    setCustomInputs(prev => ({ ...prev, [cat.id]: '' }));
                  }}
                >
                  <input
                    type="text"
                    placeholder="添加自定义子类…"
                    maxLength={32}
                    value={customInputs[cat.id] || ''}
                    onInput={e =>
                      setCustomInputs(prev => ({ ...prev, [cat.id]: e.currentTarget.value }))
                    }
                    style={{
                      flex: 1,
                      padding: '5px 9px',
                      borderRadius: '9px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface-subtle)',
                      fontSize: '12.5px',
                    }}
                  />
                  <button
                    type="submit"
                    class="button secondary"
                    style={{ minHeight: '32px', padding: '4px 10px', fontSize: '12px' }}
                    data-action="cat-add-custom-sub"
                    disabled={busy}
                  >
                    添加
                  </button>
                </form>
              </article>
            );
          })}

          {/* Unadded Recommended New Major Category Cards */}
          {recommendedMajors
            .filter(m => !existingNames.has(m.name))
            .map(rec => (
              <article key={rec.id} class="major-rec-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                  <div>
                    <strong style={{ fontSize: '14.5px' }}>{rec.name}</strong>
                    <div class="muted" style={{ fontSize: '11.5px' }}>财务常识推荐大类</div>
                  </div>
                  <button
                    type="button"
                    class="button primary"
                    style={{ minHeight: '34px', padding: '5px 12px', fontSize: '12.5px' }}
                    data-action="cat-join-major"
                    disabled={busy}
                    onClick={() => handleAddRecommendedMajor(rec)}
                  >
                    ＋ 加入大类
                  </button>
                </div>
                <div class="sub-pill-wrap">
                  {rec.subcategories.map(sub => (
                    <span key={sub} class="sub-pill rec" style={{ cursor: 'default' }}>
                      {sub}
                    </span>
                  ))}
                </div>
              </article>
            ))}
        </div>
      </section>

      {/* Edit / Create Major Category Modal */}
      <Modal
        open={Boolean(editModal)}
        title={editModal?.id ? `编辑分类 · ${editModal.name}` : '新建大类'}
        locked={busy}
        onClose={() => setEditModal(null)}
      >
        {editModal && (
          <form class="standard-form" onSubmit={handleSaveModal}>
            <div class="review-grid">
              <label>
                分类名称
                <input
                  type="text"
                  required
                  maxLength={24}
                  value={editModal.name}
                  onInput={e => setEditModal(m => ({ ...m, name: e.currentTarget.value }))}
                />
              </label>

              {!editModal.id && (
                <label>
                  收支类型
                  <select
                    value={editModal.type}
                    onChange={e => setEditModal(m => ({ ...m, type: e.currentTarget.value }))}
                  >
                    <option value="expense">支出</option>
                    <option value="income">收入</option>
                  </select>
                </label>
              )}
            </div>

            <div class="review-grid">
              <label>
                颜色
                <select
                  value={editModal.color_key}
                  onChange={e => setEditModal(m => ({ ...m, color_key: e.currentTarget.value }))}
                >
                  {Object.keys(PALETTE).map(k => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                图标
                <select
                  value={editModal.icon}
                  onChange={e => setEditModal(m => ({ ...m, icon: e.currentTarget.value }))}
                >
                  {ICONS.map(ic => (
                    <option key={ic} value={ic}>
                      {ic}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div class="review-grid">
              <label>
                支出定位（选填）
                <select
                  value={editModal.spending_label || ''}
                  onChange={e =>
                    setEditModal(m => ({ ...m, spending_label: e.currentTarget.value }))
                  }
                >
                  <option value="">不设置</option>
                  {Object.entries(SPENDING_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                排序值
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={editModal.sort_order}
                  onInput={e =>
                    setEditModal(m => ({ ...m, sort_order: Number(e.currentTarget.value) || 0 }))
                  }
                />
              </label>
            </div>

            <label>
              口述别称（逗号分隔，用于文字智能匹配）
              <input
                type="text"
                placeholder="例如：喝咖啡、奶茶、星巴克"
                value={editModal.aliasesText}
                onInput={e => setEditModal(m => ({ ...m, aliasesText: e.currentTarget.value }))}
              />
            </label>

            {editModal.id && (
              <label class="checkbox-label">
                <input
                  type="checkbox"
                  checked={Boolean(editModal.archived)}
                  onChange={e =>
                    setEditModal(m => ({ ...m, archived: e.currentTarget.checked }))
                  }
                />
                停用此分类（历史账目不受影响）
              </label>
            )}

            {modalError && <p class="field-error">{modalError}</p>}

            <div class="dialog-footer">
              <button
                type="button"
                class="button secondary"
                data-action="close-dialog"
                onClick={() => setEditModal(null)}
              >
                取消
              </button>
              <button type="submit" class="button primary" data-action="cat-save-modal" disabled={busy}>
                保存分类
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
