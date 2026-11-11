# Notebook (repo folder: `personal`)

A private, single-owner personal website: a notebook for journal, writing, ideas, projects and tasks, money, a reading library, and an end-to-end encrypted vault. One owner signs in; registration is closed. Mobile is a first-class target, not an afterthought.

> Facts below were verified against the code. Anything unverified is marked **Unknown**. If this file disagrees with the code, trust the code and fix this file.

## Stack and layout

```
client/   React 18 + Vite 5 + TypeScript (strict) + Tailwind 3 + react-router 6 + TanStack Query 5   :5173
server/   Express 4 + TypeScript (strict, ESM/NodeNext) + firebase-admin (Firestore + Storage) + zod  :4000
shared/   types.d.ts only (API types), imported by relative path from both apps
```

- Browser talks only to `/api` (Vite proxy in dev, Netlify rewrite in prod). **Firebase is reached from `server/` only.**
- Server layering: `routes/` (zod validation, no logic) → `services/` (business logic, no Express types) → `data/` (Firestore/Storage only). Authorization lives only in `server/src/permissions.ts`.
- Miniapps: small optional apps in `client/miniapps/<id>/` (More → Miniapps, Store, Home widgets), separate from the site's code and built only on the toolkit `@miniapp/sdk`. **To create one, follow `client/miniapps/README.md`; do not change `client/src` or the server for it.**
- Client: `features/<name>/` per area, `components/ui` + `components/shell` shared, `lib/apiFetch.ts` is the only way to call the API, server state in TanStack Query (keys in `lib/keys.ts`), small global state in React Context.
- Realtime: Server-Sent Events (`/api/events`), tabs ignore their own echoes via `X-Client-Id`.
- Hosting: backend on Render (`render.yaml`), frontend on Netlify (`netlify.toml`, proxies `/api/*` to Render).

## Commands (run from repo root)

| Task                     | Command                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Install everything       | `npm run install:all`                                                                |
| Dev (both apps)          | `npm run dev` (client 5173, server 4000)                                             |
| Checks                   | `npm run typecheck`, `npm run lint`, `npm test` (server only; no client tests exist) |
| Build                    | `npm run build` (server `tsc`, client `tsc --noEmit && vite build`)                  |
| Format                   | `npm run format` (Prettier: single quotes, 100 cols)                                 |
| Create the owner account | `npm run create-super-admin -- --email you@example.com --name "Name"`                |

Run typecheck + lint + test after any change; run build before calling something deployable. Report failures with their output, do not hide them.

## Secrets and environments

- Server config is validated by zod in `server/src/config/env.ts` (the server refuses to start on bad config). Template: `server/.env.example`. Never write real values into docs, code, or commits.
- Secret files, all gitignored: `server/.env`, `server/serviceAccountKey.json` (Firebase). Never `git add` them, never print their contents. The client has no secrets; its only env var is optional `VITE_API_URL`.
- **Local dev uses the real Firebase project** if `serviceAccountKey.json` is present, so local runs touch real data. Tests never do (see below). Production uses Render env vars plus the key as a Render Secret File at `/etc/secrets/serviceAccountKey.json`.

## Rules that must survive any change

- **Firestore:** all data under `users/{uid}/…`; queries are single-field only, so **no composite indexes**; keep reads low (running totals in `meta/*` updated in the same transaction, `select()` to skip bodies). Search is `searchTerms` + `array-contains`.
- **Auth:** bcryptjs, short-lived JWT access token + single-use rotated refresh token, both httpOnly cookies. Every route validates input with zod and uses `authenticate` + `requirePermission`.
- **Vault is end-to-end encrypted in the browser** (`client/src/lib/vaultCrypto.ts`). Never log, index, search server-side, or send vault plaintext anywhere. Details in `docs/DECISIONS.md`.
- **Money:** amounts are integer minor units per currency, never converted. Idea estimates are not real money.
- Never ship an unsolicited design change: keep the calm dark-blue identity, serif + sans type, small radii. See `docs/DESIGN_SYSTEM.md`.
- Import shared types with `import type` from `shared/types`; server imports use `.js` extensions.
- When a mutation removes the component that started it, use `mutateAsync().then()`, not `mutate(…, { onSuccess })`.

## How to work in this repo

1. Read the relevant file in `docs/` first, then **read the actual code** before editing. Don't assume a feature works; check it (run it, or test it).
2. Make focused changes. Reuse existing components, hooks and patterns. Don't rewrite or restyle things you weren't asked to touch.
3. Ask before: major architecture changes, destructive data changes (deleting/migrating Firestore data), adding significant dependencies, or touching deploy config.
4. Tests use in-memory fakes of the data layer (`server/test/memory.ts`, `memory3.ts`, wired in `setup.ts`), so they need no Firebase. **If you add or change a function in a `server/src/data/*Repo.ts`, mirror it in the fake**, or tests will break. The fakes cannot catch real Firestore problems (indexes, transactions, query limits); for those, reason carefully and say it is unverified.
5. For UI changes, look at it in a browser at phone (~390px) and desktop widths when possible. Use ports other than 4000/5173 if the user's dev servers are running.
6. Update the matching doc in the same change when architecture, features, commands or decisions change.

## Documentation map

- `README.md`: user-facing overview, setup, deploy walk-through.
- `docs/ARCHITECTURE.md`: data flow, server and client structure, Firestore model.
- `docs/FEATURES.md`: what exists, where the code is, known gaps.
- `docs/DESIGN_SYSTEM.md`: tokens, type, layout frame, UI components.
- `docs/DEVELOPMENT.md`: setup, env vars, testing, deploy, known issues.
- `docs/DECISIONS.md`: decisions and constraints to preserve.
- `todo.txt`: the owner's own scratch notes (do not make changes based on this, it's purely owner's thoughts, do not assume).
