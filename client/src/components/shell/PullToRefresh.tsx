import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { applyAppUpdate, hasAppUpdate } from '../../lib/appUpdate';
import { isHoldingWork } from '../../lib/busy';

/** Disc size, and how far it travels (px). */
const DISC = 40;
const MAX_PULL = 128;
/** Release beyond this to refresh. */
const TRIGGER = 72;
/** Where the disc waits while refreshing. */
const REST = 64;
/** Arc circle: radius and circumference. */
const R = 8.5;
const C = 2 * Math.PI * R;

type Phase = 'idle' | 'tracking' | 'pulling' | 'refreshing';

/** A touch starting inside something scrolled down, or inside a field, belongs to it. */
function ownedElsewhere(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el; el = el.parentElement) {
    if (el === document.body || el === document.documentElement) return false;
    if (el.scrollTop > 0) return true;
    if (el instanceof HTMLElement && (el.isContentEditable || el.dataset.noPull !== undefined))
      return true;
    if (el.matches('input,textarea,select')) return true;
  }
  return false;
}

const atTop = () => (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;

/** Pull distance with resistance: follows the finger at first, then stiffens up to MAX_PULL. */
const resist = (dy: number) => MAX_PULL * (1 - Math.exp(-dy / (MAX_PULL * 1.5)));

/**
 * Android-style pull to refresh for the page (the document is the scroll container). Starts only
 * at the very top; once the pull has started it owns the gesture. Pushing back up cancels it.
 * Releasing past the trigger refetches what is on screen, or applies a waiting app update.
 * Disabled while `disabled` (editors) or while anything holds unsaved work (lib/busy.ts).
 */
export function PullToRefresh({ disabled }: { disabled?: boolean }) {
  const qc = useQueryClient();
  const discRef = useRef<HTMLDivElement>(null);
  const arcRef = useRef<SVGCircleElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    let phase: Phase = 'idle';
    let startX = 0;
    let startY = 0;
    let pull = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const disc = discRef.current!;
    const arc = arcRef.current!;
    const svg = svgRef.current!;

    const place = (y: number, transition: string, scale = 1) => {
      disc.style.transition = transition;
      disc.style.transform = `translate3d(-50%, ${y - DISC}px, 0) scale(${scale})`;
    };
    const hide = () => {
      disc.style.visibility = 'hidden';
      svg.classList.remove('ptr-spinning');
      place(0, 'none');
      phase = 'idle';
    };
    const draw = (distance: number) => {
      const progress = Math.min(1, distance / TRIGGER);
      // The arc grows with the pull and turns as it goes; it firms up once release will refresh.
      arc.style.strokeDasharray = `${C * (0.05 + 0.75 * progress)} ${C}`;
      svg.style.transform = `rotate(${-90 + progress * 270 + Math.max(0, distance - TRIGGER) * 2}deg)`;
      arc.style.opacity = distance >= TRIGGER ? '1' : '0.55';
      disc.style.opacity = String(Math.min(1, distance / 24));
      place(distance, 'none');
    };
    const retract = () => {
      place(0, 'transform 180ms ease-in, opacity 180ms ease-in');
      disc.style.opacity = '0';
      settleTimer = setTimeout(hide, 190);
    };

    const refresh = async () => {
      phase = 'refreshing';
      disc.style.opacity = '1';
      arc.style.opacity = '1';
      arc.style.strokeDasharray = '';
      svg.style.transform = '';
      svg.classList.add('ptr-spinning');
      place(REST, 'transform 200ms ease-out');
      if (hasAppUpdate()) {
        // The page reloads into the new version; the spinner stays until it does.
        await applyAppUpdate().catch(() => {});
        return;
      }
      await Promise.all([
        qc.refetchQueries({ type: 'active' }).catch(() => {}),
        new Promise((r) => setTimeout(r, 450)),
      ]);
      // Done: the disc shrinks away where it is.
      place(REST, 'transform 200ms ease-in, opacity 200ms ease-in', 0);
      disc.style.opacity = '0';
      settleTimer = setTimeout(hide, 210);
    };

    const onStart = (e: TouchEvent) => {
      if (phase !== 'idle') return;
      if (e.touches.length !== 1 || disabledRef.current || isHoldingWork()) return;
      if (!atTop() || ownedElsewhere(e.target)) return;
      startX = e.touches[0]!.clientX;
      startY = e.touches[0]!.clientY;
      phase = 'tracking';
    };

    const onMove = (e: TouchEvent) => {
      if (phase !== 'tracking' && phase !== 'pulling') return;
      if (e.touches.length !== 1) {
        if (phase === 'pulling') retract();
        phase = 'idle';
        return;
      }
      const dx = e.touches[0]!.clientX - startX;
      const dy = e.touches[0]!.clientY - startY;
      if (phase === 'tracking') {
        // Upwards or sideways first: an ordinary scroll or swipe, not ours. Downwards at the
        // top is ours from the first move; the browser decides on that move whether the rest
        // of the gesture is a scroll it won't let us stop.
        if (dy <= 0 || Math.abs(dx) > dy || !atTop()) {
          phase = 'idle';
          return;
        }
        phase = 'pulling';
        clearTimeout(settleTimer);
        disc.style.visibility = 'visible';
      }
      // From here the gesture is ours: no scrolling, no browser overscroll.
      if (e.cancelable) e.preventDefault();
      if (dy <= 0) {
        // Pushed all the way back up: cancelled.
        pull = 0;
        retract();
        phase = 'idle';
        return;
      }
      pull = resist(dy);
      draw(pull);
    };

    const onEnd = (e: TouchEvent) => {
      if (phase === 'tracking') phase = 'idle';
      if (phase !== 'pulling') return;
      if (e.type === 'touchend' && pull >= TRIGGER) void refresh();
      else retract();
      pull = 0;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      clearTimeout(settleTimer);
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, [qc]);

  return (
    <div
      ref={discRef}
      aria-hidden
      data-testid="pull-to-refresh"
      className="pointer-events-none fixed left-1/2 top-[env(safe-area-inset-top)] z-40 flex h-10 w-10 items-center justify-center rounded-full border border-line bg-raised text-accent shadow-[0_2px_6px_rgb(0_0_0/0.3)]"
      style={{ visibility: 'hidden', transform: `translate3d(-50%, ${-DISC}px, 0)` }}
    >
      <svg
        ref={svgRef}
        viewBox="0 0 24 24"
        className="h-6 w-6"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          ref={arcRef}
          cx="12"
          cy="12"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
