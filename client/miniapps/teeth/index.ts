import { lazy } from 'react';
import { defineMiniapp } from '@miniapp/sdk';
import { dueNow, INITIAL, merge, type BrushData } from './logic';
import { ToothGlyph } from './Molar';

export default defineMiniapp<BrushData>({
  id: 'teeth',
  name: 'Brush',
  description:
    'Track brushing your teeth, morning and evening. Molar the tooth keeps your streak, and gets mad when you skip.',
  about: [
    'Two buttons a day: morning and evening. A day runs from 3 am, so a late brush still counts.',
    'Your streak and your best streak.',
    'Forgot to log? Tap any earlier day to add or fix it, as far back as you like.',
    'The last two weeks at a glance, and every month in a calendar when you want more.',
    'A badge on the icon when a brush is due.',
    'Molar the tooth is pleased when you brush, and properly annoyed when you do not.',
  ],
  icon: { glyph: ToothGlyph, background: '#14a58c', gradient: ['#5be3c6', '#0f9a82'] },
  badge: dueNow,
  App: lazy(() => import('./App')),
  Widget: lazy(() => import('./Widget')),
  initialData: INITIAL,
  merge,
});
