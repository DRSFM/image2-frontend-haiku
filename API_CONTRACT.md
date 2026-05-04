# API Contract

The frontend expects a same-origin backend. All endpoints are relative to the app origin.

## Status And Settings

### `GET /api/status`

Returns runtime status and allowed generation options.

```json
{
  "version": "0.9",
  "backend_state": "ok",
  "backend_detail": "",
  "credential_loaded": true,
  "credential_error": "",
  "save_dir": "/path/to/output",
  "allowed_sizes": ["1024x1024", "1536x2048", "2048x1536"],
  "allowed_quality": ["low", "medium", "high", "auto"],
  "allowed_formats": ["png", "jpeg", "webp"]
}
```

`backend_state` should be one of `ok`, `stalled`, or `down`.

### `GET /api/settings`

Returns persisted UI preferences.

```json
{
  "shutdown_backend_on_exit": false,
  "start_backend_on_launch": false,
  "theme": "light",
  "default_size": "2160x3840",
  "default_quality": "high",
  "default_format": "png",
  "default_n": 1,
  "auto_open_folder_on_save": false,
  "auto_optimize_prompt": false,
  "hosted_mode": false,
  "background_enabled": false,
  "background_opacity": 60,
  "background_blur": 0,
  "background_ext": "",
  "listen": "http://127.0.0.1:5180",
  "upstream": "your-provider",
  "save_dir": "/path/to/output",
  "backend_config_path": "",
  "settings_path": "",
  "log_path": ""
}
```

### `POST /api/settings`

Accepts a partial JSON object with any setting keys above.

```json
{ "ok": true }
```

## Generation

### `POST /api/generate`

Request body is JSON.

```json
{
  "prompt": "image prompt",
  "size": "2160x3840",
  "quality": "high",
  "output_format": "png",
  "n": 1,
  "save_to_disk": true,
  "include_b64": false
}
```

Response:

```json
{
  "ok": true,
  "items": [
    {
      "url": "/api/image/example.png",
      "filename": "example.png",
      "width": 2160,
      "height": 3840,
      "elapsed_ms": 1200,
      "saved": true,
      "b64_json": ""
    }
  ]
}
```

`b64_json` is only needed when the frontend requests browser-side phone download with `include_b64: true`.

### `POST /api/edit`

Request body is `multipart/form-data`.

- `image`: uploaded reference image
- `prompt`: edit prompt
- `size`
- `quality`
- `output_format`
- `save_to_disk`: `1` or `0`
- `include_b64`: `1` or `0`

Response shape matches `/api/generate`.

### `POST /api/tasks/generate`

Hosted text-to-image mode. The frontend uses this when task hosting is enabled.

```json
{
  "prompt": "image prompt",
  "size": "2160x3840",
  "quality": "high",
  "output_format": "png",
  "n": 1,
  "save_to_disk": true,
  "include_b64": false
}
```

Response:

```json
{
  "ok": true,
  "task_id": "task-123",
  "task": {
    "id": "task-123",
    "status": "queued",
    "request": {
      "size": "2160x3840",
      "n": 1
    }
  }
}
```

### `GET /api/tasks/:id`

Returns hosted-task state.

```json
{
  "task": {
    "id": "task-123",
    "status": "succeeded",
    "result": {
      "elapsed_ms": 1200,
      "items": [
        {
          "url": "/api/image/example.png",
          "filename": "example.png",
          "width": 2160,
          "height": 3840
        }
      ]
    }
  }
}
```

`status` may be `queued`, `running`, `succeeded`, `failed`, or `canceled`. Failed tasks should include an `error` object.

### `POST /api/optimize-prompt`

Request body:

```json
{ "prompt": "rough prompt" }
```

Response:

```json
{ "ok": true, "prompt": "optimized prompt" }
```

## Files And History

### `GET /api/history`

```json
{
  "items": [
    {
      "url": "/api/image/example.png",
      "filename": "example.png",
      "width": 2160,
      "height": 3840,
      "mtime": 1770000000
    }
  ]
}
```

### `GET /api/image/:name`

Returns image bytes.

### `DELETE /api/image/:name`

```json
{ "ok": true }
```

### `GET /api/prompt/:name`

Returns sidecar metadata for an image.

```json
{
  "prompt": "original prompt",
  "size": "2160x3840",
  "quality": "high",
  "output_format": "png",
  "n": 1
}
```

### `POST /api/open-folder`

Optional desktop integration hook. Return `{ "ok": true }` or `{ "ok": false, "error": "..." }`.

## Log

### `GET /api/log`

Returns generation log rows.

```json
{
  "items": [
    {
      "ts": 1770000000,
      "prompt": "image prompt",
      "size": "2160x3840",
      "quality": "high",
      "output_format": "png",
      "n": 1,
      "filenames": ["example.png"],
      "elapsed_ms": 1200,
      "ok": true,
      "error": ""
    }
  ]
}
```

### `DELETE /api/log`

```json
{ "ok": true }
```

## Models

### `GET /api/models`

```json
{
  "source": "backend",
  "items": [
    {
      "id": "gpt-image-2",
      "object": "model",
      "owned_by": "provider",
      "created": 1770000000
    }
  ]
}
```

## Backend Control Hooks

These are optional but the UI calls them from the status menu.

### `POST /api/backend/start`
### `POST /api/backend/stop`
### `POST /api/backend/restart`
### `POST /api/backend/open-logs`

Return:

```json
{ "ok": true, "detail": "" }
```

For stop, the frontend also understands:

```json
{ "ok": true, "killed": 1 }
```

## Mobile Access Hooks

The mobile card is backend-controlled. The frontend only displays the returned URL and status.

### `GET /api/mobile/status`

```json
{
  "enabled": false,
  "url": "",
  "proto": "",
  "dns_name": "",
  "tailscale_available": true
}
```

### `POST /api/mobile/start`

Request body:

```json
{ "prefer_https": true }
```

Response:

```json
{
  "ok": true,
  "enabled": true,
  "url": "https://example.tailnet.ts.net",
  "proto": "https",
  "dns_name": "example.tailnet.ts.net",
  "warning": ""
}
```

### `POST /api/mobile/stop`

```json
{ "ok": true, "enabled": false }
```

## Background Image

### `GET /api/background`

Returns the current background image bytes, or `404` if none exists.

### `POST /api/background`

`multipart/form-data` with `image`.

```json
{ "ok": true, "ext": ".png" }
```

### `DELETE /api/background`

```json
{ "ok": true }
```
