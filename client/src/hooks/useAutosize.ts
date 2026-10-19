import { useLayoutEffect } from 'react';

/**
 * Grows a textarea with its content. Keeps the page's scroll position stable while resizing,
 * which matters on phones where the textarea is taller than the screen.
 */
export function useAutosize(ref: React.RefObject<HTMLTextAreaElement>, value: string, minRows = 1) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const scroller = document.scrollingElement;
    const scrollTop = scroller?.scrollTop ?? 0;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const min = minRows * lineHeight + el.offsetHeight - el.clientHeight;
    el.style.height = `${Math.max(el.scrollHeight + el.offsetHeight - el.clientHeight, min)}px`;
    if (scroller) scroller.scrollTop = scrollTop;
  }, [ref, value, minRows]);
}
