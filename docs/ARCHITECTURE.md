# Architecture

## Overview

```
Browser (React SPA) ──/api──▶ Express API ──firebase-admin──▶ Firestore + Cloud Storage
        ▲                          │
        └──── SSE /api/events ◀────┘   (Redis pub/sub when REDIS_URL is set)
```

- Dev: Vite (`client/vite.config.ts`, port 5173, strict) proxies `/api` to `localhost:4000`.
- Prod: Netlify serves the static client and rewrites `/api/*` to the Render service (`netlify.toml`), so the browser sees one origin and cookies are first-party (`SameSite=Lax`).
- `shared/types.d.ts` holds every API request/response type. Both apps `import type` from it by relative path (`tsconfig` of each app includes `../shared`). It contains no runtime code.

## Server (`server/src`)

| Dir                  | Role                                                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`, `app.ts` | Boot, middleware order: request logger, helmet, CORS (`CLIENT_ORIGIN`, credentials), JSON (1 MB), cookies, `/api` rate limit (300/min), routes, error handlers |
| `config/`            | `env.ts` (zod-validated env, throws on invalid), `firebase.ts` (lazy init; `db()`, `bucket()`)                                                                 |
| `routes/`            | One file per feature, mounted in `routes/index.ts`. Validation with zod (`middleware/validate.ts`), then call a service                                        |
| `services/`          | Business logic. Receives a `Ctx` (user id, client id) and calls `notifyChange` to push SSE events                                                              |
| `data/`              | Firestore/Storage access only, one `*Repo.ts` per collection                                                                                                   |
| `middleware/`        | `auth`, `validate`, `rateLimit` (Redis-backed if configured), `upload` (multer), `requestLogger` (pino), `errorHandler`                                        |
| `permissions.ts`     | The only place roles/permissions are decided (`can`, `canModifyUser`, `requirePermission`)                                                                     |
| `lib/`               | errors, tokens, cookies, password, text (search term building), logger, redis                                                                                  |

Mounted API prefixes: `health auth users journal writing notes links tasks projects books documents income expenses subscriptions money-ideas versions reviews moments vault inbox me events`.

### Auth

- Access JWT 10 min (cookie path `/`); refresh JWT 14 days (cookie path `/api/auth`), single-use and rotated; its `jti` is a doc in `refreshTokens`.
- Request auth reads no DB. A disabled user is locked out at next refresh. Login/register are rate limited (20 per 15 min).
- Roles: `user`, `admin`, `superadmin`. Content is under `users/{uid}`, so nobody (admins included) can reach another user's content through the API. **There is no admin UI in the client**; user management exists only as API routes (`/api/users`).

### Realtime

`routes/events.routes.ts` streams SSE with a 25 s heartbeat. Services emit `ChangedEntity` events; `client/src/hooks/useRealtime.ts` maps them to TanStack Query invalidations. Without Redis, fan-out is in-process (single instance only).

## Firestore model (everything under `users/{uid}/`)

Collections: `journal`, `writing`, `notes`, `versions`, `tasks`, `projects`, `books`, `documents`, `income`, `expenses`, `subscriptions`, `moneyIdeas`, `reviews` (id = Monday of the week), `moments`, `vault`, `links`, `inbox`, `documentFolders`, `activity` (id = local date). Meta docs: `meta/{prefs,tags,topics,folders,library,income,expenses,vault,stats,activity}` (`meta/folders` holds the old name-based folder counts and is no longer written; `meta/library.foldersVersion = 2` marks the one-time folder migration as done). Global: `users`, `refreshTokens`.

Patterns to keep:

- **Running totals** (`meta/income`, `meta/expenses`, tag/topic counts) use `FieldValue.increment` inside the same transaction as the change.
- **Journal ordering** uses `sortKey = date|createdAt|id` (one `orderBy`, cursor pagination). Lists `select()` away bodies.
- **Search**: each doc stores `searchTerms` (accent-folded words + 3+ letter prefixes); one `array-contains` query per collection on the longest word, remaining words checked in memory.
- **Conflicts**: entries carry `rev`; a stale save gets `409 EDIT_CONFLICT`. Only content changes bump `rev`.
- **Versions**: snapshot written inside the entry update transaction (at most every 30 min while editing).
- **Links**: docs `{from: "type:id", to: "type:id"}`, queried both ways. Library folders are `folder:id`; deleting a folder removes its links. Folders have no stored `searchTerms`: search matches folder names in memory from one read of the folder list.
- **Files**: Storage at `users/{uid}/documents/{id}/file` (+ `thumb.webp`) and `users/{uid}/vault/{id}.bin`; only served through the API (with HTTP byte ranges, so video can seek). Library files are immutable and served with a one-year `immutable` cache; logout clears the browser cache (`Clear-Site-Data`).
- **Folder sizes** (`GET /api/documents/folders/sizes`, `folderService.folderSizes`): reads every file's `folderId` and `size` (`select()`, one small read per file) and adds them up through the folder tree. A filtered `sum()` aggregation would be cheaper but may need a composite index, so it isn't used. The client caches the result for 10 minutes and refreshes it on any library change.
- **Library folders**: `documentFolders/{id}` = `{name, parentId}` (null = top level); each document has `folderId` (null = top level). Listing a folder is two equality queries (`parentId ==`, `folderId ==`); the client loads all folders once and builds the tree (breadcrumbs, move picker). Moving changes only these pointers, never Storage paths or ids. Recursive delete and usage counts use `folderId in [...]` in chunks of 30 (and a count aggregation). Sibling folder names are unique (case/accents ignored), nesting is capped at 20 levels, and moves into a folder's own subtree are refused, all checked in `folderService`.
- **Folder migration** (`services/libraryMigration.ts`): files used to carry a free-text `folder` name. The first library request per user turns each distinct name into a top-level folder (deterministic id, so re-runs are no-ops), sets `folderId` on every file and rebuilds its search terms. Additive only: the old `folder` field is left in place.
- Project task counts use a Firestore count aggregation (`GET /api/projects/task-counts`).
- **Profile statistics** (`services/profileService.ts`, `data/statsRepo.ts`): item counts, task/note-type counts and library size come from `count()`/`sum()` aggregation queries, one aggregation per query (several in one query would need a composite index; about 50 queries, one read per 1,000 documents each), so they always match the data. No running counters.
- **Written text**: journal, writing and note docs, weekly reviews, moments, books, projects and money ideas store `textWords`/`textChars`, recomputed by every save from one definition (`services/textStats.ts`, counting in `lib/text.ts#textStats`). Older documents are counted once by a backfill on the first profile visit (`meta/stats.textVersion`; writes use a `lastUpdateTime` precondition, so a document saved meanwhile is skipped). Bumping `TEXT_VERSION` recounts everything; `POST /api/me/profile/recount` does it on demand.
- **Active time** (`services/activityService.ts`, `data/activityRepo.ts`): tabs send visible stretches (`POST /api/me/activity`, `{id, seconds ≤ 120, ago, date}`). One transaction updates `activity/{date}` (seconds, sessions started, first/last) and `meta/activity` (totals, `months`, the last 20 sessions, merged stretches of the last 15 min to remove overlap between tabs/devices, last 200 beat ids for idempotency). Sessions split on a 30-minute gap. Recount also rebuilds the totals from the day docs.

## Client (`client/src`)

- `main.tsx` provider order: QueryClient, Theme, Router, Toast, Confirm, Auth, Vault, UI, then `App`.
- `App.tsx`: routes; less-used pages are `lazy()`, and `AppShell` fetches all their code in the background shortly after start, so later navigation doesn't wait for it. `RequireUser`/`GuestOnly` guard auth. While the initial `/auth/me` check runs, `RequireUser` shows `ShellFrame` (sidebar + mobile nav) with a `PageSkeleton` if this device was signed in last time (a yes/no flag in localStorage, `auth:signed-in`, set and cleared by `AuthContext`); otherwise nothing, so the login page doesn't follow a flash of navigation. `AppShell` wraps signed-in pages (sidebar, mobile nav, capture/search dialogs, task detail host) and holds the `Suspense` boundary so the shell stays during page loads.
- Loading states: a page renders its real frame (header, tabs, forms, section headings) at once and puts skeletons (`components/ui/Skeleton.tsx`) only where data is pending, shaped like the content they stand for, so nothing jumps when it arrives. Skeletons show only on a first load (`isLoading`, i.e. no cached data); background refetches keep what is on screen. A section that depends on two queries waits for both (Projects waits for open tasks so it never shows "no next step" first; journal/writing/ideas lists wait for tags, whose filter row sits above them; money figures wait for the base currency). Empty and error states replace skeletons as before.
- `features/`: `capture entries home inbox library links me money profile projects reviews search tasks timeline vault`.
- Active time: `features/profile/activityTracker.ts`, started by `AppShell` for the signed-in user. Counts while `document.visibilityState === 'visible'` (no idle timeout; a >20 s gap between 5 s ticks means the device slept and isn't counted), saves the current stretch to `localStorage` (`activity:<id>`) every tick, sends every 60 s and on hide/`pagehide` (`keepalive`), and resends anything left over (crash, offline, sign-out) on the next visit. Beats are tagged with the user id and dropped after 7 days. Each holds its pages, API hooks (`api.ts`) and parts.
- `lib/apiFetch.ts`: the only fetch wrapper (JSON/FormData/raw bytes, silent single refresh on 401, `ApiError`, `X-Client-Id`).
- `lib/keys.ts`: query keys; other keys are defined next to their hooks (e.g. `projects/api.ts`). Invalidate consistently when a mutation touches related data.
- Drafts: the editor mirrors text to `localStorage` (via `lib/storage.ts`, never throws) so closed tabs and offline edits recover. **Vault content is never stored locally.**
- Routes: `/`, `/inbox`, `/journal(/:id)`, `/writing(/:id)`, `/thinking`, `/reviews`, `/timeline`, `/ideas(/:id)`, `/money`, `/money/expenses`, `/money/ideas(/:id)`, `/tasks`, `/tasks/{upcoming,all,done,projects}`, `/tasks/projects/:id`, `/library`, `/library/documents` (query: `folder`, `view=recent|starred`, `q`, `doc`), `/library/books/:id`, `/vault`, `/profile`, `/settings`. Note that tasks and projects live under `/tasks` even though the section is named "Projects & Tasks".

## Tests

`server/test/*.test.ts` run with vitest + supertest against the real Express app with the data layer replaced by in-memory fakes (`memory.ts`, `memory3.ts`, mocked in `setup.ts`; `statsRepo`/`activityRepo` fakes are in `memory3.ts` and aggregate over the other fake stores). No client tests exist.
