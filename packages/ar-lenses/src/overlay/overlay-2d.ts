import type { Overlay2DConfig, AnimationKeyframe, Point3D, FaceDetection } from '../types.js';

interface RenderResult {
  id: string;
  position: Point3D;
  opacity: number;
  scale: number;
  rotation: number;
  zOrder: number;
}

export class Overlay2DEngine {
  private overlays: Map<string, Overlay2DConfig> = new Map();

  addOverlay(config: Overlay2DConfig): void {
    this.overlays.set(config.id, config);
  }

  removeOverlay(id: string): boolean {
    return this.overlays.delete(id);
  }

  render(faces: FaceDetection[], time: number): RenderResult[] {
    const results: RenderResult[] = [];

    for (const overlay of this.overlays.values()) {
      const face = faces[0];
      if (!face) continue;

      const anchor = face.landmarks[overlay.anchorLandmark];
      if (!anchor) continue;

      const animated = this.applyAnimation(overlay, time);
      results.push({
        id: overlay.id,
        position: {
          x: anchor.position.x + animated.position.x,
          y: anchor.position.y + animated.position.y,
          z: anchor.position.z + animated.position.z,
        },
        opacity: animated.opacity,
        scale: animated.scale,
        rotation: animated.rotation,
        zOrder: overlay.zOrder,
      });
    }

    return results.sort((a, b) => a.zOrder - b.zOrder);
  }

  private applyAnimation(
    overlay: Overlay2DConfig,
    time: number,
  ): { position: Point3D; opacity: number; scale: number; rotation: number } {
    if (!overlay.animation || overlay.animation.length === 0) {
      return {
        position: overlay.position,
        opacity: overlay.opacity,
        scale: overlay.scale,
        rotation: overlay.rotation,
      };
    }

    const keyframes = overlay.animation;
    const duration = keyframes[keyframes.length - 1]?.time ?? 1;
    const normalizedTime = (time % duration) / duration;
    const currentTime = normalizedTime * duration;

    let prev: AnimationKeyframe = keyframes[0]!;
    let next: AnimationKeyframe = keyframes[0]!;

    for (let i = 0; i < keyframes.length - 1; i++) {
      const kf = keyframes[i]!;
      const kfNext = keyframes[i + 1]!;
      if (currentTime >= kf.time && currentTime <= kfNext.time) {
        prev = kf;
        next = kfNext;
        break;
      }
    }

    const range = next.time - prev.time;
    const t = range === 0 ? 0 : (currentTime - prev.time) / range;

    return {
      position: {
        x: prev.position.x + (next.position.x - prev.position.x) * t,
        y: prev.position.y + (next.position.y - prev.position.y) * t,
        z: prev.position.z + (next.position.z - prev.position.z) * t,
      },
      opacity: prev.opacity + (next.opacity - prev.opacity) * t,
      scale: prev.scale + (next.scale - prev.scale) * t,
      rotation: prev.rotation + (next.rotation - prev.rotation) * t,
    };
  }

  getOverlayCount(): number {
    return this.overlays.size;
  }
}
