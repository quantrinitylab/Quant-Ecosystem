/**
 * Dead-route guard (F-160 improvement).
 *
 * The `/api/training` and `/api/training/[id]` Next.js proxy routes were deleted
 * (F-160, 2026-10-12) because they were dead weight:
 *  - zero callers anywhere in src/ — `pages/training.tsx` is a stub rendering null
 *    and makes no fetch calls;
 *  - the only code path touching them, `apiClient.startTraining` /
 *    `listTrainingJobs` / `cancelTraining` in services/api-client.ts, was itself
 *    never called anywhere and was removed in the same change.
 *
 * This test freezes that decision: if anyone re-registers a training route or
 * re-adds a training surface to the API client, this fails until the
 * zero-caller evidence is re-verified.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const API_DIR = join(SRC, 'app', 'api');

describe('dead training routes (F-160)', () => {
  it('the deleted /api/training route stays deleted', () => {
    expect(existsSync(join(API_DIR, 'training', 'route.ts'))).toBe(false);
  });

  it('the deleted /api/training/[id] route stays deleted', () => {
    expect(existsSync(join(API_DIR, 'training', '[id]', 'route.ts'))).toBe(false);
  });

  it('the API client exposes no training surface', () => {
    const client = readFileSync(join(SRC, 'services', 'api-client.ts'), 'utf-8');
    expect(client).not.toContain('startTraining');
    expect(client).not.toContain('listTrainingJobs');
    expect(client).not.toContain('cancelTraining');
    expect(client).not.toContain("'/training'");
    expect(client).not.toContain('`/training/');
  });
});
