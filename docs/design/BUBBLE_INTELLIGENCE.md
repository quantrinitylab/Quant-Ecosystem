# Bubble Intelligence — the QuantAI character spec

> One character, every app. This document is the contract for the mascot that
> represents QuantAI across the Quant ecosystem: the **liquid amber bubble**.

---

## 1. The character

A single glowing amber droplet — one big body, one small satellite bead
orbiting up-right — that _visibly reacts to what the assistant is doing_.
Not motion for motion's sake: every one of its **35 states** is tied to
something the product actually does (a send, an index, a lost connection, a
deploy). A face nothing can trigger is a sticker; this is a colleague.

| Property  | Contract                                                                                                                                                                                                                                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Palette   | Amber ramp only — `#FFD9A0 → #FFB347 → #FF8C42 → #E8752F`, cream `#FFF6E8`, gold `#FFD54A`, ink `#3A1C06`. No new hues. The mascot wears the product's own accent.                                                                      |
| Anatomy   | Body (breathing blob, specular gloss, rim light) + satellite bead (up-right, gently orbiting). No limbs, no badge/full split.                                                                                                           |
| Face      | Ink-on-amber: 11 eye kinds, 9 mouths. The face is the _word_; the prop card is the _sentence_.                                                                                                                                          |
| Props     | Floating chip naming a concrete verb (code, search, check, doc, list, grid, plus, up, bulb, stack, chat, refresh, save, question). Rings: thinking orbit, progress arc, listening pulse, working spin.                                  |
| Rendering | **Canvas 2D** — deliberately not WebGL. QuantSidekick can be mounted many times per page and WebGL contexts are a scarce browser resource (~16/page). 2D gives the same glossy look at a fraction of the cost, in every target browser. |

Source of truth: `packages/shared-ui/src/components/QuantSidekick/BubbleAvatar.tsx`.

---

## 2. The 35 states

Sheet order (indices from `BUBBLE_ORDER`, which is derived from the sheet —
never hand-maintained):

01 Idle · 02 Wake Up · 03 Look Around · 04 Recognize You · 05 Thinking ·
06 Thinking Deep · 07 Idea Spark · 08 Understanding · 09 Reading ·
10 Analyzing · 11 Coding · 12 Refactoring · 13 Debugging · 14 Fixing ·
15 Explaining · 16 Planning · 17 Organizing · 18 Creating · 19 Improving ·
20 Suggesting · 21 Multiple Options · 22 Working · 23 Almost Done ·
24 Completed · 25 Success · 26 Error/Oops · 27 Thinking Again ·
28 Need More Info · 29 Listening · 30 Typing · 31 Searching · 32 Syncing ·
33 Saving · 34 Celebration · 35 Goodbye

Every state is a line of data in `BUBBLE_STATES` — geometry defaults to the
resting pose, so adding a state is one record, not a new painter branch.

### The five QuantSidekick statuses

Existing call sites speak a five-word vocabulary
(`idle | listening | thinking | speaking | acting`). `STATUS_TO_BUBBLE` maps
them onto the sheet (`speaking` → _explaining_, `acting` → _working_), so the
provider contract is unchanged by the character swap.

### QuantMail's face vocabulary

QuantMail's `QuantyExpression` (35 names in
`apps/quantmail/src/lib/quanty/faces.ts`) is a _product_ vocabulary driven by
the `quantyReact` event bus (`mail:sent`, `ai:thinking`, …). The adapter in
`apps/quantmail/src/components/Quanty.tsx` maps each product word onto the
bubble state that carries the same meaning. Rules of the mapping:

- Many-to-one by **meaning**, not by shape: `sad`, `sorry`, `cry`, `angry` all
  land on _error_ — the bubble reports trouble one way, whatever triggered it.
- Words with no closer reading (`wink`, `dizzy`, `offline`) map to the nearest
  gesture so a trigger never blanks the mascot.

---

## 3. Runtime rules (non-negotiable)

1. **One canvas, one rAF loop, zero React renders per frame.** All mutable
   state lives in refs; the painter reads the live state through a ref so a
   changed prop can never restart the loop.
2. **Clocks are desynced per instance.** Each mount seeds `t` at random —
   twenty bubbles on one page must never bob or blink in lockstep.
3. **The loop stops when nobody is looking.** Pauses on
   `visibilitychange` and when scrolled out of view (IntersectionObserver).
4. **`prefers-reduced-motion: reduce` renders one representative frame** and
   stops. Every state must still be _recognisable_ as a still frame — a
   screenshot is how most people meet a mascot.
5. **Blink is irregular** (`d²` easing, hashed jitter, ≈4.4 s period) and
   suppressed for held states (`noBlink`) — something attending to you does
   not close its eyes.
6. **Small-size discipline.** Below 32px the peripherals (chip, rays,
   confetti) do not render: at a 22px mount they are ~5 device px of noise
   beside the eyes. Body, bead and face render at every size.
7. **Fail-safe state names.** An unknown state falls back to `idle`; nothing
   a caller passes may blank the mascot.

---

## 4. Accessibility

- `role="img"` with a **state-aware** accessible name —
  `QuantAI assistant, thinking` — because the label is the only channel a
  non-sighted user has for a state a sighted user reads off the face.
- `title` is the native tooltip channel and is independent of the accessible
  name.
- `data-state` carries the caller's raw state for styling and tests; the
  canvas is `aria-hidden`.
- Celebratory/attention flashes (rays, burst, confetti) are motion-gated with
  everything else under rule 3.

---

## 5. Where it mounts

| Surface                        | Component                                | Notes                                                             |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------------------------- |
| Every app (floating assistant) | `QuantSidekick` → `BubbleAvatar`         | Via `EcosystemShell`; the amber panel matches the character.      |
| QuantMail everywhere           | `components/Quanty.tsx` → `BubbleAvatar` | Same component, adapter keeps `QuantyProps` + `QuantyExpression`. |
| `quanttrinity` AI page         | `AlienAvatar` export                     | Historical name, same component family.                           |

**Adding a surface = import `BubbleAvatar` (or the `AlienAvatar`/`Quanty`
aliases) and pass a state. Never fork the painter.**

---

## 6. Lab

QuantMail exposes a gated gallery at **`/lab/bubble`**: all 35 states live,
side by side, with a play-tour and dark/light toggle. It 404s in production
unless `QUANT_ENABLE_LABS=1` (same policy as `/lab/marks`).

---

## 7. History

The previous characters — a green helmeted alien (shared-ui) and an obsidian
LED-face robot (QuantMail's 1,600-line painter) — were each internally
competent and mutually inconsistent, which is how mascots drift. This spec
exists to prevent that: one sheet, one painter, data-driven states, and a
test pinning the count.
