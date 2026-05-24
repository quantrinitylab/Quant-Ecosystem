// ============================================================================
// QuantEdits - Editor Service
// Core editing engine with layer management, timeline operations, canvas ops
// ============================================================================

import type { Project, Layer, LayerType, BlendMode, Timeline, Track, Clip, Keyframe, Transition, MaskConfig } from '../../src/types';

interface LayerCreateInput {
  name: string;
  type: LayerType;
  content: Layer['content'];
  position?: { x: number; y: number; z: number };
  size?: { width: number; height: number };
  startTime?: number;
  endTime?: number;
}

interface CanvasOperation {
  type: 'move' | 'resize' | 'rotate' | 'scale' | 'flip' | 'crop' | 'align' | 'distribute';
  layerId: string;
  params: Record<string, unknown>;
}

export class EditorService {
  private projects: Map<string, Project> = new Map();
  private layerIdCounter = 0;
  private clipIdCounter = 0;

  createProject(userId: string, input: { title: string; type: Project['type']; width: number; height: number; fps?: number; duration?: number }): Project {
    const project: Project = {
      id: `proj_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      userId,
      title: input.title,
      description: '',
      type: input.type,
      width: input.width,
      height: input.height,
      fps: input.fps || 30,
      duration: input.duration || 0,
      layers: [],
      timeline: this.createTimeline(''),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      autoSaveEnabled: true,
      collaborators: [],
      tags: [],
      isPublic: false,
    };
    project.timeline.projectId = project.id;
    this.projects.set(project.id, project);
    return project;
  }

  getProject(projectId: string): Project | null {
    return this.projects.get(projectId) || null;
  }

  updateProject(projectId: string, updates: Partial<Project>): Project | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    Object.assign(project, updates, { updatedAt: new Date().toISOString(), version: project.version + 1 });
    return project;
  }

  deleteProject(projectId: string): boolean {
    return this.projects.delete(projectId);
  }

  listProjects(userId: string, options: { type?: string; page?: number; limit?: number } = {}): { projects: Project[]; total: number } {
    let projects = Array.from(this.projects.values()).filter(p => p.userId === userId);
    if (options.type) projects = projects.filter(p => p.type === options.type);
    const total = projects.length;
    const page = options.page || 1;
    const limit = options.limit || 20;
    projects = projects.slice((page - 1) * limit, page * limit);
    return { projects, total };
  }

  // Layer Management
  addLayer(projectId: string, input: LayerCreateInput): Layer | null {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const layer: Layer = {
      id: `layer_${++this.layerIdCounter}_${Date.now().toString(36)}`,
      projectId,
      name: input.name,
      type: input.type,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      position: input.position || { x: 0, y: 0, z: project.layers.length },
      size: input.size || { width: project.width, height: project.height },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      effects: [],
      keyframes: [],
      startTime: input.startTime || 0,
      endTime: input.endTime || project.duration || 10,
      content: input.content,
      children: [],
    };

    project.layers.push(layer);
    this.addClipToTimeline(project, layer);
    project.updatedAt = new Date().toISOString();
    return layer;
  }

  removeLayer(projectId: string, layerId: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    const idx = project.layers.findIndex(l => l.id === layerId);
    if (idx === -1) return false;
    project.layers.splice(idx, 1);
    // Remove associated clips
    for (const track of project.timeline.tracks) {
      track.clips = track.clips.filter(c => c.layerId !== layerId);
    }
    project.updatedAt = new Date().toISOString();
    return true;
  }

  updateLayer(projectId: string, layerId: string, updates: Partial<Layer>): Layer | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    const layer = project.layers.find(l => l.id === layerId);
    if (!layer) return null;
    Object.assign(layer, updates);
    project.updatedAt = new Date().toISOString();
    return layer;
  }

  reorderLayers(projectId: string, layerIds: string[]): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    const reordered: Layer[] = [];
    for (const id of layerIds) {
      const layer = project.layers.find(l => l.id === id);
      if (layer) {
        layer.position.z = reordered.length;
        reordered.push(layer);
      }
    }
    project.layers = reordered;
    project.updatedAt = new Date().toISOString();
    return true;
  }

  duplicateLayer(projectId: string, layerId: string): Layer | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    const original = project.layers.find(l => l.id === layerId);
    if (!original) return null;

    const copy: Layer = {
      ...JSON.parse(JSON.stringify(original)),
      id: `layer_${++this.layerIdCounter}_${Date.now().toString(36)}`,
      name: `${original.name} (copy)`,
      position: { ...original.position, z: project.layers.length },
    };
    project.layers.push(copy);
    this.addClipToTimeline(project, copy);
    project.updatedAt = new Date().toISOString();
    return copy;
  }

  groupLayers(projectId: string, layerIds: string[], groupName: string): Layer | null {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const groupLayer: Layer = {
      id: `layer_${++this.layerIdCounter}_${Date.now().toString(36)}`,
      projectId,
      name: groupName,
      type: 'overlay',
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'normal',
      position: { x: 0, y: 0, z: project.layers.length },
      size: { width: project.width, height: project.height },
      rotation: 0,
      scale: { x: 1, y: 1 },
      anchor: { x: 0.5, y: 0.5 },
      effects: [],
      keyframes: [],
      startTime: 0,
      endTime: project.duration,
      content: { type: 'overlay' },
      children: layerIds,
    };

    for (const id of layerIds) {
      const layer = project.layers.find(l => l.id === id);
      if (layer) layer.parentId = groupLayer.id;
    }

    project.layers.push(groupLayer);
    project.updatedAt = new Date().toISOString();
    return groupLayer;
  }

  // Timeline Operations
  private createTimeline(projectId: string): Timeline {
    return {
      id: `tl_${Date.now().toString(36)}`,
      projectId,
      duration: 0,
      tracks: [
        { id: 'track_video_1', name: 'Video 1', type: 'video', clips: [], muted: false, locked: false, height: 60, volume: 1 },
        { id: 'track_audio_1', name: 'Audio 1', type: 'audio', clips: [], muted: false, locked: false, height: 40, volume: 1 },
        { id: 'track_text_1', name: 'Text', type: 'text', clips: [], muted: false, locked: false, height: 30, volume: 1 },
        { id: 'track_overlay_1', name: 'Overlay', type: 'overlay', clips: [], muted: false, locked: false, height: 30, volume: 1 },
      ],
      markers: [],
      playheadPosition: 0,
      zoom: 1,
      scrollPosition: 0,
    };
  }

  private addClipToTimeline(project: Project, layer: Layer): void {
    const trackType = layer.type === 'audio' ? 'audio' : layer.type === 'text' ? 'text' : layer.type === 'overlay' || layer.type === 'effect' ? 'overlay' : 'video';
    let track = project.timeline.tracks.find(t => t.type === trackType);
    if (!track) {
      track = { id: `track_${trackType}_${project.timeline.tracks.length + 1}`, name: `${trackType} ${project.timeline.tracks.length + 1}`, type: trackType as Track['type'], clips: [], muted: false, locked: false, height: 40, volume: 1 };
      project.timeline.tracks.push(track);
    }

    const clip: Clip = {
      id: `clip_${++this.clipIdCounter}_${Date.now().toString(36)}`,
      trackId: track.id,
      layerId: layer.id,
      startTime: layer.startTime,
      endTime: layer.endTime,
      trimStart: 0,
      trimEnd: 0,
      transitions: {},
      speed: 1,
      volume: 1,
    };
    track.clips.push(clip);

    const maxEnd = Math.max(...project.timeline.tracks.flatMap(t => t.clips.map(c => c.endTime)), 0);
    project.timeline.duration = maxEnd;
    project.duration = maxEnd;
  }

  addTrack(projectId: string, type: Track['type'], name: string): Track | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    const track: Track = {
      id: `track_${type}_${project.timeline.tracks.length + 1}`,
      name,
      type,
      clips: [],
      muted: false,
      locked: false,
      height: type === 'audio' ? 40 : 60,
      volume: 1,
    };
    project.timeline.tracks.push(track);
    return track;
  }

  splitClip(projectId: string, clipId: string, time: number): { left: Clip; right: Clip } | null {
    const project = this.projects.get(projectId);
    if (!project) return null;

    for (const track of project.timeline.tracks) {
      const clipIdx = track.clips.findIndex(c => c.id === clipId);
      if (clipIdx === -1) continue;

      const clip = track.clips[clipIdx];
      if (time <= clip.startTime || time >= clip.endTime) return null;

      const rightClip: Clip = {
        ...clip,
        id: `clip_${++this.clipIdCounter}_${Date.now().toString(36)}`,
        startTime: time,
        trimStart: clip.trimStart + (time - clip.startTime),
      };

      clip.endTime = time;
      track.clips.splice(clipIdx + 1, 0, rightClip);
      project.updatedAt = new Date().toISOString();
      return { left: clip, right: rightClip };
    }
    return null;
  }

  addTransition(projectId: string, clipId: string, position: 'in' | 'out', transition: Transition): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;

    for (const track of project.timeline.tracks) {
      const clip = track.clips.find(c => c.id === clipId);
      if (clip) {
        clip.transitions[position] = transition;
        project.updatedAt = new Date().toISOString();
        return true;
      }
    }
    return false;
  }

  // Keyframe Animation
  addKeyframe(projectId: string, layerId: string, keyframe: Omit<Keyframe, 'id' | 'layerId'>): Keyframe | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    const layer = project.layers.find(l => l.id === layerId);
    if (!layer) return null;

    const kf: Keyframe = {
      id: `kf_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      layerId,
      ...keyframe,
    };
    layer.keyframes.push(kf);
    layer.keyframes.sort((a, b) => a.time - b.time);
    project.updatedAt = new Date().toISOString();
    return kf;
  }

  removeKeyframe(projectId: string, layerId: string, keyframeId: string): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    const layer = project.layers.find(l => l.id === layerId);
    if (!layer) return false;
    const idx = layer.keyframes.findIndex(k => k.id === keyframeId);
    if (idx === -1) return false;
    layer.keyframes.splice(idx, 1);
    project.updatedAt = new Date().toISOString();
    return true;
  }

  interpolateKeyframes(layer: Layer, time: number, property: string): unknown {
    const keyframes = layer.keyframes.filter(k => k.property === property);
    if (keyframes.length === 0) return undefined;
    if (keyframes.length === 1) return keyframes[0].value;

    const before = keyframes.filter(k => k.time <= time).pop();
    const after = keyframes.find(k => k.time > time);

    if (!before) return keyframes[0].value;
    if (!after) return before.value;

    const t = (time - before.time) / (after.time - before.time);
    const easedT = this.applyEasing(t, after.easing);

    if (typeof before.value === 'number' && typeof after.value === 'number') {
      return before.value + (after.value - before.value) * easedT;
    }
    return t < 0.5 ? before.value : after.value;
  }

  private applyEasing(t: number, easing: Keyframe['easing']): number {
    switch (easing) {
      case 'linear': return t;
      case 'ease-in': return t * t;
      case 'ease-out': return t * (2 - t);
      case 'ease-in-out': return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      case 'bounce': {
        const n1 = 7.5625, d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        return n1 * (t -= 2.625 / d1) * t + 0.984375;
      }
      case 'elastic': return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3));
      default: return t;
    }
  }

  // Canvas Operations
  applyCanvasOperation(projectId: string, operation: CanvasOperation): boolean {
    const project = this.projects.get(projectId);
    if (!project) return false;
    const layer = project.layers.find(l => l.id === operation.layerId);
    if (!layer || layer.locked) return false;

    switch (operation.type) {
      case 'move':
        layer.position.x = (operation.params['x'] as number) ?? layer.position.x;
        layer.position.y = (operation.params['y'] as number) ?? layer.position.y;
        break;
      case 'resize':
        layer.size.width = (operation.params['width'] as number) ?? layer.size.width;
        layer.size.height = (operation.params['height'] as number) ?? layer.size.height;
        break;
      case 'rotate':
        layer.rotation = (operation.params['angle'] as number) ?? layer.rotation;
        break;
      case 'scale':
        layer.scale.x = (operation.params['scaleX'] as number) ?? layer.scale.x;
        layer.scale.y = (operation.params['scaleY'] as number) ?? layer.scale.y;
        break;
      case 'flip':
        if (operation.params['horizontal']) layer.scale.x *= -1;
        if (operation.params['vertical']) layer.scale.y *= -1;
        break;
      case 'align': {
        const alignment = operation.params['alignment'] as string;
        if (alignment === 'center-h') layer.position.x = (project.width - layer.size.width) / 2;
        if (alignment === 'center-v') layer.position.y = (project.height - layer.size.height) / 2;
        if (alignment === 'left') layer.position.x = 0;
        if (alignment === 'right') layer.position.x = project.width - layer.size.width;
        if (alignment === 'top') layer.position.y = 0;
        if (alignment === 'bottom') layer.position.y = project.height - layer.size.height;
        break;
      }
      default:
        return false;
    }

    project.updatedAt = new Date().toISOString();
    return true;
  }

  // Auto-save & Versioning
  autoSave(projectId: string): { version: number; savedAt: string } | null {
    const project = this.projects.get(projectId);
    if (!project || !project.autoSaveEnabled) return null;
    project.version++;
    project.updatedAt = new Date().toISOString();
    return { version: project.version, savedAt: project.updatedAt };
  }
}

export const editorService = new EditorService();
