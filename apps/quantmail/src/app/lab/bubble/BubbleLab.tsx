'use client';

// ============================================================================
// BubbleLab — the 35-state Bubble Intelligence sheet, live.
// ============================================================================
//
// Mirrors the reference character sheet: header with hero avatar + tagline,
// then all 35 states in sheet order with number, name and caption. Every tile
// is a live canvas running its own rAF loop (they desync by design and pause
// off-screen, so a grid of 35 stays cheap). Hover/press any tile to see it
// up close in the hero, or use the play button to walk the sheet.
//
// Uses the shared package directly (@quant/shared-ui) — this is the *same*
// component QuantSidekick mounts in every app, so what is verified here is
// exactly what ships.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BUBBLE_ORDER, BUBBLE_STATES, BubbleAvatar, type BubbleState } from '@quant/shared-ui';

const CAPTIONS: Partial<Record<BubbleState, string>> = {
  idle: 'Calm presence',
  wakeUp: 'Starts listening',
  lookAround: 'Gets context',
  recognize: 'Feels familiar',
  thinking: 'Processing…',
  thinkingDeep: 'Working harder',
  ideaSpark: 'Got something!',
  understanding: 'Connecting dots',
  reading: 'Scanning content',
  analyzing: 'Breaking it down',
  coding: 'Writing code',
  refactoring: 'Making it better',
  debugging: 'Finding issues',
  fixing: 'Applying solution',
  explaining: 'Breaking it simple',
  planning: 'Creating a roadmap',
  organizing: 'Structuring ideas',
  creating: 'Generating content',
  improving: 'Finding better way',
  suggesting: "Here's an idea",
  options: 'You have choices',
  working: 'In progress',
  almostDone: 'Wrapping up',
  completed: 'Task finished',
  success: 'Feels good!',
  error: "Something's wrong",
  rethinking: 'Reassessing…',
  needInfo: 'Asks a question',
  listening: 'Your turn',
  typing: 'Responding…',
  searching: 'Finding resources',
  syncing: 'Working across tools',
  saving: 'Keeping it safe',
  celebration: 'You did it!',
  goodbye: 'See you soon!',
};

function label(state: BubbleState): string {
  // `BUBBLE_STATES` is a const table; read via the typed index and fall back
  // to the key itself if a caption is ever missing.
  const spec = (BUBBLE_STATES as Record<BubbleState, { label: string }>)[state];
  return spec ? spec.label : state;
}

export function BubbleLab() {
  const [hero, setHero] = useState<BubbleState>('thinking');
  const [playing, setPlaying] = useState(false);
  const [dark, setDark] = useState(true);

  // Walk the sheet on a timer while playing; the index drives the hero.
  const order = useMemo(() => BUBBLE_ORDER, []);
  const idxRef = useRef(0);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      idxRef.current = (idxRef.current + 1) % order.length;
      setHero(order[idxRef.current] ?? 'idle');
    }, 1600);
    return () => window.clearInterval(id);
  }, [playing, order]);

  return (
    <div
      className={
        dark
          ? 'min-h-screen bg-[#0d0a07] text-orange-50'
          : 'min-h-screen bg-[#faf6f0] text-stone-900'
      }
    >
      <div className="mx-auto max-w-6xl px-5 py-10">
        {/* header ------------------------------------------------------- */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BubbleAvatar state={hero} size={84} />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                Bubble <span className="text-[#FF8C42]">Intelligence</span>
              </h1>
              <p className="mt-1 text-sm opacity-70">
                Feels. Understands. Builds with you. — {order.length} meaningful states.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((v) => !v)}
              className="rounded-full bg-[#FF8C42] px-4 py-2 text-sm font-medium text-[#1a0f05] transition hover:bg-[#ffa366]"
            >
              {playing ? '⏸ Stop tour' : '▶ Play tour'}
            </button>
            <button
              type="button"
              onClick={() => setDark((v) => !v)}
              className="rounded-full border border-black/20 px-4 py-2 text-sm opacity-75 transition hover:opacity-100 dark:border-white/20"
            >
              {dark ? '☀ Light' : '☾ Dark'}
            </button>
          </div>
        </header>

        {/* hero --------------------------------------------------------- */}
        <section className="mt-8 rounded-3xl border border-orange-500/15 bg-orange-500/[0.04] p-6 sm:p-10">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-10">
            <BubbleAvatar
              state={hero}
              size={168}
              className="drop-shadow-[0_18px_40px_rgba(255,140,66,0.35)]"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-[#FF8C42]">
                State {String(order.indexOf(hero) + 1).padStart(2, '0')} / {order.length}
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {hero.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
              </h2>
              <p className="mt-1 text-sm opacity-70">
                {CAPTIONS[hero] ?? label(hero)} — “{label(hero)}”
              </p>
              <p className="mt-4 max-w-md text-sm opacity-60">
                Same component QuantSidekick mounts in every Quant app. State changes pop the
                bubble; reduced motion renders one representative frame; the loop pauses off-screen.
              </p>
            </div>
          </div>
        </section>

        {/* the sheet ---------------------------------------------------- */}
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h3 className="text-lg font-semibold">{order.length} Meaningful Animations</h3>
            <p className="text-xs opacity-60">Click a tile to feature it above</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {order.map((state, i) => (
              <button
                key={state}
                type="button"
                onClick={() => {
                  setPlaying(false);
                  idxRef.current = i;
                  setHero(state);
                }}
                aria-pressed={hero === state}
                className={`group rounded-2xl border p-4 text-left transition ${
                  hero === state
                    ? 'border-[#FF8C42]/70 bg-[#FF8C42]/10'
                    : 'border-black/10 hover:border-[#FF8C42]/40 hover:bg-[#FF8C42]/[0.06] dark:border-white/10'
                }`}
              >
                <span className="text-[10px] font-medium opacity-50">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="mt-1 flex justify-center">
                  <BubbleAvatar state={state} size={64} />
                </span>
                <span className="mt-2 block text-center text-sm font-medium">
                  {state.replace(/([A-Z])/g, ' $1')}
                </span>
                <span className="mt-0.5 block text-center text-xs opacity-60">
                  {CAPTIONS[state] ?? label(state)}
                </span>
              </button>
            ))}
          </div>
        </section>

        <footer className="mt-10 text-xs opacity-50">
          Gated lab route (`/lab/bubble`) — 404s in production unless `QUANT_ENABLE_LABS=1`. Canvas
          2D · rAF loop paused off-screen · `prefers-reduced-motion` respected.
        </footer>
      </div>
    </div>
  );
}
