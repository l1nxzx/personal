import type { UsageSection } from '../../../shared/types';

/**
 * The parts of the site whose time is recorded separately, read from the address on screen
 * (the routes in `App.tsx`). An open dialog, panel, search or query string (a task opened with
 * `?task=`, a file previewed with `?doc=`) stays in the section around it.
 */
export function sectionOf(pathname: string): UsageSection {
  const [first = '', second = ''] = pathname.split('/').filter(Boolean);
  switch (first) {
    case '':
      return 'home';
    case 'inbox':
      return 'inbox';
    case 'journal':
      return 'journal';
    case 'writing':
      return 'writing';
    case 'thinking':
      return 'thinking';
    case 'reviews':
      return 'reviews';
    case 'timeline':
      return 'timeline';
    case 'ideas':
      return 'ideas';
    case 'money':
      return second === 'expenses' ? 'expenses' : second === 'ideas' ? 'moneyIdeas' : 'money';
    case 'tasks':
      return second === 'projects' ? 'projects' : 'tasks';
    // The old documents address forwards to /documents; it never counts as Library.
    case 'library':
      return second === 'documents' ? 'documents' : 'library';
    case 'documents':
      return 'documents';
    case 'vault':
      return 'vault';
    case 'profile':
      return 'profile';
    case 'settings':
      return 'settings';
    default:
      return 'other';
  }
}

export interface SectionInfo {
  label: string;
  /** The navigation section it belongs to. */
  group: string;
  /** Where it opens. */
  to: string | null;
}

export const SECTIONS: Record<UsageSection, SectionInfo> = {
  home: { label: 'Home', group: 'Home', to: '/' },
  inbox: { label: 'Inbox', group: 'Home', to: '/inbox' },
  journal: { label: 'Journal', group: 'Journal & Writing', to: '/journal' },
  writing: { label: 'Writing', group: 'Journal & Writing', to: '/writing' },
  thinking: { label: 'Thinking', group: 'Journal & Writing', to: '/thinking' },
  reviews: { label: 'Weekly reviews', group: 'Journal & Writing', to: '/reviews' },
  timeline: { label: 'Timeline', group: 'Journal & Writing', to: '/timeline' },
  ideas: { label: 'Ideas & Knowledge', group: 'Ideas & Knowledge', to: '/ideas' },
  money: { label: 'Income', group: 'Money & Work', to: '/money' },
  expenses: { label: 'Expenses', group: 'Money & Work', to: '/money/expenses' },
  moneyIdeas: { label: 'Money-making ideas', group: 'Money & Work', to: '/money/ideas' },
  tasks: { label: 'Tasks', group: 'Projects & Tasks', to: '/tasks' },
  projects: { label: 'Projects', group: 'Projects & Tasks', to: '/tasks/projects' },
  library: { label: 'Library', group: 'Library', to: '/library' },
  documents: { label: 'Documents', group: 'Documents', to: '/documents' },
  vault: { label: 'Private Vault', group: 'Private Vault', to: '/vault' },
  profile: { label: 'Profile', group: 'Profile', to: '/profile' },
  settings: { label: 'Settings', group: 'Settings', to: '/settings' },
  other: { label: 'Other pages', group: 'Other', to: null },
};

/** In the order of the navigation. */
export const SECTION_ORDER = Object.keys(SECTIONS) as UsageSection[];
