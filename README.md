# Translate

Realtime ZH ↔ EN interpreter for an iPad laid flat between two speakers. Wraps Soniox real-time translation over WebSocket; speakers are distinguished via diarization.

```
# .env
VITE_SONIOX_API_KEY=...
```

Dev: `bun run dev` (vite on `:5173`, HTTPS via self-signed cert; access from iPad as `https://<mac-ip>:5173`).
Build: `bun run build` → `dist/`. Caddy serves `dist/` with basicauth.

## How it works

Single Soniox WebSocket session in two-way translation mode (`language_a: zh`, `language_b: en`) with speaker diarization enabled. Mic audio is captured via Web Audio API and downsampled to 16 kHz s16le by an `AudioWorklet`, then pushed as binary frames over the socket.

Tokens stream back tagged with `language`, `speaker`, `is_final`, and `translation_status`. Each token is routed to the pane matching its language — the screen is split top (zh) / bottom (en), so each utterance appears as the original in one pane and the translation in the other. Within each pane, lines are grouped by speaker and color-coded.
