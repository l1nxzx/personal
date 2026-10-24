# Decisions and constraints

Preserve these unless the owner explicitly changes them. Each has a reason.

1. **Browser never talks to Firebase.** All data and files go through the API. Keeps secrets server-side and permissions in one place (`permissions.ts`).
2. **Single-owner, registration closed.** `ALLOW_REGISTRATION=false`; the owner is created with `create-super-admin`.
3. **JWTs in httpOnly cookies, refresh tokens single-use and rotated.** Request auth reads no DB (cheap); disabled users are locked out at next refresh.
4. **No composite Firestore indexes.** Every query is one equality, `array-contains` or `orderBy`. Compound needs are solved with derived fields (`sortKey`) or in-memory filtering. Keeps setup zero-config and reads low.
5. **Maintain running totals transactionally** (`meta/*`, `FieldValue.increment`) so summaries cost one read.
6. **Search without a search service**: stored `searchTerms` + `array-contains`. Vault content is excluded from it.
7. **Money is integer minor units per currency, never converted.** Money-making ideas hold estimates that never count as income or expenses; the idea page links to real records instead of duplicating them. "Record as expense" is always an explicit action.
8. **Deadlines vs plans:** `dueDate` is a real deadline (only these can be overdue); `plannedDate` is "I'd like to do this that day" and never overdue.
9. **Edits never silently overwrite**: `rev` conflict detection on entries; the user chooses which version to keep.
10. **Vault is end-to-end encrypted in the browser.** AES-GCM vault key wrapped by a PBKDF2-SHA-256 (600k iterations) key from a separate passphrase; the key lives in memory only as a non-extractable `CryptoKey`; auto-lock after 10 min idle / 5 min hidden / reload / sign-out. Server stores only salt, wrapped key and ciphertext. Changing or resetting key material requires the account password. No local drafts of vault content; excluded from logs and search. It is deliberately not a password manager (accounts tab records where things are, not credentials). A lost passphrase is unrecoverable.
11. **Realtime by SSE, not websockets**, with a per-tab client id to ignore own echoes; Redis pub/sub only when scaled past one instance.
12. **Shared types are types only** (`shared/types.d.ts`, no runtime code), imported by relative path.
13. **One content frame for all pages** (`PAGE_FRAME`): sections share a left edge; widths vary only on the right.
14. **Tasks and projects stay under `/tasks`** even though the section is "Projects & Tasks" (renaming URLs would break links/bookmarks; only labels changed).
15. **Design identity**: quiet dark blue, serif + sans, small radii, no gamification, no card walls. Mobile first.
16. **Server tests use in-memory fakes** instead of Firebase, so they run anywhere with no credentials.
17. **Library folders are documents, files point at them** (`folderId`). Moving never touches Storage, so file ids, links, downloads and previews survive any reorganisation. A non-empty folder is never deleted silently: the API refuses (`409 FOLDER_NOT_EMPTY` with counts) unless the caller chooses `contents=move` (up a level) or `contents=delete`; the UI preselects keeping the contents.
18. **Lifetime statistics are derived, not counted up.** Counts and text totals are aggregation queries over the content itself (per-document `textWords`/`textChars` recomputed on save), so edits, deletes and imports can't leave them wrong. Active time counts a visible tab with no idle timeout (thinking and reading count), is deduplicated across tabs/devices on the server, and stores only durations and dates: no page contents, keystrokes, fingerprints or third-party analytics. Vault content is never counted.
