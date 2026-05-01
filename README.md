# Image2 Studio Frontend

This repository contains only the static frontend for Image2 Studio.

It intentionally does not include any private backend, proxy, credential handling, model routing, generated images, logs, local paths, or packaged desktop builds. To use it, serve `static/` from your own backend and implement the API described in `API_CONTRACT.md`.

## Files

- `static/index.html` - application shell
- `static/styles.css` - UI styles
- `static/app.js` - browser-side logic
- `API_CONTRACT.md` - required same-origin API endpoints

## Integration

The frontend calls same-origin `/api/*` endpoints. Your backend can be written in any language as long as it serves the static files and returns the documented JSON shapes.

Recommended local layout:

```text
your-backend/
  static/
    index.html
    app.js
    styles.css
```

Open the app from your backend root, for example `http://127.0.0.1:5180/`.

## Publishing Notes

This repo is meant to be initialized and pushed as a fresh git history. Do not import history from a private backend repository.
