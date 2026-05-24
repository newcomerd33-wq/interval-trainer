# Interval Trainer

Interval-based lifting program builder + live workout timer.

Browse all 99 valid interval configurations across 15/20/30/45/60 minute sessions, configure exercise names and order, then run a screen-wake-locked timer with audio cues.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # outputs to dist/
npm run preview      # serve dist/ locally
```

## Deploy to GitHub Pages

1. Create a new GitHub repo (suggested name: `interval-trainer`).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push this folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/interval-trainer.git
   git push -u origin main
   ```
4. The included workflow (`.github/workflows/deploy.yml`) builds and deploys on every push to `main`. URL will be `https://<your-username>.github.io/interval-trainer/`.

`vite.config.js` uses `base: './'` so the app works at any subpath — no edits needed when renaming the repo.

## iOS "Add to Home Screen"

The `index.html` already declares the right meta tags. Open the deployed URL in Safari → Share → Add to Home Screen. It launches full-screen with a black status bar.
