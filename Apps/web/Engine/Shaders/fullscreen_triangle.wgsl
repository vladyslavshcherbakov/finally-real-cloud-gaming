struct FullscreenVertex {
  @builtin(position) position: vec4f,
  @location(0) canvasUv: vec2f,
}

@vertex
fn fullscreenVertex(@builtin(vertex_index) vertexIndex: u32) -> FullscreenVertex {
  let corner = vec2f(f32((vertexIndex << 1u) & 2u), f32(vertexIndex & 2u));
  return FullscreenVertex(vec4f(corner * 2.0 - 1.0, 0.0, 1.0), vec2f(corner.x, 1.0 - corner.y));
}
