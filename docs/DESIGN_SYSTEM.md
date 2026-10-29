# Design system

Goal: a calm, personal notebook. It must **not** look like a generic AI-made or corporate productivity app. No gamification (XP, streaks, badges), no card walls, no gratuitous animation.

## Tokens (`client/src/index.css`, `client/tailwind.config.js`)

- Colors are CSS variables as RGB triplets so Tailwind can apply opacity: `bg surface surface-2 raised line line-strong ink ink-muted ink-faint accent accent-strong accent-ink ok warn bad chart-1 chart-2`. Dark is the default (`:root`); light is `:root.light`, chosen per device (`ThemeContext`).
- Use tokens, never raw hex, in components. Chart colors were validated for contrast and colour-blind separation (dark `#6c93dc`/`#3d5ea8`, light `#3a62b3`/`#7395dc`); don't change them without re-validating.
- Radii are small on purpose: `sm 2px, DEFAULT 3px, md 4px, lg 6px`. Nothing bubbly.
- Type: **Source Serif 4** (variable, optical size) for titles and writing; **IBM Plex Sans** for UI; both bundled through `@fontsource` (no third-party font requests). Extra size `text-2xs` (11px). Helper classes `.page-title` and `.section-label`.
- Transitions default to 120 ms.

## Layout

- Signed-in pages render inside `AppShell`: sidebar at `lg` (offset `lg:pl-[13.5rem]`), bottom `MobileNav` on phones (Home, Journal, Capture, Projects, More), hidden in editors.
- **All pages share one content frame**: `PAGE_FRAME` in `components/shell/PageHeader.tsx` (`mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10`). `<Page width="narrow|default|wide">` limits how far a page extends to the right but always starts at the frame's left edge. Never center a page independently or add per-page left offsets; that was the cause of horizontal jumps between sections. `html` has `scrollbar-gutter: stable` for the same reason.
- Journal/note editors (`EditorPage`) are a deliberate exception: a centered full-screen writing view.
- Mobile is first class: 16 px gutters, large touch targets (`h-10`/`h-9` on phones, smaller from `sm`), no horizontal overflow.

## Components (`client/src/components`)

- `ui/`: `Button`/`IconButton`, `Checkbox`, `Dialog`, `Field` (`Input`, `Textarea`, `controlClass`), `Menu` (+ `PointMenu` for right-click / long-press menus at a point), `AutoSaveText`, `Skeleton` (+ `SkeletonText`, `SkeletonBlock`), `MetadataDialog` (+ `timeRow`; read-only facts in labelled sections, used by entries, files and folders), and in `misc.tsx` `Loading`, `Empty`, `ErrorNote`, `TabLinks`, `Segmented`, `Kbd`.
- Loading: pages use skeletons, not spinners. A `Skeleton` group is invisible for 150 ms (fast loads show nothing), fades in, and its bars pulse slowly in step (opacity, 2.4 s); with reduced motion they are still. Bars are `ink` at 7.5% opacity, so they work in both themes. `SkeletonText` takes the real line's type classes and so its exact height. Keep real headings, labels and controls outside the skeleton; only unknown values become bars. `Loading` (a delayed "Loading…" line) remains for dialogs, previews and code-split chunks inside a page.
- `shell/`: `AppShell`, `Sidebar`, `MobileNav`, `PageHeader` (+ `Page`, `PAGE_FRAME`), `nav.ts` (single list of sections; `short` label for the phone bar).
- Prefer these over new one-offs. Lists are rows separated by hairlines, not boxed cards. Section headings use `.section-label`.

## Conventions

- Tailwind only. `cn()` from `lib/cn` for conditional classes.
- Facts, not scores: progress is "2 of 5 tasks done", never a percentage badge; a passed target date is stated plainly, not flagged red. Only real deadlines can be "overdue".
- Destructive actions confirm via `ConfirmContext`; errors surface via `ToastContext` or inline `ErrorNote`.
- Charts follow the validated-palette approach (see the `dataviz` skill if available) and offer a table view.
