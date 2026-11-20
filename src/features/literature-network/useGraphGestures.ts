import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, RefObject } from "react";
import type { Point, PositionedPaper } from "./relationshipLayout";

const RESET_VIEW = { zoom: 1, x: 0, y: 0 };
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
const DRAG_THRESHOLD = 5;

export function useGraphGestures(
  svg: RefObject<SVGSVGElement>, camera: RefObject<SVGGElement>, size: { width: number; height: number }, fit: number,
  onNodeDrag: (id: string, position: Point | null) => void,
) {
  const view = useRef(RESET_VIEW);
  const [zoom, setZoom] = useState(RESET_VIEW.zoom);
  const [changed, setChanged] = useState(false);
  const [dragging, setDragging] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ origin: Point; paper?: PositionedPaper; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const { width, height } = size;

  const applyView = useCallback((next: typeof RESET_VIEW) => {
    const previous = view.current;
    view.current = next;
    camera.current?.setAttribute("transform", `translate(${width / 2 + next.x} ${height / 2 + next.y})`);
    if (next.zoom !== previous.zoom) setZoom(next.zoom);
    const displaced = next.zoom !== 1 || next.x !== 0 || next.y !== 0;
    const wasDisplaced = previous.zoom !== 1 || previous.x !== 0 || previous.y !== 0;
    if (displaced !== wasDisplaced) setChanged(displaced);
  }, [camera, width, height]);

  useLayoutEffect(() => {
    applyView(view.current);
  }, [applyView]);

  useEffect(() => {
    const target = svg.current;
    if (!target) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = target.getBoundingClientRect();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
      const factor = Math.exp(Math.max(-0.65, Math.min(0.65, -event.deltaY * unit * 0.002)));
      const anchor = { x: event.clientX - rect.left - width / 2, y: event.clientY - rect.top - height / 2 };
      applyView(zoomView(view.current, factor, anchor, anchor));
    };
    target.addEventListener("wheel", onWheel, { passive: false });
    return () => target.removeEventListener("wheel", onWheel);
  }, [svg, width, height, applyView]);

  function begin(event: PointerEvent<SVGElement>, paper?: PositionedPaper) {
    if (event.button !== 0 || pointers.current.size >= 2 || (!event.isPrimary && event.pointerType !== "touch")) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size === 1) {
      suppressClick.current = false;
      gesture.current = { origin: point, paper, moved: false };
    } else {
      const previous = gesture.current;
      if (previous?.moved && previous.paper) onNodeDrag(previous.paper.id, null);
      gesture.current = { origin: point, moved: true };
      suppressClick.current = true;
      setDragging(true);
    }
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    const current = gesture.current;
    const previous = pointers.current.get(event.pointerId);
    if (!current || !previous) return;
    const point = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const other = Array.from(pointers.current.entries()).find(([id]) => id !== event.pointerId)?.[1];
      if (!other) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const before = { x: (previous.x + other.x - width) / 2 - rect.left, y: (previous.y + other.y - height) / 2 - rect.top };
      const after = { x: (point.x + other.x - width) / 2 - rect.left, y: (point.y + other.y - height) / 2 - rect.top };
      const factor = Math.max(1, Math.hypot(point.x - other.x, point.y - other.y))
        / Math.max(1, Math.hypot(previous.x - other.x, previous.y - other.y));
      applyView(zoomView(view.current, factor, before, after));
    } else {
      if (!current.moved) {
        if (Math.hypot(point.x - current.origin.x, point.y - current.origin.y) < DRAG_THRESHOLD) return;
        current.moved = true;
        suppressClick.current = true;
        setDragging(true);
      }
      if (current.paper) {
        const { id, x, y } = current.paper;
        const scale = view.current.zoom * fit;
        onNodeDrag(id, {
          x: x + (point.x - current.origin.x) / scale,
          y: y + (point.y - current.origin.y) / scale,
        });
      } else {
        const { x, y, zoom } = view.current;
        applyView({ zoom, x: x + point.x - previous.x, y: y + point.y - previous.y });
      }
    }
    pointers.current.set(event.pointerId, point);
  }

  function end(event: PointerEvent<SVGSVGElement>) {
    if (!pointers.current.delete(event.pointerId)) return;
    if (pointers.current.size === 0) {
      const current = gesture.current;
      if (current?.moved && current.paper) onNodeDrag(current.paper.id, null);
      gesture.current = null;
      setDragging(false);
    }
  }

  function cancelDragClick(event: MouseEvent<SVGSVGElement>) {
    if (event.detail > 0 && suppressClick.current) {
      event.stopPropagation();
      suppressClick.current = false;
    }
  }

  function zoomBy(factor: number) {
    const center = { x: 0, y: 0 };
    applyView(zoomView(view.current, factor, center, center));
  }

  function bringIntoView(point: Point) {
    if (gesture.current) return;
    const current = view.current;
    const scale = fit * current.zoom;
    const x = point.x * scale + current.x;
    const y = point.y * scale + current.y;
    if (Math.abs(x) < width / 2 - 26 && Math.abs(y) < height / 2 - 26) return;
    applyView({ ...current, x: -point.x * scale, y: -point.y * scale });
  }

  function reset() {
    applyView(RESET_VIEW);
  }

  return {
    zoom, dragging, begin, move, end, cancelDragClick, zoomBy, bringIntoView, reset, changed,
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
  };
}

function zoomView(current: typeof RESET_VIEW, factor: number, before: Point, after: Point) {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, current.zoom * factor));
  const ratio = zoom / current.zoom;
  return { zoom, x: after.x + (current.x - before.x) * ratio, y: after.y + (current.y - before.y) * ratio };
}
