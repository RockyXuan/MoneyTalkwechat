import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './Icons.jsx';

let lastTriggerEl = null;
const INTERACTIVE_SELECTOR =
  'button,a[href],input,select,textarea,summary,[role="button"],[data-action],[tabindex]:not([tabindex="-1"])';
if (typeof document !== 'undefined') {
  document.addEventListener(
    'pointerdown',
    e => {
      const target = e.target?.closest?.(INTERACTIVE_SELECTOR);
      if (target && !target.closest('#dialog')) lastTriggerEl = target;
    },
    true
  );
  document.addEventListener(
    'focusin',
    e => {
      const target = e.target;
      if (target?.matches?.(INTERACTIVE_SELECTOR) && !target.closest?.('#dialog')) {
        lastTriggerEl = target;
      }
    },
    true
  );
}

export function Modal({
  open,
  title,
  wide = false,
  locked = false,
  dirty = false,
  uncertain = false,
  uncertainMessage = '保存结果尚未核实，请先重试确认',
  lockedMessage = '正在处理，请稍候',
  onClose,
  onBlockedNotice,
  children,
}) {
  const dialogRef = useRef(null);
  const pointerDownOutsideRef = useRef(false);
  const returnFocusRef = useRef(null);
  const wasOpenRef = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const restoreReturnFocus = () => {
    const node = dialogRef.current;
    if (node?.open) node.close();
    const target = returnFocusRef.current;
    const shouldRestore = wasOpenRef.current;
    wasOpenRef.current = false;
    returnFocusRef.current = null;
    if (shouldRestore && target?.isConnected) {
      target.focus({ preventScroll: true });
      requestAnimationFrame(() => {
        if (
          target.isConnected &&
          !document.activeElement?.matches?.(INTERACTIVE_SELECTOR) &&
          !document.querySelector('dialog[open]')
        ) {
          target.focus({ preventScroll: true });
        }
      });
    }
  };

  useLayoutEffect(() => {
    return () => {
      restoreReturnFocus();
    };
  }, []);

  useLayoutEffect(() => {
    const node = dialogRef.current;
    if (!node) return;
    if (open) {
      if (!wasOpenRef.current) {
        const active = document.activeElement;
        returnFocusRef.current =
          lastTriggerEl?.isConnected && !lastTriggerEl.closest('#dialog')
            ? lastTriggerEl
            : active && active !== document.body && !active.closest('#dialog')
              ? active
              : null;
      }
      wasOpenRef.current = true;
      setConfirmDiscard(false);
      if (!node.open) {
        try {
          node.showModal();
        } catch {
          node.setAttribute('open', '');
        }
      }
    } else if (node.open || wasOpenRef.current) {
      if (node.open) node.close();
      setConfirmDiscard(false);
      restoreReturnFocus();
    }
  }, [open]);

  function attemptClose() {
    if (locked) {
      onBlockedNotice?.(lockedMessage);
      return;
    }
    if (uncertain) {
      onBlockedNotice?.(uncertainMessage);
      return;
    }
    if (confirmDiscard) {
      // Outside click / Escape while on discard guard returns to editing rather than discarding.
      setConfirmDiscard(false);
      return;
    }
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onClose?.();
  }

  function handlePointerDown(event) {
    pointerDownOutsideRef.current = !event.target.closest('.dialog-panel');
  }

  function handleClick(event) {
    if (pointerDownOutsideRef.current && !event.target.closest('.dialog-panel')) {
      attemptClose();
    }
    pointerDownOutsideRef.current = false;
  }

  function handleCancel(event) {
    event.preventDefault();
    attemptClose();
  }

  if (!open) return <dialog ref={dialogRef} class="app-dialog" />;

  return (
    <dialog
      ref={dialogRef}
      id="dialog"
      class={`app-dialog ${wide ? 'wide' : ''}`}
      aria-labelledby="dialog-title"
      data-locked={locked ? 'true' : 'false'}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onCancel={handleCancel}
    >
      <div class="dialog-panel">
        <div class="dialog-header">
          <h2 id="dialog-title">{confirmDiscard ? '放弃修改？' : title}</h2>
          <button
            type="button"
            class="icon-button"
            data-action="close-dialog"
            aria-label="关闭弹框"
            disabled={locked}
            onClick={attemptClose}
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <div class="dialog-body">
          {confirmDiscard ? (
            <div>
              <p class="muted">这次修改还没有保存。</p>
              <div class="dialog-footer">
                <button
                  type="button"
                  class="button secondary"
                  data-action="keep-editing"
                  onClick={() => setConfirmDiscard(false)}
                >
                  继续编辑
                </button>
                <button
                  type="button"
                  class="button danger-button"
                  data-action="discard-editing"
                  onClick={() => {
                    setConfirmDiscard(false);
                    onClose?.();
                  }}
                >
                  放弃修改
                </button>
              </div>
            </div>
          ) : (
            children
          )}
        </div>
      </div>
    </dialog>
  );
}
