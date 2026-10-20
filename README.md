# Notebook

A private, single-owner place to think, write, remember and organise.

```
client/   React 18 + Vite 5 + Tailwind + TanStack Query   (port 5173)
server/   Express 4 REST API + firebase-admin             (port 4000)
shared/   API types used by both (types only)
```

The browser only ever talks to the API. Firestore and Cloud Storage are reached from `server/` alone.

## What's built (phase 1)

| Area              | Notes                                                                                                                                                                                                                                                                                                     |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shell             | Sidebar on desktop; on phones a bottom bar (Home, Journal, **Capture**, Projects, More). Dark by default, light optional per device. Every page sits in one shared content frame (`PAGE_FRAME`), so all sections start at the same left edge; a page's width only limits how far it extends to the right. |
| Home              | Date, greeting, an optional focus line you write yourself, Quick Capture, today's tasks, recent writing ("Continue"), an optional daily question.                                                                                                                                                         |
| Quick Capture     | `C` anywhere, the sidebar, or the phone's center button. No title or folder needed. Optional type: Note/Idea → Inbox, Task → Tasks, Journal → appended to today's entry. Unsent text is kept on the device.                                                                                               |
| Inbox             | Captures without a home; move them to Tasks, Journal or Writing, or delete.                                                                                                                                                                                                                               |
| Journal & Writing | Markdown editor with autosave, read view, focus mode, tags, pin/archive (writing), month/tag filters and search.                                                                                                                                                                                          |
| Projects & Tasks  | Today (Due vs Planned, kept apart, then the next step of each project with nothing on today's list, one tap to plan it), Projects, Upcoming, All (grouped by project), Done. Steps, priority, notes, quick rescheduling. A task without a deadline is never overdue.                                      |
| Search            | `Ctrl/⌘ K` or `/`: journal, writing, tasks and inbox, with actions to capture, add a task or start a draft.                                                                                                                                                                                               |
| Sync              | Changes made on one device show up on the others (Server-Sent Events).                                                                                                                                                                                                                                    |

## What's built (phase 2)

| Area               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ideas & Knowledge  | Notes of four kinds (note, question, belief, quote), each with an optional topic, tags and sources. Browse by topic, kind or tag. Same editor and autosave as the journal.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Evolving beliefs   | A belief keeps dated perspectives (what I think, why, what shaped it, what I'm unsure about). Recording a new one never erases the old; any earlier one can be compared side by side. "Last considered" is shown, never a score.                                                                                                                                                                                                                                                                                                                                                                                      |
| Thinking           | A tab in Journal & Writing listing your questions and beliefs by topic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Links              | Any journal entry, writing, note, book, project, file or task can link to any other. Links show on both sides ("Linked"), are optional, and are removed when an item is deleted.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Library: books     | Want to read / Reading / Finished / Paused, optional rating, dates, your notes, and quotes. A quote can be saved to Ideas as a linked quote note.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Library: documents | Upload any file up to 25 MB (button or drag and drop). Images are resized, compressed and stripped of metadata (e.g. GPS) with a thumbnail. A file manager: nested folders (create, rename, move, delete), breadcrumbs, My files / Recent / Starred, search across all folders, sort by name, date, type or size, list or grid, multi-select with bulk move/star/delete, right-click and ⋮ menus, drag files onto a folder to move them, in-app preview for images, PDFs, text, audio and video, where ↑/↓ steps to the previous or next file. Folders can be linked to notes, entries and anything else, like files. |
| Projects           | In Projects & Tasks. Each has a one-line goal (what done looks like, why it matters), status, target date, progress (tasks done, milestones reached), a highlighted next action you can tick off from the list, milestones, notes and links. The next action is the soonest deadline, then what's planned for today, then high priority, then the order tasks were added. Deleting a project keeps its tasks.                                                                                                                                                                                                         |
| Money & Work       | Income entries (date, source, amount, currency, received/pending, note). This month vs last, year to date, a 12-month chart with a table view, breakdown by source, totals by year, full history. Currencies are kept apart, never converted. Home shows a small money summary.                                                                                                                                                                                                                                                                                                                                       |

Money & Work opens on **All time** for the income overview, comparisons and "where my money came from"; This year and This month are a tap away.

## What's built (phase 3)

| Area                | Notes                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Money-making ideas  | Money & Work → Ideas. Quick add with just a name; status (Idea, Testing, Running, Dropped), next step, what it is, why it might work, notes, optional hours and money. Grouped by status with the next step visible; search, archive, delete. Dated experiments (tried, outcome, lessons) stay when an idea is dropped. Turn an idea into a project or connect it to one. |
| Ideas vs real money | An idea's hours and money are notes, never totals. It connects to real records instead: income sources (totals come from Income) and expenses tagged with the idea. "Record as expense" on an experiment creates a real expense only when you ask.                                                                                                                        |
| Expenses            | Money & Work → Expenses: one-off expenses with category and an optional idea or project; subscriptions (weekly to yearly) with next renewal and a "Paid" button that records the expense and moves the renewal on. The recurring monthly figure is labelled as an estimate. By category and by month.                                                                     |
| Version history     | Journal, writing and notes keep earlier text automatically (at most every 30 minutes while you edit) and on demand ("Keep this version", with a label). Compare any version with now, read it, or restore it (the current text is kept as a version first).                                                                                                               |
| Decisions           | A fifth note kind: when decided, why, what you expect, when to look back, and later what actually happened. Due decisions appear on Home.                                                                                                                                                                                                                                 |
| Weekly review       | Journal & Writing → Reviews. Five optional questions, next to what the app already knows about the week (tasks done, entries, notes, income, expenses). Saved as you write. Home suggests it from Friday to Sunday.                                                                                                                                                       |
| Life timeline       | Journal & Writing → Timeline. Moments you choose to keep, by year, optionally linked to an entry, note or project ("Add to timeline…" in their menus). Nothing is added automatically.                                                                                                                                                                                    |
| On this day         | Home shows journal entries and notes from this date in earlier years (can be turned off in Settings).                                                                                                                                                                                                                                                                     |
| Private Vault       | End-to-end encrypted with its own passphrase: sensitive entries, private documents, an account inventory (where things are, never passwords or codes), important instructions, and an "If something happens to me" page that can be downloaded as plain text for a sealed copy. See below.                                                                                |

### Private Vault

- **Encrypted in the browser before anything is sent.** A random 256-bit vault key encrypts every item and file with AES-GCM. The key is stored only wrapped by a key derived from your passphrase (PBKDF2-SHA-256, 600,000 iterations, random salt). The server holds salt, wrapped key and ciphertext, and cannot read any of it.
- **The passphrase can't be recovered.** Forgetting it means the only option is deleting the vault (which needs your account password). Changing the passphrase re-wraps the key; nothing is re-encrypted.
- **Unlocked in memory only**, as a non-extractable key. It locks after 10 minutes without activity, after 5 minutes in a background tab, on reload and on sign-out. Vault text is never kept in `localStorage`, logs or universal search; vault search runs on the device over the unlocked items.
- Files are stored at `users/{uid}/vault/{id}.bin` as IV + ciphertext (up to 25 MB before encryption).

### Saving and recovery

The editor saves about a second after you stop typing, and immediately when the tab is hidden or you leave the page. Every change is also kept in `localStorage`, so:

- **offline:** the editor shows "Offline · kept on this device" and saves when the connection returns;
- **closed or killed tab before a save:** the text is restored on the next open, with a notice;
- **edited on two devices:** each save carries the entry's `rev`, so a stale save is refused with `409 EDIT_CONFLICT` and you choose which version to keep (nothing is overwritten silently). Pinning and archiving don't change `rev`.

New entries are created on their first non-empty save, so abandoned blank entries never pile up.

## Run it locally

Requires Node 20+.

1. **Install**
   ```
   npm run install:all
   ```
2. **Firebase**: in the Firebase console create a project, enable Firestore and Cloud Storage, then _Project settings → Service accounts → Generate new private key_. Save the file as `server/serviceAccountKey.json` (gitignored).
3. **Server env**: copy `server/.env.example` to `server/.env`, then set:
   - `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (the example file shows the command to generate them)
   - `FIREBASE_STORAGE_BUCKET`, the bucket name shown in the Storage console
4. **Create your account** (registration is closed by default: this is a private site)
   ```
   npm run create-super-admin -- --email you@example.com --name "Your Name"
   ```
   (It prompts for the password. Running it for an existing email promotes that user.)
5. **Start both apps**
   ```
   npm run dev
   ```
   Open http://localhost:5173. Vite proxies `/api` to http://localhost:4000.

Other scripts (root): `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run format`.

Tests need no Firebase credentials; they swap the data layer for in-memory fakes (`server/test/memory.ts`).

## Server layout

```
src/config      env (zod-validated), firebase-admin init
src/routes      one file per feature: auth, users, entries (journal, writing, notes, versions),
                tasks, inbox, projects, books, documents, income, expenses, money-ideas,
                reflect (reviews, moments), vault, links, me (home, prefs, search), events, health
src/services    business logic (no Express types)
src/data        Firestore / Storage access only
src/middleware  auth, validate (zod), rateLimit, upload (multer), requestLogger, errorHandler
src/permissions.ts   ALL authorization logic: roles, permissions, who may modify whom
```

### Auth

- bcryptjs password hashes; HS256 JWTs in httpOnly cookies.
- Access token: 10 min (cookie path `/`). Refresh token: 14 days (cookie path `/api/auth`), **single-use and rotated**; its `jti` is the id of a doc in `refreshTokens`, so checking it costs one read.
- Request authentication reads no database (the token carries id + role). A disabled user is therefore locked out at the next refresh, within `ACCESS_TOKEN_TTL_SECONDS`, and their refresh tokens are deleted immediately. Role changes take effect at the next refresh too. For instant effect, add a per-request status check (cache it in Redis).
- Set a Firestore **TTL policy** on `refreshTokens.expiresAt` so expired docs are purged automatically.

### Firestore design

Everything a person owns lives under `users/{uid}/`: `journal`, `writing`, `notes`, `versions`, `tasks`, `projects`, `books`, `documents`, `income`, `expenses`, `subscriptions`, `moneyIdeas`, `reviews` (id = the week's Monday), `moments`, `vault`, `links`, `inbox`, `documentFolders`, and `meta/{prefs,tags,topics,folders,library,income,expenses,vault}`.

- **On this day** uses a `monthDay` field (`MM-DD`) on entries: one equality query per collection, then earlier years are kept.
- **Versions** are written in the same transaction as the save that replaces them, so a snapshot can't be lost or duplicated.

- **Running totals** (`meta/income`, tag/topic counts) are updated in the same transaction as the change, so summaries cost one read. Income totals are in minor units (cents), per month, currency and source.
- **Links** are documents `{from: "type:id", to: "type:id"}`; an item's links are two equality queries (outgoing + incoming).
- **Files** live in Cloud Storage at `users/{uid}/documents/{id}/file` (+ `thumb.webp`) and are only served through the API. Moving a file only changes its `folderId`; the stored bytes and the file id never change. Only images, PDFs, plain text, audio and video are shown inline (with byte ranges so video can seek); everything else, including SVG and HTML, is always a download.

- Every query is a single-field equality, `array-contains` or `orderBy`, so **no composite indexes** are needed.
- Journal order uses one field, `sortKey = date|createdAt|id`, so the list is a single `orderBy` with cursor pagination (one page ≈ its size in reads). Lists use `select()` to skip bodies.
- Writing lists are an equality query on `archived`, sorted in memory (pinned first). Open tasks are one equality query; done tasks are ordered by `completedAt`, which only done tasks have.
- Tag counts are kept in `meta/tags` (updated in the same transaction), so the tag filter costs one read.
- **Search:** Firestore has no full-text search, so each document stores `searchTerms` (unique words, with accents removed, plus their 3+ letter prefixes). A search is one `array-contains` query per collection on the longest word, then every word is checked in memory. Recommended: in the Firestore console add single-field index _exemptions_ for `body` (never queried) to save index storage.
- Email uniqueness is enforced inside a transaction.

### Multiple instances

The server keeps no state in process when `REDIS_URL` is set:

- rate-limit counters use `rate-limit-redis`;
- SSE events fan out over Redis pub/sub, so a client connected to instance A gets events produced on instance B.

Without `REDIS_URL` both fall back to in-memory, which is correct for one instance only. Sessions and data are already in Firestore.

## Deploy

**Backend → Render** (`render.yaml` is included)

1. Create a Web Service from the repo with root directory `server`, build `npm ci && npm run build`, start `npm start`, health check `/api/health`.
2. Add the service account JSON as a **Secret File** named `serviceAccountKey.json` (mounted at `/etc/secrets/serviceAccountKey.json`).
3. Set env vars: `NODE_ENV=production`, `CLIENT_ORIGIN` (your Netlify URL), both JWT secrets, `FIREBASE_SERVICE_ACCOUNT_PATH=/etc/secrets/serviceAccountKey.json`, `FIREBASE_STORAGE_BUCKET`, and `REDIS_URL` if running more than one instance.

**Frontend → Netlify** (`netlify.toml` is included)

1. Create the site from the repo; the build settings come from `netlify.toml`.
2. Edit `netlify.toml` and replace `YOUR-RENDER-SERVICE` with your Render hostname. The `/api/*` rewrite makes the browser see a single origin, so cookies stay first-party and `SameSite=Lax` is enough.

> **SSE caveat:** Netlify's proxy rewrites can cut long-lived responses. If live updates drop in production, point the client's event stream directly at Render (set `VITE_API_URL` to the Render URL, `COOKIE_SAMESITE=none`, and keep `CLIENT_ORIGIN` exact). Normal API calls are unaffected either way.

## Conventions

- TypeScript `strict` everywhere, ES modules. Server imports use `.js` extensions (NodeNext).
- Import shared types with `import type` from `shared/types`.
- Style with Tailwind only; reusable pieces live in `client/src/components/ui`.
- Global state: React Context (`AuthContext`, `ThemeContext`, `UIContext`, toasts, confirm); server state: TanStack Query (keys in `client/src/lib/keys.ts`).
- Every API call goes through `client/src/lib/apiFetch.ts`.
- When a mutation removes the component that started it (optimistic removal), use `mutateAsync().then()`; per-call `mutate(…, { onSuccess })` callbacks don't run after unmount.
- Design tokens (colors) are CSS variables in `client/src/index.css`; small radii are set in `tailwind.config.js`. Serif (Source Serif 4) for titles and writing, IBM Plex Sans for the interface, both bundled (no third-party font requests).
