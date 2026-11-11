import { lazy } from 'react';
import { defineMiniapp } from '@miniapp/sdk';
import { INITIAL, merge, type BrushData } from './logic';
import { ToothGlyph } from './Molar';

export default defineMiniapp<BrushData>({
  id: 'teeth',
  name: 'Brush',
  description:
    'Track brushing your teeth, morning and evening. Molar the tooth keeps your streak, and gets mad when you skip.',
  icon: { glyph: ToothGlyph, background: 'linear-gradient(160deg, #7fd8c8 0%, #2b8f9d 100%)' },
  App: lazy(() => import('./App')),
  Widget: lazy(() => import('./Widget')),
  initialData: INITIAL,
  merge,
});
