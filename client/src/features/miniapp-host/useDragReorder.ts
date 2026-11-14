import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

/**
 * Rearranging tiles by dragging, like a phone's home screen, without a library.
 *
 * - Touch: hold a tile (LONG_PRESS) to pick it up; moving before that scrolls the page as usual.
 *   While arranging (`editing`), a tile is picked up as soon as the finger moves.
 * - Mouse: press and move a few pixels.
 * - The tile follows the pointer as a lifted copy (`ghost`); the others slide out of its way
 *   (FLIP animation), and dropping calls `onDrop` with the new order if it changed.
 */
const LONG_PRESS = 380;
const SLOP_TOUCH = 10;
const SLOP_MOUSE = 6;
const EDGE = 72;

export interface Ghost {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Press {
  key: string;
  pointerId: number;
  touch: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** Where in the tile it was grabbed. */
  offX: number;
  offY: number;
  width: number;
  height: number;
  timer?: ReturnType<typeof setTimeout>;
  active: boolean;
}

export function useDragReorder({
  keys,
  editing,
  onStart,
  onDrop,
}: {
  keys: string[];
  editing: boolean;
  /** A tile was picked up (the screen enters arranging mode). */
  onStart: () => void;
  onDrop: (keys: string[]) => void;
}) {
  const [order, setOrder] = useState(keys);
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const press = useRef<Press | null>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const before = useRef<Map<string, DOMRect> | null>(null);
  const lastMove = useRef(0);
  const scrollRaf = useRef<number>();
  const keysRef = useRef(keys);
  keysRef.current = keys;
  const cbs = useRef({ onStart, onDrop, editing });
  cbs.current = { onStart, onDrop, editing };

  // Follow the saved order whenever no tile is being dragged.
  const keysSig = keys.join('|');
  useEffect(() => {
    if (!press.current?.active) setOrder(keys);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSig]);

  /** Remember where each tile is, so the next layout can slide them from there. */
  const measure = () => {
    const m = new Map<string, DOMRect>();
    els.current.forEach((el, k) => m.set(k, el.getBoundingClientRect()));
    before.current = m;
  };

  useLayoutEffect(() => {
    const prev = before.current;
    before.current = null;
    if (!prev || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    els.current.forEach((el, k) => {
      const a = prev.get(k);
      if (!a || k === press.current?.key) return;
      const b = el.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], {
        duration: 200,
        easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)',
      });
    });
  }, [order]);

  const move = useCallback((to: number) => {
    const p = press.current;
    if (!p) return;
    const cur = orderRef.current;
    const from = cur.indexOf(p.key);
    if (from === -1 || to === from) return;
    measure();
    const next = cur.filter((k) => k !== p.key);
    next.splice(to, 0, p.key);
    lastMove.current = performance.now();
    setOrder(next);
  }, []);

  /** Where the dragged tile belongs, for the pointer at (x, y). */
  const retarget = useCallback(
    (x: number, y: number) => {
      const p = press.current;
      if (!p || performance.now() - lastMove.current < 90) return;
      const cur = orderRef.current;
      const from = cur.indexOf(p.key);
      for (let i = 0; i < cur.length; i++) {
        const k = cur[i]!;
        if (k === p.key) continue;
        const r = els.current.get(k)?.getBoundingClientRect();
        if (!r || x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
        // Only past the middle of a tile (in reading order) does it give way, so tiles of
        // different sizes don't swap back and forth.
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const band = r.height / 4;
        const after = y > cy + band || (Math.abs(y - cy) <= band && x > cx);
        const beforeMid = y < cy - band || (Math.abs(y - cy) <= band && x < cx);
        if (i > from && after) move(i);
        else if (i < from && beforeMid) move(i);
        return;
      }
      // Below the last tile: to the end.
      const last = els.current.get(cur[cur.length - 1]!)?.getBoundingClientRect();
      if (last && y > last.bottom && from !== cur.length - 1) move(cur.length - 1);
    },
    [move],
  );

  const autoScroll = useCallback(() => {
    const p = press.current;
    if (!p?.active) return;
    const h = window.innerHeight;
    const v = p.y < EDGE ? -(EDGE - p.y) / 6 : p.y > h - EDGE ? (p.y - (h - EDGE)) / 6 : 0;
    if (v) {
      window.scrollBy(0, v);
      retarget(p.x, p.y);
    }
    scrollRaf.current = requestAnimationFrame(autoScroll);
  }, [retarget]);

  const activate = useCallback(() => {
    const p = press.current;
    if (!p || p.active) return;
    p.active = true;
    navigator.vibrate?.(12);
    window.getSelection()?.removeAllRanges();
    cbs.current.onStart();
    setGhost({ key: p.key, x: p.x - p.offX, y: p.y - p.offY, width: p.width, height: p.height });
    scrollRaf.current = requestAnimationFrame(autoScroll);
  }, [autoScroll]);

  const end = useCallback((commit: boolean) => {
    const p = press.current;
    press.current = null;
    if (!p) return;
    clearTimeout(p.timer);
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
    if (!p.active) return;
    setGhost(null);
    // The click that follows a drop must not open the tile it ended on.
    const swallow = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 60);
    const next = orderRef.current;
    if (!commit) setOrder(keysRef.current);
    else if (next.join('|') !== keysRef.current.join('|')) cbs.current.onDrop(next);
  }, []);

  // Window listeners for the press in progress.
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = press.current;
      if (!p || e.pointerId !== p.pointerId) return;
      p.x = e.clientX;
      p.y = e.clientY;
      if (!p.active) {
        const dist = Math.hypot(p.x - p.startX, p.y - p.startY);
        if (p.touch && !cbs.current.editing) {
          // Moving before the long press is scrolling.
          if (dist > SLOP_TOUCH) end(false);
          return;
        }
        if (dist > (p.touch ? SLOP_TOUCH : SLOP_MOUSE)) activate();
        else return;
      }
      setGhost((g) => (g ? { ...g, x: p.x - p.offX, y: p.y - p.offY } : g));
      retarget(p.x, p.y);
    };
    const onUp = (e: PointerEvent) => {
      if (press.current?.pointerId === e.pointerId) end(true);
    };
    const onCancel = (e: PointerEvent) => {
      if (press.current?.pointerId === e.pointerId) end(true);
    };
    // Once a tile is picked up, the finger moves it instead of scrolling the page.
    const onTouchMove = (e: TouchEvent) => {
      if (press.current?.active && e.cancelable) e.preventDefault();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && press.current?.active) end(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('keydown', onKey);
    };
  }, [activate, end, retarget]);

  useEffect(() => () => end(false), [end]);

  /** Props for a tile's outer element. */
  const bind = useCallback(
    (key: string) => ({
      ref: (el: HTMLElement | null) => {
        if (el) els.current.set(key, el);
        else els.current.delete(key);
      },
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
        if (press.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
        const r = e.currentTarget.getBoundingClientRect();
        const touch = e.pointerType !== 'mouse';
        press.current = {
          key,
          pointerId: e.pointerId,
          touch,
          startX: e.clientX,
          startY: e.clientY,
          x: e.clientX,
          y: e.clientY,
          offX: e.clientX - r.left,
          offY: e.clientY - r.top,
          width: r.width,
          height: r.height,
          active: false,
        };
        if (touch && !cbs.current.editing) press.current.timer = setTimeout(activate, LONG_PRESS);
      },
      // Long presses on links and pictures open the browser's menu otherwise.
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
      onDragStart: (e: { preventDefault: () => void }) => e.preventDefault(),
    }),
    [activate],
  );

  /** Keyboard arranging: move a tile one place back or forward, and save. */
  const nudge = useCallback((key: string, by: number) => {
    const cur = orderRef.current;
    const from = cur.indexOf(key);
    const to = Math.max(0, Math.min(cur.length - 1, from + by));
    if (from === -1 || to === from) return;
    measure();
    const next = cur.filter((k) => k !== key);
    next.splice(to, 0, key);
    setOrder(next);
    cbs.current.onDrop(next);
  }, []);

  return { order, ghost, dragging: ghost?.key ?? null, bind, nudge };
}
