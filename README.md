# Image2 Studio Frontend

Static frontend for Image2 Studio, split from a private local backend.

This repository intentionally contains no private backend, proxy implementation, credential handling, generated images, logs, local paths, Tailscale certificates, Tailscale keys, packaged desktop builds, or personal history data. Serve `static/` from your own backend and implement the same-origin API described in `API_CONTRACT.md`.

![Image2 Studio home screen](docs/screenshot-home.png)

## What's Included

- `static/index.html` - application shell
- `static/styles.css` - UI styles
- `static/app.js` - browser-side logic
- `static/manifest.webmanifest` - PWA manifest
- `static/sw.js` - lightweight service worker
- `static/icons/` - app icons
- `API_CONTRACT.md` - required same-origin API endpoints

## Frontend Updates Since The Previous Public Split

- Added save-target controls for `PC only`, `phone only`, and `both`.
- Added hosted text-to-image tasks through `/api/tasks/generate` and `/api/tasks/:id`.
- Added mobile access settings for a backend-provided Tailscale/tailnet URL.
- Added PWA metadata, app icons, and service-worker shell caching.
- Added mobile-oriented layout and status handling for phone use.
- Expanded settings with hosted-mode and mobile-mode controls.

## Integration

The frontend calls relative `/api/*` endpoints. Your backend can be written in any language as long as it serves the static files and returns the documented JSON shapes.

Recommended local layout:

```text
your-backend/
  static/
    index.html
    app.js
    styles.css
    manifest.webmanifest
    sw.js
    icons/
```

Open the app from your backend root, for example `http://127.0.0.1:5180/`.

## Privacy Boundary

Only static frontend assets are published here. Backend-specific concerns belong outside this repo:

- API credentials and local config files
- image history and prompt sidecars
- proxy/backend source code
- Tailscale certificates, keys, helper scripts, account names, or machine domains
- generated images, logs, build folders, and packaged executables

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=DRSFM/image2-frontend-haiku&type=Date)](https://star-history.com/#DRSFM/image2-frontend-haiku&Date)
