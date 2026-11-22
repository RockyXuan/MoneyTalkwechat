import { useEffect, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { Icon, categoryColor, ownerColor } from './Icons.jsx';

export function QuickTagPopover({
  anchorRect,
  mode, // 'category' | 'owner'
  entryType = 'expense',
  currentCategoryId,
  currentSubcategory,
  currentOwnerId,
  categories = [],
  owners = [],
  onSelectCategory,
  onSelectOwner,
  onClose,
}) {
  const activeCats = categories.filter(c => c.type === entryType && (!c.archived || c.id === currentCategoryId));
  const [selectedMajorId, setSelectedMajorId] = useState(
    currentCategoryId || activeCats[0]?.id || ''
  );

  useEffect(() => {
    setSelectedMajorId(currentCategoryId || activeCats[0]?.id || '');
  }, [currentCategoryId, entryType]);

  useEffect(() => {
    const onKey = event => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!anchorRect) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
  const width = Math.min(390, vw - 24);
  const left = Math.max(12, Math.min(anchorRect.left, vw - width - 12));
  const maxHeight = Math.min(420, Math.max(200, vh - 24));
  const preferTop = anchorRect.bottom + 8 + maxHeight > vh - 12 && anchorRect.top - 12 > maxHeight;
  const rawTop = preferTop ? anchorRect.top - 8 - maxHeight : anchorRect.bottom + 8;
  const top = Math.max(12, Math.min(vh - maxHeight - 12, rawTop));

  const selectedMajor = activeCats.find(c => c.id === selectedMajorId) || activeCats[0];
  const subs = selectedMajor?.subcategories || [];
  const activeOwners = owners.filter(o => !o.archived || o.id === currentOwnerId);

  const popoverTree = (
    <div
      class="quick-popover-backdrop"
      data-action="close-popover"
      onClick={event => {
        if (!event.target.closest('.quick-popover')) onClose?.();
      }}
    >
      <div
        class="quick-popover"
        role="dialog"
        aria-label={mode === 'category' ? '快速切换分类与子类' : '快速切换 @归属人'}
        style={{ top: `${top}px`, left: `${left}px`, maxHeight: `${maxHeight}px` }}
      >
        <div class="popover-head">
          <strong>{mode === 'category' ? '点一下切换大类或子类' : '这笔花给了谁？（@归属人）'}</strong>
          <button
            type="button"
            class="icon-button"
            aria-label="关闭快捷选择"
            data-action="close-popover"
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {mode === 'category' ? (
          <div class="popover-split">
            <div class="popover-majors" role="tablist" aria-label="选择大类">
              {activeCats.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  data-action="popover-choose-major"
                  class={`popover-major-btn ${selectedMajor?.id === cat.id ? 'active' : ''}`}
                  onClick={() => {
                    if (!(cat.subcategories?.length)) {
                      onSelectCategory?.(cat.id, null);
                    } else {
                      setSelectedMajorId(cat.id);
                    }
                  }}
                >
                  <span class="color-dot" style={{ '--dot-color': categoryColor(cat) }} />
                  <span>{cat.name}</span>
                </button>
              ))}
            </div>
            <div class="popover-subs" aria-label="选择二级子类">
              {selectedMajor && (
                <button
                  type="button"
                  data-action="popover-choose-sub"
                  class={`popover-sub-btn ${currentCategoryId === selectedMajor.id && !currentSubcategory ? 'active' : ''}`}
                  onClick={() => onSelectCategory?.(selectedMajor.id, null)}
                >
                  仅选「{selectedMajor.name}」
                </button>
              )}
              {subs.map(sub => (
                <button
                  key={sub}
                  type="button"
                  data-action="popover-choose-sub"
                  class={`popover-sub-btn ${currentCategoryId === selectedMajor?.id && currentSubcategory === sub ? 'active' : ''}`}
                  onClick={() => onSelectCategory?.(selectedMajor.id, sub)}
                >
                  {sub}
                </button>
              ))}
              {!subs.length && selectedMajor && (
                <span class="muted" style={{ fontSize: '12px', padding: '6px 4px' }}>
                  该大类暂无二级子类，可在「我的」点亮
                </span>
              )}
            </div>
          </div>
        ) : (
          <div class="popover-owner-grid">
            {activeOwners.map(o => (
              <button
                key={o.id}
                type="button"
                data-action="popover-choose-owner"
                class={`owner-chip ${currentOwnerId === o.id ? 'active' : ''}`}
                aria-pressed={currentOwnerId === o.id}
                onClick={() => onSelectOwner?.(o.id)}
              >
                <span class="color-dot" style={{ '--dot-color': ownerColor(o) }} />
                <span>@{o.name}</span>
              </button>
            ))}
            <button
              type="button"
              data-action="popover-choose-owner"
              class={`owner-chip ${!currentOwnerId ? 'active' : ''}`}
              aria-pressed={!currentOwnerId}
              onClick={() => onSelectOwner?.(null)}
            >
              <span>未指定成员</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
  return typeof document !== 'undefined' ? createPortal(popoverTree, document.body) : popoverTree;
}
