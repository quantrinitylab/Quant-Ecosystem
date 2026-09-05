/**
 * Quanty's expression sheet, as data.
 *
 * The mascot sheet specifies thirty-five expressions. The eight that shipped first were
 * eight arms of a `switch`, and that is exactly the wrong shape for thirty-five: every
 * new face would re-declare its own eyes, its own brow arithmetic and its own mouth, and
 * the fourteenth one to be written would not match the third. So a face is a *record* —
 * which eyes, how far open, where they look, whether there are brows, which mouth, what
 * else is on the panel — and one painter in `Quanty.tsx` interprets every record. Adding
 * a face is a line of data; changing what a `capsule` eye looks like changes all of them.
 *
 * The thirty-five are not decorative. Every one of them has to be reachable from
 * something the product actually does — a send, an index, a lost connection, a full
 * quota — because the brief is that Quanty reacts to what it is doing, and a face
 * nothing can trigger is a sticker. `reactions.ts` owns that mapping from event to
 * face; this file owns how each face is drawn, and the two are kept apart so a product
 * event can be re-pointed at a different face without touching any geometry.
 */

/** The eye shapes. Every face picks one per side, so `wink` is a pair, not a special case. */
export type EyeKind =
  | 'capsule' /** the resting vertical pill */
  | 'arch' /** ∩ — a smiling eye, stroked not filled */
  | 'shut' /** a shallow lid curving down: asleep, not sad */
  | 'bar' /** a squat horizontal bar: hooded, bored, working */
  | 'wide' /** the capsule, oversized: startled */
  | 'droop' /** capsule with the lid down from above: sleepy */
  | 'star' /** four-point twinkle: awe */
  | 'heart' /** for the faces that are fond of you */
  | 'cross' /** an X: dead, failed */
  | 'spiral' /** dizzy, and the only eye that spins */
  | 'dot'; /** a small dim circle: powered down */

/** The mouths. `null` is a face with no mouth, which is what the hero sheet shows. */
export type MouthKind =
  | 'smile'
  | 'grin'
  | 'frown'
  | 'flat'
  | 'wobble'
  | 'o'
  | 'gasp'
  | 'smirk'
  | 'clench';

/** Everything else that can appear on the panel. Drawn after the face, over it. */
export type ExtraKind =
  | 'tears'
  | 'dots' /** the three-dot ellipsis: a process, not an emotion */
  | 'sweat'
  | 'zzz'
  | 'spark'
  | 'confetti'
  | 'blush'
  | 'exclaim'
  | 'question'
  | 'pulse'; /** a ring breathing outward: listening */

/** One face. Everything optional falls back to the resting pose. */
export interface FaceSpec {
  /** One kind for both eyes, or `[left, right]` when they differ. */
  eyes: EyeKind | readonly [EyeKind, EyeKind];
  /** Openness multiplier, applied on top of the blink and the press-squint. */
  lid?: number;
  /** Eye box, as a multiple of the family's 15×27. */
  eyeW?: number;
  eyeH?: number;
  /** Where the eyes sit, in buffer units, relative to the resting centre. */
  gaze?: readonly [number, number];
  /**
   * Brow tilt. `sign: 1` drops the inner ends into `\/` — a threat; `sign: -1` raises
   * them into `/\` — a plea. It is the single most legible axis on the whole panel at
   * 26px, which is why so many of the thirty-five differ only here.
   */
  brow?: { readonly sign: 1 | -1; readonly tilt: number };
  mouth?: MouthKind;
  extras?: readonly ExtraKind[];
  /** How far shut this face may blink. `1` never blinks — for held states. */
  blinkFloor?: number;
  /** LED brightness multiplier. `offline` is dim; `celebrate` runs hot. */
  bloom?: number;
  /**
   * What a screen reader is told. The mascot is `role="img"`, so its accessible name is
   * the only channel a non-sighted user has for a state the sighted user reads off a
   * face — "Quanty is thinking" is information, not decoration.
   */
  label: string;
}

/**
 * The sheet. Thirty-five, grouped the way the reference groups them, and the first eight
 * keep their original names because twenty-two call sites already pass them.
 *
 * Ordering within a group runs from the mildest reading to the strongest, because that is
 * the axis `reactions.ts` escalates along: a retry is `determined`, a second failure is
 * `annoyed`, a hard error is `error`.
 */
export const FACES = {
  // ---- resting and content ----
  idle: { eyes: 'capsule', label: 'idle' },
  calm: { eyes: 'capsule', lid: 0.86, mouth: 'smile', label: 'calm' },
  happy: { eyes: 'arch', label: 'happy' },
  grateful: { eyes: 'arch', eyeW: 0.9, mouth: 'smile', label: 'grateful' },
  // Bigger arches and **no spark**, which is the interesting half. `joy` and `success` are both
  // `arch` + `grin`, and `joy`'s `blush` is invisible to a lit-pixel measurement by design — it
  // is a 28%-alpha ember radial, not an LED, and it measured as a real but unlit +12 red lift on
  // the cheek. So the only *lit* difference between the sheet's happiest face and its
  // done-something face was arch size at 1.1/1.2 against 1.0/1.0, and the pair sat 17 lit pixels
  // apart out of ~100. The spark made it worse rather than better: it is ink the two faces
  // *share*, so it lifted both and separated neither.
  //
  // 1.25/1.45 is what the geometry allows. `arcShape`'s apex is `cy - 0.36 * bulge`, so a 17.4
  // bulge peaks at y 41.7 and a stroke of 6 puts its top edge at 38.7 — clear of the brow band
  // at 26..32 by nearly seven units. Span 13.1 puts the right arch's outer end at 79.1 (82.1
  // with the stroke), inside the bezel at 93.6, and leaves a 5.8-unit gap between the two
  // arches so they still read as two eyes.
  joy: {
    eyes: 'arch',
    eyeW: 1.25,
    eyeH: 1.45,
    mouth: 'grin',
    extras: ['blush'],
    label: 'delighted',
  },
  love: { eyes: 'heart', mouth: 'smile', extras: ['blush'], label: 'fond' },
  // `eyeH` is not decoration here. `bar` and `capsule` are the *same* rounded rect at the same
  // 15×27 — only the corner radius differs, 3.2 against 7.5 — so a `bar` face that does not
  // shorten its eyes is a capsule with sharper corners and nothing else. `proud` was the one
  // `bar` in the sheet without an `eyeH`, and it measured 23 lit pixels from `calm`, which is a
  // filled capsule under a lid of 0.86.
  //
  // Shortening it alone was not enough, and the way it failed is the useful part: at `eyeH: 0.5`
  // under `lid: 0.8` the slit is 10.8 units, which is `working`'s 0.4 exactly, and the pair went
  // to 20 — worse than the collision being fixed, because `ai:answered` and `mail:sending` are
  // both in the table and land on the same mount. Nine of the thirty-five use `bar`, spread over
  // `eyeH` 0.3 to 0.5, which is 8.1 to 13.5 units — about two device pixels of range at 26px for
  // nine faces. Height cannot be what separates them; brow, mouth, extras and gaze are.
  //
  // So `proud` takes the one axis none of the other eight uses: it looks *up*. A declared gaze
  // also drifts (see `paintFace`), so the ink moves rather than merely sitting off-centre, and
  // "pleased with itself" is a face that is not looking at you.
  proud: {
    eyes: 'bar',
    eyeH: 0.46,
    gaze: [0, -4],
    mouth: 'smirk',
    extras: ['spark'],
    label: 'pleased',
  },
  wink: { eyes: ['capsule', 'shut'], mouth: 'smirk', label: 'winking' },
  // A hello is a *gesture*, not a louder `success`. The draft before this one made it `arch`
  // eyes with a grin and a spark, which is `success` with the arches 12% taller — 15 lit pixels
  // apart at 26px, and both are reachable from the table on the same mount (`sys:greeting`
  // against `mail:sent`), so that pair is the one collision on the sheet a user could actually
  // catch. One eye shut turns it into a wink-and-wave: different silhouette, same warmth, and
  // still distinct from `wink` itself, which is a capsule and a smirk rather than an arch and
  // a grin.
  greeting: { eyes: ['arch', 'shut'], mouth: 'grin', extras: ['spark'], label: 'saying hello' },
  relieved: { eyes: 'shut', mouth: 'smile', label: 'relieved' },

  // ---- working. These are the faces the product wears most, so none of them is loud. ----
  thinking: {
    eyes: 'bar',
    eyeH: 0.35,
    gaze: [4, -5],
    extras: ['dots'],
    blinkFloor: 0.72,
    label: 'thinking',
  },
  focused: { eyes: 'bar', eyeH: 0.42, mouth: 'flat', blinkFloor: 0.8, label: 'concentrating' },
  working: { eyes: 'bar', eyeH: 0.4, extras: ['dots', 'spark'], blinkFloor: 0.8, label: 'working' },
  // Two eye fields and a blink floor, because the ring alone was not enough. Rasterised at
  // 26px this face differed from `idle` by four lit pixels out of 1089 — and `ai:listening`
  // latches for fifteen seconds, so it is the one state a user has time to stare at. The ring
  // is fixed in `paintPulse`; here the eyes shorten a fifth and stop blinking shut, because
  // something that is attending to you does not close its eyes.
  listening: {
    eyes: 'capsule',
    eyeW: 1.08,
    eyeH: 0.82,
    extras: ['pulse'],
    blinkFloor: 0.5,
    label: 'listening',
  },
  curious: { eyes: ['capsule', 'wide'], extras: ['question'], label: 'curious' },
  // Brow set, and the ellipsis — because a retry is a *process*, and the two other faces the
  // product wears during a 15-second latch (`thinking`, `working`) both carry `dots`. Wearing
  // the same token for the same meaning is the point; what makes this one "trying again" rather
  // than "thinking" is the brow, which the file's own note calls the most legible axis at 26px.
  //
  // The flat mouth had to go to make room, and that is a measurement, not a preference:
  // `thinkingDots` draws at y 74 and `flat` is a 13×3.2 bar at y 75, so the two would have
  // overlapped into one lit smear across the mouth row. Losing it costs nothing — `determined`
  // sat 27 lit pixels from `annoyed` at 26px, the two differed only in brow tilt (0.3 against
  // 0.22, same sign) and 3.8 units of eye height, and both are table-reachable on the same mount
  // (`ai:retrying` against `mail:spam`). Persistence and contempt cannot be the same face.
  determined: {
    eyes: 'bar',
    eyeH: 0.48,
    brow: { sign: 1, tilt: 0.3 },
    extras: ['dots'],
    blinkFloor: 0.78,
    label: 'trying again',
  },

  // ---- surprise, escalating ----
  surprised: { eyes: 'wide', eyeW: 1.1, eyeH: 1.02, mouth: 'o', blinkFloor: 1, label: 'surprised' },
  shock: { eyes: 'wide', eyeW: 1.2, eyeH: 1.06, mouth: 'gasp', blinkFloor: 1, label: 'shocked' },
  wow: { eyes: 'star', mouth: 'o', extras: ['spark'], blinkFloor: 1, label: 'impressed' },
  alarm: {
    eyes: 'wide',
    eyeW: 1.16,
    eyeH: 1.04,
    brow: { sign: -1, tilt: 0.2 },
    mouth: 'gasp',
    extras: ['exclaim'],
    blinkFloor: 1,
    label: 'alarmed',
  },

  // ---- unsure ----
  confused: { eyes: ['bar', 'capsule'], eyeH: 0.5, extras: ['question'], label: 'confused' },
  nervous: { eyes: 'capsule', lid: 0.72, mouth: 'wobble', extras: ['sweat'], label: 'nervous' },
  worried: {
    eyes: 'capsule',
    lid: 0.62,
    brow: { sign: -1, tilt: 0.3 },
    mouth: 'wobble',
    extras: ['sweat'],
    label: 'worried',
  },

  // ---- low energy. Dimmer LEDs, because a tired panel is a darker panel. ----
  bored: { eyes: 'bar', eyeH: 0.3, gaze: [-5, 2], mouth: 'flat', bloom: 0.85, label: 'bored' },
  sleepy: {
    eyes: 'droop',
    lid: 0.5,
    mouth: 'flat',
    extras: ['zzz'],
    blinkFloor: 0.35,
    bloom: 0.7,
    label: 'sleepy',
  },

  // ---- sorrow, escalating ----
  sad: {
    eyes: 'capsule',
    lid: 0.55,
    brow: { sign: -1, tilt: 0.34 },
    mouth: 'frown',
    label: 'sad',
  },
  sorry: {
    eyes: 'shut',
    brow: { sign: -1, tilt: 0.28 },
    mouth: 'frown',
    extras: ['sweat'],
    label: 'apologetic',
  },
  cry: {
    eyes: 'shut',
    brow: { sign: -1, tilt: 0.38 },
    mouth: 'frown',
    extras: ['tears'],
    label: 'crying',
  },

  // ---- displeasure, escalating. Never pointed at the user — see `reactions.ts`. ----
  // Both use `bar` eyes, because the whole distinction lives in the brow and the mouth and a
  // rounded eye under a hard `\/` brow reads as *startled*. `annoyed` is the narrower slit
  // with the softer tilt and a smirk — contempt; `angry` opens the slit slightly, drives the
  // brow twice as hard, clenches and runs the LEDs hot. It is `bar` and not a hooded capsule
  // for a reason worth keeping: at `lid: 0.8` a capsule is 21.6 units tall, which is barely
  // hooded at all, and the documented separation is that **grief is slack and rage is
  // clenched** — a flattened eye is the clenched one.
  annoyed: {
    eyes: 'bar',
    eyeH: 0.34,
    brow: { sign: 1, tilt: 0.22 },
    mouth: 'smirk',
    label: 'unimpressed',
  },
  angry: {
    eyes: 'bar',
    eyeH: 0.4,
    brow: { sign: 1, tilt: 0.46 },
    mouth: 'clench',
    bloom: 1.15,
    label: 'angry',
  },

  // ---- outcomes. Almost always arrive as reactions; `reactions.ts` owns how long. ----
  success: { eyes: 'arch', mouth: 'grin', extras: ['spark'], label: 'done' },
  celebrate: {
    eyes: 'star',
    mouth: 'grin',
    extras: ['confetti', 'spark'],
    bloom: 1.3,
    label: 'celebrating',
  },
  dizzy: { eyes: 'spiral', mouth: 'wobble', label: 'dizzy' },
  error: {
    eyes: 'cross',
    brow: { sign: 1, tilt: 0.2 },
    mouth: 'clench',
    extras: ['exclaim'],
    blinkFloor: 1,
    bloom: 0.9,
    label: 'something went wrong',
  },
  /**
   * Powered down, and the only face that is allowed to be nearly invisible: two dim
   * dots at a third of the usual bloom. It never blinks, because a blink is a sign of
   * life and this face's whole job is to say there is none.
   */
  offline: { eyes: 'dot', mouth: 'flat', blinkFloor: 1, bloom: 0.32, label: 'offline' },
} as const satisfies Record<string, FaceSpec>;

/**
 * The expression union, derived rather than declared — so a face cannot exist in the
 * sheet without being nameable at a call site, and a name cannot be passed that the
 * painter has no record for. The eight original names are all still keys, so none of
 * the existing `<Quanty expression="…">` call sites changes.
 */
export type QuantyExpression = keyof typeof FACES;

/** Every name, for the lab route and for tests that must cover the whole sheet. */
export const FACE_NAMES = Object.keys(FACES) as readonly QuantyExpression[];

/**
 * The resting face. Anything that decays — a reaction that has run out its hold, a
 * mood with nothing to say — comes back here.
 */
export const BASE_FACE: QuantyExpression = 'idle';

/**
 * Widened to `FaceSpec` on the way out. `FACES` is `as const`, so reading a field off
 * it directly gives a literal type (`0.86`, not `number`), and the painter would then
 * have to be generic over every face to do arithmetic on a lid. One cast at the
 * boundary keeps the table exhaustively typed and the painter plain.
 */
export function faceSpec(expression: QuantyExpression): FaceSpec {
  return FACES[expression] as FaceSpec;
}

/** `eyes` is one kind or a pair; the painter only ever wants the pair. */
export function eyePair(spec: FaceSpec): readonly [EyeKind, EyeKind] {
  // `typeof === 'string'`, not `Array.isArray`: the tuple is `readonly`, and
  // `Array.isArray`'s `arg is any[]` predicate does not narrow a readonly tuple out of
  // a union — it leaves the false branch still holding the string.
  return typeof spec.eyes === 'string' ? [spec.eyes, spec.eyes] : spec.eyes;
}
