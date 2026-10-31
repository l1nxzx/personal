import { useEffect } from 'react';

/**
 * Whether something on screen holds work that a reload or a full refresh could lose: an editor
 * or form with unsaved changes, or an open dialog. Pull to refresh and app updates wait for it.
 */
let holds = 0;

export function isHoldingWork(): boolean {
  if (holds > 0) return true;
  // A field being typed in is a form in use, saved or not.
  const el = document.activeElement;
  return (
    el instanceof HTMLElement &&
    (el.isContentEditable ||
      el.matches('input:not([type=checkbox]):not([type=radio]),textarea,select'))
  );
}

/** Register a hold; call the returned function to release it (safe to call twice). */
export function holdWork(): () => void {
  holds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds--;
  };
}

/** Hold while `active` is true (the component is mounted and has unsaved work). */
export function useHoldWork(active: boolean): void {
  useEffect(() => (active ? holdWork() : undefined), [active]);
}
