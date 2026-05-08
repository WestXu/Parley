# Translate

Realtime EN ↔ VI interpreter for an iPad laid flat between two speakers. Wraps OpenAI `gpt-realtime-translate` over WebRTC.

```
# .env
VITE_OPENAI_API_KEY=sk-***
```

Dev: `bun run dev` (vite on `:5173`, HTTPS via self-signed cert; access from iPad as `https://<mac-ip>:5173`).
Build: `bun run build` → `dist/`. Caddy serves `dist/` with basicauth.

## How it works

Two parallel WebRTC sessions, both fed the same mic track:

- target `vi` → translates EN speech to Vietnamese
- target `en` → translates VI speech to English

Source language is auto-detected per session. Translated audio plays through two `<audio>` elements; transcripts (input + output) arrive on each session's data channel.

UI: top half is rotated 180° for the person across the table; each half shows "You said" + "They said" panes in that side's language.
