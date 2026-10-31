import { registerSW } from 'virtual:pwa-register';
import { isHoldingWork } from './busy';

/**
 * App updates (service worker, `registerType: 'prompt'`). A new version is applied by reloading,
 * so it is only done when nothing can be lost:
 * - right after launch (the first few seconds, before any work has started), or
 * - on pull to refresh (which is disabled while there is unsaved work).
 * Otherwise the new version waits and is picked up on the next launch.
 */
const LAUNCH_WINDOW_MS = 5000;
const launchedAt = performance.now();

let update: ((reload?: boolean) => Promise<void>) | null = null;
let waiting = false;

export function initAppUpdate(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  update = registerSW({
    onNeedRefresh() {
      waiting = true;
      if (performance.now() - launchedAt < LAUNCH_WINDOW_MS && !isHoldingWork()) {
        void applyAppUpdate();
      }
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // Look for a new version when the app comes back to the foreground; it is applied on the
      // next launch or pull to refresh.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          void registration.update().catch(() => {});
        }
      });
    },
  });
}

export function hasAppUpdate(): boolean {
  return waiting && !!update;
}

/** Switch to the waiting version; the page reloads once it has taken over. */
export async function applyAppUpdate(): Promise<void> {
  if (!waiting || !update) return;
  await update(true);
}
