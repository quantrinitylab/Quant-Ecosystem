import type {
  CrossAppTarget,
  AppCapabilities,
  LensDefinition,
  DistributionManifest,
} from '../types.js';

const APP_CAPABILITIES: Record<CrossAppTarget, AppCapabilities> = {
  quant_neon: {
    app: 'quant_neon',
    maxFaces: 5,
    supports3D: true,
    supportsParticles: true,
    maxResolution: 1920,
    supportsGenerative: true,
  },
  quant_chat: {
    app: 'quant_chat',
    maxFaces: 2,
    supports3D: true,
    supportsParticles: true,
    maxResolution: 1280,
    supportsGenerative: false,
  },
  quant_max: {
    app: 'quant_max',
    maxFaces: 2,
    supports3D: false,
    supportsParticles: true,
    maxResolution: 720,
    supportsGenerative: false,
  },
  quant_meet: {
    app: 'quant_meet',
    maxFaces: 1,
    supports3D: false,
    supportsParticles: false,
    maxResolution: 1080,
    supportsGenerative: false,
  },
};

export class CrossAppDistributor {
  private registeredLenses = new Map<string, DistributionManifest>();

  register(lens: LensDefinition, targets: CrossAppTarget[]): DistributionManifest {
    const compatibility = new Map<CrossAppTarget, boolean>();
    const constraints = new Map<CrossAppTarget, string[]>();

    for (const target of targets) {
      const caps = APP_CAPABILITIES[target];
      const issues = this.checkCompatibility(lens, caps);
      compatibility.set(target, issues.length === 0);
      constraints.set(target, issues);
    }

    const manifest: DistributionManifest = {
      lensId: lens.id,
      targets,
      compatibility,
      constraints,
    };

    this.registeredLenses.set(lens.id, manifest);
    return manifest;
  }

  getCapabilities(target: CrossAppTarget): AppCapabilities {
    return APP_CAPABILITIES[target];
  }

  isCompatible(lensId: string, target: CrossAppTarget): boolean {
    const manifest = this.registeredLenses.get(lensId);
    if (!manifest) return false;
    return manifest.compatibility.get(target) ?? false;
  }

  getConstraints(lensId: string, target: CrossAppTarget): string[] {
    const manifest = this.registeredLenses.get(lensId);
    if (!manifest) return ['lens_not_registered'];
    return manifest.constraints.get(target) ?? [];
  }

  private checkCompatibility(lens: LensDefinition, caps: AppCapabilities): string[] {
    const issues: string[] = [];

    const has3D = lens.effects.some(
      (e) => e.effectType === 'overlay_3d' || e.effectType === 'mesh_deform',
    );
    if (has3D && !caps.supports3D) {
      issues.push('3d_not_supported');
    }

    const hasParticles = lens.effects.some((e) => e.effectType === 'particles');
    if (hasParticles && !caps.supportsParticles) {
      issues.push('particles_not_supported');
    }

    const hasGenerative = lens.effects.some(
      (e) =>
        e.effectType === 'style_transfer' ||
        e.effectType === 'background_replace' ||
        e.effectType === 'generative',
    );
    if (hasGenerative && !caps.supportsGenerative) {
      issues.push('generative_not_supported');
    }

    // Check maxFaces constraint from lens parameters
    const requiredFaces = lens.parameters['maxFaces']?.default ?? 1;
    if (requiredFaces > caps.maxFaces) {
      issues.push('max_faces_exceeded');
    }

    // Check maxResolution constraint from lens parameters
    const requiredResolution = lens.parameters['maxResolution']?.default ?? 0;
    if (requiredResolution > 0 && requiredResolution > caps.maxResolution) {
      issues.push('max_resolution_exceeded');
    }

    return issues;
  }

  getRegisteredLenses(): string[] {
    return [...this.registeredLenses.keys()];
  }
}
