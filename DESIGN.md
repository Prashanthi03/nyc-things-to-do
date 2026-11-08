# Things to Do in NYC — Design Doc

*Status: draft for approval · Standalone personal project (NOT a Meta project)*

## Intent & why
A bright, fun, New York–themed web app the owner can share **publicly** with
friends and family (outside Meta) via a personal GitHub Pages link. It helps
visitors get inspired by NYC activities, decide what to do, and plan a day or
trip — and lets each person mark what they've done and add their own spots.

## Goals
- Delightful, bright, unmistakably-NYC look (taxi yellow / subway accents / skyline).
- Four ways to engage: **Browse**, **Surprise Me**, **Help Me Decide** (filters), **Plan**.
- Each person can **add** an activity to any category (deduped if it already exists).
- Each person can toggle **Visited / Not Visited** on any item.
- One **self-contained `index.html`** — all HTML/CSS/JS inline, zero external
  requests, works offline and on any device, drops straight into GitHub Pages.
- Mobile-first; great on a phone.

## Non-goals (v1)
- No shared/synced state. Each browser+device is its own copy (localStorage).
- No accounts / login (planned for a later phase — see Future).
- No live maps, external images, or APIs (would break "works anywhere offline").
- No Export/Import button in v1 (owner chose plain per-device for now).

## Anti-goals (what makes it a failure even if it "works")
- Feels like a boring spreadsheet or a generic list — it must feel *fun*.
- Breaks offline or on a phone.
- Loses a person's Visited marks / added items on reload (must persist locally).

## Approach (decided)
Single `index.html`, **vanilla HTML/CSS/JS, everything inline, no frameworks or
CDNs.** Alternatives rejected: CDN frameworks (need network, break offline);
a bundler/build step (unnecessary tooling for one page). Vanilla single-file is
the match for "embedded, works anywhere, public static host."

## Data model
Seed list of ~50 curated NYC activities embedded as a JS array. Each item:

| field | example | used by |
|---|---|---|
| `id` | seed: `met-museum` · custom: `c_1699900000000_a1b2` | internal key for visited/plan |
| `name` | "The Met" | all |
| `category` | `museums` | browse, add, filter |
| `emoji` | 🎨 | cards |
| `area` | "Upper East Side" / borough | filter, cards |
| `budget` | `free` \| `$` \| `$$` \| `$$$` | filter, cards |
| `moods` | `["artsy","chill"]` (**always an array**, incl. custom) | filter |
| `time` | `quick` \| `half` \| `full` | filter, cards |
| `blurb` | "World-class art, pay-what-you-wish for NY residents." | cards |
| `custom` | `true` if user-added | styling/badge |

**ID scheme (fixes review #1):** seed ids are hand-authored slugs; **custom ids
are machine-generated and non-guessable** (`c_<timestamp>_<rand>`), **never
derived from the name**. Seed and custom ids live in disjoint namespaces, so a
user adding "The Met" can never collide with the seed `met-museum` and
cross-link Visited/Plan state.

**Normalized match key:** `category + "::" + lowercased, trimmed, inner-space-
collapsed, punctuation-stripped name` (e.g. `museums::the met`). Used for all
dedup, both at add time and at load (see REQ-5).

**Categories (8):** 🗽 Iconic NYC · 🎨 Museums & Culture · 🌳 Parks & Outdoors ·
🍕 Food & Drink · 🏙️ Neighborhoods · 🎭 Shows & Nightlife · 💎 Hidden Gems ·
🆓 Free & Cheap.

**Coverage:** NYC (all five boroughs) **plus Jersey City, NJ** — JC appears as an
`area` value (e.g. Liberty State Park, Liberty Science Center, Exchange Place
waterfront/skyline walk, Grove Street dining, Mana Contemporary, Newport) and
flows through Browse, the Area filter, and Surprise Me like any other area.

**Per-person state (localStorage):** `visited` set of item ids; `customItems`
array; `plan` ordered array of item ids. Stored under a namespaced, **versioned**
key (`nyc-todo:v1`).

**Load-time reconciliation (fixes review #2 & #4):** on every load the app builds
the live catalog (seed ∪ customItems) and reconciles stored state against it:
1. **Dedup/merge custom vs seed by normalized key.** If a custom item now
   matches a seed item (e.g. it later shipped as a seed spot), **seed wins**:
   the custom item is dropped and any Visited mark / Plan slot it held is
   **migrated onto the seed id** (so the user keeps their checkmark).
2. **Drop orphans.** `visited`/`plan` ids that match no live item are removed, so
   the progress count and the Plan list never show dangling or phantom entries.
   An optional **id-rename map** (old→new) migrates marks across seed renames
   before the orphan sweep, so a rename doesn't silently drop a checkmark.
3. **De-dup the Plan.** Because `plan` is an ordered array (not a set), after a
   custom→seed merge the migrated id could appear twice; reconciliation collapses
   duplicates, keeping first position.
4. A `schemaVersion` field *inside* the stored object drives migrations (distinct
   from the storage **key** namespace `nyc-todo:v1`, which rarely changes);
   bumping `schemaVersion` runs reconciliation + any version-specific transform,
   then rewrites clean state.

## Features / requirements
- **REQ-1 Browse**: responsive card grid, grouped/filterable by category; each
  card shows emoji, name, area, budget, time, blurb, a Visited toggle, and an
  "＋ Plan" button.
- **REQ-2 Surprise Me**: a 🎲 button picks one random activity (respecting any
  active filters) with a little reveal animation.
- **REQ-3 Help Me Decide**: filter bar — Mood, Budget, Area, Time — combine to
  narrow the grid live. A "clear filters" reset. **Area options are derived from
  the live catalog** (unique `area` values across seed ∪ custom, sorted), so a
  spot you add in a new area becomes filterable automatically; the add form
  constrains area entry (choose-from-known + "other") to keep this list clean.
- **REQ-4 Plan**: add items to "My Plan"; view as an ordered list; reorder
  (up/down), remove, and mark visited from there; persists locally.
- **REQ-5 Add your own**: form (name + category required; area/budget/mood/time
  optional). Added to that category only if its **normalized match key** (see
  Data model) isn't already present in the live catalog (seed ∪ custom);
  duplicate shows a friendly "already on the list" message. Dedup runs **both at
  add time and at load** (review #4). The **Area input is a choose-from-known
  dropdown plus a free-text "other"** so typos don't spawn junk filter chips
  (review suggestion). Mood selection may pick one or more and is always stored
  as an array. Added items are tagged `custom` with a machine-generated id.
- **REQ-9 Smart suggest on add (offline)**: as the user types a place name, an
  embedded **enricher** suggests category + area + budget + mood + time, which
  pre-fill the form; the user can change any field before confirming. The
  enricher works two ways, fully offline, no API keys:
  (a) an **embedded knowledge base of ~150+ well-known NYC/JC spots**
  (name → attributes) matched case/space-insensitively (incl. common aliases,
  e.g. "statue of liberty"); (b) for unknown names, **keyword heuristics**
  ("…park" → parks/outdoor/free; "…museum" → museums/artsy/$$; "pizza|deli|
  bar|restaurant" → food; etc.) with sensible defaults. The enricher is a
  **swappable module** so a live LLM/search lookup can replace it in Phase C
  (when a backend can safely hold the key) with no rework.
- **REQ-6 Visited**: toggle per item, persisted. The progress stat leads with the
  **raw count** of spots you've marked — "You've visited **12** spots 🎉" — with a
  secondary "**12 of 57**". **Denominator = every item currently in the catalog
  (seed + your added spots).** Leading with the count (not a percentage) avoids
  the footgun where adding an unvisited spot appears to *lower* your progress
  (review #3). The count tracks the user's action, so it only moves when they
  toggle Visited; the one exception is a genuine catalog removal (a seed spot
  retired), which is correct behavior. To avoid needlessly dropping an earned
  checkmark on a seed **rename**, reconciliation uses an optional id-rename map
  (old id → new id) so marks migrate instead of orphaning. Example numbers track
  the real seed size (~50+), not a placeholder.
- **REQ-7 Storage layer**: a single small `Store` module abstracts get/set so
  swapping localStorage → cloud+login later is a contained change, not a rewrite.
  **All reads/writes are wrapped in try/catch** (review #5): if storage is
  unavailable or throws (Safari private mode, quota exhausted), the app degrades
  to an **in-memory session** and shows a one-time, non-blocking notice —
  "Heads up: this browser isn't saving changes, so your marks won't stick here" —
  rather than failing silently and violating the persistence anti-goal.
- **REQ-8 Self-contained**: one file, no external network calls, mobile-first.
  **Offline nuance (review suggestion):** a file *opened from disk* is fully
  offline; *served from GitHub Pages* the first visit needs network, and
  "offline" thereafter means browser-cached (no service worker, which would break
  the single-file constraint). The README will state this plainly.
- **REQ-10 Empty states**: filter combinations over a modest catalog will often
  match nothing. A zero-result grid shows friendly copy + a "clear filters"
  button; **Surprise Me on an empty filtered set** doesn't error — it tells the
  user nothing matches and offers to clear filters or roll across everything.
- **REQ-11 Accessibility & safety** (cross-cutting, matters for a public family
  share): WCAG-AA contrast (black text on yellow, never yellow-on-white);
  category conveyed by **emoji + label, never color alone** (colorblind-safe);
  semantic HTML, visible focus states, ≥44px touch targets. All user-entered
  text (names/blurbs) rendered via `textContent`, never `innerHTML`, to prevent
  self-XSS.

## Look & feel
Taxi-yellow + black, subway-sign accents, skyline/emoji touches. Rounded bright
cards, playful micro-animations on Surprise Me and Visited. Color-per-category is
**decorative, paired with emoji + label** (never the sole signal) and held to
AA-contrast text (per REQ-11).

## Future (not now)
- **Phase C**: optional cloud sync + per-person login (e.g. Firebase/Supabase),
  and a **live LLM/search enricher** for the add flow (backend holds the key).
  The `Store` and enricher modules are the seams these plug into.
- Possibly Export/Import, shared lists, photos.

## Deliverable & location
`/home/prashanthibala/nyc-things-to-do/index.html` (+ this DESIGN.md and later a
README for GitHub Pages). Standalone; owner publishes to personal GitHub.

## Changes from design review (round 1)
All five critical issues were edge-case / data-model / error-handling fixes
inside already-agreed scope — resolved as author's calls, none change what the
app is or does:
1. **Custom id scheme** — machine-generated `c_<ts>_<rand>`, disjoint from seed
   slugs; added a normalized match key. (Data model)
2. **Migration** — load-time reconciliation drops orphaned visited/plan ids;
   `schemaVersion` drives migrations. (Data model)
3. **Progress stat** — denominator defined (seed + custom); leads with an
   always-climbing count to avoid the "adding lowers %" footgun. (REQ-6)
4. **Dedup** — normalized key, runs at load as well as add; seed wins over a
   superseded custom item and its Visited mark migrates. (Data model, REQ-5)
5. **Storage failure** — Store try/catch → in-memory fallback + visible notice.
   (REQ-7)
Also folded in suggestions: empty states (REQ-10); accessibility + text-escaping
(REQ-11); `moods` always an array; Area input choose-from-known + other (REQ-5);
offline claim clarified (REQ-8).
