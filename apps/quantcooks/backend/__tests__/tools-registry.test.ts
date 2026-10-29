// ============================================================================
// CP-1 — the registry itself (§13.1): all 54 manifest tools resolvable by
// name with their tier + mode, the 2 conditional marketplace tools NOT
// registered, the 2 ratified Craft twins present, the 2 design-companion
// amendments from C-7 step 4 present (58 total), structural invariants
// (Tier B always carries a named refusal; examples parse; duplicate
// registration throws; the rate table is whole-credit only).
// ============================================================================

import { describe, it, expect } from 'vitest';
import { createToolsTestRig, userCtx } from './tools-test-rig';
import { validateRateTable } from '../tools/pricing';

// The manifest (§3–§4) + the ratified twins (§4 of the CP-1 build:
// quantcooks.render_effects from C-2, quantcooks.edit_photo from C-3B)
// + the design amendments (quantcooks.create_design /
// quantcooks.export_design from C-7 step 4).
const EXPECTED_TOOLS = [
  'quantcooks.add_comment',
  'quantcooks.add_voiceover',
  'quantcooks.animate_image',
  'quantcooks.apply_brand_kit',
  'quantcooks.apply_template',
  'quantcooks.cancel_job',
  'quantcooks.clone_voice',
  'quantcooks.create_chef_persona',
  'quantcooks.create_design',
  'quantcooks.create_food_ad',
  'quantcooks.create_project',
  'quantcooks.create_shot_sequence',
  'quantcooks.create_story_episode',
  'quantcooks.create_storyboard',
  'quantcooks.create_ugc_clip',
  'quantcooks.delete_asset',
  'quantcooks.delete_project',
  'quantcooks.download_asset',
  'quantcooks.dub_video',
  'quantcooks.duplicate_project',
  'quantcooks.edit_photo',
  'quantcooks.export_design',
  'quantcooks.export_project',
  'quantcooks.generate_captions',
  'quantcooks.generate_dish_image',
  'quantcooks.generate_video_from_text',
  'quantcooks.get_asset',
  'quantcooks.get_auto_edit_preferences',
  'quantcooks.get_brand_kit',
  'quantcooks.get_credit_balance',
  'quantcooks.get_credit_quote',
  'quantcooks.get_job_status',
  'quantcooks.get_project',
  'quantcooks.invite_collaborator',
  'quantcooks.list_assets',
  'quantcooks.list_camera_presets',
  'quantcooks.list_collaborators',
  'quantcooks.list_credit_history',
  'quantcooks.list_effects',
  'quantcooks.list_models',
  'quantcooks.list_presets',
  'quantcooks.list_projects',
  'quantcooks.list_templates',
  'quantcooks.make_presenter_speak',
  'quantcooks.plan_project',
  'quantcooks.render_effects',
  'quantcooks.run_auto_edit',
  'quantcooks.run_pipeline',
  'quantcooks.score_hook',
  'quantcooks.set_auto_edit_preference',
  'quantcooks.set_timeline',
  'quantcooks.suggest_titles',
  'quantcooks.transform_video',
  'quantcooks.update_brand_kit',
  'quantcooks.update_project',
  'quantcooks.upload_asset',
  'quantcooks.upscale_asset',
  'quantcooks.vary_ad',
].sort();

// name → [tier, mode, permissionTier] spot-pins across every group.
const SPOT_PINS: Record<string, ['A' | 'B', 'sync' | 'async', number]> = {
  'quantcooks.create_project': ['A', 'sync', 1],
  'quantcooks.set_timeline': ['A', 'sync', 1],
  'quantcooks.export_project': ['A', 'async', 1],
  'quantcooks.upload_asset': ['A', 'sync', 1],
  'quantcooks.list_templates': ['A', 'sync', 0],
  'quantcooks.suggest_titles': ['A', 'sync', 2],
  'quantcooks.generate_captions': ['A', 'sync', 2],
  'quantcooks.run_auto_edit': ['A', 'async', 2],
  'quantcooks.get_job_status': ['A', 'sync', 0],
  'quantcooks.get_credit_balance': ['A', 'sync', 0],
  'quantcooks.list_models': ['B', 'sync', 0],
  'quantcooks.generate_dish_image': ['B', 'async', 2],
  'quantcooks.clone_voice': ['B', 'async', 2],
  'quantcooks.score_hook': ['B', 'async', 2],
  'quantcooks.plan_project': ['B', 'sync', 0],
  'quantcooks.render_effects': ['A', 'async', 2],
  'quantcooks.edit_photo': ['A', 'async', 2],
  'quantcooks.create_design': ['A', 'async', 2],
  'quantcooks.export_design': ['A', 'async', 2],
};

describe('CP-1 tool registry', () => {
  const rig = createToolsTestRig();

  it('registers exactly the 54 manifest tools + 2 ratified twins + 2 design amendments (58)', () => {
    expect(rig.registry.names()).toEqual(EXPECTED_TOOLS);
    expect(rig.registry.names()).toHaveLength(58);
  });

  it('tier split: 37 Tier A (33 manifest + 2 twins + 2 design), 21 Tier B fail-closed', () => {
    const all = rig.registry.list();
    expect(all.filter((d) => d.tier === 'A')).toHaveLength(37);
    expect(all.filter((d) => d.tier === 'B')).toHaveLength(21);
  });

  it('the 2 conditional marketplace tools stay RESERVED, not registered', () => {
    expect(rig.registry.has('quantcooks.list_campaigns')).toBe(false);
    expect(rig.registry.has('quantcooks.submit_to_campaign')).toBe(false);
  });

  it('spot-pins: tier / mode / permissionTier per group', () => {
    for (const [name, [tier, mode, permissionTier]] of Object.entries(SPOT_PINS)) {
      const def = rig.registry.get(name);
      expect([def.tier, def.mode, def.permissionTier], name).toEqual([tier, mode, permissionTier]);
    }
  });

  it('every Tier B tool carries a named NOT_CONFIGURED refusal code', () => {
    for (const def of rig.registry.list().filter((d) => d.tier === 'B')) {
      expect(def.notConfiguredCode, def.name).toBeTruthy();
      expect(def.notConfiguredCode, def.name).toMatch(/_NOT_CONFIGURED$/);
    }
  });

  it('every registered example parses against its own input schema', () => {
    for (const def of rig.registry.list()) {
      if (!def.example) continue;
      const parsed = def.inputSchema.safeParse(def.example.input);
      expect(parsed.success, `${def.name}: ${JSON.stringify(def.example.input)}`).toBe(true);
    }
  });

  it('summaries resolve for all 58 tools with an availability verdict', () => {
    const summaries = rig.registry.summaries();
    expect(summaries).toHaveLength(58);
    for (const s of summaries) {
      expect(['available', 'not_configured'], s.name).toContain(s.availability);
      if (s.availability === 'not_configured') {
        expect(s.notConfiguredReason, s.name).toBeTruthy();
      }
    }
  });

  it('the twins report not_configured while their binaries are absent', () => {
    const byName = new Map(rig.registry.summaries().map((s) => [s.name, s]));
    expect(byName.get('quantcooks.render_effects')?.availability).toBe('not_configured');
    expect(byName.get('quantcooks.render_effects')?.notConfiguredReason).toBe('CRAFT_NOT_CONFIGURED');
    expect(byName.get('quantcooks.edit_photo')?.availability).toBe('not_configured');
    expect(byName.get('quantcooks.edit_photo')?.notConfiguredReason).toBe('PHOTO_NOT_CONFIGURED');
  });

  it('the design amendments report not_configured while the FigCraft binary is absent', () => {
    const byName = new Map(rig.registry.summaries().map((s) => [s.name, s]));
    expect(byName.get('quantcooks.create_design')?.availability).toBe('not_configured');
    expect(byName.get('quantcooks.create_design')?.notConfiguredReason).toBe('FIGCRAFT_NOT_CONFIGURED');
    expect(byName.get('quantcooks.export_design')?.availability).toBe('not_configured');
    expect(byName.get('quantcooks.export_design')?.notConfiguredReason).toBe('FIGCRAFT_NOT_CONFIGURED');
    // Step-5's tool is a follow-up, never silently registered.
    expect(rig.registry.has('quantcooks.inspect_design_code')).toBe(false);
  });

  it('duplicate registration throws', () => {
    const def = rig.registry.get('quantcooks.list_projects');
    expect(() => rig.registry.register(def)).toThrow(/already registered/);
  });

  it('unknown tool names refuse with TOOL_NOT_FOUND', async () => {
    await expect(
      rig.registry.invoke('quantcooks.nope', {}, userCtx()),
    ).rejects.toMatchObject({ code: 'TOOL_NOT_FOUND' });
  });

  it('rate table validation rejects fractional credit rows at boot (§6.4)', () => {
    expect(() => validateRateTable()).not.toThrow();
    expect(() =>
      validateRateTable({ 'quantcooks.x': { type: 'flat', credits: 0.5 } as never }),
    ).toThrow(/whole number/);
  });

  it('audit records carry paramsHash, never raw params (§7.5)', async () => {
    const rig2 = createToolsTestRig();
    await rig2.registry.invoke('quantcooks.list_projects', {}, userCtx());
    const record = rig2.auditLog.records.at(-1);
    expect(record?.tool).toBe('quantcooks.list_projects');
    expect(record?.paramsHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(record)).not.toContain('params":');
  });
});
