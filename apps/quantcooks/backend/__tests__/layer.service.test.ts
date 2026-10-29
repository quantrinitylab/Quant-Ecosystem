// ============================================================================
// LayerService tests (P0-2). The service runs over a combined fake prisma:
// the P0-1 EditProject fake (for project existence/ownership) plus the
// EditLayer fake. Mirrors the project.service.test.ts idiom.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { LayerService } from '../services/layer.service';
import { ProjectService } from '../services/project.service';
import { createFakeEditProjectPrisma } from './fake-edit-project-prisma';
import { createFakeEditLayerPrisma } from './fake-edit-layer-prisma';

describe('LayerService', () => {
  let projects: ProjectService;
  let layers: LayerService;
  let projectId: string;

  beforeEach(async () => {
    const prisma = {
      ...createFakeEditProjectPrisma(),
      ...createFakeEditLayerPrisma(),
    };
    projects = new ProjectService(prisma as never);
    layers = new LayerService(prisma as never);
    const project = await projects.createProject({
      userId: 'user-1',
      name: 'Film',
      type: 'video',
    });
    projectId = project.id;
  });

  it('creates a layer with schema defaults and appends order', async () => {
    const a = await layers.createLayer(projectId, 'user-1', {
      name: 'Base',
      type: 'video',
      content: { src: 'a.mp4' },
    });
    const b = await layers.createLayer(projectId, 'user-1', { name: 'Title', type: 'text' });

    expect(a.order).toBe(0);
    expect(b.order).toBe(1);
    expect(a.visible).toBe(true);
    expect(a.locked).toBe(false);
    expect(a.opacity).toBe(1);
    expect(a.blendMode).toBe('normal');
    expect(a.content).toEqual({ src: 'a.mp4' });
  });

  it('lists layers in order', async () => {
    await layers.createLayer(projectId, 'user-1', { name: 'Second', type: 'audio', order: 5 });
    await layers.createLayer(projectId, 'user-1', { name: 'First', type: 'video', order: 1 });

    const list = await layers.listLayers(projectId);
    expect(list.map((l) => l.name)).toEqual(['First', 'Second']);
  });

  it('updates only the given fields', async () => {
    const layer = await layers.createLayer(projectId, 'user-1', { name: 'Clip', type: 'video' });
    const updated = await layers.updateLayer(projectId, layer.id, 'user-1', { opacity: 0.5 });

    expect(updated.opacity).toBe(0.5);
    expect(updated.name).toBe('Clip');
  });

  it('deletes a layer', async () => {
    const layer = await layers.createLayer(projectId, 'user-1', { name: 'Clip', type: 'video' });
    await layers.deleteLayer(projectId, layer.id, 'user-1');

    expect(await layers.listLayers(projectId)).toHaveLength(0);
  });

  it('duplicates a layer as an appended (Copy)', async () => {
    const layer = await layers.createLayer(projectId, 'user-1', {
      name: 'Clip',
      type: 'video',
      content: { src: 'x.mp4' },
    });
    const copy = await layers.duplicateLayer(projectId, layer.id, 'user-1');

    expect(copy.id).not.toBe(layer.id);
    expect(copy.name).toBe('Clip (Copy)');
    expect(copy.order).toBe(1);
    expect(copy.content).toEqual({ src: 'x.mp4' });
  });

  it('reorders by the given id list', async () => {
    const a = await layers.createLayer(projectId, 'user-1', { name: 'A', type: 'video' });
    const b = await layers.createLayer(projectId, 'user-1', { name: 'B', type: 'audio' });

    const reordered = await layers.reorderLayers(projectId, 'user-1', [b.id, a.id]);
    expect(reordered.map((l) => l.name)).toEqual(['B', 'A']);
    expect(reordered.map((l) => l.order)).toEqual([0, 1]);
  });

  it('rejects a reorder that does not list the full layer set', async () => {
    const a = await layers.createLayer(projectId, 'user-1', { name: 'A', type: 'video' });
    await layers.createLayer(projectId, 'user-1', { name: 'B', type: 'audio' });

    await expect(layers.reorderLayers(projectId, 'user-1', [a.id])).rejects.toMatchObject({
      code: 'REORDER_SET_MISMATCH',
    });
  });

  it('rejects mutations by a non-owner', async () => {
    await expect(
      layers.createLayer(projectId, 'user-2', { name: 'Nope', type: 'video' }),
    ).rejects.toMatchObject({ code: 'NOT_PROJECT_OWNER' });
  });

  it('rejects a missing project and a missing layer', async () => {
    await expect(layers.listLayers('no-such-project')).rejects.toMatchObject({
      code: 'PROJECT_NOT_FOUND',
    });
    await expect(
      layers.updateLayer(projectId, 'no-such-layer', 'user-1', { name: 'X' }),
    ).rejects.toMatchObject({ code: 'LAYER_NOT_FOUND' });
  });

  it('does not leak layers across projects', async () => {
    const other = await projects.createProject({ userId: 'user-1', name: 'Other', type: 'video' });
    const layer = await layers.createLayer(projectId, 'user-1', { name: 'Mine', type: 'video' });

    await expect(
      layers.updateLayer(other.id, layer.id, 'user-1', { name: 'Stolen' }),
    ).rejects.toMatchObject({ code: 'LAYER_NOT_FOUND' });
    expect(await layers.listLayers(other.id)).toHaveLength(0);
  });
});
