# PageChat – Extension

Chrome MV3 extension built with React, TypeScript, and Vite.

## Development

```bash
npm install
npm run build
```

Load `dist/` as an unpacked extension in `chrome://extensions` (Developer mode on).

## Structure

- `src/content/` – Content script injected into every page. Renders the chat panel.
- `src/options/` – Options page for saving your OpenAI API key.
- `public/background.js` – Background service worker that opens the options page on request.
- `public/manifest.json` – Chrome extension manifest (MV3).
- `vite.config.ts` – Builds the options page.
- `vite.content.config.ts` – Builds the content script.
