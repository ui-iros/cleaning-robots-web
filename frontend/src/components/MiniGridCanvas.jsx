import React from "react";
import SimBoard from "./SimBoard.jsx";

export default function MiniGridCanvas({ state, stepIntervalMs }) {
  return (
    <SimBoard
      state={state}
      stepIntervalMs={stepIntervalMs}
      className="mini-grid-wrap"
      canvasClassName="mini-grid-canvas"
      ariaLabel={`Mini grid for ${state?.algorithm || "algorithm"}`}
    />
  );
}
