// ============================================================================
// QuantCooks Studio (Phase 2 Unit 1) — JobStrip + CreditsPill rendering.
// Pins the §0.2 rules: no fake progress, failed jobs show the real error
// plus the auto-refund note, and the credits pill NEVER shows a number
// that did not come from the real ledger.
// ============================================================================

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { JobStrip } from '../components/studio/JobStrip';
import { CreditsPill } from '../components/studio/CreditsPill';
import { jobFromExportJob, type StudioJob } from '../lib/studio/jobs';
import type { ServerExportJob } from '../services/api-client';

const job = (patch: Partial<StudioJob>): StudioJob => ({
  job_id: 'job-1',
  status: 'QUEUED',
  progress: null,
  credit_cost: null,
  outputs: [],
  error: null,
  label: 'Video generation',
  ...patch,
});

describe('JobStrip', () => {
  it('renders an honest empty state when there are no jobs', () => {
    const html = renderToStaticMarkup(React.createElement(JobStrip, { jobs: [] }));
    expect(html).toContain('data-testid="jobstrip-empty"');
    expect(html).toContain('No jobs yet');
  });

  it('renders QUEUED without inventing a progress percentage', () => {
    const html = renderToStaticMarkup(React.createElement(JobStrip, { jobs: [job({ status: 'QUEUED' })] }));
    expect(html).toContain('Queued');
    expect(html).not.toContain('<progress');
  });

  it('renders PROCESSING with real progress when the backend reported it', () => {
    const html = renderToStaticMarkup(
      React.createElement(JobStrip, { jobs: [job({ status: 'PROCESSING', progress: 40 })] }),
    );
    expect(html).toContain('value="40"');
    expect(html).toContain('40%');
  });

  it('renders PROCESSING with a stage label when there is no number', () => {
    const html = renderToStaticMarkup(
      React.createElement(JobStrip, {
        jobs: [job({ status: 'PROCESSING', progress: null, stage: 'Reading your clip' })],
      }),
    );
    expect(html).toContain('Reading your clip');
    expect(html).not.toContain('<progress');
  });

  it('renders COMPLETED with its outputs', () => {
    const html = renderToStaticMarkup(
      React.createElement(JobStrip, {
        jobs: [
          job({
            status: 'COMPLETED',
            progress: 100,
            outputs: [{ id: 'o1', kind: 'video', url: 'https://signed.example/clip', label: 'Open clip' }],
          }),
        ],
      }),
    );
    expect(html).toContain('Done');
    expect(html).toContain('Open clip');
  });

  it('renders FAILED with the real error and the auto-refund note', () => {
    const html = renderToStaticMarkup(
      React.createElement(JobStrip, {
        jobs: [job({ status: 'FAILED', error: 'Provider timed out', credit_cost: 8 })],
      }),
    );
    expect(html).toContain('Provider timed out');
    expect(html).toContain('Refunded');
  });

  it('maps a real P0-4 export job onto the unified shape', () => {
    const exportJob: ServerExportJob = {
      id: 'exp-1',
      projectId: 'p1',
      format: 'mp4',
      resolution: '1080p',
      quality: 'high',
      status: 'PROCESSING',
      progress: 70,
      outputUrl: null,
      error: null,
      createdAt: '2026-10-29T00:00:00.000Z',
      completedAt: null,
    };
    const mapped = jobFromExportJob(exportJob);
    expect(mapped.job_id).toBe('exp-1');
    expect(mapped.progress).toBe(70);
    expect(mapped.credit_cost).toBeNull(); // exports are not credit-charged; never invent a cost
    const queued = jobFromExportJob({ ...exportJob, status: 'QUEUED', progress: 0 });
    expect(queued.progress).toBeNull();
  });
});

describe('CreditsPill', () => {
  it('shows the honest not-configured dash by default — never a made-up number', () => {
    const html = renderToStaticMarkup(React.createElement(CreditsPill, {}));
    expect(html).toContain('data-testid="credits-not-configured"');
    expect(html).toContain('Credits · —');
    expect(html).not.toMatch(/\d+\s*credits/);
  });

  it('shows the balance only when a real number is passed in', () => {
    const html = renderToStaticMarkup(React.createElement(CreditsPill, { balance: 120 }));
    expect(html).toContain('120 credits');
  });

  it('renders loading and error states without a number', () => {
    const loading = renderToStaticMarkup(React.createElement(CreditsPill, { state: 'loading' }));
    expect(loading).toContain('Loading credits…');
    const error = renderToStaticMarkup(React.createElement(CreditsPill, { state: 'error' }));
    expect(error).toContain('Credits unavailable');
  });
});
