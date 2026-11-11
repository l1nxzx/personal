# Miniapps

Small, optional apps that live on the **Miniapps** screen (More → Miniapps), are switched on and
off in its **Store**, and can show a **widget on Home**. They are separate from the website's own
code: the site finds them by itself, and a miniapp can only use the toolkit `@miniapp/sdk`.

This file is the recipe. To make a new miniapp, follow it; nothing outside this folder needs to
change.

## Rules

- One folder per app: `client/miniapps/<id>/`. The folder name is the app's `id`: lower-case
  letters, digits and dashes (`water`, `mood-log`). Not `store` or `wallpaper`. **Never rename it**
  once used: the app's saved data is stored under its id.
- A miniapp may import **only**: `react`, `lucide-react`, `@miniapp/sdk`, and its own files
  (`./something`). Lint fails on anything else (the site's code, other miniapps, other packages).
  The site never imports a miniapp either.
- No server code, no new pages, no changes to `client/src`. Data, routes, the Store, icons and
  widgets come from the framework.
- Look like the rest of the site, not like a generated app: the site's colour tokens, its type
  (serif for big numbers and titles, sans for the rest), small radii, hairlines rather than boxes,
  no gradients, glows or glossy effects. The icon is one solid, muted colour with a plain line
  glyph (a lucide icon, white).
- Keep it simple and small. Style with Tailwind classes and the site's colour tokens (`bg-surface`,
  `border-line`, `text-ink`, `text-ink-muted`, `text-ink-faint`, `text-accent`, `bg-ok/10`,
  `text-bad`…), so it works in dark and light mode. An app may have its own accent colours.
- No emojis in code. Use `lucide-react` icons or small inline SVGs.
- Mobile first: it is used mostly as an installed app on an Android phone (~390px wide).

## Files

```
client/miniapps/<id>/
  index.ts     the manifest (required)
  App.tsx      the app's screen (required)
  Widget.tsx   a small Home widget (optional)
  ...          anything else it needs (logic.ts, components)
```

### `index.ts`

```ts
import { lazy } from 'react';
import { Droplet } from 'lucide-react';
import { defineMiniapp } from '@miniapp/sdk';

export interface WaterData {
  days: Record<string, number>;
}

export default defineMiniapp<WaterData>({
  id: 'water', // = folder name
  name: 'Water', // under the icon: one or two short words
  description: 'Count glasses of water each day.', // one sentence, under its name in the Store
  about: ['A tap per glass.', 'Your days at a glance.'], // optional: points for its Store page
  icon: {
    glyph: Droplet, // a lucide icon, or an SVG component ({ className, strokeWidth })
    background: '#3d6a8c', // one solid, muted colour
    // color: '#fff',       // glyph colour, default white
  },
  App: lazy(() => import('./App')),
  Widget: lazy(() => import('./Widget')), // optional
  initialData: { days: {} }, // what the app starts with before anything is saved
  // merge: (server, local) => ..., // optional, see "Data"
});
```

### `App.tsx`

A default-exported component. It is shown under a header with the app's icon and name and a way
back; render only the content. `Widget.tsx` is the same, but small: one or two lines and at most a
couple of buttons. It is shown in a card on Home.

```tsx
import { Button, dayKey, useAppData, useNow } from '@miniapp/sdk';
import type { WaterData } from './index';

export default function WaterApp() {
  const { data, update, isLoading } = useAppData<WaterData>();
  const today = dayKey(useNow());
  if (isLoading) return null;
  const n = data.days[today] ?? 0;
  return (
    <div className="space-y-4">
      <p className="font-serif text-[2rem] text-ink">{n} glasses</p>
      <Button
        variant="primary"
        onClick={() => update((d) => ({ ...d, days: { ...d.days, [today]: n + 1 } }))}
      >
        Add a glass
      </Button>
    </div>
  );
}
```

(Import types from `./index` only with `import type`, or keep them in a separate `logic.ts`, as
the `teeth` app does, so the manifest stays small.)

## The toolkit: `@miniapp/sdk`

| Export                                               | What it is                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineMiniapp(def)`                                 | Declares the app (the manifest's default export).                                                                                                          |
| `useAppData<T>()`                                    | `{ data, update, isLoading, isSaving, error }`: the app's own data, synced to the account. `update(fn)` changes it at once and saves it in the background. |
| `useMiniapp()`                                       | `{ definition, place, open }`: `place` is `'app'` or `'widget'`; `open()` opens the app's screen (from a widget).                                          |
| `useNow(everyMs?)`                                   | The current time, re-rendering each minute (and when the app comes back to the screen).                                                                    |
| `dayKey(date?, startHour?)`                          | `YYYY-MM-DD` of a moment. With `startHour` 3, 00:00 to 02:59 still counts as the day before.                                                               |
| `addDays(key, n)`, `dateOf(key)`                     | Day arithmetic on `YYYY-MM-DD` keys.                                                                                                                       |
| `useToast()`                                         | `toast({ message, tone?: 'error', action?: { label, onClick } })`.                                                                                         |
| `Button`, `IconButton`, `Card`, `SectionLabel`, `cn` | The site's button and card styles, a section heading, class joining.                                                                                       |

## Data

- Each app has **one** JSON value (`initialData`'s shape), up to about 300 KB. It is saved to the
  owner's account and is the same on every device. Store what you need, not derived numbers
  (compute streaks and totals from the data).
- Always update with a function of the previous value: `update((d) => ({ ...d, x: d.x + 1 }))`.
  If another device saved meanwhile, the framework applies the same function again on top of
  that, so nothing is lost.
- Changes made offline are kept on the device and saved when the connection returns. If the app
  can combine its data with newer data from another device (lists, day maps), give
  `merge(server, local)`; otherwise this device's data wins.
- If the shape must change later, keep reading the old shape (or add a `v` field and convert).
  Saved data stays even when the app is removed from the screen; the Store's "Delete data"
  erases it.
- Never put passwords or secrets in miniapp data: it is not encrypted.

## Checklist

1. Create the folder and files above.
2. `npm run typecheck`, `npm run lint`, `npm run build` (from the repository root).
3. Open More → Miniapps → Store, press **Get**, open the app; tick "Widget on Home" if it has one.
4. Look at it at phone width (~390px) in dark and light mode.

## Existing miniapps

- `teeth` (**Brush**): morning and evening brushing, streaks, the last two weeks, and Molar the
  tooth, who gets mad when you skip. Widget on Home.
