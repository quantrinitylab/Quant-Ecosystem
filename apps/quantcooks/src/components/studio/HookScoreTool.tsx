// ============================================================================
// QuantCooks Studio — Hook Score (spec §8.3 item 2, checklist #61)
//
// A short clip in → a report card: headline score /100, hook score, hold
// rate and attention-factor bars. The twin is quantcooks.score_hook
// (CP-1 tool 52, kind ANALYSIS) whose result schema itself carries
// framing:'modelled_estimate' — the honesty is in the contract, and
// this screen repeats it on the surface.
//
// The hard rule of this screen: NO score, gauge or bar renders unless a
// real analysis object is handed in (the `analysis` prop, shaped
// exactly like the tool's result). The page passes none today — the
// analysis engine is not configured — so the run attempt lands on
// ANALYSIS_NOT_CONFIGURED and the report area states that plainly. A
// fabricated score would be worse than no score (CP-1 §4.1).
// ============================================================================

import React, { useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  HOOK_FRAMING_COPY,
  HOOK_PLATFORMS,
  HOOK_SCORE_FACTOR_LABELS,
  HOOK_SCORE_LIMIT_NOTE,
  attemptHookScore,
  hookScoreQuote,
  previousRunsFor,
  toolById,
  type HookPlatform,
  type HookScoreOutcome,
  type HookScoreReport,
} from '../../lib/studio/tools';
import {
  AssetInputZone,
  OutcomeNote,
  PreviousRuns,
  QuotePanel,
  ToolPageShell,
  type ToolAssetsState,
} from './ToolFlow';

const TOOL = toolById('hook-score')!;

export interface HookScoreToolProps {
  projectId?: string | null;
  assets?: ServerAsset[];
  assetsState: ToolAssetsState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  upload?: (file: File) => Promise<ServerAsset>;
  initialAsset?: ServerAsset | null;
  initialPlatform?: HookPlatform;
  initialHookText?: string;
  initialOutcome?: HookScoreOutcome | null;
  /**
   * A REAL finished analysis (the tool's result object), when one
   * exists. The page passes none today; without it, no number renders.
   */
  analysis?: HookScoreReport | null;
  jobs?: StudioJob[];
}

export const HookScoreTool: React.FC<HookScoreToolProps> = ({
  projectId,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  upload,
  initialAsset = null,
  initialPlatform = 'generic',
  initialHookText = '',
  initialOutcome = null,
  analysis = null,
  jobs = [],
}) => {
  const [asset, setAsset] = useState<ServerAsset | null>(initialAsset);
  const [platform, setPlatform] = useState<HookPlatform>(initialPlatform);
  const [hookText, setHookText] = useState(initialHookText);
  const [outcome, setOutcome] = useState<HookScoreOutcome | null>(initialOutcome);

  const quote = hookScoreQuote();
  const runs = previousRunsFor(jobs, TOOL.name);

  return (
    <ToolPageShell
      tool={TOOL}
      explainer="How hard does your opening pull? Score the first seconds of a food clip before you post it."
      limitNote={HOOK_SCORE_LIMIT_NOTE}
      jobs={jobs}
    >
      <p className="studio-tools-framing" data-testid="hook-framing" role="note">
        {HOOK_FRAMING_COPY}
      </p>

      <div className="studio-tools-flow-layout">
        <AssetInputZone
          tool={TOOL}
          slotLabel="Clip to score"
          assets={assets}
          assetsState={assetsState}
          assetsError={assetsError}
          onRetryAssets={onRetryAssets}
          projectId={projectId}
          upload={upload}
          selected={asset}
          onSelect={(a) => {
            setAsset(a);
            setOutcome(null);
          }}
          testIdPrefix="hook"
        />

        <div className="studio-tools-options" data-testid="hook-options">
          <h2>Where it will play</h2>
          <ul className="studio-tools-platforms">
            {HOOK_PLATFORMS.map((p) => (
              <li key={p.id}>
                <label>
                  <input
                    type="radio"
                    name="hook-platform"
                    data-testid={`hook-platform-${p.id}`}
                    checked={platform === p.id}
                    onChange={() => {
                      setPlatform(p.id);
                      setOutcome(null);
                    }}
                  />{' '}
                  {p.label}
                </label>
              </li>
            ))}
          </ul>

          <label className="studio-tools-hook-text">
            The line you open with (kept with the run, word for word)
            <input
              type="text"
              data-testid="hook-text-input"
              value={hookText}
              placeholder="e.g. Wait for the cheese pull…"
              onChange={(e) => setHookText(e.target.value)}
            />
          </label>

          <QuotePanel
            quote={quote}
            actionLabel="Score this hook"
            canRun={Boolean(asset)}
            onRun={() => setOutcome(attemptHookScore({ asset, platform, hookText }))}
            testIdPrefix="hook"
          />
          <OutcomeNote outcome={outcome} testIdPrefix="hook" />
        </div>

        <aside className="studio-tools-results" data-testid="hook-report" aria-label="Hook Score report">
          <h2>Report</h2>
          {analysis ? (
            <div className="studio-tools-report-card" data-testid="hook-report-card">
              <p className="studio-tools-report-framing">
                Modelled estimate · based on {analysis.analysedDurationSec}s of your clip
              </p>
              <p className="studio-tools-report-score" data-testid="hook-report-score">
                {analysis.score}
                <span> /100</span>
              </p>
              <div
                className="studio-tools-report-gauge"
                role="img"
                aria-label={`Hook Score ${analysis.score} out of 100 — low to high`}
              >
                <span style={{ width: `${analysis.score}%` }} />
              </div>
              <dl className="studio-tools-report-stats">
                <div>
                  <dt>Hook score</dt>
                  <dd data-testid="hook-report-hook">{analysis.factors.hook}</dd>
                </div>
                <div>
                  <dt>Hold rate</dt>
                  <dd data-testid="hook-report-hold">{analysis.factors.hold}</dd>
                </div>
              </dl>
              <ul className="studio-tools-report-factors">
                {HOOK_SCORE_FACTOR_LABELS.map((factor) => (
                  <li key={factor.id}>
                    <span>{factor.label}</span>
                    <span
                      className="studio-tools-factor-bar"
                      role="img"
                      aria-label={`${factor.label}: ${analysis.factors[factor.id]} out of 100`}
                    >
                      <span style={{ width: `${analysis.factors[factor.id]}%` }} />
                    </span>
                    <span>{analysis.factors[factor.id]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p data-testid="hook-report-empty">
              No analysis yet — and no score will ever be drawn here without a real one behind
              it. The analysis engine is not connected, so a run today answers honestly that it
              cannot score yet, at no charge.
            </p>
          )}

          <div className="studio-tools-how" data-testid="hook-how-it-works">
            <h3>How it works</h3>
            <p>
              The tool reads the clip's opening — the first frame, the motion in the first
              seconds, faces, on-screen text and the sound bed — and compares the pattern
              against openings that tended to hold attention. The result is an estimate with
              the word estimate attached, in the tool's own output: useful for choosing which
              of two cuts to post, useless as a promise.
            </p>
          </div>
        </aside>
      </div>

      <PreviousRuns runs={runs} testIdPrefix="hook" />
    </ToolPageShell>
  );
};

export default HookScoreTool;
