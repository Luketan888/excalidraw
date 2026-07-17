let eraserSize = 5;

export const MIN_ERASER_SIZE = 1;
export const MAX_ERASER_SIZE = 50;

export const getEraserSize = () => eraserSize;

export const setEraserSize = (size: number) => {
  eraserSize = Math.min(MAX_ERASER_SIZE, Math.max(MIN_ERASER_SIZE, size));
};
