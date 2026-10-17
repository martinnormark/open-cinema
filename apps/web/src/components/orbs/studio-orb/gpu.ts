import { d, std, tgpu } from "typegpu";

/*
 * Studio Orb: an original shader written for Open Cinema (MIT, see LICENSE).
 *
 * A lit sphere whose surface carries a slow, domain-warped 3D value-noise
 * field. The field is thresholded into soft pools of warm light that sit over a
 * dark base, then shaded with a key light, a specular glint and a Fresnel rim.
 * Idle drifts gently; thinking warps harder, flows faster and breathes.
 */

export const studioOrbParams = d.struct({
  anim: d.f32,
  c_base: d.vec3f,
  c_light: d.vec3f,
  inputVol: d.f32,
  outputVol: d.f32,
  p_breath: d.f32,
  p_coverage: d.f32,
  p_flow: d.f32,
  p_gain: d.f32,
  p_radius: d.f32,
  p_rim: d.f32,
  p_scale: d.f32,
  p_softness: d.f32,
  p_spin: d.f32,
  p_warp: d.f32,
  res: d.vec2f,
  time: d.f32,
});

const layout = tgpu
  .bindGroupLayout({
    params: { uniform: studioOrbParams },
  })
  .$idx(0);

/** Pseudo-random 0..1 per integer lattice point. */
const lattice = tgpu.fn(
  [d.vec3f],
  d.f32,
)((p) => {
  "use gpu";
  const h = std.dot(p, d.vec3f(41.3, 289.1, 157.7));
  return std.fract(std.sin(h) * 24_634.6345);
});

/** Trilinear value noise with a quintic fade, 0..1. */
const valueNoise = tgpu.fn(
  [d.vec3f],
  d.f32,
)((p) => {
  "use gpu";
  const cell = std.floor(p);
  const t = std.fract(p);
  // 6t^5 - 15t^4 + 10t^3: C2-continuous so the light pools have no creases.
  const s = t
    .mul(t)
    .mul(t)
    .mul(t.mul(t.mul(6).sub(15)).add(10));
  const x00 = std.mix(lattice(cell), lattice(cell.add(d.vec3f(1, 0, 0))), s.x);
  const x10 = std.mix(
    lattice(cell.add(d.vec3f(0, 1, 0))),
    lattice(cell.add(d.vec3f(1, 1, 0))),
    s.x,
  );
  const x01 = std.mix(
    lattice(cell.add(d.vec3f(0, 0, 1))),
    lattice(cell.add(d.vec3f(1, 0, 1))),
    s.x,
  );
  const x11 = std.mix(
    lattice(cell.add(d.vec3f(0, 1, 1))),
    lattice(cell.add(d.vec3f(1, 1, 1))),
    s.x,
  );
  return std.mix(std.mix(x00, x10, s.y), std.mix(x01, x11, s.y), s.z);
});

/** Three unrolled octaves; each octave is rotated off-axis to hide the grid. */
const layered = tgpu.fn(
  [d.vec3f],
  d.f32,
)((p) => {
  "use gpu";
  const a = valueNoise(p);
  const q = d.vec3f(p.y + p.z, p.z - p.x, p.x + p.y).mul(1.31);
  const b = valueNoise(q.add(d.vec3f(5.2, 1.7, 9.4)));
  const r = d.vec3f(q.y - q.z, q.x + q.z, q.y - q.x).mul(1.27);
  const c = valueNoise(r.add(d.vec3f(2.8, 7.1, 3.6)));
  return a * 0.55 + b * 0.3 + c * 0.15;
});

const studioOrbFragment = tgpu
  .fragmentFn({
    in: { uv: d.vec2f },
    out: d.vec4f,
  })((input) => {
    "use gpu";
    const u = layout.$.params;

    // Centred, aspect-correct coordinates where the sphere has radius 1.
    const side = std.min(u.res.x, u.res.y);
    const centred = input.uv
      .mul(u.res)
      .sub(u.res.mul(0.5))
      .div(side * 0.5);
    const p = centred.div(std.max(u.p_radius, 0.1));
    const r = std.length(p);

    // One device pixel of antialiasing on the silhouette.
    const edge = 2 / (side * std.max(u.p_radius, 0.1));
    const mask = 1 - std.smoothstep(1 - edge, 1, r);

    // Sphere normal; uv.y grows downward, so flip it to make +y point up.
    const z = std.sqrt(std.max(1 - r * r, 0));
    const n = d.vec3f(p.x, -p.y, z);

    // Turn the sampling point around the vertical axis so the field rolls.
    const ca = std.cos(u.p_spin);
    const sa = std.sin(u.p_spin);
    const s = d
      .vec3f(ca * n.x + sa * n.z, n.y, ca * n.z - sa * n.x)
      .mul(u.p_scale);

    // Domain warp: a coarse field nudges where the fine field is read.
    const drift = d.vec3f(0.31, -0.17, 0.23).mul(u.p_flow);
    const bend = layered(s.mul(0.6).add(drift));
    const field = layered(
      s.add(d.vec3f(bend, bend * 0.7, -bend).mul(u.p_warp)).sub(drift.mul(1.6)),
    );

    // Soft threshold into pools of light; input volume widens them a touch.
    const cover = u.p_coverage + 0.06 * u.inputVol;
    const soft = std.max(u.p_softness, 0.01);
    const pools = std.smoothstep(1 - cover - soft, 1 - cover + soft, field);

    // Shading: key light from the upper left, a small glint and a rim.
    const key = std.normalize(d.vec3f(-0.5, 0.6, 0.62));
    const diffuse = std.max(std.dot(n, key), 0);
    const half = std.normalize(key.add(d.vec3f(0, 0, 1)));
    const glint = std.pow(std.max(std.dot(n, half), 0), 28) * 0.35;
    const rim = std.pow(1 - z, 2.6) * u.p_rim;

    // Thinking breathes; agent output lifts the light slightly.
    const breath = 1 + u.p_breath * 0.18 * std.sin(u.time * 3.1);
    const gain = u.p_gain * breath * (0.9 + 0.3 * u.outputVol);

    const base = u.c_base.mul(0.6 + 0.6 * diffuse);
    const lit = u.c_light.mul(pools * (0.25 + 0.75 * diffuse) * gain);
    const col = base
      .add(lit)
      .add(u.c_light.mul(glint + rim * (0.25 + 0.5 * pools)));

    // Premultiplied alpha: the mask is coverage.
    return d.vec4f(std.min(col, d.vec3f(1)).mul(mask), mask);
  })
  .$name("studioOrbFragment");

export const studioOrbShader = tgpu.resolve([studioOrbFragment]);
