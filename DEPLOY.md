# GitHub Pages deployment

Site: https://ui-iros.github.io/cleaning-robots-web/

The viewer is static and runs simulation and trained policy inference in the browser. It needs no Python service, API URL, or WebSocket server. Actor exports in `frontend/public/policies/` are published as regular static JSON; the original Python checkpoints do not need to be downloaded by Actions or the browser.

1. Keep **Settings → Pages → Source** set to **GitHub Actions**.
2. Push changes to `main`, or manually run **Deploy GitHub Pages** in Actions.
3. The workflow installs frontend dependencies, runs lint and simulator tests, builds with the Pages base path, and deploys `frontend/dist`.

For a local build that matches Pages (PowerShell):

```powershell
cd frontend
$env:VITE_BASE_PATH = '/cleaning-robots-web/'
npm ci
npm run lint
npm test
npm run build
```

Without `VITE_BASE_PATH`, the build uses `/`, suitable for local development and Docker. The generated `404.html` loads the viewer for old nested URLs such as `/arena`; GitHub Pages serves those fallback responses with HTTP 404.

## Smoke check

- Open the site: the map and Run Status should appear without network errors.
- Select a manual action and Step; test Play/Pause and Reset.
- Select each of the five algorithms with Action set to Policy and verify Step works.
- Open Multi-grid benchmark, run all five to the horizon, and inspect the comparison table. Test selecting a subset and Reset benchmark.
- Apply random and custom layouts; test invalid/disconnected layouts.
- Save and reload a configuration, then export a PNG.
- Check the layout on a narrow screen.
