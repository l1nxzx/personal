import type { EntryKind, RefType, SearchType } from '../../../shared/types';

/** API base path per entry kind. */
export const ENTRY_API: Record<EntryKind, string> = {
  journal: '/journal',
  writing: '/writing',
  note: '/notes',
};

/** Where each entry kind's list lives in the app. */
export const ENTRY_LIST: Record<EntryKind, string> = {
  journal: '/journal',
  writing: '/writing',
  note: '/ideas',
};

/** In-app link for any item that can be searched for or linked to. */
export function hrefFor(type: RefType | SearchType, id: string): string {
  switch (type) {
    case 'journal':
      return `/journal/${id}`;
    case 'writing':
      return `/writing/${id}`;
    case 'note':
      return `/ideas/${id}`;
    case 'task':
      return `/tasks?task=${id}`;
    case 'capture':
      return '/inbox';
    case 'book':
      return `/library/books/${id}`;
    case 'project':
      return `/tasks/projects/${id}`;
    case 'document':
      return `/library/documents?doc=${id}`;
    case 'folder':
      return `/library/documents?folder=${id}`;
    case 'income':
      return `/money?entry=${id}`;
    case 'expense':
      return `/money/expenses?entry=${id}`;
    case 'moneyIdea':
      return `/money/ideas/${id}`;
    case 'moment':
      return `/timeline#${id}`;
  }
}

export const TYPE_LABEL: Record<RefType | SearchType, string> = {
  journal: 'Journal',
  writing: 'Writing',
  note: 'Note',
  task: 'Task',
  capture: 'Inbox',
  book: 'Book',
  project: 'Project',
  document: 'File',
  folder: 'Folder',
  income: 'Income',
  expense: 'Expense',
  moneyIdea: 'Money idea',
  moment: 'Moment',
};
