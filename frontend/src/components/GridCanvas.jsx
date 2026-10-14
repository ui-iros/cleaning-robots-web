import React from "react";
import SimBoard from "./SimBoard.jsx";

export default function GridCanvas({ state, stepIntervalMs }) {
  return (
    <SimBoard
      state={state}
      stepIntervalMs={stepIntervalMs}
      className="board-shell"
      canvasClassName="h-full w-full"
      ariaLabel="Vacuum grid simulation"
    />
  );
}
