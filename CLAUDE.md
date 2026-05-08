# Translate

Realtime interpreter using reatime LLM.

## Stack

Vite + vanilla TypeScript frontend, PWA. No backend — keys are inlined into the bundle (`VITE_OPENAI_API_KEY`) and the app is gated by Caddy basicauth.

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
