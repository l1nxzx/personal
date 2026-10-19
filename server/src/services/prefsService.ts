import type { Prefs } from '../../../shared/types.js';
import * as prefsRepo from '../data/prefsRepo.js';
import { notifyChange, type Ctx } from './context.js';

const DEFAULTS: Prefs = {
  focusLine: '',
  showPrompts: true,
  promptDismissedOn: null,
  writingFont: 'serif',
  baseCurrency: 'EUR',
  showOnThisDay: true,
};

export async function getPrefs(ctx: Ctx): Promise<Prefs> {
  return { ...DEFAULTS, ...(await prefsRepo.get(ctx.userId)) };
}

export async function updatePrefs(ctx: Ctx, patch: Partial<Prefs>): Promise<Prefs> {
  await prefsRepo.update(ctx.userId, patch);
  notifyChange(ctx, 'prefs');
  return getPrefs(ctx);
}
