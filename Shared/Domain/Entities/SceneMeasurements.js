const SHORTEST_FOG_REACH_METRES = 120;
const LONGEST_FOG_REACH_METRES = 800;
const FOG_REACH_BEYOND_FARTHEST_SURFACE = 1.6;
const FARTHEST_SURFACE_PERCENTILE = 0.99;
const SKY_DEPTH_SHARE = 0.99;
const GROUND_ROWS_SHARE = 0.25;
const BRIGHTEST_PIXELS_SHARE = 0.01;

export class SceneMeasurements {
  constructor({ skyColor, groundColor, sunColor, fogReachMetres }) {
    this.skyColor = skyColor;
    this.groundColor = groundColor;
    this.sunColor = sunColor;
    this.fogReachMetres = fogReachMetres;
  }
}

export function measureScene({ linearPixels, width, height, depthMetresAt, skyDepthMetres }) {
  const isSky = (x, y) => depthMetresAt((x + 0.5) / width, (y + 0.5) / height) >= skyDepthMetres * SKY_DEPTH_SHARE;
  const skyPixels = [];
  const topRowPixels = [];
  const groundPixels = [];
  const allPixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = linearPixels[y * width + x];
      allPixels.push(pixel);
      if (isSky(x, y)) skyPixels.push(pixel);
      if (y < height * GROUND_ROWS_SHARE) topRowPixels.push(pixel);
      if (y >= height * (1 - GROUND_ROWS_SHARE)) groundPixels.push(pixel);
    }
  }
  return new SceneMeasurements({
    skyColor: averageColor(skyPixels.length > 0 ? skyPixels : topRowPixels),
    groundColor: averageColor(groundPixels),
    sunColor: colorOfBrightestPixels(allPixels),
    fogReachMetres: fogReachMetres(surfaceDepths(width, height, depthMetresAt, skyDepthMetres)),
  });
}

function surfaceDepths(width, height, depthMetresAt, skyDepthMetres) {
  const depths = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const depthMetres = depthMetresAt((x + 0.5) / width, (y + 0.5) / height);
      if (depthMetres < skyDepthMetres * SKY_DEPTH_SHARE) depths.push(depthMetres);
    }
  }
  return depths;
}

function fogReachMetres(surfaceDepthsMetres) {
  if (surfaceDepthsMetres.length === 0) return LONGEST_FOG_REACH_METRES;
  const nearestFirst = [...surfaceDepthsMetres].sort((a, b) => a - b);
  const farthestSurfaceMetres = nearestFirst[Math.floor((nearestFirst.length - 1) * FARTHEST_SURFACE_PERCENTILE)];
  return Math.min(LONGEST_FOG_REACH_METRES, Math.max(SHORTEST_FOG_REACH_METRES, farthestSurfaceMetres * FOG_REACH_BEYOND_FARTHEST_SURFACE));
}

function averageColor(pixels) {
  const sum = pixels.reduce((total, [red, green, blue]) => [total[0] + red, total[1] + green, total[2] + blue], [0, 0, 0]);
  return sum.map((channel) => channel / pixels.length);
}

function colorOfBrightestPixels(pixels) {
  const luminance = ([red, green, blue]) => red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const brightestFirst = [...pixels].sort((a, b) => luminance(b) - luminance(a));
  const brightest = brightestFirst.slice(0, Math.max(8, Math.floor(pixels.length * BRIGHTEST_PIXELS_SHARE)));
  const brightestAverage = averageColor(brightest);
  const peakChannel = Math.max(...brightestAverage, 1e-4);
  return brightestAverage.map((channel) => channel / peakChannel);
}
