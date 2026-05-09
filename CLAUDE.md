# Translate

Realtime ZH ↔ EN interpreter using Soniox real-time translation with speaker diarization.

## Stack

Vite + vanilla TypeScript frontend. No backend — the Soniox key is inlined into the bundle (`VITE_SONIOX_API_KEY`) and the app is gated by Caddy basicauth. Mic audio is captured via Web Audio API + AudioWorklet (16 kHz s16le PCM) and streamed over a single WebSocket to Soniox; tokens come back tagged with language + speaker and are routed into a split-screen layout (top = zh, bottom = en).

## Dev

```
bun run dev          # vite on :5173 (HTTPS)
```

Access from iPad via `https://<mac-ip>:5173`.

## Deploy

```
bun run build
```

Sync `dist/` to VPS; Caddy serves it with basicauth.
