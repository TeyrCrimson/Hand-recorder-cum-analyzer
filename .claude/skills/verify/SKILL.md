---
name: verify
description: Build/launch/drive recipe for verifying this PWA end-to-end in headless Chromium.
---

# Verify: Hand Log PWA

- Model logic: `node src/model.test.mjs` (plain asserts; CI gates deploy on it).
- Runtime surface: browser at phone width. Launch: `npx vite --port 5199 &`,
  app at `http://localhost:5199/Hand-recorder-cum-analyzer/` (base path from
  vite.config.js must match the repo name).
- Drive with Playwright: `npx playwright install chromium` once, then a script
  with `chromium.launch()` + viewport 390x844. All UI controls are `<button>`s
  with visible text — locate by exact text. The active turn/selection is the
  gold chip: `getComputedStyle(el).backgroundColor === "rgb(224, 179, 74)"`.
- Gotchas: all five pager pages are rendered at once (horizontal scroll-snap),
  so text-based locators can match offscreen pages — prefer `.first()` or
  scope to the page; the amount "custom" input exists on every street page
  when a sizing action is pending. Dev-server HTML doubles the base path in
  `%BASE_URL%` links — check `dist/index.html` (prod is correct) before
  calling it a bug.
- Seed legacy-format data via `page.evaluate` writing localStorage key
  `handlog:v1`, then `page.reload()`.
