/**
 * "Machined graphite + molten core" — the one material every Quant mark is cut
 * from, as a fragment shader.
 *
 * WHY THIS MATERIAL. The five reference marks we were given are five different
 * material worlds (flat purple, candy 3D orange, paper, dark chrome). Building
 * six icons in four materials is how a suite ends up looking like six unrelated
 * products. Only one of the five matches what this design system actually is —
 * a near-black canvas with a single ember accent — so that is the one the whole
 * family is machined from: a graphite body under raking light, with the accent
 * arriving as heat from *inside* the object rather than as paint on top of it.
 *
 * WHY IT IS NOT FLAT. The last attempt read as "fika" — washed out — and the
 * cause was flatness, not a shortage of colour. So the fix here is physics, not
 * saturation: a real bevel with a cool-white environment highlight on one side
 * and ember bounce on the other, self-occlusion in the milled channels, and a
 * contact shadow. Ember on near-black also has *more* local contrast than the
 * references' mid-tone gradients, so it reads harder at 32px and passes
 * contrast checks the candy version would not.
 *
 * THE DESIGN TOKENS, GIVEN PHYSICAL MEANING. `#2B1A11` and `#5C3016` have been
 * "brand soft" and "brand soft border" — two hexes with no story. Here they are
 * the interior wall of a milled channel: the colour a wall takes when the only
 * light reaching it is the ember at the bottom. `#FF8C42` is the emission
 * itself, and `rgba(0,0,0,0.6)` — the standard shadow — is the contact shadow.
 *
 * WHAT A MARK MUST SUPPLY. Two functions, ~15 lines. Everything else is shared:
 *
 *   float markPlate(vec3 p);
 *       Signed distance to the UNCARVED solid, object space, half-extent ~0.62.
 *
 *   float markChannel(vec2 uv, out float hot);
 *       Unsigned distance to the centreline of the ember channel network in the
 *       face plane. `hot` in 0..1 marks the places that glow hardest (a commit
 *       node, a calendar digit, an eye) and is what makes one material read as
 *       six different personalities.
 *
 * The channel is *carved* by this file, not by the mark, so a mark can never
 * carve a channel it does not also light.
 */

/** Uniform block + helpers + the raymarcher. Prepend to a mark's SDF source. */
export const MARK_MATERIAL_GLSL = String.raw`
// ── The dial every mark is tuned with ───────────────────────────────────────
// "Ember ratio" is ember area over graphite area, and it is the whole
// personality control: Contacts wants ~35% (a person, mostly lit), QuantGit
// ~4% (an instrument, mostly metal). One material, six temperaments.
uniform float uEmber;        // 0..1 ember ratio
uniform float uIridescence;  // 0..1, rationed to grazing angles only
uniform float uBrushed;      // 0..1 anisotropic machining marks
uniform float uRough;        // 0.08 satin .. 0.55 matte
uniform float uHover;        // 0..1 pointer proximity
uniform float uYaw;          // radians, object space
uniform float uPitch;        // radians, object space
uniform float uBreath;       // 0 or 1 — the idle ember settle

// ── The contract a mark fills in (defined after this block) ────────────────
float markPlate(vec3 p);
float markChannel(vec2 uv, out float hot);

// ── The palette, straight from the design system ────────────────────────────
const vec3 GRAPHITE_DEEP = vec3(0.051, 0.059, 0.075); // #0D0F13
const vec3 GRAPHITE_LIT  = vec3(0.102, 0.114, 0.137); // #1A1D23
const vec3 EMBER         = vec3(1.000, 0.549, 0.259); // #FF8C42
const vec3 EMBER_HOT     = vec3(1.000, 0.702, 0.451); // #FF9B5A hover/hot
const vec3 WALL_DEEP     = vec3(0.169, 0.102, 0.067); // #2B1A11 channel wall
const vec3 WALL_LIT      = vec3(0.361, 0.188, 0.086); // #5C3016 wall, ember-lit
const vec3 ENV_KEY       = vec3(0.859, 0.898, 1.000); // cool room light
const vec3 TYPE_WHITE    = vec3(0.961, 0.961, 0.961); // #F5F5F5

const float PLATE_HALF = 0.62;
const float PLATE_Z    = 0.155;   // front face
/**
 * World height the canvas covers, and therefore how much of its own box the mark
 * fills. Solve it, do not guess it: the shifted-ortho camera magnifies by 1.106
 * at the front face, and the default yaw of -0.22 foreshortens x by cos(0.22), so
 * the plate's projected half-width is 0.62 * 0.976 / 1.106 = 0.547 world units.
 * At the first draft's 1.62 that filled 67% of the box — the mark looked like a
 * thumbnail of itself, and the SVG twin at 92% was visibly a different size.
 * 1.334 puts it at 82%, which is where macOS and iOS put icon art, and leaves
 * exactly the margin the contact shadow needs.
 */
const float VIEW_H     = 1.334;

float hash11(float x) { return fract(sin(x * 127.1) * 43758.5453123); }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

/**
 * THE CUT AND THE LIGHT IN IT ARE TWO DIFFERENT WIDTHS.
 *
 * The first version tied them together: a low ember ratio meant a narrow cut,
 * and at 172px that was a 4px groove asked to show a wall, a dark lip and a lit
 * floor. Three features do not fit in four pixels, so what rendered was a flat
 * orange line — a sticker, which is the one read this material exists to avoid.
 *
 * The cut is therefore generous and nearly fixed, and uEmber controls how much
 * of its floor actually glows. "Instrument at 10%" is then what the words
 * describe — a wide milled groove with a narrow filament of heat at the bottom of
 * it — and the dark #2B1A11 ring around that filament is guaranteed by
 * construction at every setting and every size, because it is unlit floor rather
 * than a vertical wall that a front-on camera sees edge-on and never renders.
 */
float channelHalf() { return mix(0.052, 0.076, clamp(uEmber, 0.0, 1.0)); }
float channelDepth() { return mix(0.038, 0.055, clamp(uEmber, 0.0, 1.0)); }
/** Half-width of the *lit* filament on that floor. Always inside the cut. */
float emberHalf() { return channelHalf() * mix(0.34, 0.82, clamp(uEmber, 0.0, 1.0)); }

/** Object-space rotation, applied once so normals stay consistent with it. */
vec3 toObject(vec3 p) {
  p.xz = rot(uYaw) * p.xz;
  p.yz = rot(uPitch) * p.yz;
  return p;
}

/**
 * The solid, with the channel network subtracted from its front face.
 *
 * "max(body, -region)" is a hard boolean subtraction: exact for the body, and
 * still 1-Lipschitz, so the march below stays safe without shortening steps
 * more than the 0.9 relaxation already does.
 */
float sceneSDF(vec3 p) {
  vec3 q = toObject(p);
  float body = markPlate(q);

  float hot;
  float ch = markChannel(q.xy, hot) - channelHalf();
  // The channel exists only from the front face down to its floor, so the mark
  // stays a solid object rather than a cut-through stencil.
  float region = max(ch, (PLATE_Z - channelDepth()) - q.z);
  return max(body, -region);
}

vec3 normalAt(vec3 p) {
  // 0.0007 is tuned to the channel width: larger smears the channel lip into a
  // fillet and the milled edge stops reading as milled.
  vec2 e = vec2(0.0007, 0.0);
  return normalize(vec3(
    sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
    sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
    sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
  ));
}

/** GGX specular for one light. Small, standard, and the reason the bevel reads
 *  as machined metal rather than as a gradient. */
float ggx(vec3 n, vec3 v, vec3 l, float rough) {
  vec3 h = normalize(v + l);
  float a = max(rough * rough, 0.0025);
  float ndh = max(dot(n, h), 0.0);
  float denom = ndh * ndh * (a * a - 1.0) + 1.0;
  float d = (a * a) / (3.14159265 * denom * denom);
  float ndv = max(dot(n, v), 0.001);
  float ndl = max(dot(n, l), 0.0);
  float k = a * 0.5;
  float g = (ndl / (ndl * (1.0 - k) + k)) * (ndv / (ndv * (1.0 - k) + k));
  return d * g / (4.0 * ndv * ndl + 0.001) * ndl;
}

/**
 * Thin-film interference — what iridescence physically is on a machined,
 * coated surface. The earlier plan called for three refraction marches at
 * different IOR, but that is *dispersion*, and dispersion needs a translucent
 * body. Graphite is opaque, so the honest model is a film on the bevel: one
 * cosine triple instead of three extra marches, and it costs nothing.
 */
vec3 thinFilm(float cosTheta) {
  float phase = 5.4 / max(cosTheta, 0.09);
  return 0.5 + 0.5 * cos(vec3(phase, phase * 1.13, phase * 1.27) + vec3(0.0, 2.09, 4.19));
}

/** Cheap self-occlusion: how much of the hemisphere the channel walls block. */
float channelAO(vec3 p, vec3 n) {
  float hot;
  float ch = markChannel(p.xy, hot) - channelHalf();
  float inside = 1.0 - smoothstep(-0.004, 0.008, ch);
  // The floor is flanked by two walls, so it loses a fifth of its sky even facing
  // straight up; a wall is looking at the opposite wall 0.1 away and loses far
  // more. Without the floor term the cut and the face take the same room light and
  // the groove flattens out.
  float wall = inside * (1.0 - clamp(n.z, 0.0, 1.0));
  return 1.0 - inside * 0.22 - wall * 0.45;
}

vec3 shade(vec3 pw, vec3 nw, vec3 rd) {
  vec3 p = toObject(pw);
  vec3 v = -rd;

  float hot;
  float centre = markChannel(p.xy, hot);   // 0 on the centreline of the cut
  float ch = centre - channelHalf();
  float inside = 1.0 - smoothstep(-0.003, 0.006, ch);
  float faceness = clamp(nw.z, 0.0, 1.0);
  // The flat bottom of the cut, and its near-vertical walls, told apart by which
  // way the surface faces rather than by how deep it is.
  float floorness = inside * smoothstep(0.55, 0.95, faceness);
  float wallness = inside * (1.0 - smoothstep(0.30, 0.78, faceness));
  // The filament, measured from the centreline — NOT from the cut edge. This is
  // what leaves a ring of unlit #2B1A11 floor between the heat and the graphite.
  float eh = emberHalf();
  float lit = 1.0 - smoothstep(eh * 0.70, eh, centre);

  // MACHINING, AND WHY IT IS NOT A TEXTURE AT ALL.
  //
  // Two attempts drew the scratches. At 210 cycles they aliased into CRT scan
  // lines; at 34 cycles they stopped aliasing and became corduroy — 4.6 pixels
  // per period at 252px is a *visible stripe*, which is a woven fabric, not
  // milled metal. Both failures have the same cause: a real brushed face at icon
  // size is 200+ sub-pixel scratches, and any frequency low enough to survive
  // the pixel grid is far too low to be scratches.
  //
  // So there is no pattern here. What a scratched face actually does to light is
  // scatter it along the grain, and that is a roughness anisotropy: the key
  // highlight stretches across the grain and stays tight along it. One extra
  // roughness value, no texture, no tangent frame, no second march — and it is
  // the only part of "brushed" that is true at 32px as well as at 252px.
  vec3 n = nw;
  float rough = clamp(uRough + wallness * 0.22, 0.05, 0.9);

  vec3 base = mix(GRAPHITE_DEEP, GRAPHITE_LIT, clamp(0.34 + p.y * 0.55 + faceness * 0.30, 0.0, 1.0));
  // Everything inside the cut — floor and walls alike — is milled interior, so it
  // takes the wall colour. "lit" warms only the strip the filament actually
  // reaches, which is what makes the surrounding floor read as a dark ring.
  float cut = max(wallness, floorness);
  base = mix(base, mix(WALL_DEEP, WALL_LIT, 0.14 + 0.42 * hot + 0.30 * lit), cut);

  // Two lights and no more: a cool key standing in for the room, and an ember
  // fill that is not a light in the room at all — it is the object's own heat
  // bouncing back out of its own channels.
  vec3 key = normalize(vec3(-0.55, 0.72, 0.86));
  vec3 fill = normalize(vec3(0.62, -0.52, 0.44));
  float breath = 0.94 + 0.06 * sin(uTime * 1.15) * uBreath;
  float emberGain = mix(0.55, 1.35, clamp(uEmber, 0.0, 1.0)) * breath * (1.0 + 0.30 * uHover);

  // Anisotropy: the grain runs in x, so the key highlight is blurred in y and
  // stays tight in x. Capped at 0.7 rather than 1.3 — past that the lobe is broad
  // enough to cover the whole face in one soft dome, which is a glossy pillow.
  vec3 hKey = normalize(v + key);
  float roughKey = clamp(rough * (1.0 + 0.70 * uBrushed * abs(hKey.y)), 0.05, 0.95);

  // The ember fill is the object's own heat bouncing back, and it belongs on the
  // graphite as a hint, not a wash: at 0.32 the whole plate went bronze, which is
  // a different material with a different name.
  vec3 col = base * ENV_KEY * (0.10 + 0.48 * max(dot(n, key), 0.0));
  col += base * EMBER * max(dot(n, fill), 0.0) * 0.15 * emberGain;
  col += ENV_KEY * ggx(n, v, key, roughKey) * 0.44;
  col += EMBER * ggx(n, v, fill, rough) * 0.26 * emberGain;

  // Emission. It comes from a filament on the floor of the cut, so the ember is
  // ringed by unlit floor and then by a lip of graphite, and never sits on top of
  // the object like paint. Contained on purpose: no bloom pass, no halo — those
  // are the "AI render" tell.
  float core = floorness * lit * (0.55 + 0.45 * hot);
  col += mix(EMBER, EMBER_HOT, hot * 0.6) * core * 1.55 * emberGain;
  // A little of it reaches the walls and the floor beside it, which is what makes
  // the channel read as having depth rather than as a dark line. Kept low: a
  // bright wall is a wall that has stopped being a shadow.
  col += EMBER * cut * (0.09 + 0.20 * hot) * emberGain;

  // Light escaping across the lip onto the face. Tight enough to be a lip and
  // not a glow: e^-1 at ~0.009 world units, which is under a pixel at 96px.
  float leak = exp(-max(ch, 0.0) * 110.0) * faceness * (0.6 + 0.4 * hot);
  col += EMBER * leak * 0.06 * emberGain;

  float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
  col += ENV_KEY * fres * 0.10;

  // Iridescence, rationed. Only the grazing sliver of the bevel gets it — a few
  // percent of pixels — because a fully iridescent object is a chrome novelty,
  // and chrome is what made the reference marks look rendered rather than made.
  float grazing = smoothstep(0.62, 0.97, fres);
  col += thinFilm(clamp(dot(n, v), 0.0, 1.0)) * grazing * uIridescence * 0.30;

  col *= channelAO(p, nw);
  // The one white in the whole mark, and it is the type colour: the specular
  // pin at the very top of the bevel, which is what tells the eye "hard edge".
  // Exponent 90, not 46: at 46 the pin is a fat glass-button arc, and a glass
  // button is the 2010 tell in the same way a neon glow is the 2024 one.
  col += TYPE_WHITE * pow(max(dot(n, key), 0.0), 90.0) * 0.22;

  return col;
}

/**
 * A shoulder only where the value would clip. Below ~0.85 the token colours
 * pass through untouched, which is the whole point: #FF8C42 has to still be
 * #FF8C42 on the face of the mark, not a filmic approximation of it.
 */
vec3 tonemap(vec3 c) {
  float m = max(c.r, max(c.g, c.b));
  if (m <= 0.85) return c;
  return c * ((0.85 + (m - 0.85) / (1.0 + (m - 0.85) * 1.4)) / m);
}

void main() {
  vec2 uv = ((gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y) * VIEW_H;

  // Shifted-orthographic camera: a whisper of perspective and no wide-angle
  // distortion. An icon has to look identical in the corner of a grid and in
  // the middle of it, which a real perspective camera cannot promise.
  vec3 ro = vec3(uv, 2.2);
  vec3 rd = normalize(vec3(uv * 0.052, -1.0));
  float px = VIEW_H / uResolution.y;

  float t = 1.15;
  float dmin = 1e9;
  vec3 pmin = ro;
  vec3 p = ro;
  bool hit = false;

  for (int i = 0; i < 84; i++) {
    p = ro + rd * t;
    float d = sceneSDF(p);
    if (d < dmin) { dmin = d; pmin = p; }
    if (d < 0.0006) { hit = true; break; }
    t += d * 0.9;          // under-relaxed for the boolean subtraction
    if (t > 3.6) break;    // background rays leave in ~10 steps, so they are cheap
  }

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (hit) {
    col = shade(p, normalAt(p), rd);
    alpha = 1.0;
  } else {
    // Analytic edge coverage from the closest approach the ray made. One extra
    // normal evaluation on edge pixels only — a fraction of the cost of
    // supersampling every pixel 4x, and smoother than 4x would be.
    float cov = 1.0 - smoothstep(0.0, px * 1.35, dmin);
    if (cov > 0.002) {
      col = shade(pmin, normalAt(pmin), rd);
      alpha = cov;
    }
  }

  // Contact shadow, under the plate, in the design system's shadow colour:
  // neutral black at 0.6. Never a coloured glow — "shadow-orange-500/50" is the
  // single fastest way to make a product look generated.
  //
  // Its geometry is solved against the camera, not nudged by eye. The plate's
  // bottom edge projects to y = -0.553 and the canvas now ends at -0.667, so the
  // ellipse is centred at -0.60 with a 0.055 minor radius: it starts under the
  // plate's own lip and its far edge lands 0.012 short of the crop. On the old
  // 1.62 view this sat at -0.80, which is off-screen at 1.334 — the shadow was
  // being drawn into pixels that do not exist.
  vec2 sc = (uv - vec2(0.0, -0.60)) / vec2(0.50, 0.055);
  float shadow = (1.0 - smoothstep(0.28, 1.0, length(sc))) * 0.60;

  col = tonemap(col);
  // Dither below the last 8-bit step. The body is a near-black gradient across
  // #0D0F13 -> #1A1D23, which is exactly where banding is visible.
  col += (hash11(gl_FragCoord.x * 3.7 + gl_FragCoord.y * 11.3) - 0.5) / 255.0;

  // The shadow sits behind the mark. Output is non-premultiplied, so the colour
  // has to be un-multiplied back out after compositing the two layers.
  float outA = alpha + shadow * (1.0 - alpha);
  vec3 outC = outA > 0.0001 ? (col * alpha) / outA : vec3(0.0);
  fragColor = vec4(outC, outA);
}
`;

/**
 * Compose a complete fragment shader: the shared material, then the mark's own
 * SDF. Order matters — the material forward-declares `markPlate`/`markChannel`
 * so a mark file contains nothing but its own geometry.
 */
export function buildMarkShader(sdfSource: string): string {
  return MARK_MATERIAL_GLSL + '\n' + sdfSource;
}
