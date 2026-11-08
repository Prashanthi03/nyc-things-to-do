# 🗽 Things to Do in NYC (+ Jersey City)

A bright, fun, New-York-themed web app for finding things to do across the five
boroughs **and Jersey City**. Browse by category, filter by mood/budget/area/time,
hit **Surprise Me** for a random pick, build a **Plan**, add your own spots (with
offline smart suggestions), and tick off what you've **Visited**.

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
