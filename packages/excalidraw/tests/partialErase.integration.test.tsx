import React from "react";

import { pointFrom } from "@excalidraw/math";

import { Excalidraw } from "../index";
import { API } from "./helpers/api";
import { UI } from "./helpers/ui";
import {
  render,
  fireEvent,
  act,
  mockBoundingClientRect,
  restoreOriginalGetBoundingClientRect,
} from "./test-utils";

const { h } = window;

afterEach(() => restoreOriginalGetBoundingClientRect());

describe("partial eraser (integration)", () => {
  it("splits a line brushed across the middle", async () => {
    const { container } = await render(<Excalidraw />);
    mockBoundingClientRect({
      left: 0,
      top: 0,
      width: 800,
      height: 600,
    });

    // a line from (0,0) to (100,0), with a midpoint
    UI.createElement("line", {
      x: 0,
      y: 0,
      points: [
        pointFrom(0, 0),
        pointFrom(50, 0),
        pointFrom(100, 0),
      ],
    });

    expect(
      h.app.scene.getElementsIncludingDeleted().filter((e) => !e.isDeleted)
        .length,
    ).toBe(1);

    // force a render so `visibleElements` (used by the eraser
    // detection) reflects the scene
    act(() => {
      h.app.refresh();
    });

    act(() => {
      h.app.setActiveTool({ type: "eraser", mode: "partial" });
    });

    const canvas = container.querySelector("canvas.interactive")!;
    // brush across the middle of the line (and a little past both ends)
    fireEvent.pointerDown(canvas, { clientX: 20, clientY: 0 });
    fireEvent.pointerMove(canvas, { clientX: 80, clientY: 0 });

    const trail = (h.app as any).eraserTrail.getCurrentTrail();
    const eraserPoints = trail
      ? trail.originalPoints.map((p: number[]) => [p[0], p[1]])
      : [];

    // exercise the same path pointer-up would (the window pointer-up
    // listener is unreliable under jsdom synthetic events)
    await act(async () => {
      await (h.app as any).eraseElements(eraserPoints);
    });

    const live = h.app.scene
      .getElementsIncludingDeleted()
      .filter((e) => !e.isDeleted);
    const deleted = h.app.scene
      .getElementsIncludingDeleted()
      .filter((e) => e.isDeleted);

    expect(deleted.length).toBeGreaterThan(0);
    // original line removed, two pieces remain
    expect(live.length).toBe(2);
  });
});
