# HTML mockup conventions

Output format for `docs/screens/html/<slug>.html`. Matches the `prd-to-screens` convention so artifacts stack — both skills can write to the same directory without conflict.

## Hard requirements

- **Self-contained.** No build step. Double-click the file → it renders in any modern browser.
- **Tailwind via CDN.** `<script src="https://cdn.tailwindcss.com"></script>` in `<head>`. No npm install, no PostCSS, no config file.
- **Fonts via Google Fonts.** `<link>` in `<head>`. Pick a font that matches the design vision recorded in the research doc.
- **Shared mock data.** Every screen imports `<script src="./assets/mock-data.js"></script>`. A user named "Sam Chen" on the dashboard is the same "Sam Chen" everywhere.
- **Shared styles file (optional).** `./assets/styles.css` for cross-screen overrides Tailwind can't express compactly. Don't create it unless two screens need the same custom rule.
- **Platform viewport.** Set the `<meta viewport>` per `.design-loop/state.json` `platform`:
  - `mobile`: `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover`
  - `desktop`: `width=1440` (or skip viewport meta entirely)

## Skeleton

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Dashboard — Acme App</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="./assets/mock-data.js"></script>
  <style> body { font-family: 'Inter', system-ui, sans-serif; } </style>
</head>
<body class="bg-neutral-50 text-neutral-900">
  <!-- screen markup here -->
  <script>
    // populate the DOM from mock-data.js — keep this brief; this is a mockup, not an app
  </script>
</body>
</html>
```

## Mobile vs desktop

| Concern | Mobile (`375x812`) | Desktop (`1440x900`) |
|---|---|---|
| Layout | Single column, stacked sections | Multi-column where the research justifies (sidebar + main + drawer) |
| Tap targets | ≥ 44px height for interactive elements | ≥ 32px is fine; hover states matter more |
| Nav | Bottom tab bar OR top bar with hamburger; not both | Sidebar (persistent) or top nav; almost never bottom |
| Type scale | Smaller base (14–15px) | Larger base (16–18px) |
| Padding | Generous; thumb reach > pixel density | Tighter; pointer precision allows |
| Modals | Bottom sheets, not centered modals | Centered modals fine |

Don't mix patterns. If `.design-loop/state.json` says `platform: "mobile"`, don't ship a 3-column desktop layout because the research showed one. A future iter with `platform` flipped to `desktop` handles that case.

## Cross-linking

`index.html` lives at `docs/screens/html/index.html` and is a simple nav into every screen. The `prd-to-screens` P6 step builds it; if it already exists, this loop maintains it (add a new `<li>` for any newly-created screen).

Within a screen, links to other screens use relative paths: `<a href="./settings.html">Settings</a>`. The chrome-devtools render step opens screens via `file://` URLs, so relative links work.

## What NOT to do

- **Don't use frameworks** (React, Vue, etc.). Mockups don't compile.
- **Don't fetch from real APIs.** Mock data via `mock-data.js` only.
- **Don't write real form submission.** A `<form>` with `onsubmit="event.preventDefault(); console.log('submitted')"` is fine for showing the interaction.
- **Don't add accessibility theater.** Real `aria-*` attributes for real semantic HTML, yes. Don't `aria-label` every `<div>` to look thorough.
- **Don't optimize for performance.** This is a mockup. A 200KB inline SVG is fine if the design calls for it.

## Iteration discipline

When refining an existing file:
- **Preserve approved structure.** Diff is incremental. If a prior iter `pass`-ed the sidebar layout, don't re-architect it in a later iter — change only what the new research justifies.
- **Update the `<title>`'s implicit version mark only when sections meaningfully change.** No "v2", "v3" suffixes in filenames or titles.
- **The shared mock data is shared.** Adding a new user field for this screen means adding it to `mock-data.js` (which every other screen now sees), not faking it inline.

## When the screen needs interactivity Tailwind+inline can't express compactly

It probably doesn't. This is a mockup. But if you genuinely need (e.g.) a working tab switcher for the screen to communicate its design:
- Vanilla JS only, inline at the bottom of `<body>`
- No bundler, no build step, no NPM
- Comment what the interaction is meant to demonstrate

If the interaction is complex enough that vanilla JS feels painful, it's a sign the mockup is doing implementation's job — log the complexity to `logs/blocks.md` and keep the mockup static for the design pass.
