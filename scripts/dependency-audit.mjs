#!/usr/bin/env node
/**
 * Parse pnpm audit JSON, emit actionable GitHub annotations, and fail only at
 * or above an explicit severity threshold.
 *
 * Usage:
 *   node scripts/dependency-audit.mjs --level high
 *   node scripts/dependency-audit.mjs --input audit-fixture.json --level high
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const SEVERITIES = ['info', 'low', 'moderate', 'high', 'critical'];

function argumentValue(flag) {
  const exactIndex = process.argv.indexOf(flag);
  if (exactIndex !== -1) {
    const value = process.argv[exactIndex + 1];
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
    return value;
  }
  const prefix = `${flag}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  return inline?.slice(prefix.length);
}

function severityRank(severity) {
  const rank = SEVERITIES.indexOf(String(severity ?? '').toLowerCase());
  return rank === -1 ? 0 : rank;
}

function emptyCounts() {
  return { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
}

function normalizeCounts(report, findings) {
  const metadata = report?.metadata?.vulnerabilities;
  if (metadata && typeof metadata === 'object') {
    const counts = emptyCounts();
    for (const severity of SEVERITIES) {
      const value = Number(metadata[severity] ?? 0);
      counts[severity] = Number.isFinite(value) ? value : 0;
    }
    return counts;
  }

  const counts = emptyCounts();
  for (const finding of findings) counts[finding.severity] += 1;
  return counts;
}

function normalizeAudit(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('Audit report must be a JSON object');
  }

  const findings = [];
  if (report.vulnerabilities && typeof report.vulnerabilities === 'object') {
    for (const [packageName, vulnerability] of Object.entries(report.vulnerabilities)) {
      if (!vulnerability || typeof vulnerability !== 'object') continue;
      const nodes = Array.isArray(vulnerability.nodes)
        ? vulnerability.nodes.filter((node) => typeof node === 'string')
        : [];
      const via = Array.isArray(vulnerability.via)
        ? vulnerability.via.filter((entry) => entry && typeof entry === 'object')
        : [];
      if (via.length === 0) {
        findings.push({
          packageName,
          severity: String(vulnerability.severity ?? 'info').toLowerCase(),
          title: `${packageName} has a reported vulnerability`,
          url: undefined,
          range: vulnerability.range,
          direct: Boolean(vulnerability.isDirect),
          nodes,
        });
        continue;
      }
      for (const advisory of via) {
        findings.push({
          packageName,
          severity: String(advisory.severity ?? vulnerability.severity ?? 'info').toLowerCase(),
          title: advisory.title ?? advisory.name ?? `${packageName} vulnerability`,
          url: advisory.url,
          range: advisory.range ?? vulnerability.range,
          direct: Boolean(vulnerability.isDirect),
          nodes,
        });
      }
    }
  } else if (report.advisories && typeof report.advisories === 'object') {
    for (const advisory of Object.values(report.advisories)) {
      if (!advisory || typeof advisory !== 'object') continue;
      const paths = Array.isArray(advisory.findings)
        ? advisory.findings.flatMap((finding) => Array.isArray(finding?.paths) ? finding.paths : [])
        : [];
      findings.push({
        packageName: advisory.module_name ?? advisory.name ?? 'unknown-package',
        severity: String(advisory.severity ?? 'info').toLowerCase(),
        title: advisory.title ?? 'Dependency vulnerability',
        url: advisory.url,
        range: advisory.vulnerable_versions ?? advisory.range,
        direct: Boolean(paths.some((path) => typeof path === 'string' && !path.includes('>'))),
        nodes: paths.filter((path) => typeof path === 'string'),
      });
    }
  }

  for (const finding of findings) {
    if (!SEVERITIES.includes(finding.severity)) finding.severity = 'info';
  }
  return { counts: normalizeCounts(report, findings), findings };
}

function parseAuditJson(raw) {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end < start) throw new Error('pnpm audit did not return JSON');
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (error) {
    throw new Error(`Unable to parse pnpm audit JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function loadAuditReport() {
  const input = argumentValue('--input');
  if (input) return parseAuditJson(readFileSync(input, 'utf8'));

  const result = spawnSync('pnpm', ['audit', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Unable to run pnpm audit: ${result.error.message}`);
  if (!result.stdout?.trim()) {
    throw new Error(`pnpm audit produced no JSON${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  }
  return parseAuditJson(result.stdout);
}

function escapeWorkflowCommand(value) {
  return String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function findingMessage(finding) {
  const nodes = Array.isArray(finding.nodes) ? finding.nodes.slice(0, 5) : [];
  return [
    `${finding.packageName}: ${finding.title}`,
    finding.range ? `affected ${finding.range}` : undefined,
    finding.direct ? 'direct dependency' : 'transitive or unresolved path',
    nodes.length > 0 ? `nodes ${nodes.join(', ')}` : undefined,
    finding.url,
  ].filter(Boolean).join(' | ');
}

function blockingCount(counts, minimumRank) {
  return SEVERITIES.reduce(
    (total, severity) => total + (severityRank(severity) >= minimumRank ? counts[severity] : 0),
    0,
  );
}

function writeSummary(counts, findings, level) {
  const summary = [
    '## Dependency audit',
    '',
    `Blocking threshold: **${level}**`,
    '',
    '| Critical | High | Moderate | Low | Info |',
    '| ---: | ---: | ---: | ---: | ---: |',
    `| ${counts.critical} | ${counts.high} | ${counts.moderate} | ${counts.low} | ${counts.info} |`,
  ];
  const notable = findings.filter((finding) => severityRank(finding.severity) >= severityRank(level)).slice(0, 20);
  if (notable.length > 0) {
    summary.push('', '### Blocking findings', '');
    for (const finding of notable) summary.push(`- **${finding.severity.toUpperCase()}** ${findingMessage(finding)}`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary.join('\n')}\n`);
}

try {
  const level = String(argumentValue('--level') ?? 'high').toLowerCase();
  if (!SEVERITIES.includes(level)) throw new Error(`Unsupported severity level: ${level}`);

  const { counts, findings } = normalizeAudit(loadAuditReport());
  const minimumRank = severityRank(level);
  const blockingFindings = findings.filter((finding) => severityRank(finding.severity) >= minimumRank);
  const blocked = blockingCount(counts, minimumRank);

  console.error(
    `[dependency-audit] critical=${counts.critical} high=${counts.high} moderate=${counts.moderate} low=${counts.low} info=${counts.info}; threshold=${level}`,
  );
  writeSummary(counts, findings, level);

  if (blocked > 0) {
    if (process.env.GITHUB_ACTIONS === 'true') {
      const annotations = blockingFindings.length > 0
        ? blockingFindings.slice(0, 25)
        : [{ severity: level, packageName: 'dependency graph', title: `${blocked} blocking audit finding(s) reported`, direct: false }];
      for (const finding of annotations) {
        console.error(
          `::error file=pnpm-lock.yaml,title=${escapeWorkflowCommand(`${String(finding.severity).toUpperCase()} dependency vulnerability`)}::${escapeWorkflowCommand(findingMessage(finding))}`,
        );
      }
    }
    throw new Error(`${blocked} dependency vulnerability finding(s) meet or exceed ${level}`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (process.env.GITHUB_ACTIONS === 'true' && !message.includes('meet or exceed')) {
    console.error(`::error file=scripts/dependency-audit.mjs,title=Dependency audit failed::${escapeWorkflowCommand(message)}`);
  }
  console.error(`[dependency-audit] ${message}`);
  process.exitCode = 1;
}
