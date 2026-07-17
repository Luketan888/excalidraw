import { newFreeDrawElement } from "@excalidraw/element";
import type { ExcalidrawFreeDrawElement } from "@excalidraw/element/types";
import { getVectorErasedElements, type Point } from "../eraser/partialErase";

const makeLine = (points: [number, number][]) =>
  newFreeDrawElement({
    type: "freedraw",
    x: 0,
    y: 0,
    points: points.map(([x, y]) => [x, y]) as unknown as ExcalidrawFreeDrawElement["points"],
    pressures: points.map(() => 0.5),
    simulatePressure: false,
  });

const erased = (line: ExcalidrawFreeDrawElement, eraser: Point[]) =>
  getVectorErasedElements(line, eraser, 8);

describe("getVectorErasedElements", () => {
  it("splits a line when brushed slowly (dense points)", () => {
    const line = makeLine([
      [0, 0],
      [25, 0],
      [50, 0],
      [75, 0],
      [100, 0],
    ]);
    const eraser: Point[] = [
      [40, 0],
      [45, 10],
      [50, 0],
      [55, -5],
      [60, 0],
    ];
    const result = erased(line, eraser);
    expect(result).not.toBeNull();
    // middle removed -> two remaining runs
    expect(result!.length).toBe(2);
  });

  it("splits a line when brushed FAST (sparse points crossing it)", () => {
    const line = makeLine([
      [0, 0],
      [25, 0],
      [50, 0],
      [75, 0],
      [100, 0],
    ]);
    // eraser jumps from (10, -40) to (90, 40): a stroke that crosses the
    // line between two far-apart sample points. The old code only tested
    // individual eraser points and missed this.
    const eraser: Point[] = [
      [10, -40],
      [90, 40],
    ];
    const result = erased(line, eraser);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    const runs = result! as ExcalidrawFreeDrawElement[];
    expect(runs[0].points[0]).toEqual([0, 0]);
    expect(runs[1].points.at(-1)).toEqual([100, 0]);
  });

  it("returns null when the brush misses the line", () => {
    const line = makeLine([
      [0, 0],
      [50, 0],
      [100, 0],
    ]);
    const result = erased(line, [[0, 100]] as Point[]);
    expect(result).toBeNull();
  });

  it("erases the whole element when fully covered", () => {
    const line = makeLine([
      [0, 0],
      [50, 0],
      [100, 0],
    ]);
    const result = erased(line, [
      [0, 0],
      [100, 0],
    ] as Point[]);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(0);
  });
});
