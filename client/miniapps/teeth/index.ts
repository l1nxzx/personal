import { lazy } from 'react';
import { defineMiniapp } from '@miniapp/sdk';
import { INITIAL, merge, type BrushData } from './logic';
import { ToothGlyph } from './Molar';

export default defineMiniapp<BrushData>({
  id: 'teeth',
  name: 'Brush',
  description:
    'Track brushing your teeth, morning and evening. Molar the tooth keeps your streak, and gets mad when you skip.',
  about: [
    'Two buttons a day: morning and evening. A day runs from 3 am, so a late brush still counts.',
    'Your streak, your best streak and the last two weeks at a glance.',
    'Forgot to log last night? Add it the next day.',
    'Molar the tooth is pleased when you brush, and properly annoyed when you do not.',
  ],
  icon: { glyph: ToothGlyph, background: '#3f7a72' },
  App: lazy(() => import('./App')),
  Widget: lazy(() => import('./Widget')),
  initialData: INITIAL,
  merge,
});
