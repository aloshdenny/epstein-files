# House Style — for Devin building epstein-files

Source of truth: the live ASMRboard code at `~/vscode/text2asmr/frontend/src/index.css` and the components in `src/components/`. This is the *current* style (it evolved past the early Clardentity/Geist port). Copy it directly.

## Feel

**Friendly and chunky.** Rounded Nunito type, 2px borders, buttons that sit on a darker edge and physically press down, one violet for everything you act on. **No gradients, no glass, no soft shadows.** Light mode is the default; dark mode only through the toggle, and the choice is remembered.

## Tokens (light)

| Token | Value | Use |
|---|---|---|
| `--canvas` / `--surface` | `#ffffff` | page and card backgrounds |
| `--surface-muted` / `--surface-hover` | `#f6f5fa` / `#efeef6` | quiet zones, hover fills |
| `--border` / `--border-strong` | `#e6e4ef` / `#d6d3e3` | hairlines (used as `--color-hairline` in Tailwind) |
| `--text` / `--text-secondary` / `--text-muted` | `#3b3a4a` / `#6f6d82` / `#a09eb3` | ink hierarchy |
| `--brand` / `--brand-dark` | `#7c5cff` / `#6142e6` | the one accent; `brand-dark` is the edge brand buttons sit on |
| `--brand-soft` / `--brand-border` | `#f1edff` / `#cbbfff` | selected/tinted states |
| `--danger*`, `--ok*` | `#ea4b5b`, `#2fa84f` + dark/bg/border variants | destructive, positive |
| `--hm-0…4` | `#efeef6 → #5b3be0` | 4-step contribution heatmap of the accent |
| `--topbar-height` | `64px` | |

Dark theme (`[data-theme="dark"]`): near-black canvas `#16151f`, surfaces `#1d1c29`, borders `#343244`, brand brightens to `#9b85ff`, heatmap steps run `#2a2938 → #b3a1ff`. Both palettes live in `:root` blocks in `index.css` — port them verbatim.

## Typography

- Body: **Nunito Variable** (rounded, friendly). Mono: **Geist Mono Variable** for ids, counts, keyboard hints.
- Registered via `@fontsource-variable/*` packages, wired with Tailwind v4 `@theme inline` (`--font-sans`, `--font-mono`, plus every token above as `--color-*` so utilities like `bg-surface`, `text-ink-muted`, `border-hairline` work).
- For epstein-files keep this system but swap the accent only if the Simpsons hero demands it; keep everything else identical so the two boards feel like siblings.

## Components and behaviors (copy from ASMRboard)

- **`.press` buttons/tiles** — `box-shadow: 0 4px 0 var(--edge)`; on `:active` they `translateY(4px)` and the shadow collapses. The signature interaction.
- **`.pop`** — a selected label tile scales to 1.06 for 0.22s, once.
- **`.cheer-in`** — small confirmation ("nice!") rises 12px and fades in.
- **`.play-ring`** — the play button "breathes" (pulsing 8px ring of the accent at 14%) while audio plays.
- **`.hum`** — a slow conic-gradient arc travels round a hairline pill with a breathing glow; used for "working on it" states.
- **Rings** (`Ring.tsx`) — SVG progress rings, 1% and 99% must both render centred; arcs animate in with a 1.1s ease.
- **Heatmap** (`Heatmap.tsx`) — GitHub-style contribution grid using `--hm-*`.
- **HeadphonesPrompt** — modal that fades/rises in, waves breathing out of the earcups; gate the labelling session behind it.
- **TopBar** — 64px, brand + theme toggle (sun/moon, chosen server-side or pre-paint via `.theme-when-dark` CSS) + account menu. Nothing else. "Keep it aesthetic and minimal."
- **Focus** — one treatment everywhere: 2px `--focus-ring` outline, 2px offset, 14px radius.
- **Scrollbars** — `.scroll-slim` / `.no-scrollbar` helpers.
- **`prefers-reduced-motion`** — every animation above has a reduce fallback that disables it. Non-negotiable; keep the discipline.

## Copy rules (from the chat history, user is strict about these)

- **No em dashes or en dashes anywhere in UI text.** Reword instead: "3–20 characters" becomes "3 to 20 characters", an absent value shows "Unranked" not "—".
- Lowercase-friendly, plain, deadpan microcopy. Duolingo's energy comes from the *mechanics* (combo, daily bar, interludes), not exclamation-heavy copy.
- Phone widths: hide keyboard hints, keep everything single-column, check both themes (the chat log shows every page was verified at desktop + phone width in light + dark — do the same).

## Labelling UI conventions

- One item at a time, full attention. Keyboard-first: Space to play, number/letter keys to toggle labels, Enter to submit.
- Minimum-listen enforcement: submit stays locked until real playback happened (duration read from the item, `listen_ms` recorded with the submission).
- "Something else" opens a free-text box; "Can't tell" and "Skip" are always available (all three feed quality metrics).
- Blind discipline: the browser gets an opaque id and a short-lived signed URL for exactly one assigned item. Never show vote counts, other people's answers, or source info.
