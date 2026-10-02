//#include fullscreen_triangle

const SPEED_DISPLAY_SCALE = 0.02;
const SOLID_COLOUR = vec3f(1.0, 0.55, 0.2);
const FOG_DISPLAY_TINT = vec3f(0.9, 0.95, 1.0);

fn linearToSrgb(colour: vec3f) -> vec3f {
  let darkPart = colour * 12.92;
  let brightPart = 1.055 * pow(colour, vec3f(1.0 / 2.4)) - 0.055;
  return select(brightPart, darkPart, colour <= vec3f(0.0031308));
}

fn sliceUvw(canvasUv: vec2f, slice: i32) -> vec3f {
  return vec3f(canvasUv, (f32(slice) + 0.5) / params.gridDepth);
}

fn averageThroughSlices(canvasUv: vec2f, showSpeed: bool) -> vec3f {
  var sum = vec3f(0.0);
  for (var slice = 0; slice < i32(params.gridDepth); slice++) {
    if (showSpeed) {
      sum += abs(textureSampleLevel(velocity, clampSampler, sliceUvw(canvasUv, slice), 0.0).xyz) * SPEED_DISPLAY_SCALE;
    } else {
      sum += vec3f(textureSampleLevel(fog, clampSampler, sliceUvw(canvasUv, slice), 0.0).r) * FOG_DISPLAY_TINT;
    }
  }
  return sum / params.gridDepth;
}

fn nearestSolid(canvasUv: vec2f) -> f32 {
  var nearness = 0.0;
  for (var slice = 0; slice < i32(params.gridDepth); slice++) {
    let solidFraction = textureSampleLevel(solids, clampSampler, sliceUvw(canvasUv, slice), 0.0).r;
    nearness = max(nearness, solidFraction * (1.0 - f32(slice) / params.gridDepth));
  }
  return nearness;
}

fn viewColour(canvasUv: vec2f, photoColour: vec3f) -> vec3f {
  switch (i32(params.debugView)) {
    case DEBUG_VIEW_PHOTO: { return photoColour; }
    case DEBUG_VIEW_DEPTH: {
      let nearness = 1.0 - textureSampleLevel(sceneDepth, clampSampler, photoUv(canvasUv), 0.0).r;
      return vec3f(nearness * nearness);
    }
    case DEBUG_VIEW_FOG_DENSITY: { return averageThroughSlices(canvasUv, false); }
    case DEBUG_VIEW_VELOCITY: { return averageThroughSlices(canvasUv, true); }
    case DEBUG_VIEW_SOLIDS: { return mix(photoColour * 0.3, SOLID_COLOUR, nearestSolid(canvasUv)); }
    case DEBUG_VIEW_FINAL, default: {
      let fogLight = textureSampleLevel(fogLayer, clampSampler, canvasUv, 0.0);
      return photoColour * fogLight.a + fogLight.rgb * params.exposure;
    }
  }
}

fn ditherOffset(pixel: vec2f) -> f32 {
  return (fract(sin(dot(pixel, vec2f(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
}

@fragment
fn main(vertex: FullscreenVertex) -> @location(0) vec4f {
  let photoColour = textureSampleLevel(photo, clampSampler, photoUv(vertex.canvasUv), 0.0).rgb;
  let colour = viewColour(vertex.canvasUv, photoColour);
  return vec4f(linearToSrgb(max(colour, vec3f(0.0))) + ditherOffset(vertex.position.xy), 1.0);
}
