import { useLayoutEffect, useRef, useState } from "react";
import {
  settleRelationshipSimulation, snapshotRelationshipPositions, startRelationshipSimulation, stepRelationshipSimulation,
} from "./relationshipLayout";
import type { Point, PositionedPaper, RelationshipLayout } from "./relationshipLayout";

interface GraphPositions {
  labelAnchors: PositionedPaper[];
  moved: boolean;
}

export function useRelationshipPositions(layout: RelationshipLayout) {
  const [positions, setPositions] = useState<GraphPositions>(() => ({ labelAnchors: layout.points, moved: false }));
  const livePoints = useRef<readonly PositionedPaper[]>(layout.points);
  const paint = useRef<((points: readonly PositionedPaper[]) => void) | null>(null);
  const controls = useRef<{ drag: (id: string, position: Point | null) => void; reset: () => void } | null>(null);

  useLayoutEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let simulation = startRelationshipSimulation(layout);
    let frame: number | null = null;
    let moved = false;
    let settledHome: PositionedPaper[] | null = null;

    function publish(settled: boolean) {
      livePoints.current = simulation.points;
      paint.current?.(simulation.points);
      if (settled) {
        const anchors = snapshotRelationshipPositions(simulation);
        if (!moved) settledHome = anchors;
        setPositions({ labelAnchors: anchors, moved });
      }
    }

    function advanceLayout() {
      frame = null;
      const active = stepRelationshipSimulation(simulation);
      publish(!active && !simulation.pinned);
      if (active) frame = requestAnimationFrame(advanceLayout);
    }

    function updateMotion() {
      if (!motion.matches) return;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      settleRelationshipSimulation(simulation);
      publish(!simulation.pinned);
    }

    controls.current = {
      drag(id, position) {
        if (position) {
          const point = simulation.points.find((candidate) => candidate.id === id);
          if (!point) return;
          simulation.pinned = point;
          point.x = position.x;
          point.y = position.y;
          point.vx = 0;
          point.vy = 0;
          if (!moved) {
            moved = true;
            setPositions((previous) => ({ ...previous, moved: true }));
          }
          simulation.temperature = 1;
          if (motion.matches) publish(false);
        } else {
          if (simulation.pinned?.id !== id) return;
          simulation.pinned = null;
          simulation.temperature = 1;
          if (motion.matches) {
            settleRelationshipSimulation(simulation);
            publish(true);
          }
        }
        if (!motion.matches && frame === null) frame = requestAnimationFrame(advanceLayout);
      },
      reset() {
        if (!moved) return;
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        simulation = startRelationshipSimulation(layout);
        moved = false;
        if (settledHome) {
          for (const [index, point] of simulation.points.entries()) Object.assign(point, settledHome[index]);
          simulation.temperature = 0;
        } else {
          settleRelationshipSimulation(simulation);
        }
        publish(true);
      },
    };
    if (motion.matches) {
      updateMotion();
    } else {
      livePoints.current = simulation.points;
      paint.current?.(simulation.points);
      setPositions({ labelAnchors: layout.points, moved: false });
      if (simulation.points.length > 1) frame = requestAnimationFrame(advanceLayout);
    }
    motion.addEventListener("change", updateMotion);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      motion.removeEventListener("change", updateMotion);
      controls.current = null;
    };
  }, [layout]);

  return { ...positions, livePoints, paint, controls };
}
