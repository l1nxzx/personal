// API contract shared by client/ and server/. Types only (no runtime code),
// imported with `import type` from both apps.

/** Calendar date in the owner's local time zone, `YYYY-MM-DD`. */
export type LocalDate = string;

export type Role = 'user' | 'admin' | 'superadmin';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ---------------------------------------------------------------- Auth
export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface AuthResponse {
  user: PublicUser;
}
export interface UpdateProfileRequest {
  displayName: string;
}
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// ---------------------------------------------------------------- Users (admin)
export interface UpdateUserRequest {
  role?: Role;
  disabled?: boolean;
}

// ---------------------------------------------------------------- Journal, Writing & Knowledge notes
/** Journal entries, longer writing and knowledge notes share one editor and API shape. */
export type EntryKind = 'journal' | 'writing' | 'note';

export type NoteType = 'note' | 'question' | 'belief' | 'quote' | 'decision';

/** Decision journal fields (notes of type `decision`); the body holds context and options. */
export interface DecisionMeta {
  madeOn: LocalDate | null;
  reasons: string;
  expected: string;
  /** When to look back and record what actually happened. */
  revisitOn: LocalDate | null;
  outcome: string;
  outcomeOn: LocalDate | null;
}

export interface Source {
  id: string;
  label: string;
  url: string | null;
}

/** One dated statement of where you stand on a belief. Earlier ones are never overwritten. */
export interface Perspective {
  id: string;
  date: LocalDate;
  position: string;
  reasons: string;
  influences: string;
  uncertainties: string;
}

/** Extra fields of knowledge notes (kind `note`). */
export interface NoteMeta {
  noteType: NoteType;
  topic: string | null;
  sources: Source[];
  /** Beliefs only; oldest first. */
  perspectives: Perspective[];
  /** Decisions only. */
  decision: DecisionMeta | null;
}

export interface NoteSummary {
  noteType: NoteType;
  topic: string | null;
  /** Date of the latest perspective (beliefs). */
  lastConsidered: LocalDate | null;
  /** Decisions: when to revisit, and whether the outcome is recorded. */
  revisitOn: LocalDate | null;
  decided: boolean;
}

/** AES-GCM ciphertext made in the browser with the vault key (base64); see lib/vaultCrypto.ts. */
export interface SealedBox {
  iv: string;
  data: string;
  /**
   * Id of the entries key that sealed it. Absent: sealed with the vault key (entries locked
   * before the entries key existed); those are re-sealed by the migration.
   */
  k?: string;
}

/** The entries key, encrypted in the browser with the vault key (base64). */
export interface EntryKeyInfo {
  keyId: string;
  iv: string;
  data: string;
  createdAt: string;
}

/** A device that can open encrypted entries with its PIN. */
export interface PinDevice {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface EnrollPinRequest {
  deviceId: string;
  /** Derived from the PIN on the device (with a salt only the device has); never the PIN. */
  verifier: string;
  keyId: string;
  label: string;
}

export interface UnlockPinRequest {
  deviceId: string;
  verifier: string;
}

/** Migration: the same entry and versions, re-sealed with the entries key. */
export interface ResealEntryRequest {
  rev: number;
  sealed: SealedBox;
  versions: { id: string; sealed: SealedBox }[];
}

/** What a locked entry's (or a locked version's) sealed box holds. */
export interface SealedEntryContent {
  body: string;
  tags: string[];
  wordCount: number;
  /** Versions only: the label given with "Keep this version". */
  label?: string | null;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  title: string;
  /** Markdown. */
  body: string;
  /** Journal entries only. */
  date: LocalDate | null;
  tags: string[];
  pinned: boolean;
  archived: boolean;
  wordCount: number;
  /** Increments on every content save; used to detect edits from another device. */
  rev: number;
  createdAt: string;
  updatedAt: string;
  /** Knowledge notes only. */
  note: NoteMeta | null;
  /**
   * Locked with the PIN (journal and writing only): the text, tags and word count are in
   * `sealed`, encrypted in the browser; the server stores only the title in readable form,
   * and `body`/`tags` are empty.
   */
  locked: boolean;
  sealed: SealedBox | null;
}

export type EntrySummary = Omit<Entry, 'body' | 'note' | 'sealed'> & {
  excerpt: string;
  note: NoteSummary | null;
};
export type EntryMeta = Omit<Entry, 'body'>;

export interface CreateEntryRequest {
  title?: string;
  body?: string;
  date?: LocalDate;
  tags?: string[];
  noteType?: NoteType;
  topic?: string | null;
  sources?: Source[];
  /** Beliefs only. */
  perspectives?: Perspective[];
  /** Create it locked: the text never reaches the server readable (no `body` or `tags`). */
  sealed?: SealedBox;
  /** Locked entries: the files and folders its text links to (`document:<id>`, `folder:<id>`). */
  anchors?: string[];
}

export interface UpdateEntryRequest {
  /** The rev the edit was based on. Omit to overwrite unconditionally. */
  rev?: number;
  title?: string;
  body?: string;
  date?: LocalDate;
  tags?: string[];
  pinned?: boolean;
  archived?: boolean;
  noteType?: NoteType;
  topic?: string | null;
  sources?: Source[];
  perspectives?: Perspective[];
  decision?: DecisionMeta | null;
  /** Locked entries only, instead of `body` and `tags`. */
  sealed?: SealedBox;
  anchors?: string[];
}

/** Lock an existing entry: its text and every earlier version, encrypted in the browser. */
export interface LockEntryRequest {
  rev: number;
  sealed: SealedBox;
  anchors: string[];
  /** Every version that isn't sealed yet. */
  versions: { id: string; sealed: SealedBox }[];
}

/** Remove the lock: the text and every earlier version, decrypted in the browser. */
export interface UnlockEntryRequest {
  rev: number;
  body: string;
  tags: string[];
  versions: { id: string; body: string; tags: string[]; label: string | null }[];
}

/** details of a 409 EDIT_CONFLICT error */
export interface EditConflictDetails {
  current: Entry;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface TopicCount {
  topic: string;
  count: number;
}

// ---------------------------------------------------------------- Links
export type RefType =
  | 'journal'
  | 'writing'
  | 'note'
  | 'book'
  | 'project'
  | 'document'
  | 'folder'
  | 'task'
  | 'moneyIdea';

export interface Ref {
  type: RefType;
  id: string;
}

/** Something linked to the item being viewed, in either direction. */
export interface LinkedItem {
  ref: Ref;
  title: string;
  subtitle: string;
  /** `out`: this item links to it. `in`: it links to this item. */
  direction: 'out' | 'in';
}

export interface LinkRequest {
  from: Ref;
  to: Ref;
}

// ---------------------------------------------------------------- Projects & Tasks
export type TaskPriority = 'none' | 'low' | 'high';
export type TaskStatus = 'open' | 'done';

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  /** A real deadline. Tasks without one are never overdue. */
  dueDate: LocalDate | null;
  /** "I want to work on this on that day" — not a deadline. */
  plannedDate: LocalDate | null;
  priority: TaskPriority;
  subtasks: Subtask[];
  status: TaskStatus;
  completedAt: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskRequest {
  title: string;
  notes?: string;
  dueDate?: LocalDate | null;
  plannedDate?: LocalDate | null;
  priority?: TaskPriority;
  projectId?: string | null;
}

export type UpdateTaskRequest = Partial<
  Pick<
    Task,
    'title' | 'notes' | 'dueDate' | 'plannedDate' | 'priority' | 'subtasks' | 'status' | 'projectId'
  >
>;

export type ProjectStatus = 'active' | 'paused' | 'done';

export interface Milestone {
  id: string;
  title: string;
  date: LocalDate | null;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  /** One line: what finishing it looks like, or why it matters. */
  goal: string;
  /** Markdown: what it is, notes, what you've learned. */
  description: string;
  status: ProjectStatus;
  targetDate: LocalDate | null;
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
}

export type CreateProjectRequest = Pick<Project, 'name'> &
  Partial<Pick<Project, 'goal' | 'description' | 'status' | 'targetDate'>>;
export type UpdateProjectRequest = Partial<
  Pick<Project, 'name' | 'goal' | 'description' | 'status' | 'targetDate' | 'milestones'>
>;
/** Project id → how many tasks it has, open and done (progress = total − open). */
export type ProjectTaskCounts = Record<string, number>;

// ---------------------------------------------------------------- Library: books
export type BookStatus = 'want' | 'reading' | 'finished' | 'paused';

export interface Quote {
  id: string;
  text: string;
  page: string | null;
  note: string;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  status: BookStatus;
  /** 1–5, optional. */
  rating: number | null;
  startedOn: LocalDate | null;
  finishedOn: LocalDate | null;
  /** Markdown. */
  notes: string;
  quotes: Quote[];
  createdAt: string;
  updatedAt: string;
}

export type BookSummary = Omit<Book, 'notes' | 'quotes'> & { quoteCount: number };

export type CreateBookRequest = Pick<Book, 'title'> & Partial<Pick<Book, 'author' | 'status'>>;
export type UpdateBookRequest = Partial<
  Pick<
    Book,
    'title' | 'author' | 'status' | 'rating' | 'startedOn' | 'finishedOn' | 'notes' | 'quotes'
  >
>;

// ---------------------------------------------------------------- Library: documents
export interface DocumentFile {
  id: string;
  name: string;
  mime: string;
  size: number;
  /** The folder it sits in; null means the top level of Documents. */
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  hasThumb: boolean;
  /** Images, PDFs, plain text, audio and video can be shown in the browser. */
  previewable: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UpdateDocumentRequest = Partial<
  Pick<DocumentFile, 'name' | 'folderId' | 'tags' | 'favorite'>
>;

/** A Documents folder. Folders nest through `parentId` (null = top level). */
export interface DocumentFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFolderRequest {
  name: string;
  parentId: string | null;
}
export type UpdateFolderRequest = Partial<CreateFolderRequest>;

/** Files and folders acted on together (bulk move / delete). */
export interface LibrarySelection {
  fileIds: string[];
  folderIds: string[];
}

export interface MoveItemsRequest extends LibrarySelection {
  /** Destination folder; null = top level. */
  targetId: string | null;
}

/** Stored bytes and files per folder, counted through every level below it. */
export interface FolderSizes {
  /** Keyed by folder id; folders with nothing inside are absent. */
  folders: Record<string, { bytes: number; files: number }>;
  /** All documents. */
  total: { bytes: number; files: number };
}

/** What sits inside some folders, counted through every level below them. */
export interface FolderUsage {
  files: number;
  folders: number;
}

// ---------------------------------------------------------------- Money: income
export type IncomeStatus = 'received' | 'pending';

export interface IncomeEntry {
  id: string;
  date: LocalDate;
  source: string;
  /** Integer in the currency's minor unit (cents). */
  amountMinor: number;
  /** ISO 4217, e.g. EUR. */
  currency: string;
  description: string;
  status: IncomeStatus;
  createdAt: string;
  updatedAt: string;
}

export type CreateIncomeRequest = Pick<
  IncomeEntry,
  'date' | 'source' | 'amountMinor' | 'currency'
> &
  Partial<Pick<IncomeEntry, 'description' | 'status'>>;
export type UpdateIncomeRequest = Partial<CreateIncomeRequest>;

export interface MonthCurrencyTotals {
  received: number;
  pending: number;
  /** Received amounts by source key. */
  sources: Record<string, number>;
}

/** Running totals kept up to date on every change: one read for every summary view. */
export interface IncomeSummary {
  /** `YYYY-MM` → currency → totals (minor units). */
  months: Record<string, Record<string, MonthCurrencyTotals>>;
  /** source key → display label */
  sourceLabels: Record<string, string>;
}

// ---------------------------------------------------------------- Quick Capture / Inbox
/** Optional hint chosen while capturing. `task` and `journal` are filed right away. */
export type CaptureKind = 'note' | 'idea' | 'task' | 'journal';

export interface Capture {
  id: string;
  text: string;
  kind: 'note' | 'idea' | null;
  createdAt: string;
}

export interface CaptureRequest {
  text: string;
  kind?: CaptureKind;
  /** Needed to file into "today's" journal entry in the owner's time zone. */
  localDate: LocalDate;
  /** `HH:mm`, used as a small timestamp when appending to the journal. */
  localTime: string;
}

export type CaptureDestination = 'inbox' | 'task' | 'journal' | 'writing' | 'note';

export interface CaptureResult {
  destination: CaptureDestination;
  id: string;
}

export interface ConvertCaptureRequest {
  to: 'task' | 'journal' | 'writing' | 'note';
  localDate: LocalDate;
  localTime: string;
}

// ---------------------------------------------------------------- Search
export type SearchType =
  | 'journal'
  | 'writing'
  | 'note'
  | 'task'
  | 'capture'
  | 'book'
  | 'project'
  | 'document'
  | 'folder'
  | 'income'
  | 'expense'
  | 'moneyIdea'
  | 'moment';

export interface SearchResult {
  type: SearchType;
  id: string;
  title: string;
  snippet: string;
  /** Journal/income date, or last update for other types. */
  date: string;
}

// ---------------------------------------------------------------- Home & preferences
export interface AddedItem {
  ref: Ref;
  title: string;
  subtitle: string;
  createdAt: string;
}

export interface HomeData {
  /** Recently edited writing and notes ("Continue"). */
  recent: EntrySummary[];
  /** Recently added books, documents and projects. */
  added: AddedItem[];
  inboxCount: number;
  /** Journal entries and notes from this date in earlier years. */
  onThisDay: OnThisDayItem[];
  /** Decisions whose revisit date has come, without a recorded outcome. */
  toRevisit: EntrySummary[];
}

export interface OnThisDayItem {
  ref: Ref;
  title: string;
  excerpt: string;
  /** The original date (LocalDate). */
  date: LocalDate;
}

export interface Prefs {
  focusLine: string;
  showPrompts: boolean;
  promptDismissedOn: LocalDate | null;
  writingFont: 'serif' | 'sans';
  /** Default currency for new income and summaries. */
  baseCurrency: string;
  /** Occasionally show something written on this date in an earlier year. */
  showOnThisDay: boolean;
}

// ---------------------------------------------------------------- Server-Sent Events
export type ChangedEntity =
  | 'journal'
  | 'writing'
  | 'note'
  | 'task'
  | 'inbox'
  | 'prefs'
  | 'book'
  | 'project'
  | 'document'
  | 'income'
  | 'link'
  | 'expense'
  | 'subscription'
  | 'moneyIdea'
  | 'review'
  | 'moment'
  | 'vault'
  | 'miniapp';

export interface ServerEvent {
  type: 'changed';
  entity: ChangedEntity;
  id?: string;
  /** X-Client-Id of the tab that made the change, so it can ignore its own echo. */
  origin?: string;
}

// ---------------------------------------------------------------- Money: money-making ideas
export type MoneyIdeaStatus = 'idea' | 'testing' | 'running' | 'dropped';

/** One thing tried while testing an idea. Kept forever, also after the idea is dropped. */
export interface Experiment {
  id: string;
  date: LocalDate;
  tried: string;
  outcome: string;
  lessons: string;
  /** Optional effort, in hours. */
  hours: number | null;
  /** Optional money spent (a note only; real costs go to Expenses). */
  spentMinor: number | null;
  currency: string | null;
}

export interface MoneyIdea {
  id: string;
  name: string;
  description: string;
  whyItMightWork: string;
  nextStep: string;
  status: MoneyIdeaStatus;
  /** What was tried, what happened, what was learned (Markdown). */
  notes: string;
  /** Optional totals noted by hand, in addition to experiments. */
  hours: number | null;
  spentMinor: number | null;
  currency: string | null;
  experiments: Experiment[];
  /** Project this idea became or belongs to. */
  projectId: string | null;
  /** Income source keys that come from this idea (totals are read from the income summary). */
  incomeSources: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type MoneyIdeaSummary = Omit<
  MoneyIdea,
  'notes' | 'experiments' | 'description' | 'whyItMightWork'
> & {
  experimentCount: number;
};

export type CreateMoneyIdeaRequest = Pick<MoneyIdea, 'name'> & Partial<Pick<MoneyIdea, 'status'>>;
export type UpdateMoneyIdeaRequest = Partial<Omit<MoneyIdea, 'id' | 'createdAt' | 'updatedAt'>>;

// ---------------------------------------------------------------- Money: expenses & subscriptions
export interface Expense {
  id: string;
  date: LocalDate;
  amountMinor: number;
  currency: string;
  category: string;
  description: string;
  /** Optional connections, so an idea or project can show its real costs. */
  moneyIdeaId: string | null;
  projectId: string | null;
  /** Set when recorded from a subscription renewal. */
  subscriptionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateExpenseRequest = Pick<Expense, 'date' | 'amountMinor' | 'currency'> &
  Partial<
    Pick<Expense, 'category' | 'description' | 'moneyIdeaId' | 'projectId' | 'subscriptionId'>
  >;
export type UpdateExpenseRequest = Partial<CreateExpenseRequest>;

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

/** A recurring cost. Its amounts are projections until a payment is recorded as an expense. */
export interface Subscription {
  id: string;
  name: string;
  amountMinor: number;
  currency: string;
  frequency: Frequency;
  nextRenewal: LocalDate | null;
  category: string;
  notes: string;
  active: boolean;
  moneyIdeaId: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateSubscriptionRequest = Pick<
  Subscription,
  'name' | 'amountMinor' | 'currency' | 'frequency'
> &
  Partial<Pick<Subscription, 'nextRenewal' | 'category' | 'notes' | 'moneyIdeaId' | 'projectId'>>;
export type UpdateSubscriptionRequest = Partial<
  CreateSubscriptionRequest & Pick<Subscription, 'active'>
>;

export interface ExpenseSummary {
  /** `YYYY-MM` → currency → { total, categories: { [categoryKey]: amount } } (minor units). */
  months: Record<string, Record<string, { total: number; categories: Record<string, number> }>>;
  categoryLabels: Record<string, string>;
}

// ---------------------------------------------------------------- Version history
export interface EntryVersionSummary {
  id: string;
  entryId: string;
  kind: EntryKind;
  title: string;
  wordCount: number;
  /** When this text was current (the entry's updatedAt at the time). */
  savedAt: string;
  /** Set when saved by hand ("Keep this version"). */
  label: string | null;
}

export interface EntryVersion extends EntryVersionSummary {
  body: string;
  tags: string[];
  /** Set when the version is encrypted (a locked entry's history); body and tags are empty. */
  sealed: SealedBox | null;
}

// ---------------------------------------------------------------- Weekly review
export interface WeeklyReviewAnswers {
  happened: string;
  learned: string;
  accomplished: string;
  work: string;
  focus: string;
}

export interface WeeklyReview {
  /** Monday of the week (LocalDate). */
  weekStart: LocalDate;
  answers: WeeklyReviewAnswers;
  createdAt: string;
  updatedAt: string;
}

/** What the app already knows about a week, offered as a starting point. */
export interface WeekContext {
  tasksDone: { id: string; title: string }[];
  journal: { id: string; title: string; date: LocalDate }[];
  notes: { id: string; title: string; noteType: NoteType }[];
  perspectives: { noteId: string; title: string }[];
  income: Record<string, number>;
  expenses: Record<string, number>;
}

// ---------------------------------------------------------------- Life timeline
export interface Moment {
  id: string;
  date: LocalDate;
  title: string;
  description: string;
  /** Optional item this moment points to (a journal entry, project…). */
  ref: Ref | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateMomentRequest = Pick<Moment, 'date' | 'title'> &
  Partial<Pick<Moment, 'description' | 'ref'>>;
export type UpdateMomentRequest = Partial<CreateMomentRequest>;

// ---------------------------------------------------------------- Private Vault (end-to-end encrypted)
/**
 * Key material for the vault. The vault key is random and only ever leaves the browser wrapped
 * (AES-GCM) with a key derived from the vault passphrase (PBKDF2-SHA-256). The server cannot
 * decrypt anything in the vault.
 */
export interface VaultMeta {
  version: 1;
  /** base64 */
  salt: string;
  iterations: number;
  /** base64 AES-GCM ciphertext of the raw vault key */
  wrappedKey: string;
  /** base64 IV used to wrap the key */
  wrapIv: string;
  createdAt: string;
  updatedAt: string;
}

export type VaultMetaInput = Pick<VaultMeta, 'salt' | 'iterations' | 'wrappedKey' | 'wrapIv'>;

/** An encrypted item. Everything about it, including its kind and title, is inside `data`. */
export interface VaultItem {
  id: string;
  /** base64 */
  iv: string;
  /** base64 AES-GCM ciphertext of the item's JSON */
  data: string;
  createdAt: string;
  updatedAt: string;
}

export interface VaultItemInput {
  iv: string;
  data: string;
  /** For updates: the updatedAt the edit was based on (detects edits from another device). */
  expectedUpdatedAt?: string;
}

// ---------------------------------------------------------------- Profile & lifetime statistics
/** Things counted on the profile. Each item is counted once, in the collection it lives in. */
export type ContentStatKey =
  | 'journal'
  | 'writing'
  | 'note'
  | 'review'
  | 'moment'
  | 'project'
  | 'task'
  | 'book'
  | 'document'
  | 'moneyIdea'
  | 'income'
  | 'expense'
  | 'subscription';

export interface ContentStat {
  key: ContentStatKey;
  count: number;
}

/** Where written text is counted (titles and names never are). */
export type WritingStatKey =
  'journal' | 'writing' | 'note' | 'review' | 'moment' | 'book' | 'project' | 'moneyIdea';

export interface WritingStat {
  key: WritingStatKey;
  words: number;
  /** Characters, not counting spaces and line breaks. */
  chars: number;
  /** Items with any text in them. */
  items: number;
}

export interface ActivityMonth {
  /** `YYYY-MM`, by the browser's local date. */
  month: string;
  seconds: number;
  days: number;
  /** Time and visits per section that month (only sections with time). */
  sections: { section: UsageSection; seconds: number; visits: number }[];
  actions: ActionCount[];
}

/** Time the site was open in a visible tab, recorded since this feature existed. */
export interface ActivityStats {
  totalSeconds: number;
  /** Distinct local calendar days with any recorded time. */
  days: number;
  /** Stretches of use separated by at least 30 minutes without a visible tab. */
  sessions: number;
  longestSessionSeconds: number;
  /** When recording started; null until the first minute is recorded. */
  firstActiveAt: string | null;
  lastActiveAt: string | null;
  /** Newest first. */
  months: ActivityMonth[];
  /** All-time time and visits per section (sections with any time), most time first. */
  sections: SectionUsage[];
  /** When time started being recorded per section; null until then. */
  sectionsSince: string | null;
  /** All-time counts of meaningful actions (only those that happened). */
  actions: ActionCount[];
}

/**
 * A part of the site whose time is recorded on its own, from the address shown (see
 * `client/src/lib/sections.ts`). Dialogs, panels and query strings never make a section. The
 * Private Vault is not one: no time, visit or action there is recorded at all.
 */
export type UsageSection =
  | 'home'
  | 'inbox'
  | 'journal'
  | 'writing'
  | 'thinking'
  | 'reviews'
  | 'timeline'
  | 'ideas'
  | 'money'
  | 'expenses'
  | 'moneyIdeas'
  | 'tasks'
  | 'projects'
  | 'library'
  | 'documents'
  | 'profile'
  | 'settings'
  | 'other';

export interface SectionUsage {
  section: UsageSection;
  seconds: number;
  /** Arrivals in the section (see `ActivityBeat.visit`). */
  visits: number;
  /** End of the latest recorded time there. */
  lastAt: string | null;
}

/**
 * Meaningful things done, counted when they succeed on the server. Each item counts at most
 * once per action per day ("edited" = items changed that day, not saves), and an item edited on
 * the day it was created counts only as created.
 */
export type UsageAction =
  | 'capture.created'
  | 'capture.filed'
  | 'journal.created'
  | 'journal.edited'
  | 'writing.created'
  | 'writing.edited'
  | 'note.created'
  | 'note.edited'
  | 'review.created'
  | 'review.edited'
  | 'moment.created'
  | 'project.created'
  | 'project.edited'
  | 'task.created'
  | 'task.completed'
  | 'book.created'
  | 'book.edited'
  | 'document.uploaded'
  | 'document.organized'
  | 'folder.created'
  | 'income.created'
  | 'expense.created'
  | 'subscription.created'
  | 'subscription.paid'
  | 'moneyIdea.created'
  | 'moneyIdea.edited'
  | 'link.created';

export interface ActionCount {
  action: UsageAction;
  count: number;
}

/** One local day of recorded use. Days with nothing recorded are left out. */
export interface UsageDay {
  /** Local date (of the device for time, of the request for actions). */
  date: LocalDate;
  seconds: number;
  sessions: number;
  /** Time recorded before sections were tracked is in `seconds` but in no section. */
  sections: { section: UsageSection; seconds: number; visits: number }[];
  actions: ActionCount[];
}

export interface UsageRange {
  from: LocalDate;
  to: LocalDate;
  days: UsageDay[];
}

export interface ProfileStats {
  /** When the account was created. */
  memberSince: string;
  activity: ActivityStats;
  content: {
    items: ContentStat[];
    /** Sum of `items` (every item once). */
    total: number;
    /** Knowledge notes by type; together they are the `note` count. */
    noteTypes: { type: NoteType; count: number }[];
    tasksDone: number;
    documentBytes: number;
    folders: number;
  };
  writing: {
    words: number;
    chars: number;
    /** Journal entries, writings, notes, weekly reviews and moments with any text. */
    entries: number;
    items: WritingStat[];
  };
}

/** One continuous stretch during which a tab of the site was visible. */
export interface ActivityBeat {
  /** Random id; a stretch sent more than once is counted once. */
  id: string;
  seconds: number;
  /** How many seconds ago (by the browser's clock) the stretch ended. */
  ago: number;
  /** The browser's local date when the stretch ended. */
  date: LocalDate;
  /** The section on screen the whole stretch (absent from tabs older than section tracking). */
  section?: UsageSection;
  /**
   * The stretch begins a visit: the section was entered from another one, or the site was
   * back in view after 30 minutes or more. Reloading, opening another tab of the same section
   * or switching back to this tab soon after never does.
   */
  visit?: boolean;
}

export interface ActivityRequest {
  beats: ActivityBeat[];
}

// ---------------------------------------------------------------- Miniapps
/** The miniapps screen's background: a built-in template, or an uploaded picture. */
export type MiniappWallpaper =
  { kind: 'template'; id: string } | { kind: 'image'; version: string };

export interface MiniappSettings {
  wallpaper: MiniappWallpaper;
  /** App order (app ids): the Store's and Home widgets' order. */
  order: string[];
  /**
   * The miniapps screen as arranged by hand: tiles in order. An app icon is its id, the two
   * built-in icons are `store` and `wallpaper`, a widget is `widget:<app id>` (or `widget:clock`).
   * null until first arranged (the client then shows its default).
   */
  layout: string[] | null;
}

/** One miniapp's place on this account (apps themselves live in client/miniapps/). */
export interface MiniappInstall {
  enabled: boolean;
  /** Its widget is shown on Home. */
  onHome: boolean;
  /** It has saved data (kept while disabled, until deleted in the Store). */
  hasData: boolean;
  updatedAt: string;
}

export interface MiniappState {
  settings: MiniappSettings;
  apps: Record<string, MiniappInstall>;
}

/** A miniapp's own saved data: any JSON it chooses. */
export interface MiniappData {
  data: unknown;
  /** Increments on every save; send it back to detect saves from another device. */
  rev: number;
  updatedAt: string | null;
}
