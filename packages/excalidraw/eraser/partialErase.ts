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

/**
 * Marks each element segment as "removed" when the eraser brush comes within
 * `brushRadius` of it, then derives the remaining runs (sub-polylines) by
 * splitting at the removed segments. This correctly erases the middle of a
 * line (not just near its points) and splits the element into separate parts.
 */
const getErasedRuns = (
  element: ExcalidrawElement,
  eraserPoints: Point[],
  brushRadius: number,
): { runs: number[][]; erasedAny: boolean } => {
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
        (p) => distanceToSegmentSq(p[0], p[1], element.x + points[0][0], element.y + points[0][1], element.x + points[0][0], element.y + points[0][1]) <= radiusSq,
      );
    return { runs: [], erasedAny };
  }

  const globalPts: Point[] = points.map((p) => [
    element.x + p[0],
    element.y + p[1],
  ]);

  const segKept: boolean[] = [];
  let removedAny = false;
  for (let i = 0; i < n - 1; i++) {
    const [ax, ay] = globalPts[i];
    const [bx, by] = globalPts[i + 1];
    let removed = false;
    for (const ep of eraserPoints) {
      if (distanceToSegmentSq(ep[0], ep[1], ax, ay, bx, by) <= radiusSq) {
        removed = true;
        break;
      }
    }
    if (removed) {
      removedAny = true;
    }
    segKept.push(!removed);
  }

  const runs: number[][] = [];
  let current: number[] = [0];
  for (let i = 0; i < n - 1; i++) {
    if (segKept[i]) {
      current.push(i + 1);
    } else {
      if (current.length >= 2) {
        runs.push(current);
      }
      current = [i + 1];
    }
  }
  if (current.length >= 2) {
    runs.push(current);
  }

  return { runs, erasedAny: removedAny };
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

  return runs.map((run) => {
    if (isFreeDrawElement(element)) {
      const freedraw = element as ExcalidrawFreeDrawElement;
      const points = run.map((i) => freedraw.points[i]);
      const pressures = run.map((i) => freedraw.pressures[i] ?? 0.5);
      return { ...newElementWith(freedraw, { points, pressures }), id: newId() };
    }
    const linear = element as ExcalidrawLinearElement;
    return {
      ...newElementWith(linear, { points: run.map((i) => linear.points[i]) }),
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
