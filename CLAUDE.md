# Motion videos studio — house rules

- Every film is a pure function of time: `window.seek(t)` paints frame t. No CSS transitions, setTimeout or requestAnimationFrame in render mode, and no state carried between frames. Seeded noise only (`mulberry32`), never `Math.random`.
- Banned defaults: centered title on gradient, everything fading in, corner labels and frame borders, glow on UI chrome, generic particle bursts.
- One display face, one UI face, one accent color unless the brief says otherwise.
- Something new happens on screen every 2–4 seconds.
- Sound hits sit on the measured beat grid. Final loudness -14 LUFS.
- Nothing is shown to the user before at least one critique round.
- Real product UI only (captured screenshots). Never invent screens, numbers or testimonials.
- API keys live in `.env`, or in the cloud environment's network secrets; never in code, logs or chat.
- One project folder per film under `films/<slug>/`; shared renderer, motion library, fonts, and tools live at the repo root.
