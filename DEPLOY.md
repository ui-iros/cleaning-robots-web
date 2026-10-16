# Deployment

## Backend: Hugging Face Spaces

Space URL:

- Repo page: https://huggingface.co/spaces/cjoyy/vacuum-rl
- Runtime URL: https://cjoyy-vacuum-rl.hf.space

Required files:

- `README.md` with Docker Space metadata:
  - `sdk: docker`
  - `app_port: 7860`
- `Dockerfile`
- `requirements.txt`
- `backend/`
- `ml/`

Deploy with the Hugging Face CLI:

```bash
hf auth login
hf upload cjoyy/vacuum-rl . . --repo-type=space \
  --exclude ".git/*" \
  --exclude ".venv/*" \
  --exclude "frontend/node_modules/*" \
  --exclude "frontend/dist/*" \
  --exclude "*.log"
```

After the Space finishes building, verify:

```bash
curl https://cjoyy-vacuum-rl.hf.space/health
curl https://cjoyy-vacuum-rl.hf.space/algorithms
```

Expected health response:

```json
{"status":"ok"}
```

## Frontend: GitHub Pages

Repository: `ui-iros/cleaning-robots-web` (the former `cjoyy/vacuum-rl` URL redirects here).
Site URL: https://ui-iros.github.io/cleaning-robots-web/

1. In repository **Settings → Pages**, select **GitHub Actions** as the publishing source.
2. In **Settings → Secrets and variables → Actions → Variables**, set `VITE_API_URL` to the public HTTPS backend URL. The workflow defaults to `https://cjoyy-vacuum-rl.hf.space`; that old endpoint returned 404 when checked on October 16, 2026 and must be restored or replaced for simulations to work.
3. Push to `main`, or run **Deploy GitHub Pages** manually in Actions.

The workflow installs dependencies, lints, downloads the paper PDF from Git LFS, builds the frontend with the Pages base path, and publishes `frontend/dist`. It downloads only the paper, not the ML checkpoints.
The generated `404.html` loads the React app for direct `/arena` links and refreshes. GitHub Pages serves those fallback requests with HTTP 404 even though the app renders.

Deploy the updated backend separately so its CORS configuration allows `https://ui-iros.github.io`. GitHub Pages hosts the frontend; Python inference and WebSockets run on the backend.

For a local Pages build (PowerShell):

```powershell
cd frontend
$env:VITE_BASE_PATH = '/cleaning-robots-web/'
$env:VITE_API_URL = 'https://YOUR-BACKEND-HOST'
npm ci
npm run lint
npm run build
```

Normal local development and the existing Docker build retain the root base path `/` when `VITE_BASE_PATH` is unset. Docker still serves the frontend and backend from the same origin.

## Production Smoke Test

1. Open the GitHub Pages site URL and verify the paper PDF loads.
2. Confirm the status pill says `connected`.
3. Click `Step`; the step counter should increase and the grid should update.
4. Click `Play`; the grid should continue updating through WebSocket messages.
5. Check browser console for failed WebSocket/CORS requests.
6. Open `/cleaning-robots-web/arena` directly and refresh it; the arena should render via the SPA fallback.
