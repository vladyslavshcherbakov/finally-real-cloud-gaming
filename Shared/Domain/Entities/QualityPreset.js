export const QUALITY_PRESETS = {
  low: { cellsAlongLongSide: 72, depthSlices: 16, renderScale: 0.5, mostFogLayerPixels: 200_000, samplesPerSlice: 1, particlesPerCell: 2 },
  medium: { cellsAlongLongSide: 104, depthSlices: 24, renderScale: 0.6, mostFogLayerPixels: 450_000, samplesPerSlice: 1, particlesPerCell: 2 },
  high: { cellsAlongLongSide: 144, depthSlices: 32, renderScale: 0.75, mostFogLayerPixels: 900_000, samplesPerSlice: 2, particlesPerCell: 3 },
};

export const PRESETS_FROM_LOWEST = ['low', 'medium', 'high'];

export const DEFAULT_PRESET = 'medium';

const GRID_CELL_MULTIPLE = 4;

export function gridSize(presetName, canvasAspect) {
  const { cellsAlongLongSide, depthSlices } = QUALITY_PRESETS[presetName];
  const cellsAlongShortSide = cellsAlongLongSide / Math.max(canvasAspect, 1 / canvasAspect);
  return canvasAspect >= 1
    ? [roundToCellMultiple(cellsAlongLongSide), roundToCellMultiple(cellsAlongShortSide), depthSlices]
    : [roundToCellMultiple(cellsAlongShortSide), roundToCellMultiple(cellsAlongLongSide), depthSlices];
}

function roundToCellMultiple(cells) {
  return Math.max(2 * GRID_CELL_MULTIPLE, Math.round(cells / GRID_CELL_MULTIPLE) * GRID_CELL_MULTIPLE);
}
