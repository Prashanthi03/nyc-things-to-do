# Things to Do in NYC — Design Doc

*Status: current (v3) · Standalone personal project, published on GitHub Pages*

## Intent
A bright, fun, New York–themed web app the owner shares **publicly** with
friends and family. It helps people find things to do across NYC's five boroughs
and Jersey City, decide what to do, plan a day, mark what they've done, and add
their own spots.

## Goals
- Delightful, readable, unmistakably-NYC look.
- Explore a curated catalog; get a random pick; plan a day; track Visited.
- Add your own spots with offline smart suggestions; remove them later.
- One **self-contained `index.html`**: all HTML/CSS/JS inline, zero network
  requests, works from disk or GitHub Pages, phone and laptop.

## Non-goals (for now)
- No shared or synced state: each browser on each device keeps its own data.
- No accounts, no live maps or routing, no external APIs.
- No live LLM/search lookup for Add (a public static file can't hold an API key).

## Approach
Single `index.html`, vanilla HTML/CSS/JS, no frameworks or CDNs, no build step.
The script has two marked blocks:
- `/* ==LOGIC-START== */ … /* ==LOGIC-END== */`: pure, DOM-free logic and data.
  The Node test harness extracts this exact block and runs it, so tests exercise
  the shipped code.
- `/* ==UI-START== */ … /* ==UI-END== */`: DOM rendering and event wiring.

## Data

### Catalog (`SEED`, 224 shown spots)
Each spot: `id` (hand-authored slug), `name`, `categories[]` (1–3), `emoji`,
`area`, `budget` (`free` | `$` | `$$` | `$$$`), `moods[]` (1–3), `time`
(`quick` | `half` | `full`), `blurb`, optional `aliases[]`, and `featured`
(61 curated highlights).

**Categories (9), a spot can have several:** 🗽 Iconic · 🎨 Museums · 🌳 Parks ·
🍕 Food · 🏙️ Neighborhoods · 🎭 Nightlife (`shows`) · 💎 Hidden Gems · 🆓 Free ·
💕 Date.

**Moods:** chill, adventurous, romantic, foodie, artsy, touristy, outdoorsy, lively.

**Coverage:** all five boroughs plus Jersey City (19 shown spots). Stale or
unsafe places are excluded (e.g. Dead Horse Bay, the Freedom Tunnel).

### Add-recognition library (`KB_EXTRA`, 368 places)
Same shape as SEED, never shown in Explore. Together with SEED it gives the Add
form about 600 recognizable places. No KB entry repeats a shown spot's name or
alias (data test).

### Locations and food details
Every shown and recognized place has `lat`/`lng` (checked against a rough box
for its borough by a data test). Every food place also has `cuisine`,
`reputation` (legendary / acclaimed / local) and `reservation` (required /
recommended / walk-in). Live star ratings are not stored: they change and can't
be fetched without a network call, so the UI links to Google Maps instead.
Places that have moved were updated; ones that may have closed were removed.

### Per-person state (localStorage)
`{ schemaVersion: 2, visited: [ids], plan: [ordered ids], customItems: [spots] }`
under key `nyc-todo:v1`. Custom spot ids are machine-generated
(`c_<timestamp>_<rand>`), never derived from the name, so they can't collide
with a seed slug.

### Names and duplicates
- `normalizeKey(name)`: lowercase, strip punctuation, collapse spaces.
- `looseKey(name)`: `normalizeKey` minus a leading "The".
- **Add** refuses a name whose loose key matches any shown or custom spot's name
  **or alias** ("Lady Liberty", "The Battery" → already listed).
- Generic one-word aliases ("park", "garden", "village"…) were removed so they
  don't block legitimate custom names like "The Park".

### Load-time reconciliation (`reconcile`, runs on every load)
1. **Upgrade old saved data:** v1 custom spots (single `category`, scalar mood)
   become arrays; names coerced to strings; unknown categories dropped;
   entries without id/name dropped.
2. **Renames:** `V1_RENAMES` (31 entries) maps every v1 seed id and every
   merged-away duplicate id onto its current spot, so Visited/Plan marks from
   the live v1 site carry over. Verified end-to-end in a browser.
3. **Merge:** a custom spot whose **name** matches a shown spot merges into it
   (seed wins, marks migrate). Not by alias, so a user's own "The Park" and its
   notes survive. Custom spots sharing a name merge with each other.
4. **Clean up:** drop ids that match no live spot; de-dup `visited` (set) and
   `plan` (first position wins).

All lookup maps are prototype-free (`Object.create(null)`), so a spot named
"Constructor" can't collide with `Object` keys.

### Storage safety
`safeStorage(window)` guards even reading `window.localStorage` (it throws when
site data is blocked). `makeStore` wraps every read/write; on failure it keeps
an in-memory session and the UI shows a "this browser isn't saving changes"
notice instead of a blank page or silent data loss.

## Features

### Explore (split explorer)
- **Left: index.** Search box (name, area or category over all spots),
  **⭐ Highlights** (featured + your own spots + all Jersey City spots) or
  **🗽 All**, grouped **by borough** (Jersey City first, then Manhattan, Brooklyn,
  Queens, The Bronx, Staten Island, Harbor Islands) or **by category**.
  Collapsible sticky group headers (ignored while searching). Filters: mood,
  budget, area, time needed, travel time from Van Vorst St (≤ 20/30/45/60 min).
- **Right: detail.** Big emoji and name, category badges, facts (where, budget,
  time needed, travel estimate), description, vibes, ✅ Mark Visited,
  🗓️ Add To Plan, 🗑️ Delete My Spot (custom only, with Undo), and
  **🍽️ Eat Nearby** and **📍 Also Nearby** (see Distances). Food rows show
  cuisine · budget · walk time, then reputation · reservations · vibe, and a
  ⭐ Live Rating ↗ link (Google Maps search, opens in a new tab). A row that is
  itself a shown spot links to it.
- **Phones (≤ 860px):** list and detail are separate screens with a Back button;
  the header compacts into one swipeable row.

### Plan (its own page)
- **Left: Plan My Day.** Choose 🎯 One Spot / 🌤️ Half Day / 🌆 Full Day
  (1/3/5 stops) plus optional mood, area and budget. `generatePlan` draws only
  from **unvisited** spots, then chains them nearest-neighbor by real distance;
  picks without a location still fill the plan. Without coordinates it falls
  back to same area → same borough → the rest. Shuffle, or Add All To My Plan.
- **Right: Your Saved Plan** with a "N of M done" counter; move up/down, remove.
- Both are numbered **stop timelines**. Between stops, `hopInfo` gives the
  distance and mode (see Distances); if a stop can't be located, `hopKind`
  falls back to 🚶 same neighborhood / 🚇 within a borough / 🚆 cross-borough.
  Each stop lists its 3 closest food spots.
- Tap a stop to expand it in place (description, vibes, Mark Visited,
  Add/Remove, 🧭 See In Explore).

### Surprise Me
Picks a random **unvisited** spot matching the visible filters (Explore's, or
the planner's on the Plan page) and opens it in Explore. Messages distinguish
"you've visited everything", "nothing matches these filters" (with Clear
Filters), and "nothing left".

### Add A Spot
Modal form. The name field is an accessible combobox: autocomplete over shown,
recognized and custom places (arrow keys + Enter). Picking a match, or leaving
the field, runs `enrich(name)`:
1. library hit by name or alias → categories, area, budget, mood, time,
   description;
2. else keyword heuristics ("…park" → Parks/free, "…museum" → Museums…);
3. else safe defaults.

Fields the user already changed are never overwritten. Enter submits; a stray
backdrop click won't discard typed details; focus is trapped in the dialog and
moves to the new spot afterwards. `enrich` is the single seam a live lookup
could replace later.

### Visited and progress
Toggle anywhere; the header of the index shows "You've Visited N Spots" and
"N of total".

### Travel time
`travelTime(area)`: offline **public-transit estimate from Van Vorst St, Jersey
City** (by Grove St PATH). Looks up the neighborhood part of the area
case-insensitively in a ~100-entry table, else falls back to a per-borough
default. An estimate, not live routing; the UI labels it as such.

### Distances
- `locate(item)`: the place's own coordinates, else the average of known places
  in its area (for custom spots). An area that is only a borough name gives no
  location, so nothing pretends to be precise.
- `distanceMeters`: haversine. `walkGroup` keeps walks on one landmass:
  Brooklyn + Queens share one, Roosevelt Island and the harbor islands are their
  own, each borough otherwise.
- `hopInfo`: ≤ 1300 m on the same landmass → 🚶 walk at 80 m/min; to or from a
  harbor island → ⛴️ take the ferry; otherwise 🚇 transit ≈ 8 min + 3 min/km.
- `nearbyFood` / `nearbySpots`: same landmass, within 1.2 km (widened to 2.4 km
  if fewer than 3), nearest first, excluding the spot itself.

## Look and accessibility
- **One theme ("NYC Sweetheart")**: Brooklyn-brownstone peach, Sex and the City
  blush pinks, Friends purple with yellow-frame cream; peach → pink → lavender
  header; dotted background with scattered emoji "sprinkles".
- WCAG AA contrast enforced by a test for every text pair (body, panels, buttons,
  header across its gradient, tabs).
- Category shown by emoji + label, never color alone. Visible double-ring focus
  indicator; focus restored to the same control after every re-render; ≥ 44px
  touch targets; live-region announcements for toasts and timeline changes;
  `prefers-reduced-motion` respected.
- All user text rendered with `textContent` / `setAttribute`, never `innerHTML`.

## Testing
`node --test test/` (Node 16, no dependencies):
- `test/logic.test.js` (54): dedup, reconcile/migration, enrich, search,
  filters, Surprise, plan generation and nearest-neighbor ordering, distances,
  walk/ferry rules, Eat Nearby, hop labels, travel time,
  borough mapping, storage failure, theme contrast.
- `test/data.test.js` (17): catalog shape and size, coordinates inside each
  borough, food details present, Eat Nearby coverage, no network loads, unique
  names/aliases,
  KB/catalog disjointness, every v1 id resolves, rename targets exist, stale
  spots absent, borough coverage, key names recognized and generic ones not.

UI changes are verified in a headless browser at phone and laptop widths.
Each batch went through an independent review before release.

## Future
- **Phase C:** optional cloud sync + per-person login (e.g. Firebase/Supabase)
  behind the `Store` seam, and a live LLM/search lookup behind `enrich`
  (the backend would hold the key).
- **"Submit" (open question):** what it should do and for whom (personal sync
  across devices vs. one shared list). A static page can't write to the GitHub
  repo without a backend or an exposed token.

## Files
- `index.html`: the whole app (ship this).
- `test/`: logic and data tests (`extract.js` is the harness).
- `README.md`: features and how to publish on GitHub Pages.
- `DESIGN.md`: this document.
