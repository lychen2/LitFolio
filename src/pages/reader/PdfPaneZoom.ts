export type PdfZoom = number | "page-width";

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.4;
const WHEEL_ZOOM_FACTOR = 0.0015;

export const ZOOM_STEP = 0.15;
export const DEFAULT_ZOOM = 1;

export function nextZoom(current: PdfZoom, delta: number): number {
  const base = current === "page-width" ? DEFAULT_ZOOM : current;
  const value = Math.round((base + delta) * 100) / 100;
  return clampZoom(value);
}

export function wheelZoom(current: PdfZoom, deltaY: number): number {
  const base = current === "page-width" ? DEFAULT_ZOOM : current;
  const value = base * Math.exp(-deltaY * WHEEL_ZOOM_FACTOR);
  return clampZoom(value);
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}
