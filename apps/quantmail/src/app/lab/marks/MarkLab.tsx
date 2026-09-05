'use client';

/**
 * Four candidates, one material, and six dials — the whole point of which is
 * that the *pick* is cheap and the *consequence* is not. Whatever gets chosen
 * here locks the material for all six marks, so the four cards are deliberately
 * separated along one axis each rather than being four vague moods:
 *
 *   Instrument   ember 10%  — the brief's own read of QuantGit: mostly metal
 *   Filmed       ember 10% + thin-film on the bevel only
 *   Furnace      ember 42%  — what Contacts will want, shown on QuantGit so the
 *                             top and bottom of the family dial are comparable
 *   Satin        no machining marks, low roughness, slight film
 *
 * The scale row underneath is the part that actually decides it. A material that
 * only works at 220px is not a material, it is a wallpaper.
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { MarkGL } from '../../../components/marks/MarkGL';
import { QuantGitGraphiteMark } from '../../../components/marks/GraphiteMark';
import { QuantCalendarLogo } from '../../../components/QuantCalendarLogo';
import { QuantContactsLogo } from '../../../components/QuantContactsLogo';
import { QuantDriveLogo } from '../../../components/QuantDriveLogo';
import { QuantGitLogo } from '../../../components/QuantGitLogo';
import { QuantMailLogo } from '../../../components/QuantMailLogo';
import { Quanty } from '../../../components/Quanty';
import { FACE_NAMES } from '../../../lib/quanty/faces';
import {
  REACTIONS,
  quantyReact,
  useQuantyMood,
  type QuantyEvent,
} from '../../../lib/quanty/reactions';
import { buildMarkShader } from '../../../lib/marks/material.glsl';
import { QUANTGIT_SDF_GLSL } from '../../../lib/marks/quantgit.glsl';

type Dials = {
  uEmber: number;
  uIridescence: number;
  uBrushed: number;
  uRough: number;
  uYaw: number;
  uPitch: number;
};

type Variant = { id: string; name: string; note: string; dials: Dials };

const VARIANTS: readonly Variant[] = [
  {
    id: 'instrument',
    name: 'Instrument',
    note: 'Ember 10%. Brushed body, no film. The reading, not the housing.',
    dials: { uEmber: 0.1, uIridescence: 0, uBrushed: 1, uRough: 0.34, uYaw: -0.22, uPitch: 0.16 },
  },
  {
    id: 'filmed',
    name: 'Filmed',
    note: 'Same ember, thin-film rationed to the grazing bevel only.',
    dials: { uEmber: 0.1, uIridescence: 0.4, uBrushed: 1, uRough: 0.3, uYaw: -0.22, uPitch: 0.16 },
  },
  {
    id: 'furnace',
    name: 'Furnace',
    note: 'Ember 42%. Wider, deeper channel — the far end of the family dial.',
    dials: {
      uEmber: 0.42,
      uIridescence: 0,
      uBrushed: 0.7,
      uRough: 0.38,
      uYaw: -0.22,
      uPitch: 0.16,
    },
  },
  {
    id: 'satin',
    name: 'Satin',
    note: 'No machining marks, low roughness. Reads moulded, not milled.',
    dials: { uEmber: 0.2, uIridescence: 0.2, uBrushed: 0, uRough: 0.14, uYaw: -0.22, uPitch: 0.16 },
  },
];

const DIALS: readonly {
  key: keyof Dials;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}[] = [
  { key: 'uEmber', label: 'Ember ratio', min: 0, max: 1, step: 0.01, hint: 'channel width + gain' },
  {
    key: 'uIridescence',
    label: 'Thin film',
    min: 0,
    max: 1,
    step: 0.01,
    hint: 'grazing bevel only',
  },
  { key: 'uBrushed', label: 'Machining', min: 0, max: 1, step: 0.01, hint: 'anisotropic sweep' },
  { key: 'uRough', label: 'Roughness', min: 0.05, max: 0.6, step: 0.01, hint: 'satin → matte' },
  { key: 'uYaw', label: 'Yaw', min: -0.7, max: 0.7, step: 0.01, hint: 'radians' },
  { key: 'uPitch', label: 'Pitch', min: -0.5, max: 0.5, step: 0.01, hint: 'radians' },
];

const FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#090A0C]';

/**
 * Every size a `<Quanty>` is mounted at in the product, plus the 104px lab hero for the
 * comparison. 20 is the composer footer, 22 the header trigger and the chat avatars, 24 the
 * composer strip, 26 the transcript, 34 and 36 the two assistant headers, 64 the CodeHub card.
 * Seven of the eight are under 40px, which is the entire point of measuring here.
 */
const RING_SIZES = [20, 22, 24, 26, 34, 36, 64, 104];

/**
 * The six app marks, at the sizes that decide them.
 *
 * 36 is the real one — `AppShell.tsx:726` mounts the whole family there, and the bottom nav and
 * the switcher are 20–24. 64 and 104 are here to judge *construction*, not to ship: a mark whose
 * layering only resolves at 104px has its detail in the wrong place, and that is exactly the
 * failure the calendar was rebuilt for. Read 36 first and 104 last, never the other way round.
 */
const APP_MARK_SIZES = [20, 24, 32, 36, 64, 104];

const APP_MARKS = [
  {
    key: 'calendar',
    label: 'Calendar',
    render: (size: number) => <QuantCalendarLogo size={size} />,
  },
  {
    key: 'contacts',
    label: 'Contacts',
    render: (size: number) => <QuantContactsLogo size={size} />,
  },
  { key: 'drive', label: 'Drive', render: (size: number) => <QuantDriveLogo size={size} /> },
  {
    key: 'mail',
    label: 'Mail',
    render: (size: number) => <QuantMailLogo size={size} interactive={false} />,
  },
  { key: 'git', label: 'QuantGit', render: (size: number) => <QuantGitLogo size={size} /> },
  { key: 'quanty', label: 'Quanty', render: (size: number) => <Quanty size={size} /> },
];

/**
 * The mail mark's three unread paths, as three cells.
 *
 * `interactive={false}` with a real count is the one production surface renders
 * (`AppShell`), so it is the one that has to announce; the interactive case is
 * rendered here because no product surface mounts it, and an unexercised branch
 * is where a missing accessible name lives.
 */
const UNREAD_CASES = [
  {
    label: 'decorative, 0 unread',
    render: (size: number) => <QuantMailLogo size={size} interactive={false} />,
  },
  {
    label: 'decorative, 7 unread — AppShell',
    render: (size: number) => <QuantMailLogo size={size} interactive={false} unreadCount={7} />,
  },
  {
    label: 'interactive, 128 unread',
    render: (size: number) => <QuantMailLogo size={size} unreadCount={128} />,
  },
];

function format(value: number): string {
  return value.toFixed(2);
}

/**
 * The three scale columns are the same card three times, so they are one
 * component — the rule that a repeated visual pattern becomes a primitive
 * applies inside a lab page too, and it is what keeps the marks baseline-aligned
 * across all three columns.
 */
function Panel({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#282C35] bg-[#111318] p-5">
      <p className="text-[11px] uppercase tracking-[0.12em] text-[#A1A4AC]">{label}</p>
      <p className="mt-1 text-[11px] text-[#6B6E76]">{note}</p>
      <div className="no-scrollbar mt-4 flex items-end gap-5 overflow-x-auto pb-1">{children}</div>
    </div>
  );
}

/**
 * The mascot sheet, as a live sheet.
 *
 * Thirty-five faces built from a declarative table is exactly the kind of change that
 * typechecks perfectly and renders two of them identically — a `bar` at `eyeH: 0.34` beside
 * one at `0.4` either separates or it does not, and no amount of reading the numbers tells
 * you which. So the sheet is rendered at three sizes: 104 because that is the hero mount,
 * 40 because that is the copilot, and 26 because that is the sidebar, and a face that only
 * works at 104 has failed the same way a material that only works at 250px has.
 */
function FaceSheet() {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
      {FACE_NAMES.map((name) => (
        <div key={name} className="flex flex-col items-center gap-2">
          <Quanty expression={name} size={104} />
          <div className="flex items-end gap-2">
            <Quanty expression={name} size={40} />
            <Quanty expression={name} size={26} />
          </div>
          <code className="text-[11px] text-[#A1A4AC]">{name}</code>
        </div>
      ))}
    </div>
  );
}

/**
 * The other half of the complaint — that the mascot never *reacts*. Every event in
 * `REACTIONS` gets a button, and one mood-driven Quanty listens to all of them, so the
 * latch/pulse/priority behaviour is testable by hand rather than by reading the table.
 */
function ReactionBench() {
  const mood = useQuantyMood();
  const events = Object.keys(REACTIONS) as QuantyEvent[];
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
      <div className="flex shrink-0 flex-col items-center gap-2">
        <Quanty expression={mood} size={104} bob />
        <code className="text-[11px] text-[#A1A4AC]">{mood}</code>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {events.map((event) => (
          <button
            key={event}
            type="button"
            onClick={() => quantyReact(event)}
            className="min-h-11 rounded-lg border border-[#282C35] bg-[#16181D] px-2.5 text-[11px] text-[#A1A4AC] transition-colors hover:border-[#5C3016] hover:text-[#F5F5F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
          >
            {event}
          </button>
        ))}
      </div>
    </div>
  );
}

export function MarkLab() {
  // Built once. The material is ~300 lines of GLSL and every mount of every
  // canvas would otherwise re-concatenate it.
  const source = useMemo(() => buildMarkShader(QUANTGIT_SDF_GLSL), []);
  const [selected, setSelected] = useState<string>(VARIANTS[0]!.id);
  const [dials, setDials] = useState<Dials>({ ...VARIANTS[0]!.dials });
  const [copied, setCopied] = useState(false);
  const [shaderError, setShaderError] = useState<string | null>(null);

  // One report is enough: every canvas on the page compiles the same source, so
  // eight identical logs would just push the useful line off the screen.
  const reportFailure = useCallback((reason: string) => {
    setShaderError((prev) => prev ?? reason);
  }, []);

  const pick = useCallback((variant: Variant) => {
    setSelected(variant.id);
    setDials({ ...variant.dials });
  }, []);

  const setDial = useCallback((key: keyof Dials, value: number) => {
    // Touching a dial means the pick is no longer one of the four, and saying so
    // is the difference between a lab and a toy.
    setSelected('custom');
    setDials((prev) => ({ ...prev, [key]: value }));
  }, []);

  const json = useMemo(() => JSON.stringify(dials, null, 2), [dials]);

  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(json).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      },
      () => setCopied(false),
    );
  }, [json]);

  return (
    <main id="main-content" tabIndex={-1} className="min-h-screen bg-[#090A0C] px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-[1180px]">
        <header>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#6B6E76]">
            Internal · not a product route
          </p>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight text-[#F5F5F5]">
            Mark material lab
          </h1>
          <p className="mt-2 max-w-[68ch] text-[13px] leading-relaxed text-[#A1A4AC]">
            One material for all six marks: a graphite body under raking light, with the accent
            arriving as heat from the floor of a milled channel rather than as paint on top. Pick a
            candidate below — that pick locks the family, and Calendar, Contacts, Drive, Mail and
            Quanty are then the same shader with a different channel network.
          </p>
        </header>

        {shaderError !== null && (
          <div
            className="mt-6 rounded-xl border border-[#5C3016] bg-[#2B1A11] p-4"
            role="status"
            data-testid="shader-error"
          >
            <p className="text-[13px] font-medium text-[#FF8C42]">
              No WebGL tier — every mark below is the SVG twin
            </p>
            <pre className="no-scrollbar mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] leading-relaxed text-[#A1A4AC]">
              {shaderError}
            </pre>
          </div>
        )}

        <section className="mt-8" aria-labelledby="candidates">
          <h2 id="candidates" className="text-[13px] font-medium text-[#F5F5F5]">
            Four candidates
          </h2>
          <p className="mt-1 text-[11px] text-[#6B6E76]">
            Each differs from “Instrument” along exactly one axis, so the comparison means
            something.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {VARIANTS.map((variant) => (
              <button
                key={variant.id}
                type="button"
                onClick={() => pick(variant)}
                aria-pressed={selected === variant.id}
                className={`flex flex-col rounded-xl border bg-[#111318] p-4 text-left transition-colors duration-200 ${
                  selected === variant.id
                    ? 'border-[#5C3016]'
                    : 'border-[#282C35] hover:border-[#3A404D]'
                } ${FOCUS}`}
              >
                <MarkGL
                  fragmentSource={source}
                  uniforms={variant.dials}
                  size={172}
                  title={`QuantGit — ${variant.name}`}
                  fallback={<QuantGitGraphiteMark size={172} />}
                  className="self-center"
                />
                <span className="mt-3 flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-medium text-[#F5F5F5]">{variant.name}</span>
                  <span className="text-[11px] tabular-nums text-[#6B6E76]">
                    {Math.round(variant.dials.uEmber * 100)}% ember
                  </span>
                </span>
                <span className="mt-1 text-[11px] leading-snug text-[#6B6E76]">{variant.note}</span>
              </button>
            ))}
          </div>
        </section>
        <section
          className="mt-10 grid gap-6 rounded-xl border border-[#282C35] bg-[#111318] p-5 lg:grid-cols-[300px_1fr]"
          aria-labelledby="tuner"
        >
          <div className="flex flex-col items-center justify-center gap-3">
            <MarkGL
              fragmentSource={source}
              uniforms={dials}
              size={252}
              title="QuantGit — tuned"
              fallback={<QuantGitGraphiteMark size={252} />}
              onFailure={reportFailure}
            />
            <p className="text-[11px] text-[#6B6E76]">
              Hover it: the ember lifts on the 120 / 380 ms curve.
            </p>
          </div>
          <div>
            <h2 id="tuner" className="text-[13px] font-medium text-[#F5F5F5]">
              Dials
            </h2>
            <p className="mt-1 text-[11px] text-[#6B6E76]">
              Ember ratio widens and deepens the milled channel, so more ember is more cut metal —
              not just a brighter light.
            </p>
            <div className="mt-3">
              {DIALS.map((dial) => (
                <label
                  key={dial.key}
                  className="block border-t border-[#282C35] py-1 first:border-t-0"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-[0.12em] text-[#A1A4AC]">
                      {dial.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-[#6B6E76]">
                      {format(dials[dial.key])} · {dial.hint}
                    </span>
                  </span>
                  <input
                    type="range"
                    min={dial.min}
                    max={dial.max}
                    step={dial.step}
                    value={dials[dial.key]}
                    onChange={(event) => setDial(dial.key, Number(event.target.value))}
                    className={`h-[44px] w-full cursor-pointer accent-[#FF8C42] ${FOCUS}`}
                  />
                </label>
              ))}
            </div>
          </div>
        </section>
        <section className="mt-10" aria-labelledby="scale">
          <h2 id="scale" className="text-[13px] font-medium text-[#F5F5F5]">
            The part that actually decides it
          </h2>
          <p className="mt-1 max-w-[68ch] text-[11px] leading-snug text-[#6B6E76]">
            A material that only works at 250px is wallpaper. 96px is the WebGL tier’s floor — 48
            and 32 are shown{' '}
            <em className="not-italic text-[#A1A4AC]">to prove why the twin exists</em>: a
            raymarcher gets about one sample per pixel, so at 32px the ember filament is 0.9px and
            the dark ring around it is thinner still — the cut stops reading as a cut. Everything
            below 44px — favicon, tab, email, print, and anything under
            <code className="px-1 text-[#A1A4AC]">prefers-reduced-motion</code> — is the SVG twin,
            same six tokens, same five points, optically sized in three tiers.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Panel label="WebGL hero tier" note="96px and up. Below that it is mush, by design.">
              {[96, 48, 32].map((size) => (
                <MarkGL
                  key={size}
                  fragmentSource={source}
                  uniforms={dials}
                  size={size}
                  animate={false}
                  interactive={false}
                  title={`QuantGit at ${size}px`}
                  fallback={<QuantGitGraphiteMark size={size} />}
                />
              ))}
            </Panel>
            <Panel label="SVG twin" note="literal ≥44 · groove 1.7x at 24–43 · no plate under 24">
              {[96, 48, 32, 16].map((size) => (
                <QuantGitGraphiteMark key={size} size={size} />
              ))}
            </Panel>
            <Panel label="Current mark" note="orange plate, dark knockout — for reference">
              {[96, 48, 32, 16].map((size) => (
                <QuantGitLogo key={size} size={size} />
              ))}
            </Panel>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="faces">
          <h2 id="faces" className="text-[13px] font-medium text-[#F5F5F5]">
            Quanty — the whole sheet, at three sizes
          </h2>
          <p className="mt-1 max-w-[68ch] text-[11px] leading-snug text-[#6B6E76]">
            Thirty-five faces, one painter. Read the 26px column, not the 104px one: that is the
            sidebar, the launcher and the send button, and a face that needs 104px to be legible is
            a face the product never actually shows.
          </p>
          <div className="mt-4">
            <FaceSheet />
          </div>
        </section>

        <section className="mt-10" aria-labelledby="ring">
          <h2 id="ring" className="text-[13px] font-medium text-[#F5F5F5]">
            The ring, at every size the product actually mounts
          </h2>
          <p className="mt-1 max-w-[68ch] text-[11px] leading-snug text-[#6B6E76]">
            The sheet above proves the faces are distinguishable; this row exists because the ring
            was not, and for a reason no single-size view can show. A stroke is measured in buffer
            units and the buffer is fitted to the CSS box, so one unit buys{' '}
            <code className="px-1 text-[#A1A4AC]">dpr × size / 100</code> device pixels — the 2.3
            units that read as a rainbow at 104px are three quarters of one pixel at 22px.{' '}
            <code className="px-1 text-[#A1A4AC]">ringWidthForSize</code> holds the weight and{' '}
            <code className="px-1 text-[#A1A4AC]">ringVividness</code> raises the chroma as the box
            shrinks. Quanty above, QuantGit below: the two share the primitive, so both have to be
            read, and 20 through 36 is where every product mount lives.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-5 rounded-xl border border-[#282C35] bg-[#111318] p-5">
            {RING_SIZES.map((size) => (
              <div key={size} className="flex flex-col items-center gap-2">
                <Quanty size={size} title={`Quanty at ${size}px`} />
                <QuantGitLogo size={size} title={`QuantGit at ${size}px`} />
                <code className="text-[10px] text-[#6B6E76]">{size}px</code>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="family">
          <h2 id="family" className="text-[13px] font-medium text-[#F5F5F5]">
            The whole family, at the sizes that decide it
          </h2>
          <p className="mt-1 max-w-[68ch] text-[11px] leading-snug text-[#6B6E76]">
            Six marks, one silhouette, one light rig — and the row is the point. Judging a mark on
            its own hero shot is how the calendar shipped value-inverted from its reference: the
            grey sheet under it looked like depth at 104px and like a smudge at 36. Read the{' '}
            <code className="px-1 text-[#A1A4AC]">36px</code> column first, because
            <code className="px-1 text-[#A1A4AC]">AppShell</code> mounts every one of these there,
            then scan down it — a suite reads as a suite when the whole column shares a light
            direction and a material, not when each mark is separately pretty.
          </p>
          <div className="mt-4 overflow-x-auto no-scrollbar rounded-xl border border-[#282C35] bg-[#111318] p-5">
            <div className="w-max">
              {/*
                Every cell is `shrink-0`, header included. Without it the header row — whose
                content is wider than the scroller — shrank its 104px cells to 55px while the
                mark rows below held theirs, so the labels sat between the columns they named.
                A size sweep whose labels are off by one is worse than no labels.
              */}
              <div className="flex items-end gap-6">
                <span className="w-[72px] shrink-0" aria-hidden="true" />
                {APP_MARK_SIZES.map((size) => (
                  <span
                    key={size}
                    className="w-[104px] shrink-0 text-center text-[10px] text-[#6B6E76]"
                  >
                    {size}px
                  </span>
                ))}
              </div>
              {APP_MARKS.map((mark) => (
                <div key={mark.key} className="mt-4 flex items-center gap-6">
                  <span className="w-[72px] shrink-0 text-[11px] text-[#A1A4AC]">{mark.label}</span>
                  {APP_MARK_SIZES.map((size) => (
                    <span
                      key={size}
                      className="flex w-[104px] shrink-0 items-center justify-center"
                    >
                      {mark.render(size)}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="unread">
          <h2 id="unread" className="text-[13px] font-medium text-[#F5F5F5]">
            The mail mark carrying a count
          </h2>
          <p className="mt-1 max-w-[68ch] text-[11px] leading-snug text-[#6B6E76]">
            Three states, because unread is the one thing this mark says beyond its own name and all
            three used to be wrong. The old mark spent it on{' '}
            <code className="px-1 text-[#A1A4AC]">0.7</code> of a unit of extra pupil radius, which
            no eye resolves at 20px; it is now warm light inside the envelope, under the flap.{' '}
            <code className="px-1 text-[#A1A4AC]">AppShell</code> mounts the middle case — a real
            count on a decorative mark — and until now painted the pill inside an{' '}
            <code className="px-1 text-[#A1A4AC]">aria-hidden</code> wrapper, so the number was on
            screen and announced nowhere. Read each cell&apos;s screen-reader text below it.
          </p>
          <div className="mt-4 flex flex-wrap gap-6">
            {UNREAD_CASES.map((unread) => (
              <div
                key={unread.label}
                className="flex w-[150px] flex-col items-center gap-3 rounded-xl border border-[#282C35] bg-[#111318] p-5"
              >
                <div className="flex items-end gap-4">{unread.render(36)}</div>
                {unread.render(20)}
                <code className="text-center text-[11px] leading-snug text-[#A1A4AC]">
                  {unread.label}
                </code>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10" aria-labelledby="reactions">
          <h2 id="reactions" className="text-[13px] font-medium text-[#F5F5F5]">
            …and what makes one arrive
          </h2>
          <p className="mt-1 max-w-[68ch] text-[11px] leading-snug text-[#6B6E76]">
            One <code className="px-1 text-[#A1A4AC]">useQuantyMood()</code> listening to every
            channel. Press two in a row to watch priority work: a hard failure outranks a background
            index, and a pulse decays back to <code className="px-1">idle</code> on its own while a
            latch waits to be replaced.
          </p>
          <div className="mt-4 rounded-xl border border-[#282C35] bg-[#111318] p-5">
            <ReactionBench />
          </div>
        </section>

        <section
          className="mt-10 rounded-xl border border-[#282C35] bg-[#111318] p-5"
          aria-labelledby="values"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="values" className="text-[13px] font-medium text-[#F5F5F5]">
                Locked values
              </h2>
              <p className="mt-1 text-[11px] text-[#6B6E76]">
                {selected === 'custom'
                  ? 'Custom — not one of the four.'
                  : `Candidate: ${VARIANTS.find((v) => v.id === selected)?.name ?? '—'}`}
              </p>
            </div>
            <button
              type="button"
              onClick={copy}
              className={`min-h-[44px] rounded-lg border border-[#5C3016] bg-[#2B1A11] px-4 text-[13px] font-medium text-[#FF8C42] transition-colors duration-200 hover:bg-[#3A2416] ${FOCUS}`}
            >
              {copied ? 'Copied' : 'Copy JSON'}
            </button>
          </div>
          <pre className="no-scrollbar mt-3 overflow-x-auto text-[11px] leading-relaxed text-[#A1A4AC]">
            {json}
          </pre>
        </section>
      </div>
    </main>
  );
}
