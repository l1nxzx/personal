import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CaptureKind } from '../../../shared/types';

interface CaptureSeed {
  text?: string;
  kind?: CaptureKind;
}

interface UIValue {
  captureOpen: boolean;
  captureSeed: CaptureSeed | null;
  openCapture: (seed?: CaptureSeed) => void;
  closeCapture: () => void;
  searchOpen: boolean;
  openSearch: () => void;
  closeSearch: () => void;
}

const UIContext = createContext<UIValue | null>(null);

/** App-wide overlays (Quick Capture, Search) that any page or shortcut can open. */
export function UIProvider({ children }: { children: ReactNode }) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureSeed, setCaptureSeed] = useState<CaptureSeed | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const openCapture = useCallback((seed?: CaptureSeed) => {
    setSearchOpen(false);
    setCaptureSeed(seed ?? null);
    setCaptureOpen(true);
  }, []);
  const closeCapture = useCallback(() => setCaptureOpen(false), []);
  const openSearch = useCallback(() => {
    setCaptureOpen(false);
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);

  const value = useMemo(
    () => ({
      captureOpen,
      captureSeed,
      openCapture,
      closeCapture,
      searchOpen,
      openSearch,
      closeSearch,
    }),
    [captureOpen, captureSeed, openCapture, closeCapture, searchOpen, openSearch, closeSearch],
  );
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used inside UIProvider');
  return ctx;
}
