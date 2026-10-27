/**
 * Evidence generator (design §7). Reads a run JSON artifact (+ optional
 * baseline JSON) and emits the per-PR Slack markdown table. Numbers are
 * generated FROM the JSON, never hand-typed.
 *
 * CLI: node report/evidence.mjs runs/<name>.json [--baseline runs/baseline.json]
 */

function fmt(v, digits = 1) {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'n/a';
  return String(Math.round(v * 10 ** digits) / 10 ** digits);
}

function verdict(pass, blocked = false) {
  if (blocked) return 'BLOCKED';
  return pass ? 'PASS' : 'FAIL';
}

function worstFilter(perFilter) {
  let worst = null;
  for (const [name, f] of Object.entries(perFilter || {})) {
    if (f.status !== 'run') continue;
    if (!worst || (f.tFirstPaintMedianMs || 0) > (worst.tFirstPaintMedianMs || 0)) {
      worst = { name, ...f };
    }
  }
  return worst;
}

function regressionDiff(run, baseline, budgets) {
  if (!baseline) return { available: false, lines: ['Baseline: none committed yet — this run becomes the baseline candidate.'] };
  const lines = [];
  let regressed = false;
  const threshold = budgets.regression.worseningThreshold;
  const compare = (label, current, base, lowerIsBetter = true) => {
    if (!Number.isFinite(current) || !Number.isFinite(base) || base === 0) return;
    const delta = (current - base) / Math.abs(base);
    const worse = lowerIsBetter ? delta > threshold : delta < -threshold;
    if (worse) {
      regressed = true;
      lines.push(`- ${label}: ${fmt(current)} vs baseline ${fmt(base)} (${(delta * 100).toFixed(1)}% worse)`);
    }
  };
  const budgetDevice = (run.devices || []).find((d) => d.profile.id === 'VP-360');
  const baseDevice = (baseline.devices || []).find((d) => d.profile.id === 'VP-360');
  if (budgetDevice && baseDevice) {
    const j1 = budgetDevice.journeys.J1 || {};
    const b1 = baseDevice.journeys.J1 || {};
    if (j1.median && b1.median) {
      compare('Scroll p95', j1.median.p95Ms, b1.median.p95Ms);
      compare('Scroll p99', j1.median.p99Ms, b1.median.p99Ms);
      compare('Scroll % within budget', j1.median.pctWithinBudget, b1.median.pctWithinBudget, false);
    }
    const j4 = budgetDevice.journeys.J4 || {};
    const b4 = baseDevice.journeys.J4 || {};
    if (j4.open && b4.open) compare('Thread open median', j4.open.medianMs, b4.open.medianMs);
    const j2 = budgetDevice.journeys.J2 || {};
    const b2 = baseDevice.journeys.J2 || {};
    for (const [name, f] of Object.entries(j2.perFilter || {})) {
      const bf = (b2.perFilter || {})[name];
      if (f.status === 'run' && bf && bf.status === 'run') {
        compare(`Filter ${name} first paint`, f.tFirstPaintMedianMs, bf.tFirstPaintMedianMs);
      }
    }
  }
  if (!lines.length) lines.push('Baseline diff: none (no metric >10% worse than baseline).');
  return { available: true, regressed, lines };
}

export function buildEvidence(run, budgets, baseline) {
  const budgetDevice = (run.devices || []).find((d) => d.profile.id === 'VP-360')
    || (run.devices || [])[0];
  const refDevice = (run.devices || []).find((d) => d.profile.id === 'VP-390');
  const j = (budgetDevice && budgetDevice.journeys) || {};
  const j1 = j.J1 || {};
  const j2 = j.J2 || {};
  const j4 = j.J4 || {};
  const j5 = j.J5 || {};
  const j6 = j.J6 || {};
  const j3 = j.J3 || {};

  const scrollPass = j1.status === 'run'
    && (j1.median.pctWithinBudget ?? 0) >= budgets.frame.pctWithinBudget
    && (j1.median.p99Ms ?? Infinity) <= budgets.frame.p99MaxMs
    && (j1.median.longtaskCount ?? 1) <= budgets.frame.maxLongtasks;
  const openPass = j4.status === 'run'
    && (j4.open.medianMs ?? Infinity) < budgets.tap.medianMaxMs
    && (j4.open.p95Ms ?? Infinity) < budgets.tap.p95MaxMs;
  const backPass = j4.status === 'run' && !j4.backBlocked
    && (j4.back.medianMs ?? Infinity) < budgets.tap.medianMaxMs;
  const backVerdict = j4.status !== 'run' ? 'BLOCKED' : (j4.backBlocked ? 'BLOCKED' : verdict(backPass));
  const threadFramePass = j4.status === 'run'
    && (j4.maxFrameDuringOpenMs ?? Infinity) <= budgets.frame.threadOpenMaxFrameMs;
  const worst = worstFilter(j2.perFilter);
  const filterPass = j2.status === 'run' && worst !== null
    && (worst.tFirstPaintMedianMs ?? Infinity) < budgets.filter.firstPaintMedianMaxMs
    && (worst.blankFramesMax ?? 1) <= budgets.filter.maxBlankFrames;
  const drawerPass = j5.status === 'run' && j5.close && j5.close.animated;
  const ptrPass = j6.status === 'run' && j6.noPush && j6.noPush.pass;

  const skipped = [];
  for (const d of run.devices || []) {
    for (const s of d.skipped || []) skipped.push(`${d.profile.id}:${s}`);
  }
  const blocked = [];
  for (const d of run.devices || []) {
    for (const b of d.blocked || []) blocked.push(`${d.profile.id}:${b}`);
  }
  const diff = regressionDiff(run, baseline, budgets);
  const anyFail = [scrollPass, openPass, backPass, threadFramePass, filterPass, drawerPass, ptrPass]
    .some((p, idx) => {
      const statuses = [j1.status, j4.status, j4.status, j4.status, j2.status, j5.status, j6.status];
      if (idx === 2 && j4.backBlocked) return false; // back BLOCKED ≠ failed; overall handles it
      return statuses[idx] === 'run' && !p;
    });
  const overall = anyFail || diff.regressed
    ? 'FAIL'
    : (blocked.length ? 'PASS_WITH_BLOCKED' : 'PASS');

  const perFilterRows = Object.entries(j2.perFilter || {}).map(([name, f]) => {
    if (f.status !== 'run') return `| ${name} | ${f.status} | — | — | ${f.reason || ''} |`;
    return `| ${name} | ${fmt(f.tFirstPaintMedianMs)}ms | ${fmt(f.tRowsMedianMs)}ms | ${fmt(f.blankFramesMax, 0)} | — |`;
  }).join('\n');

  const lines = [];
  lines.push(`PR: <link> | Gate: <status> | Full-sweep: <status>`);
  lines.push(`Device: mid-range Android emulation (VP-360, CPU ×4)${refDevice ? ' + VP-390 reference' : ''}`);
  lines.push(`Target: ${run.meta.targetUrl}${run.meta.fixture ? ' (harness fixture — NOT the real app)' : ''}`);
  lines.push(`Overall: ${overall}`);
  lines.push(`Journeys run: ${Object.keys(j).filter((k) => !k.startsWith('_')).join(', ') || 'none'} (skipped: ${skipped.join(', ') || 'none'}; blocked: ${blocked.join(', ') || 'none'})`);
  lines.push('');
  lines.push('| Metric | Budget | Measured (median) | Verdict |');
  lines.push('|---|---|---|---|');
  lines.push(`| Tap → thread open | <${budgets.tap.medianMaxMs}ms | ${fmt(j4.open && j4.open.medianMs)}ms (p95 ${fmt(j4.open && j4.open.p95Ms)}ms) | ${verdict(openPass, j4.status !== 'run')} |`);
  lines.push(`| Tap → back to list | <${budgets.tap.medianMaxMs}ms | ${j4.backBlocked ? j4.backBlocked : `${fmt(j4.back && j4.back.medianMs)}ms (p95 ${fmt(j4.back && j4.back.p95Ms)}ms)`} | ${backVerdict} |`);
  lines.push(`| Filter switch (worst filter) | <${budgets.filter.firstPaintMedianMaxMs}ms first paint, 0 blank frames | ${worst ? `${fmt(worst.tFirstPaintMedianMs)}ms (${worst.name}), ${fmt(worst.blankFramesMax, 0)} blank frames` : 'n/a'} | ${verdict(filterPass, j2.status !== 'run')} |`);
  lines.push(`| List scroll (VP-360 throttled) | ≥${budgets.frame.pctWithinBudget}% frames ≤16.67ms, p99 ≤${budgets.frame.p99MaxMs}ms, 0 longtasks | ${fmt(j1.median && j1.median.pctWithinBudget)}% (≤17ms: ${fmt(j1.median && j1.median.pctWithin17Ms)}%), p99 ${fmt(j1.median && j1.median.p99Ms)}ms, ${fmt(j1.median && j1.median.longtaskCount, 0)} longtasks | ${verdict(scrollPass, j1.status !== 'run')} |`);
  lines.push(`| Thread-open frames | 0 frames >${budgets.frame.threadOpenMaxFrameMs}ms | max ${fmt(j4.maxFrameDuringOpenMs)}ms | ${verdict(threadFramePass, j4.status !== 'run')} |`);
  lines.push(`| Drawer open/close | slides both ways | open ${fmt(j5.openMs)}ms, close animated=${j5.close ? j5.close.animated : 'n/a'} | ${verdict(drawerPass, j5.status !== 'run')} |`);
  lines.push(`| PTR | transform-only, no list push | noPush=${j6.noPush ? j6.noPush.pass : 'n/a'} (max delta ${j6.noPush ? fmt(j6.noPush.maxDeltaPx, 0) : 'n/a'}px) | ${verdict(ptrPass, j6.status !== 'run')} |`);
  lines.push('');
  lines.push('Per-filter table (J2): filter | t_first_paint | t_rows | blank frames');
  lines.push('');
  lines.push('| filter | t_first_paint | t_rows | blank frames | note |');
  lines.push('|---|---|---|---|---|');
  lines.push(perFilterRows || '| — | — | — | — | no filters measured |');
  lines.push('');
  lines.push('Baseline diff:');
  for (const l of diff.lines) lines.push(l);
  if (j3.status) lines.push(`\nJ3 empty states: ${j3.status}${j3.reason ? ` — ${j3.reason}` : ''}${j3.structurePresent !== undefined ? ` (structure present: ${j3.structurePresent})` : ''}`);
  lines.push('\nTraces: JSON artifact for this run (committed under runs/); videos/screenshots live with the QA evidence store and are linked, not committed as binaries.');
  return lines.join('\n');
}

// CLI usage: node report/evidence.mjs runs/<name>.json [--baseline runs/baseline.json]
if (process.argv[1] && process.argv[1].endsWith('evidence.mjs')) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const fileURLToPath = await import('node:url');
  const HERE = path.dirname(fileURLToPath.fileURLToPath(import.meta.url));
  const ROOT = path.dirname(HERE);
  const argv = process.argv.slice(2);
  const input = argv[0];
  const baselineIdx = argv.indexOf('--baseline');
  const baseline = baselineIdx >= 0
    ? JSON.parse(fs.readFileSync(argv[baselineIdx + 1], 'utf8')) : null;
  const run = JSON.parse(fs.readFileSync(input, 'utf8'));
  const budgets = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'budgets.json'), 'utf8'));
  console.log(buildEvidence(run, budgets, baseline));
}
