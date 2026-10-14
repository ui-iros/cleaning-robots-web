const DEFAULT_API_URL =
  typeof window === "undefined" || window.location.port === "5173"
    ? `http://${typeof window === "undefined" ? "localhost" : window.location.hostname || "localhost"}:8000`
    : window.location.origin;

export const API_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(/\/$/, "");

export function websocketUrl(path) {
  const url = new URL(API_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  return url.toString();
}

export function arenaWebsocketUrl() {
  return websocketUrl("/ws/arena");
}

export async function fetchAlgorithms() {
  const response = await fetch(`${API_URL}/algorithms`);
  if (!response.ok) {
    throw new Error(`Failed to load algorithms: ${response.status}`);
  }
  return response.json();
}

export async function resetEpisode(algorithm) {
  const response = await fetch(`${API_URL}/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ algorithm }),
  });
  if (!response.ok) {
    throw new Error(`Failed to reset episode: ${response.status}`);
  }
  return response.json();
}

export async function fetchSnapshots({ algorithms, seed, steps }) {
  const response = await fetch(`${API_URL}/arena/snapshots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ algorithms, seed, steps }),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => null);
    throw new Error(detail?.detail || `Failed to load snapshots: ${response.status}`);
  }
  return response.json();
}
