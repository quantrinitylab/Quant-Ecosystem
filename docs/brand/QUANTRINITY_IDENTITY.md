# Quantrinity Identity Foundation

> Status: foundation proposal for review in #71. This document defines the architecture and constraints before final vector construction. It is not permission to copy another company's mark or trade dress.

## 1. Brand architecture

**QUANTRINITY** is the parent company and masterbrand. Product names are endorsed brands within one family.

| Layer | Name | Primary domain | Role |
| --- | --- | --- | --- |
| Company and ecosystem | QUANTRINITY | `quantrinity.in` | Trust, ownership, platform and corporate presence |
| Identity and mail | QuantMail | `quantmail.in` | Consumer identity root, communication and work hub |
| Product surfaces | QuantChat, QuantAI, QuantDrive, etc. | `<product>.quantrinity.in` | Focused product experiences using one identity |

Required endorsement pattern:

```text
QuantMail
by [Quantrinity mark] QUANTRINITY
```

The endorsement appears on splash screens, authentication, legal/account surfaces, product about views and appropriate launch/loading moments. It must remain quiet: the product name leads; the parent guarantees the experience.

## 2. Mastermark concept

The mastermark is an **original continuous infinity ribbon** representing:

- continuity across apps;
- durable user memory;
- human and agent collaboration;
- compounding utility;
- an Indian company designed for the world.

The symbol must not reuse Meta's proportions, stroke construction, terminal behaviour or gradient placement. An infinity symbol is a shared mathematical form; Quantrinity's distinctive expression comes from its geometry, ribbon logic, wordmark, colour system and motion.

### Geometry constraints

1. One continuous centreline with no decorative duplicate path.
2. Bilateral balance without perfect mechanical symmetry; the right loop may carry a subtle forward bias.
3. Crossing is explicit through ribbon over/under logic, not a small central badge.
4. Stroke thickness remains legible at 16 px.
5. Negative spaces remain open at 16, 24 and 32 px.
6. No container is part of the core mark. App-icon containers are separate assets.
7. No drop shadow, bevel or highlight is required for recognition.
8. The one-colour silhouette must remain unmistakable.

### Colour direction

The full-colour ribbon uses an India-inspired progression:

- **Uday Saffron** — energy and courage;
- **Prakash** — luminous neutral transition, represented by light rather than a literal white stripe;
- **Jeevan Green** — growth and responsibility;
- **Navy intelligence accent** — optional and restrained, never a flag pasted into a logo.

This is cultural inspiration, not a replacement for or stylisation of the national flag. The mark must work internationally without relying on patriotic explanation.

### Required variants

- full-colour on ink;
- full-colour on light;
- solid ink;
- solid white;
- small-size simplified mark;
- favicon/app glyph;
- static and animated marks;
- horizontal and stacked wordmark lockups;
- endorsed product lockups.

## 3. Wordmark

`QUANTRINITY` is set in uppercase for corporate lockups, with custom optical spacing and distinctive treatment around the `Q`, `A`, `R` and `Y`. The final wordmark cannot be a stock font typed without adjustment.

Product names use title case (`QuantMail`, `QuantChat`) and share the `Quant` construction while allowing a product-specific emphasis.

### Voice

- confident, not loud;
- precise, not robotic;
- ambitious, not grandiose;
- Indian in origin, global in execution;
- warm intelligence, not cold automation.

## 4. Endorsement lockups

### Standard

```text
QuantMail  by [mark] QUANTRINITY
```

### Splash

```text
[QuantMail product mark]
QuantMail

by [small Quantrinity mark] QUANTRINITY
```

### Rules

- `by` is lowercase and visually secondary.
- Parent wordmark uses tracked uppercase.
- Endorsement width is no more than 45% of the product wordmark width on splash screens.
- Minimum contrast is 4.5:1 for text.
- Endorsement cannot be placed inside unrelated pills or badges.
- No animation longer than 900 ms before product access.

## 5. Product icon family

Each product icon contains:

1. a unique, task-relevant glyph;
2. a shared optical grid;
3. common corner and stroke behaviour;
4. one product accent spectrum;
5. an optional tiny Quantrinity signature only where legible.

The infinity symbol is not repeated as the dominant glyph for every app. Family resemblance comes from construction, not identical logos.

## 6. Motion signature

The mastermark animation communicates continuity:

1. a single luminous point enters the left loop;
2. the ribbon resolves along one continuous path;
3. the crossing clarifies depth;
4. colour transitions from saffron through light into green;
5. the motion settles without looping indefinitely.

Duration target: 600–900 ms. Reduced-motion mode uses a 150 ms opacity transition. Motion never delays authentication or navigation.

## 7. Current asset disposition

`apps/quantmail/public/quantrinity-mark.svg` captures the approved infinity/tricolour direction but is not production-master quality because it combines:

- a rounded-square container inside the source mark;
- duplicate foreground and shadow paths;
- raster-like lighting effects;
- drop shadow and micro highlights;
- a central detail that becomes noise at favicon scale.

It remains a historical reference until the new mastermark passes silhouette, small-size, contrast and cultural review.

## 8. Acceptance tests

A final mark is not accepted until it passes:

- recognisable silhouette at 16 px;
- clean embroidery/one-colour reproduction;
- no collision with Meta or other major infinity marks;
- contrast on ink, white and photographic backgrounds;
- no reliance on shadow or container;
- clear-space and minimum-size documentation;
- owner approval of full-colour and monochrome variants;
- cultural review of the India-inspired colour narrative.
