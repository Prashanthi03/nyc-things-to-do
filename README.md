# 🗽 Things to Do in NYC

A bright, fun, New-York-themed web app for finding things to do across the five
boroughs **and Jersey City**.

**Features**
- **292 curated spots** across 9 categories (incl. 💕 Date Night); spots can belong to
  several categories at once.
- **Explore** is a split view: a scannable index grouped by borough (or category)
  on the left, and a detail panel for the selected spot on the right. Start with
  highlights or switch to all 292; the search box covers everything.
- **Look**: one blended theme mixing Brooklyn-brownstone peach, Sex and the City
  pinks and Friends purple. **Plan** is its own page: a day builder with a
  stop-by-stop itinerary, next to your saved plan.
- **Filters**: mood, budget, area, time, and **travel time from Jersey City** (an
  offline public-transit estimate from Van Vorst St — approximate, not live routing).
- **🎲 Surprise Me** — a random pick (skips places you've already visited).
- **✨ Plan my day** (in the Plan tab) — tell it one spot / half day / full day and
  it builds a clustered itinerary from unvisited spots; save it to your plan.
  Once your plan has stops, **💡 Nearby To Add** suggests spots close to them;
  adding one slots it in right after the stop it's nearest to.
- **💕 Date Night** — 55 must-try restaurants across NYC and Jersey City (no
  steakhouses or pork-focused menus, very little seafood), each with cuisine,
  budget, vibe, dress code and booking info, plus dessert stops and lots of free
  and cheap date-worthy parks, waterfronts, bookshops and shows. On the Plan
  page, switch to **💕 Dates Only** to plan a **☀️ Half-Day Date**, **🌇 Date
  Evening** or **🌙 Date Night (Outdoors)**: a restaurant plus the closest spots
  that suit that time of day, all within your budget.
- **＋ Add your own** — autocomplete recognizes ~600 known places (the 292 shown
  plus a 326-place knowledge base) and auto-fills categories, area, budget, mood,
  time, and a description; remove spots you added anytime.
- **Visited** toggle on every spot with a progress counter.
- **🍽️ Eat Nearby** on every spot: famous food within walking distance, with
  cuisine, budget, walk time, reputation and whether you need a reservation, plus
  a **⭐ Live Rating** link to Google Maps for current ratings and hours.
- **📍 Also Nearby** and distance-aware plans: stops are chained nearest-first and
  every hop says how far it is and whether to walk, take transit or the ferry.

It's a **single self-contained `index.html`** — all HTML, CSS, and JavaScript
inline, no frameworks, no build step, and **no external network requests**. Open
it anywhere.

## Try it locally

Just open the file in any browser:

- Double-click `index.html`, or
- drag it into a browser window.

That's it — it works fully offline this way.

## Publish it publicly (GitHub Pages)

1. Create a repo on your GitHub (e.g. `nyc-things-to-do`) and push these files:
   ```bash
   git remote add origin https://github.com/<your-username>/nyc-things-to-do.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
   branch**, pick `main` and `/ (root)`, then **Save**.
3. After a minute your public link is live at:
   `https://<your-username>.github.io/nyc-things-to-do/`

Anyone on the internet can open that link — no login, no install. Share away. 🎉

## How your data works (per-device for now)

Your **Visited** marks and the spots **you add** are saved in *your own browser*
using `localStorage`. That means:

- ✅ No accounts, no servers, totally private to you, works offline.
- ⚠️ It's **per browser, per device** — your phone and your laptop keep separate
  lists, and friends who open your link get their own copy to mark up.

A later version can add optional **cloud sync + a personal login** so one list
follows you everywhere (and everyone can share a growing list). The code is
structured for that: the `Store` and `enrich` modules are the single seams those
features plug into.

### Offline, precisely

- Opened **from disk** (`file://`): fully offline, always.
- Served **from GitHub Pages**: the *first* visit needs the internet to fetch the
  one file; after that your browser caches it. (There's no service worker — that
  would break the single-file design.)

## Adding your own spots

Type a place name and the app suggests a **category, area, budget, mood, and time**
for you — you can change any of it before saving. Suggestions come from a built-in
knowledge base of well-known NYC/JC spots plus keyword rules, all **offline**.
Duplicates (same place, same category) are detected automatically.

## Developing

All the app's logic lives in one marked block inside `index.html`
(`/* ==LOGIC-START== */ … /* ==LOGIC-END== */`). The tests extract that exact
block and run it under Node — so there's **no build step** and `index.html` stays
the single source of truth.

```bash
node --test test/
```

Requires Node 16+ (uses only the built-in test runner — no `npm install`).

## What's inside

- `index.html` — the whole app (ship this).
- `test/` — logic and data-integrity tests.
- `DESIGN.md` — the design doc.
