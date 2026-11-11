import { createContext, useContext } from 'react';
import type { MiniappDefinition } from './types';

export interface MiniappRuntime {
  definition: MiniappDefinition;
  /** Opens the app's own screen (from a widget). */
  open: () => void;
  /** Where it is shown: its own screen, or a widget on Home. */
  place: 'app' | 'widget';
}

export const MiniappContext = createContext<MiniappRuntime | null>(null);

/** The miniapp this component belongs to. */
export function useMiniapp(): MiniappRuntime {
  const ctx = useContext(MiniappContext);
  if (!ctx) throw new Error('useMiniapp must be used inside a miniapp');
  return ctx;
}
