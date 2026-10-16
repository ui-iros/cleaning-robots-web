# Cleaning Robots Web

![Lint](https://github.com/ui-iros/cleaning-robots-web/actions/workflows/lint.yml/badge.svg)

[Open the viewer](https://ui-iros.github.io/cleaning-robots-web/)

A browser viewer based on the Tkinter UI in [cleaning-robots-gym](https://github.com/ui-iros/cleaning-robots-gym), including its map colors, icons, local observation boundary, Run Status panel, and Map Key.

The published viewer runs entirely in the browser. It supports manual actions and a **random policy**; it does not run the trained DQN/PPO/TRPO/A2C/SAC checkpoints. The existing Python backend and training code remain in `backend/` and `ml/` for separate local work.

## Controls

- **Journal benchmark:** original 7×7 layout, five obstacles, and journal parameters.
- **Random layout:** configure rows, columns (2–20), obstacle count, and seed. Every free cell stays reachable from the dock.
- **Custom layout:** use **Edit layout** to place obstacles, move the dock, or erase cells, then **Apply & reset**. Disconnected layouts are rejected.
- **Environment settings:** configure battery, charge amount, horizon, move probability, and dirt rates in random/custom modes.
- **Policy / manual action:** choose Policy for uniformly random actions, or North, South, East, West, Stay, Clean, or Charge. Use Play/Pause, Step, Reset, and the speed slider (0.5–8 steps/s).
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
