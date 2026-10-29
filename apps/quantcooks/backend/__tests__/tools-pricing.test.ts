// ============================================================================
// CP-1 — pricing & quotes (§13.5): FLAT anchors exact, PROVIDER quotes
// carry NO number anywhere, unset rate rows refuse with the tool's own
// code, quote→invoke validation (expiry/mismatch), and the CP-2 port
// contract proven against a fake port — settle never exceeds the quote,
// failure releases (settle-at-0) — while CP-1's production port is null
// and invokes run honestly unmetered.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createToolsTestRig, expectCode, userCtx } from './tools-test-rig';
import { pricingRuleFor } from '../tools/pricing';
import type { CreditsExecutionPort } from '../tools/pricing';

const fakeAi = {
  infer: async () => ({ content: 'One\nTwo', model: 'fake', provider: 'fake' }),
};

describe('quotes', () => {
  it('FLAT anchor: suggest_titles quotes exactly 1 credit with a breakdown', async () => {
    const rig = createToolsTestRig();
    const quote = await rig.registry.quote(
      'quantcooks.suggest_titles',
      { description: 'A biryani video' },
      userCtx(),
    );
    expect(quote.credits).toBe(1);
    expect(quote.quoteId).toMatch(/^quote_/);
    expect(quote.breakdown).toEqual([{ label: 'quantcooks.suggest_titles', credits: 1 }]);
  });

  it('PROVIDER-priced quote refuses with NO number anywhere', async () => {
    const rig = createToolsTestRig();
    try {
      await rig.registry.quote(
        'quantcooks.generate_dish_image',
        { prompt: 'a thali' },
        userCtx(),
      );
      throw new Error('quote should have refused');
    } catch (err) {
      const e = err as { code?: string; statusCode?: number };
      expect(e.code).toBe('PROVIDER_NOT_CONFIGURED');
      expect(e.statusCode).toBe(503);
      expect(JSON.stringify(err)).not.toMatch(/"credits":\s*[1-9]/);
    }
  });

  it('unset rate rows refuse with the tool’s own NOT_CONFIGURED code', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.quote('quantcooks.dub_video', { videoAssetId: 'a', targetLanguage: 'hi' }, userCtx()),
      'PROVIDER_NOT_CONFIGURED',
      503,
    );
    await expectCode(
      rig.registry.quote('quantcooks.clone_voice', {
        name: 'v', sampleAssetIds: ['a'], consent: { ownVoice: true, confirmedAt: '2026-10-29T00:00:00.000Z' },
      }, userCtx()),
      'VOICE_TRAINING_NOT_CONFIGURED',
      503,
    );
  });

  it('not_wired twins quote 0 with metering stated; free tools quote 0', async () => {
    const rig = createToolsTestRig();
    const twin = await rig.registry.quote(
      'quantcooks.render_effects',
      { projectId: 'p', ecproj: { compositions: [] } },
      userCtx(),
    );
    expect(twin.credits).toBe(0);
    expect(twin.metering).toBe('not_wired');
    const free = await rig.registry.quote('quantcooks.list_projects', {}, userCtx());
    expect(free.credits).toBe(0);
  });

  it('design pair (C-7 step 4) quotes 0 WITH not_wired — a table row, not the free default', async () => {
    const rig = createToolsTestRig();
    // The rows exist in the table itself: pricingRuleFor falls back to
    // { type: 'free' } for unlisted tools, so an exact not_wired match
    // proves create_design/export_design are priced rows, not defaults.
    expect(pricingRuleFor('quantcooks.create_design')).toEqual({ type: 'not_wired' });
    expect(pricingRuleFor('quantcooks.export_design')).toEqual({ type: 'not_wired' });
    const created = await rig.registry.quote(
      'quantcooks.create_design',
      { projectId: 'p', template: 'mobile-app', name: 'Dish App' },
      userCtx(),
    );
    expect(created.credits).toBe(0);
    expect(created.metering).toBe('not_wired');
    const exported = await rig.registry.quote(
      'quantcooks.export_design',
      { sourceAssetId: 'a', format: 'png' },
      userCtx(),
    );
    expect(exported.credits).toBe(0);
    expect(exported.metering).toBe('not_wired');
    // Contrast: a genuinely free tool quotes the same 0 credits but
    // carries NO metering marker — the marker is the not_wired proof.
    const free = await rig.registry.quote('quantcooks.list_projects', {}, userCtx());
    expect(free.credits).toBe(0);
    expect(free.metering).toBeUndefined();
  });

  it('plan-priced tools refuse a bare quote (the plan IS the quote)', async () => {
    const rig = createToolsTestRig();
    await expectCode(
      rig.registry.quote('quantcooks.run_pipeline', { inputs: {} }, userCtx()),
      'PIPELINE_NOT_CONFIGURED',
      503,
    );
  });
});

describe('quote → invoke validation (§6.2)', () => {
  it('an accepted quote matching the invoke succeeds (defaults cannot mismatch)', async () => {
    const rig = createToolsTestRig({ ai: fakeAi });
    const params = { description: 'A biryani video' };
    const quote = await rig.registry.quote('quantcooks.suggest_titles', params, userCtx());
    const result = await rig.registry.invoke('quantcooks.suggest_titles', params, userCtx(), {
      quoteId: quote.quoteId,
    });
    expect(result['tool']).toBe('quantcooks.suggest_titles');
  });

  it('params differing from the quote → QUOTE_MISMATCH 400', async () => {
    const rig = createToolsTestRig({ ai: fakeAi });
    const quote = await rig.registry.quote(
      'quantcooks.suggest_titles', { description: 'one' }, userCtx(),
    );
    await expectCode(
      rig.registry.invoke('quantcooks.suggest_titles', { description: 'two' }, userCtx(), {
        quoteId: quote.quoteId,
      }),
      'QUOTE_MISMATCH',
      400,
    );
  });

  it('an expired quote → QUOTE_EXPIRED 409', async () => {
    const rig = createToolsTestRig({ ai: fakeAi });
    const quote = await rig.registry.quote(
      'quantcooks.suggest_titles', { description: 'one' }, userCtx(),
    );
    const stored = rig.deps.quotes.get(quote.quoteId);
    expect(stored).not.toBeNull();
    stored!.expiresAt = new Date(Date.now() - 1000);
    await expectCode(
      rig.registry.invoke('quantcooks.suggest_titles', { description: 'one' }, userCtx(), {
        quoteId: quote.quoteId,
      }),
      'QUOTE_EXPIRED',
      409,
    );
  });

  it('a quote belonging to another user → QUOTE_MISMATCH', async () => {
    const rig = createToolsTestRig({ ai: fakeAi });
    const quote = await rig.registry.quote(
      'quantcooks.suggest_titles', { description: 'one' }, userCtx(),
    );
    await expectCode(
      rig.registry.invoke(
        'quantcooks.suggest_titles',
        { description: 'one' },
        userCtx({ actorUserId: 'user-2' }),
        { quoteId: quote.quoteId },
      ),
      'QUOTE_MISMATCH',
      400,
    );
  });
});

describe('the CP-2 port contract, proven against a fake port', () => {
  function fakePort() {
    const calls: { op: string; credits?: number }[] = [];
    const port: CreditsExecutionPort = {
      async reserve(_userId, _jobId, credits) {
        calls.push({ op: 'reserve', credits });
        return { reservationKey: 'rk-1' };
      },
      async settle(_jobId, actualCredits) {
        calls.push({ op: 'settle', credits: actualCredits });
      },
      async release() {
        calls.push({ op: 'release' });
      },
      async getBalance() {
        return { daily: 0, monthly: 0, purchased: 0, total: 0, held: 0 };
      },
    };
    return { port, calls };
  }

  it('success: reserve(quote) then settle(quote) — never above the quote', async () => {
    const { port, calls } = fakePort();
    const rig = createToolsTestRig({ ai: fakeAi, credits: port });
    const result = await rig.registry.invoke(
      'quantcooks.suggest_titles', { description: 'x' }, userCtx(),
    );
    expect(calls).toEqual([
      { op: 'reserve', credits: 1 },
      { op: 'settle', credits: 1 },
    ]);
    expect(result['creditCost']).toBe(1);
    expect(result['metering']).toBe('metered');
  });

  it('executor failure: release (settle-at-0), never settle', async () => {
    const { port, calls } = fakePort();
    const failingAi = {
      infer: async () => {
        throw new Error('provider down');
      },
    };
    const rig = createToolsTestRig({ ai: failingAi, credits: port });
    await expect(
      rig.registry.invoke('quantcooks.suggest_titles', { description: 'x' }, userCtx()),
    ).rejects.toThrow(/provider down/);
    expect(calls).toEqual([{ op: 'reserve', credits: 1 }, { op: 'release' }]);
  });

  it('CP-1 production shape (null port): the same invoke runs unmetered and says so', async () => {
    const rig = createToolsTestRig({ ai: fakeAi });
    expect(rig.deps.credits).toBeNull();
    const result = await rig.registry.invoke(
      'quantcooks.suggest_titles', { description: 'x' }, userCtx(),
    );
    expect(result['creditCost']).toBe(0);
    expect(result['metering']).toBe('not_wired');
  });
});
