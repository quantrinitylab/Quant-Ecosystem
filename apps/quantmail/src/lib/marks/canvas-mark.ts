/**
 * The drawing primitives every *live* app mark shares.
 *
 * `QuantMailLogo` established the technique the family is judged against: a
 * Canvas 2D buffer redrawn on `requestAnimationFrame`, an Apple squircle clip,
 * layered moving gradients for material, hand-authored bezier geometry, and a
 * gradient rim stroke for the bezel. That component is deliberately left alone —
 * it is the ecosystem's own mark and it works — so the shape of the box, the
 * corner radius and the bezel ramp are re-declared here once, as numbers the rest
 * of the family can share instead of six files each guessing at them.
 *
 * Pure canvas: no React, no DOM outside the passed context, so a mark can be
 * unit-tested by drawing into an offscreen canvas.
 */

/** Internal buffer edge, in px, before the device-pixel multiplier. */
export const MARK_RES = 100;

/** Half-extent of the plate inside the buffer — 90 of 100, so 5px of margin. */
export const MARK_HALF = 45;

/** Corner radius of the plate at `MARK_HALF`. Apple-squircle-ish, not a stadium. */
export const MARK_RADIUS = 22;

/**
 * The palette, as canvas needs it: string literals, not Tailwind classes.
 * Kept to the design system's values so a mark cannot drift from the UI around it.
 */
export const MARK_COLORS = {
  canvas: '#090A0C',
  void: '#0B0C0F',
  card: '#16181D',
  border: '#282C35',
  ember: '#FF8C42',
  emberHot: '#FFB875',
  emberDeep: '#E8752F',
  emberInk: '#1A0F08',
  peach: '#FFD9B8',
  type: '#F5F5F5',
  typeMuted: '#A1A4AC',
} as const;

/** Device pixel ratio, capped so a 3x phone does not allocate a 300px buffer per mark. */
export const markDpr = (): number =>
  typeof window === 'undefined' ? 2 : Math.min(window.devicePixelRatio || 2, 3);

/** The family silhouette, as a path on the current context. Does not fill or stroke. */
export function markSquirclePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number = MARK_HALF,
  radius: number = MARK_RADIUS,
): void {
  ctx.beginPath();
  ctx.roundRect(cx - half, cy - half, half * 2, half * 2, radius);
}

/**
 * The ember plate, molten — the family's material, built the way `QuantMailLogo`
 * builds its lava, because that is the mark this set is judged against.
 *
 * The construction is the point, and an earlier draft of this file got it wrong in a
 * way worth recording. That draft laid a `#FFB875 → #FF8C42 → #DC6A24` diagonal down
 * and floated two low-alpha radial passes over it, on the theory that a quiet plate
 * would read as premium. It does not. A linear gradient plus two whispers is a *flat
 * orange sticker*: there is no depth in it, because a diagonal ramp has no interior,
 * and no drama, because nothing is dark. Beside the mail mark it looked printed.
 *
 * What the mail mark actually does — and what this now does — is stack **an ember floor
 * and four large orbiting layers**, three hot and one cold:
 *
 * 1. deep ember, widest, the body of the glow
 * 2. brand ember, the plate's identity, `MARK_COLORS.ember` at full strength
 * 3. solar gold, tightest and brightest, the core
 * 4. **an obsidian void pass** — the layer the earlier draft omitted entirely, and the
 *    reason it looked flat. Darkness *inside* the glow is what turns three concentric
 *    blurs into molten crust with something glowing underneath. Without it there is no
 *    interior; with it the plate has a near side and a far side.
 *
 * Every centre orbits on its own sin/cos at a different rate and amplitude, so the
 * four never lock into a pattern, and pointer tilt shifts them by different multiples
 * so the layers separate in depth as the mark is moved — cheap parallax that reads as
 * a thick slab of glass over lava. Assumes the caller has already clipped.
 */
export function paintEmberPlate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
  tiltX = 0,
  tiltY = 0,
): void {
  const half = MARK_HALF;
  const x0 = cx - half;
  const y0 = cy - half;
  const edge = half * 2;

  // The floor. *Ember, radial, and generous* — not obsidian. A first cut at this
  // rewrite used a near-black base and let the four layers do all the lighting, which
  // produced a genuinely molten 192px render and a 24px chip that read brown-black.
  // The plate has to be recognisable as `#FF8C42` in a sidebar before it is allowed to
  // be dramatic anywhere else, so the floor never falls below deep ember and the
  // interior darkness is subtracted from it by the void pass instead.
  const fx = cx - 8;
  const fy = cy - 10;
  const base = ctx.createRadialGradient(fx, fy, 4, fx, fy, 82);
  base.addColorStop(0, '#FFC189');
  base.addColorStop(0.3, '#FF9450');
  base.addColorStop(0.5, MARK_COLORS.ember);
  base.addColorStop(0.74, '#C8520F');
  base.addColorStop(1, '#6E2606');
  ctx.fillStyle = base;
  ctx.fillRect(x0, y0, edge, edge);

  const layer = (
    ox: number,
    oy: number,
    rate: number,
    amp: number,
    radius: number,
    tilt: number,
    stops: Array<[number, string]>,
  ) => {
    const lx = cx + ox + Math.cos(time * rate) * amp + tiltX * tilt;
    const ly = cy + oy + Math.sin(time * rate * 0.84) * amp * 0.82 + tiltY * tilt;
    const g = ctx.createRadialGradient(lx, ly, 2, lx, ly, radius);
    for (const [at, colour] of stops) g.addColorStop(at, colour);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, edge, edge);
  };

  // 1 — deep ember. Widest and lowest, so the plate's corners never go dead.
  layer(-3, 7, 0.75, 13, 58, 5, [
    [0, '#EE7622'],
    [0.42, '#C6520F'],
    [0.78, 'rgba(140, 52, 10, 0.55)'],
    [1, 'rgba(96, 32, 6, 0)'],
  ]);

  // 2 — brand ember. The plate's identity, at full strength and slightly high, so the
  // eye reads `#FF8C42` first and everything else as light on it.
  layer(-6, -4, 1.05, 11, 50, 9, [
    [0, MARK_COLORS.ember],
    [0.38, '#F87A2C'],
    [0.72, 'rgba(226, 100, 30, 0.5)'],
    [1, 'rgba(200, 80, 22, 0)'],
  ]);

  // 3 — solar gold. Tightest and brightest: the core the crust is thinnest over. It
  // goes almost to white, because tonal *range* is what the mail mark's lava has and a
  // narrow ramp is what made the first draft look printed. Nothing else on the plate is
  // allowed to be this bright.
  layer(-13, -14, 1.2, 12, 37, 13, [
    [0, '#FFF1D6'],
    [0.26, '#FFC584'],
    [0.62, 'rgba(255, 158, 78, 0.46)'],
    [1, 'rgba(255, 140, 66, 0)'],
  ]);

  // 4 — the void. Cold, tight, orbiting the other way, and the whole reason the plate
  // has an inside. It is subtracted from the far corner, so the glow reads as something
  // seen *through* a crust rather than as a lamp behind frosted glass.
  layer(19, 21, -0.9, 14, 40, -7, [
    [0, 'rgba(20, 9, 3, 0.7)'],
    [0.42, 'rgba(44, 18, 6, 0.38)'],
    [1, 'rgba(70, 30, 12, 0)'],
  ]);
}

/**
 * Dome the plate: light gathered along the top edge, shade pooled at the bottom, and a
 * fresnel band just inside the rim.
 *
 * The band is the part that matters. `strokeMarkBezel` draws the plate's *outer* edge,
 * which reads as a bright outline; a real slab of enamel or glass also carries light a
 * short way *in* from that edge, strongest at the top where the sky is. Without it the
 * plate is a coloured area with a highlight drawn around it. With it the plate has a
 * thickness, and the glyph sitting on it is clearly below the rim. Clip first.
 */
export function paintPlateDome(ctx: CanvasRenderingContext2D, cx: number, cy: number): void {
  const half = MARK_HALF;
  const dome = ctx.createLinearGradient(cx, cy - half, cx, cy + half);
  dome.addColorStop(0, 'rgba(255, 255, 255, 0.1)');
  dome.addColorStop(0.34, 'rgba(255, 255, 255, 0.02)');
  dome.addColorStop(0.72, 'rgba(0, 0, 0, 0.07)');
  dome.addColorStop(1, 'rgba(0, 0, 0, 0.27)');
  ctx.fillStyle = dome;
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);

  markSquirclePath(ctx, cx + 0, cy + 1.5, half - 1.5, MARK_RADIUS - 1.5);
  ctx.lineWidth = 2.6;
  const fresnel = ctx.createLinearGradient(cx, cy - half, cx, cy + half * 0.5);
  fresnel.addColorStop(0, 'rgba(255, 240, 220, 0.5)');
  fresnel.addColorStop(0.3, 'rgba(255, 226, 196, 0.12)');
  fresnel.addColorStop(1, 'rgba(255, 214, 176, 0)');
  ctx.strokeStyle = fresnel;
  ctx.stroke();
}

/**
 * The bezel, stroked *outside* the clip so the highlight sits over the glyph edge
 * rather than under it — the ordering `AppMark` and `QuantMailLogo` both rely on.
 * `lineWidth` matches the mail mark's 1.4 so the family shares one edge weight.
 */
export function strokeMarkBezel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  half: number = MARK_HALF,
  radius: number = MARK_RADIUS,
): void {
  ctx.save();
  markSquirclePath(ctx, cx, cy, half, radius);
  ctx.lineWidth = 1.4;
  const rim = ctx.createLinearGradient(cx - half, cy - half, cx + half, cy + half);
  rim.addColorStop(0, 'rgba(255, 255, 255, 0.46)');
  rim.addColorStop(0.4, 'rgba(255, 214, 170, 0.28)');
  rim.addColorStop(1, 'rgba(255, 255, 255, 0.08)');
  ctx.strokeStyle = rim;
  ctx.stroke();
  ctx.restore();
}

/**
 * The *other* family material: near-black glossy chrome, for the two marks whose
 * reference sheets are dark rather than ember — QuantGit and Quanty. The silhouette,
 * the corner radius and the buffer are identical to the ember marks, so the family
 * still reads as one set; only the material changes, the way a product line ships a
 * graphite model alongside the orange one.
 *
 * Black is the hardest material to make read on a dark UI, because a flat black fill
 * on `#090A0C` is a hole rather than an object. Two moving passes fix that: a cool
 * sheen top-left, which is the light the room is putting on it, and a warm pass
 * bottom-right, which is what keeps an obsidian mark inside an ember product instead
 * of looking like it wandered in from a different brand. Clip first.
 */
export function paintObsidianPlate(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
  tiltX = 0,
  tiltY = 0,
): void {
  const half = MARK_HALF;
  const base = ctx.createLinearGradient(cx - half, cy - half, cx + half, cy + half);
  base.addColorStop(0, '#23272F');
  base.addColorStop(0.42, '#0F1116');
  base.addColorStop(1, '#050609');
  ctx.fillStyle = base;
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);

  const sx = cx - 15 + Math.cos(time * 0.5) * 12 + tiltX * 8;
  const sy = cy - 18 + Math.sin(time * 0.44) * 9 + tiltY * 8;
  const sheen = ctx.createRadialGradient(sx, sy, 2, sx, sy, 38);
  sheen.addColorStop(0, 'rgba(198, 218, 255, 0.19)');
  sheen.addColorStop(0.45, 'rgba(126, 156, 205, 0.07)');
  sheen.addColorStop(1, 'rgba(96, 126, 175, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);

  const wx = cx + 19 + Math.sin(time * 0.39) * 11 - tiltX * 6;
  const wy = cy + 20 + Math.cos(time * 0.61) * 9 - tiltY * 6;
  const warm = ctx.createRadialGradient(wx, wy, 2, wx, wy, 44);
  warm.addColorStop(0, 'rgba(255, 140, 66, 0.22)');
  warm.addColorStop(0.5, 'rgba(198, 88, 30, 0.09)');
  warm.addColorStop(1, 'rgba(255, 140, 66, 0)');
  ctx.fillStyle = warm;
  ctx.fillRect(cx - half, cy - half, half * 2, half * 2);
}

/**
 * The two finishes the ring comes in.
 *
 * These started as one spectral table for both dark marks, and the first render settled
 * it: beside three ember plates, a saturated pink-blue-green ring reads as an RGB
 * gaming bezel, not as reference ⑤'s "iridescent **chrome**" — and it would have made
 * QuantGit and Quanty near-identical, when the rainbow is precisely Quanty's own
 * signature (reference ⑧). So the ring has a finish, and the marks do not share it.
 *
 * `chrome` is polished steel: alternating light and dark bands with a single warm and a
 * single cool tint, which is what makes metal read as *iridescent* rather than as grey.
 * `spectral` is the oil film, reserved for the mascot.
 *
 * The spectral ramp is **pastel**, and that took a second render to accept. Reference ⑧'s
 * ring is thin-film interference on black glass — a soap bubble, a CD edge, an anodised
 * lens barrel — and the defining property of thin-film colour is that it is *pale*: it
 * lives at high value and low saturation, because it is white light with a little of it
 * cancelled, not a pigment. The first table ran `#4E7BE8` blue against `#38D2C0` teal
 * against `#FF6B4A` coral, all at 70–100% saturation, and at 104px those three bands were
 * the loudest thing on the mark — louder than the face, which is the one element that must
 * win. Halving the saturation and lifting the value fixes it without touching the ring's
 * geometry.
 *
 * What is *not* softened is the tonal range. `#3E4A54` at 0.5 and `#4C4654` at 0.93 are as
 * dark as anything in the `chrome` table, and they have to be: a ramp of pale hues with no
 * dark in it is a pastel sticker, and the two near-white stops only read as *specular* by
 * contrast with a terminator a tenth of a turn away. Pale hues, full range.
 *
 * ---
 *
 * **That whole judgement was made at one size, and the size was the wrong one.** It is kept
 * above because it is still true at 104px — but 104px is the lab hero, and the product's
 * largest Quanty is the 64px CodeHub card, with everything else at 20–36px. The ring is
 * stroked in buffer units and the buffer is downsampled to the CSS box, so a unit is worth
 * `dpr × size / 100` device pixels: the 2.3-unit ramp that measures 3.6 device px at 104px
 * measures **0.76 device px at 22px**, where it cannot carry a hue at all — it alpha-blends
 * into the dark backing on both sides and comes out as an off-white hairline. A screenshot of
 * `/codehub` showed exactly that, and read as "no rainbow ring", which is the honest reading.
 *
 * So each stop is now a **pair**: the pale thin-film value above, and a saturated partner.
 * `ringVividness(size)` mixes between them — 0 at hero size, where the measurement above
 * holds, rising to 1 by 32px, where a 1.5-device-px line gets one chance to say "colour" and
 * a soap-bubble tint is not it. The vivid end of `spectral` follows reference ⑧'s own
 * sequence (red → orange → yellow → green → blue, warm side dominant) and passes through
 * `#FF8C42` itself. `chrome`'s partner adds contrast rather than saturation: the same
 * downsampling that greys a hue also collapses an alternating light/dark band into flat
 * mid-grey, so polished steel needs whiter whites and blacker blacks at small sizes, not
 * colour it never had.
 */
const RING_FINISHES = {
  chrome: [
    [0, '#FFFFFF', '#FFFFFF'],
    [0.06, '#C9D2DE', '#E4EBF4'],
    [0.14, '#6D7686', '#7E8998'],
    [0.22, '#2B3038', '#0E1116'],
    [0.3, '#8E96A4', '#A8B2C0'],
    [0.38, '#E8EEF6', '#FFFFFF'],
    [0.46, '#A99BC0', '#B79FE0'],
    [0.54, '#4A4E58', '#2E323A'],
    [0.63, '#26313A', '#0C1015'],
    [0.71, '#9AA6B2', '#BCC8D4'],
    [0.79, '#F0DCC0', '#FFD9A0'],
    [0.87, '#6E645C', '#5A5048'],
    [0.94, '#3A3F49', '#14181F'],
    [1, '#FFFFFF', '#FFFFFF'],
  ],
  spectral: [
    [0, '#FFF6EC', '#FFFFFF'],
    [0.07, '#FFDCBC', '#FFA24A'],
    [0.15, '#F0C8DE', '#FF5E7A'],
    [0.24, '#D9BEEE', '#C25CFF'],
    [0.33, '#B9CBF2', '#4E8CFF'],
    [0.41, '#F2FAFF', '#EAF6FF'],
    [0.5, '#3E4A54', '#141A20'],
    [0.59, '#7FA9A6', '#22C08F'],
    [0.68, '#C8E6DC', '#7BE8C0'],
    [0.77, '#F6E6C2', '#FFD54A'],
    [0.85, '#FFD0BC', '#FF8C42'],
    [0.93, '#4C4654', '#1A1420'],
    [1, '#FFF6EC', '#FFFFFF'],
  ],
} satisfies Record<string, Array<[number, string, string]>>;

export type RingFinish = keyof typeof RING_FINISHES;

/**
 * The ring's weight, in buffer units, for a mark displayed at `size` CSS px.
 *
 * A unit is not a pixel. `useLiveMark` supersamples to `max(100, size) × dpr` and the browser
 * then fits that buffer into a `size`-px box, so one unit survives as `dpr × size / 100`
 * device pixels — and the reciprocal, `100 / (dpr × size)`, is how many units it takes to buy
 * one. At 104px and dpr 1.5 that is 0.64 units per device px; at 22px it is 3.03. The same
 * stroke is therefore 4.7× thinner on a header trigger than on the lab hero, which is why a
 * ring tuned at 104px disappears everywhere the product actually mounts one.
 *
 * Two device pixels is the floor: one is exactly the case that fails, because a single pixel
 * of a mid-tone hue sitting between a dark backing and a dark plate is averaged into both.
 * `RING_MAX_WIDTH` then caps the compensation at twice the design weight, and that ceiling
 * binds below ~29px — a 22px mark simply cannot hold 2 device px of ring without turning into
 * a frame, so from there down `ringVividness` carries what the geometry cannot.
 */
const RING_DESIGN_WIDTH = 2.3;
const RING_MIN_DEVICE_PX = 2;
const RING_MAX_WIDTH = 4.6;

export function ringWidthForSize(size: number): number {
  const unitsPerDevicePx = MARK_RES / Math.max(1, markDpr() * size);
  const needed = RING_MIN_DEVICE_PX * unitsPerDevicePx;
  return Math.min(RING_MAX_WIDTH, Math.max(RING_DESIGN_WIDTH, needed));
}

/**
 * How far along each stop's pale → saturated pair to sit, for a mark at `size` CSS px. Zero
 * at 96px and above, where the pastel measurement stands; one at 32px and below, where the
 * ring is a hairline and needs every bit of chroma it can hold. The 64px hero lands at 0.5.
 */
export function ringVividness(size: number): number {
  return Math.min(1, Math.max(0, (96 - size) / 64));
}

/**
 * sRGB lerp between two `#rrggbb` strings. Good enough here on purpose: every pair in
 * `RING_FINISHES` holds hue and value roughly constant and moves saturation, which is the one
 * axis where naive channel mixing does not visibly bend.
 */
function mixHex(from: string, to: string, t: number): string {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = parseInt(from.slice(1), 16);
  const b = parseInt(to.slice(1), 16);
  const lerp = (shift: number): number => {
    const av = (a >> shift) & 255;
    return Math.round(av + (((b >> shift) & 255) - av) * t);
  };
  return `rgb(${lerp(16)}, ${lerp(8)}, ${lerp(0)})`;
}

/**
 * The iridescent ring the dark marks wear instead of the warm bezel — reference ⑤'s
 * chrome ring and ⑧'s rainbow ring are the same object with two finishes, so they are
 * one function.
 *
 * Two strokes, not one. A colour ramp on its own reads as a printed pattern; what makes
 * it read as *metal* is that it sits in a dark ring body and that its banding alternates
 * light and dark as it goes round, which is what an anodised or oil-filmed edge actually
 * does. The ramp rotates with `time`, so the iridescence travels the way it does when you
 * tilt a real one — a static rainbow is a decal.
 *
 * Stroked outside the plate clip, like `strokeMarkBezel`, so it sits over the glyph.
 *
 * `size` is the mark's displayed edge in CSS px, and it is not optional in spirit: the weight
 * and the chroma are both read off it, because a ring is the one element of these marks whose
 * correct value in buffer units changes with how big the buffer is being shown. Passing
 * nothing gets the 100-unit assumption, which is the lab hero and nothing in the product.
 */
export function strokeIridescentBezel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  time: number,
  finish: RingFinish = 'chrome',
  size: number = MARK_RES,
): void {
  const width = ringWidthForSize(size);
  const vivid = ringVividness(size);

  ctx.save();
  markSquirclePath(ctx, cx, cy);
  ctx.lineWidth = width + 1.2;
  ctx.strokeStyle = 'rgba(9, 10, 14, 0.94)';
  ctx.stroke();

  const ring = ctx.createConicGradient(time * 0.3, cx, cy);
  for (const [at, calm, hot] of RING_FINISHES[finish]) {
    ring.addColorStop(at, mixHex(calm, hot, vivid));
  }

  /*
   * Reference ⑧'s "soft inward bloom", and inward is the whole of it. Two widening strokes of
   * the same gradient at falling alpha approximate a falloff — the trick `paintPulse` uses —
   * clipped to the plate so the spill lands on the mark's own body and not on the app behind
   * it. `shadowBlur` would be softer and is not an option: its `shadowColor` is one flat
   * colour, so the bloom would lose the hue that is the entire point, and it would halo
   * outward into exactly the neon glow the design system rules out.
   *
   * Clipping to the silhouette also halves each stroke, so the widths below reach inward by
   * about `(width + n) / 2 − width / 2`. Scaled by `vivid` because at hero size the ring is
   * wide enough to read on its own and a bloom there is just haze over the face.
   */
  if (vivid > 0.01) {
    ctx.save();
    markSquirclePath(ctx, cx, cy);
    ctx.clip();
    ctx.strokeStyle = ring;
    ctx.lineWidth = width + 2.2;
    ctx.globalAlpha = 0.3 * vivid;
    markSquirclePath(ctx, cx, cy);
    ctx.stroke();
    ctx.lineWidth = width + 5;
    ctx.globalAlpha = 0.16 * vivid;
    markSquirclePath(ctx, cx, cy);
    ctx.stroke();
    ctx.restore();
  }

  markSquirclePath(ctx, cx, cy);
  ctx.lineWidth = width;
  ctx.strokeStyle = ring;
  ctx.stroke();
  ctx.restore();
}

/**
 * Reference ⑤'s "notched light shape, top right": a hard specular chip on the plate's
 * own corner, from a light that does *not* move with the iridescence. It is what tells
 * the eye the box is a solid with a polished edge — the rotating ring alone reads as a
 * pattern printed on a flat tile. Draw it inside the plate clip.
 *
 * The chip is stroked on an **inset** squircle, and that is not a taste call. Stroked on
 * the plate's own edge it was invisible in every render: `strokeIridescentBezel` follows
 * it and lays a 3.5-wide dark backing stroke centred on that same path, which covers the
 * chip's whole ±1.7 completely. Inset by `INSET` it lands just inside the ring instead,
 * where it reads as light carried in from a polished corner — which is what the reference
 * actually shows.
 */
export function paintCornerNotch(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  strength = 0.5,
): void {
  const half = MARK_HALF;
  const INSET = 2.8;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx + half - 32, cy - half);
  ctx.lineTo(cx + half, cy - half);
  ctx.lineTo(cx + half, cy - half + 32);
  ctx.closePath();
  ctx.clip();
  markSquirclePath(ctx, cx, cy, half - INSET, MARK_RADIUS - INSET);
  ctx.lineWidth = 3;
  const chip = ctx.createLinearGradient(cx + half - 27, cy - half, cx + half, cy - half + 27);
  chip.addColorStop(0, 'rgba(255, 255, 255, 0)');
  chip.addColorStop(0.42, `rgba(255, 255, 255, ${strength})`);
  chip.addColorStop(0.6, `rgba(255, 246, 232, ${strength * 0.8})`);
  chip.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.strokeStyle = chip;
  ctx.stroke();
  ctx.restore();
}

/**
 * Give a glyph thickness: fill its silhouette once, pushed `depth` units down, in a
 * vertical ramp, then let the caller draw the top face over it. What is left showing
 * along the bottom and sides is the object's wall.
 *
 * This is the other half of the "flat sticker" fix. A pad, a figure or a sheet drawn as
 * one filled path is a *decal on* the plate no matter how good the plate is; it has an
 * outline and no edge. One offset fill costs a single extra path and turns it into a
 * solid sitting on the plate, and because the offset is vertical the light direction
 * stays consistent with the dome above — the wall is the face the light cannot reach.
 *
 * `depth` should shrink under press: an object pushed into the plate has less of its
 * side showing, and that is the cue that sells a press far better than a scale change.
 */
export function paintSideWall(
  ctx: CanvasRenderingContext2D,
  path: (ctx: CanvasRenderingContext2D) => void,
  depth: number,
  near: string,
  far: string,
  topY: number,
  bottomY: number,
): void {
  if (depth <= 0.05) return;
  ctx.save();
  ctx.translate(0, depth);
  path(ctx);
  const wall = ctx.createLinearGradient(0, topY, 0, bottomY + depth);
  wall.addColorStop(0, near);
  wall.addColorStop(1, far);
  ctx.fillStyle = wall;
  ctx.fill();
  ctx.restore();
}

/** `beginPath` + `roundRect`, because every glyph here is a rounded rectangle. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/**
 * A travelling specular band across a card face. `sweep` is 0→1 and moves the band
 * from above the top-left corner to past the bottom-right, so hover can push it
 * across instead of fading a static highlight in and out. Clip to the card first.
 */
export function paintGlossSweep(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  sweep: number,
  strength = 0.16,
): void {
  const span = w + h;
  const travel = -span * 0.5 + sweep * span * 1.5;
  const g = ctx.createLinearGradient(x + travel, y, x + travel + span * 0.42, y + h);
  g.addColorStop(0, 'rgba(255, 255, 255, 0)');
  g.addColorStop(0.45, `rgba(255, 255, 255, ${strength})`);
  g.addColorStop(0.55, `rgba(255, 255, 255, ${strength * 0.72})`);
  g.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

/**
 * One font stack for every mark, so a date drawn on canvas matches the UI's type.
 * Canvas takes no fallback list per weight, hence the single string.
 */
export const markFont = (weight: number, px: number): string =>
  `${weight} ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
