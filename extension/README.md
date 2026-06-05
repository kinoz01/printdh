# KDP Niches Saver Extension

This extension saves the current Amazon tab into the local Niches board.

Before using it, start the app:

```bash
npm run dev
```

The popup defaults to `http://localhost:3000`. If Next starts on another port, change the App URL field in the popup.

## Chrome / Brave

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select this folder: `extension`.
5. Open an Amazon book or author page.
6. Click the extension icon, then `Save Book` or `Save Author`.

## Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click `Load Temporary Add-on`.
3. Select `extension/manifest.json`.
4. Open an Amazon book or author page.
5. Click the extension icon, then `Save Book` or `Save Author`.

Firefox temporary add-ons are removed when Firefox restarts. Load the same `manifest.json` again when needed.
