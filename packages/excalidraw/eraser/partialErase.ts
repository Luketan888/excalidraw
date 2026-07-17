export type Point = [number, number];

export const getEraserPoints = (
  originalPoints: ReadonlyArray<readonly [number, number, number]> | undefined,
): Point[] => {
  if (!originalPoints) {
    return [];
  }
  return originalPoints.map((p) => [p[0], p[1]]);
};
