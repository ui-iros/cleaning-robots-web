# Cleaning Robots Web

![Lint](https://github.com/ui-iros/cleaning-robots-web/actions/workflows/lint.yml/badge.svg)

[Open the viewer](https://ui-iros.github.io/cleaning-robots-web/)

A browser viewer based on the Tkinter UI in [cleaning-robots-gym](https://github.com/ui-iros/cleaning-robots-gym), including its map colors, icons, local observation boundary, Run Status panel, and Map Key.

The published viewer runs entirely in the browser, including the trained **DQN, PPO, TRPO, A2C, and SAC** policies. The deterministic actors are exported from the existing v2 checkpoints (training seed 12345); no Python backend is required. Manual actions and a random baseline are also available. The Python backend and training code remain in `backend/` and `ml/` for separate local work.

## Controls

- **Journal benchmark:** original 7×7 layout, five obstacles, and journal parameters.
- **Random layout:** configure rows, columns (2–20), obstacle count, and seed. Every free cell stays reachable from the dock.
- **Custom layout:** use **Edit layout** to place obstacles, move the dock, or erase cells, then **Apply & reset**. Disconnected layouts are rejected.
- **Environment settings:** configure battery, charge amount, horizon, move probability, and dirt rates in random/custom modes.
- **Algorithm:** select DQN, PPO (default), TRPO, A2C, SAC, or Random. Changing algorithm resets the episode to the applied configuration and seed.
- **Policy / manual action:** Policy runs the selected algorithm; Random uses uniformly random actions. Manual options are North, South, East, West, Stay, Clean, and Charge. Use Play/Pause, Step, Reset, and the speed slider (0.5–8 steps/s).
- **Multi-grid benchmark:** run all five trained algorithms, or a selected subset, on independent grids with identical initial layout, dirt, battery, seed, and shared environment noise. Play/Pause, Step all, Run to horizon, and Reset benchmark advance every selected grid together. The comparison table reports steps, return, remaining dirt, dirty cells, and battery resets. This is one seeded episode per algorithm, not a multi-episode policy-quality evaluation.
- **Arrange grids:** drag the grip beside an algorithm name to move its card, or focus the grip and use arrow keys. Ordering is remembered in your browser and also applied to the comparison table. Rearranging cards preserves the running simulations and their results.
- **Load/Save config:** JSON uses the Tkinter export format: `environment`, `mode`, `seed`, and `config`. Save exports the applied configuration; pending form edits need Apply & reset first.
- **Save PNG:** export the current map, status, and legend.

The browser follows the gym's battery, cleaning, spontaneous dirt, movement, and reward rules. Its seeded PRNG is independent of NumPy: the same seed repeats a browser run, but does not produce identical random draws to Python. Reset returns to the applied configuration and seed. Battery depletion away from the dock returns the robot to the dock with the reset penalty; the run stops at the configured horizon.

## Development

```bash
cd frontend
npm ci
npm run dev
```

```bash
npm run lint
npm test
npm run build
```

No API URL or backend is needed for the viewer. See [DEPLOY.md](DEPLOY.md) for GitHub Pages deployment.

## Browser policies

`frontend/public/policies/*.json` contains only actor/Q-network weights and export metadata, including each source checkpoint's SHA-256. Inference follows [SB3 policy export](https://stable-baselines3.readthedocs.io/en/master/guide/export.html): normalized 14-feature observations, deterministic argmax for discrete policies, and tanh plus the original continuous-to-discrete adapter for SAC. The weights load on demand and are cached for the session. Failed loads show an error with Retry; they never fall back to random actions.

To regenerate exports and Python reference fixtures from the local checkpoints:

```powershell
.venv/Scripts/python.exe ml/export_browser_policies.py
```

`npm test` checks all five policies against Python outputs/actions on 128 observations each and checks observation normalization against 32 Gym states. It also verifies benchmark synchronization and simulation rules. The browser uses a different PRNG from NumPy, so complete trajectories differ from Python even though deterministic policy inference matches.

On Windows with Microsoft Edge installed, run the optional browser smoke checks from `frontend/`:

```bash
node tests/viewer.browser.mjs
```
