import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchAlgorithms, fetchSnapshots } from "../api.js";
import SimBoard, { BoardLegend } from "./SimBoard.jsx";

const MODEL_SEEDS = [12345, 12346, 12347, 12348, 12349];
// Columns are time steps; the first column is the shared starting environment.
const STEP_PRESETS = [
  [0, 50, 100, 200, 300, 400, 500],
  [0, 100, 200, 300, 400, 500],
  [0, 25, 50, 75, 100, 150, 200],
];

export default function SnapshotArena() {
  const { t } = useTranslation();
  const [algorithms, setAlgorithms] = useState([]);
  const [selected, setSelected] = useState([]);
  const [seed, setSeed] = useState(MODEL_SEEDS[0]);
  const [presetIndex, setPresetIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    fetchAlgorithms()
      .then((payload) => {
        setAlgorithms(payload.algorithms);
        setSelected(payload.algorithms.filter((algorithm) => algorithm.available).map((algorithm) => algorithm.id));
      })
      .catch((err) => setError(err.message));
  }, []);

  // Keep rows in the backend's algorithm order regardless of click order.
  const orderedSelection = useMemo(
    () => algorithms.map((algorithm) => algorithm.id).filter((id) => selected.includes(id)),
    [algorithms, selected],
  );

  useEffect(() => {
    if (orderedSelection.length === 0) {
      setResult(null);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError("");
    fetchSnapshots({ algorithms: orderedSelection, seed, steps: STEP_PRESETS[presetIndex] })
      .then((payload) => {
        if (requestIdRef.current === requestId) setResult(payload);
      })
      .catch((err) => {
        if (requestIdRef.current === requestId) setError(err.message);
      })
      .finally(() => {
        if (requestIdRef.current === requestId) setLoading(false);
      });
  }, [orderedSelection, seed, presetIndex]);

  function toggleAlgorithm(id) {
    setSelected((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  return (
    <>
      {error ? <div className="error-banner">{error}</div> : null}

      <div className="arena-controls">
        <fieldset className="arena-algo-select">
          <legend>{t("arena.select_algorithms")}</legend>
          <div className="arena-checkbox-grid">
            {algorithms.map((algorithm) => (
              <label
                key={algorithm.id}
                className={`arena-checkbox-label ${algorithm.available ? "" : "disabled"}`}
                title={algorithm.load_error || undefined}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(algorithm.id)}
                  disabled={!algorithm.available}
                  onChange={() => toggleAlgorithm(algorithm.id)}
                />
                <span className="arena-algo-label">{algorithm.name}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="arena-actions">
          <label className="arena-seed-label">
            {t("arena.snapshots.seed")}
            <select value={seed} onChange={(event) => setSeed(Number(event.target.value))} className="arena-seed-input">
              {MODEL_SEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="arena-seed-label">
            {t("arena.snapshots.steps")}
            <select
              value={presetIndex}
              onChange={(event) => setPresetIndex(Number(event.target.value))}
              className="snapshot-steps-input"
            >
              {STEP_PRESETS.map((steps, index) => (
                <option key={steps.join()} value={index}>
                  {steps.join(", ")}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {algorithms.length === 0 ? null : orderedSelection.length === 0 ? (
        <div className="arena-placeholder">{t("arena.no_selection")}</div>
      ) : (
        <div className={`snapshot-panel ${loading ? "is-loading" : ""}`} aria-busy={loading}>
          <BoardLegend />
          {loading && !result ? <div className="snapshot-status">{t("arena.snapshots.loading")}</div> : null}
          {result ? <SnapshotMatrix result={result} /> : null}
          {loading && result ? <div className="snapshot-status overlay">{t("arena.snapshots.loading")}</div> : null}
        </div>
      )}
    </>
  );
}

function SnapshotMatrix({ result }) {
  const { t } = useTranslation();
  const { steps, rows, max_steps: maxSteps } = result;

  // Per time step, the lowest remaining dirt among rows — "who cleans fastest".
  const cleanestByColumn = steps.map((_, column) => {
    const dirt = rows.filter((row) => row.snapshots.length).map((row) => row.snapshots[column].total_dirt);
    const min = Math.min(...dirt);
    return dirt.length > 1 && dirt.some((value) => value !== min) ? min : null;
  });

  return (
    <div className="snapshot-scroll">
      <div
        className="snapshot-matrix"
        style={{
          gridTemplateColumns: `96px repeat(${steps.length}, minmax(0, 1fr))`,
          // Below this width the matrix scrolls sideways instead of shrinking boards further.
          minWidth: 96 + steps.length * 124,
        }}
      >
        <div className="snapshot-corner" />
        {steps.map((step) => (
          <div key={step} className="snapshot-step-header">
            t = {step}
          </div>
        ))}

        {rows.map((row) => (
          <React.Fragment key={row.algorithm}>
            <div className="snapshot-row-label">
              <span className="arena-algo-badge">{row.name}</span>
              {row.error ? null : (
                <>
                  <small>
                    {t("arena.snapshots.return")} <strong>{row.episode_return.toFixed(1)}</strong>
                  </small>
                  {row.ended_at !== null && row.ended_at < maxSteps ? (
                    <small className="snapshot-ended">{t("arena.snapshots.ended", { step: row.ended_at })}</small>
                  ) : null}
                </>
              )}
            </div>
            {row.error ? (
              <div className="snapshot-row-error" style={{ gridColumn: `span ${steps.length}` }}>
                {row.error}
              </div>
            ) : (
              row.snapshots.map((snapshot, column) => {
                const isCleanest = cleanestByColumn[column] === snapshot.total_dirt;
                const endedEarly = snapshot.step_count < snapshot.requested_step;
                return (
                  <figure key={snapshot.requested_step} className={`snapshot-cell ${endedEarly ? "ended" : ""}`}>
                    <SimBoard
                      state={snapshot}
                      animate={false}
                      showEffects={false}
                      showLegend={false}
                      className="snapshot-board"
                      canvasClassName="snapshot-canvas"
                      ariaLabel={`${row.name}, t = ${snapshot.requested_step}`}
                    />
                    <figcaption>
                      <span
                        className={isCleanest ? "snapshot-dirt cleanest" : "snapshot-dirt"}
                        title={isCleanest ? t("arena.snapshots.cleanest") : undefined}
                      >
                        {t("arena.snapshots.dirt")} {snapshot.total_dirt}
                      </span>
                      <span>
                        {t("arena.snapshots.battery")} {snapshot.battery}
                      </span>
                    </figcaption>
                  </figure>
                );
              })
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
