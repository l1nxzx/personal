import {
  BookOpen,
  FolderOpen,
  House,
  LayoutGrid,
  Library,
  Lightbulb,
  ListChecks,
  LockKeyhole,
  Settings,
  UserRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  /** For the phone's bottom bar, where there is room for one word. */
  short?: string;
  /** Full section name, used as the page title. */
  title: string;
  icon: LucideIcon;
  /** Other path prefixes that belong to this section. */
  also?: string[];
}

export const NAV: NavItem[] = [
  { to: '/', label: 'Home', title: 'Home', icon: House, also: ['/inbox'] },
  {
    to: '/journal',
    label: 'Journal',
    title: 'Journal & Writing',
    icon: BookOpen,
    also: ['/writing', '/thinking', '/reviews', '/timeline'],
  },
  { to: '/ideas', label: 'Ideas', title: 'Ideas & Knowledge', icon: Lightbulb },
  { to: '/money', label: 'Money', title: 'Money & Work', icon: Wallet },
  {
    to: '/tasks',
    label: 'Projects & Tasks',
    short: 'Projects',
    title: 'Projects & Tasks',
    icon: ListChecks,
  },
  { to: '/library', label: 'Library', title: 'Library', icon: Library },
  { to: '/documents', label: 'Documents', title: 'Documents', icon: FolderOpen },
  { to: '/vault', label: 'Vault', title: 'Private Vault', icon: LockKeyhole },
  { to: '/miniapps', label: 'Miniapps', title: 'Miniapps', icon: LayoutGrid },
];

export const PROFILE_NAV: NavItem = {
  to: '/profile',
  label: 'Profile',
  title: 'Profile',
  icon: UserRound,
};

export const SETTINGS_NAV: NavItem = {
  to: '/settings',
  label: 'Settings',
  title: 'Settings',
  icon: Settings,
};

export function isActive(item: NavItem, pathname: string): boolean {
  const prefixes = [item.to, ...(item.also ?? [])];
  return prefixes.some((p) =>
    p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`),
  );
}
