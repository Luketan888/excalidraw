import {
  getElementBounds,
  isArrowElement,
  isFreeDrawElement,
  isLinearElement,
  newElementWith,
  newImageElement,
} from "@excalidraw/element";

import type {
  ExcalidrawElement,
  ExcalidrawFreeDrawElement,
  ExcalidrawImageElement,
  ExcalidrawLinearElement,
  ElementsMap,
  NonDeleted,
} from "@excalidraw/element/types";

import { exportToCanvas } from "../scene/export";
import { MIME_TYPES, randomId } from "@excalidraw/common";

import type { AppState, BinaryFileData, BinaryFiles, DataURL } from "../types";

export type Point = [number, number];

const distanceToSegmentSq = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number => {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ddx = px - cx;
  const ddy = py - cy;
  return ddx * ddx + ddy * ddy;
};

type ClipPoint = { x: number; y: number; idx: number };
// `idx` is the original element-point index when this point IS an original
// vertex; otherwise -1 (a freshly computed brush-crossing point).

/**
 * Trims one element segment [A,B] (global coords, segment index `i`) against
 * the eraser stroke. Returns the kept sub-polyline (global points).
 * The eraser is treated as a polyline of segments + circles around its
 * points, so:
 *   - a segment fully inside the brush is dropped,
 *   - a segment fully outside is kept whole,
 *   - a segment crossing the brush is split at the crossing, keeping the
 *     outside fragments.
 * This is what makes a "paint" erase leave the un-brushed parts
 * of a line/shape intact instead of deleting whole segments (which made
 * short lines vanish when brushed in the middle).
 */
const clipSegment = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  i: number,
  radiusSq: number,
  distToStrokeSq: (x: number, y: number) => number,
): { points: ClipPoint[]; anyCrossing: boolean } => {
  const len = Math.hypot(bx - ax, by - ay);
  const steps = Math.max(1, Math.ceil(len / 2));
  const out: ClipPoint[] = [];
  let prevInside: boolean | null = null;
  let anyCrossing = false;

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const px = ax + t * (bx - ax);
    const py = ay + t * (by - ay);
    const inside = distToStrokeSq(px, py) <= radiusSq;

    if (s === 0) {
      if (!inside) {
        out.push({ x: px, y: py, idx: i });
      }
    } else {
      if (prevInside !== null && inside !== prevInside) {
        anyCrossing = true;
        const tc = (s - 0.5) / steps;
        out.push({
          x: ax + tc * (bx - ax),
          y: ay + tc * (by - ay),
          idx: -1,
        });
      }
      if (!inside) {
        out.push({ x: px, y: py, idx: s === steps ? i + 1 : -1 });
      }
    }
    prevInside = inside;
  }

  // Fully outside, no crossing: keep the whole segment (exact endpoints,
  // avoid re-sampling into many points).
  if (!anyCrossing && out.length > 0) {
    return {
      points: [
        { x: ax, y: ay, idx: i },
        { x: bx, y: by, idx: i + 1 },
      ],
      anyCrossing: false,
    };
  }

  return { points: out, anyCrossing };
};

/**
 * Builds the kept runs (sub-polylines) of an element after the eraser
 * brush is applied. Splits each segment at the brush crossing so the
 * un-brushed parts survive, and derives the remaining runs by chaining
 * consecutive kept fragments.
 *
 * Returns runs in GLOBAL coordinates (each a ClipPoint[]).
 */
const getErasedRuns = (
  element: ExcalidrawElement,
  eraserPoints: Point[],
  brushRadius: number,
): { runs: ClipPoint[][]; erasedAny: boolean } => {
  const points =
    isFreeDrawElement(element) || isLinearElement(element)
      ? (element as ExcalidrawFreeDrawElement | ExcalidrawLinearElement).points
      : [];
  const n = points.length;
  const radiusSq = brushRadius * brushRadius;

  if (n < 2) {
    const erasedAny =
      n === 1 &&
      eraserPoints.some(
        (p) =>
          distanceToSegmentSq(
            p[0],
            p[1],
            element.x + points[0][0],
            element.y + points[0][1],
            element.x + points[0][0],
            element.y + points[0][1],
          ) <= radiusSq,
      );
    return { runs: [], erasedAny };
  }

  const globalPts: Point[] = points.map((p) => [
    element.x + p[0],
    element.y + p[1],
  ]);

  // Eraser stroke: segments between consecutive points + per-point circles.
  const eraserSegments: [number, number, number, number][] = [];
  for (let i = 1; i < eraserPoints.length; i++) {
    eraserSegments.push([
      eraserPoints[i - 1][0],
      eraserPoints[i - 1][1],
      eraserPoints[i][0],
      eraserPoints[i][1],
    ]);
  }

  const distToStrokeSq = (qx: number, qy: number): number => {
    let best = Infinity;
    for (const ep of eraserPoints) {
      best = Math.min(best, distanceToSegmentSq(qx, qy, ep[0], ep[1], ep[0], ep[1]));
    }
    for (const [cx, cy, dx, dy] of eraserSegments) {
      best = Math.min(best, distanceToSegmentSq(qx, qy, cx, cy, dx, dy));
    }
    return best;
  };

  const runs: ClipPoint[][] = [];
  let current: ClipPoint[] = [];
  let erasedAny = false;
  const mergeEps = 2; // px, ~ sampling step

  for (let i = 0; i < n - 1; i++) {
    const [ax, ay] = globalPts[i];
    const [bx, by] = globalPts[i + 1];
    const { points: kept, anyCrossing } = clipSegment(
      ax,
      ay,
      bx,
      by,
      i,
      radiusSq,
      distToStrokeSq,
    );

    if (kept.length === 0) {
      erasedAny = true;
      if (current.length >= 2) {
        runs.push(current);
      }
      current = [];
      continue;
    }

    if (anyCrossing) {
      erasedAny = true;
    }

    if (current.length > 0) {
      const last = current[current.length - 1];
      const first = kept[0];
      if (Math.hypot(last.x - first.x, last.y - first.y) > mergeEps) {
        if (current.length >= 2) {
          runs.push(current);
        }
        current = [];
      }
    }
    if (current.length === 0) {
      current = [kept[0]];
    }
    for (let k = 1; k < kept.length; k++) {
      current.push(kept[k]);
    }
  }

  if (current.length >= 2) {
    runs.push(current);
  }

  return { runs, erasedAny };
};

export const isVectorErasable = (element: ExcalidrawElement) => {
  if (isFreeDrawElement(element) || isLinearElement(element)) {
    // bound arrows would break their bindings when split, so treat them as
    // raster-erasable (whole element) instead
    if (isArrowElement(element) && (element.startBinding || element.endBinding)) {
      return false;
    }
    return true;
  }
  return false;
};

/**
 * Splits a freehand/linear element into the remaining (non-erased) runs.
 * Returns `null` when nothing was erased, `[]` when fully erased, or the
 * array of remaining segments (each with a fresh id) otherwise.
 *
 * Pressure for original vertices is preserved; freshly cut points use a
 * neutral pressure (visually negligible for the cut edge).
 */
export const getVectorErasedElements = (
  element: ExcalidrawElement,
  eraserPoints: Point[],
  brushRadius: number,
): ExcalidrawElement[] | null => {
  const { runs, erasedAny } = getErasedRuns(element, eraserPoints, brushRadius);

  if (!erasedAny) {
    return null;
  }

  if (runs.length === 0) {
    return [];
  }

  const newId = () => randomId() as ExcalidrawElement["id"];

  const pressuresFor = (run: ClipPoint[]): number[] => {
    const freedraw = element as ExcalidrawFreeDrawElement;
    return run.map((p) =>
      p.idx >= 0 ? (freedraw.pressures?.[p.idx] ?? 0.5) : 0.5,
    );
  };

  return runs.map((run) => {
    const relPoints = run.map(
      (p) => [p.x - element.x, p.y - element.y],
    ) as unknown as ExcalidrawFreeDrawElement["points"];
    if (isFreeDrawElement(element)) {
      const freedraw = element as ExcalidrawFreeDrawElement;
      return {
        ...newElementWith(freedraw, {
          points: relPoints,
          pressures: pressuresFor(run),
        }),
        id: newId(),
      };
    }
    const linear = element as ExcalidrawLinearElement;
    return {
      ...newElementWith(linear, { points: relPoints }),
      id: newId(),
    };
  });
};

export type RasterEraseResult = {
  image: NonDeleted<ExcalidrawImageElement>;
  file: BinaryFileData;
};

/**
 * Renders the element to an offscreen canvas, erases the pixels touched by the
 * eraser brush, and returns a new image element (plus its file) to replace it.
 * Returns `null` when the whole element was erased.
 */
export const rasterEraseElement = async (
  element: ExcalidrawElement,
  elementsMap: ElementsMap,
  files: BinaryFiles,
  appState: AppState,
  eraserPoints: Point[],
  brushRadius: number,
): Promise<RasterEraseResult | null> => {
  const bounds = getElementBounds(element, elementsMap);
  const [minX, minY, maxX, maxY] = bounds;
  const pad = Math.ceil(brushRadius) + 8;
  const scale = 2;

  const createCanvas = (width: number, height: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = width * scale;
    canvas.height = height * scale;
    return { canvas, scale };
  };

  const canvas = await exportToCanvas(
    [element as NonDeleted<ExcalidrawElement>],
    appState,
    files,
    {
      exportBackground: false,
      exportPadding: pad,
      viewBackgroundColor: "transparent",
    },
    createCanvas,
  );

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const toX = (sx: number) => (sx - minX + pad) * scale;
  const toY = (sy: number) => (sy - minY + pad) * scale;

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#000";
  ctx.lineWidth = brushRadius * 2 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (eraserPoints.length > 1) {
    ctx.beginPath();
    eraserPoints.forEach((p, i) => {
      const cx = toX(p[0]);
      const cy = toY(p[1]);
      if (i === 0) {
        ctx.moveTo(cx, cy);
      } else {
        ctx.lineTo(cx, cy);
      }
    });
    ctx.stroke();
  }
  eraserPoints.forEach((p) => {
    ctx.beginPath();
    ctx.arc(toX(p[0]), toY(p[1]), brushRadius * scale, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // detect whether anything is left
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let hasContent = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) {
      hasContent = true;
      break;
    }
  }
  if (!hasContent) {
    return null;
  }

  const dataURL = canvas.toDataURL(MIME_TYPES.png) as DataURL;
  const fileId = randomId() as BinaryFileData["id"];
  const file: BinaryFileData = {
    mimeType: MIME_TYPES.png,
    id: fileId,
    dataURL,
    created: Date.now(),
  };

  const image = newImageElement({
    type: "image",
    x: minX - pad,
    y: minY - pad,
    width: canvas.width / scale,
    height: canvas.height / scale,
    opacity: element.opacity,
    fileId,
    status: "saved",
  });

  return { image, file };
};

export const getEraserPoints = (
  originalPoints: ReadonlyArray<readonly [number, number, number]> | undefined,
): Point[] => {
  if (!originalPoints) {
    return [];
  }
  return originalPoints.map((p) => [p[0], p[1]]);
};

export const isRasterErasable = (element: NonDeleted<ExcalidrawElement>) =>
  !isVectorErasable(element);
