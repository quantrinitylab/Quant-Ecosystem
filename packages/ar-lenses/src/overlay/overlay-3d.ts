import type { Overlay3DConfig, TransformMatrix, Point3D, FaceDetection } from '../types.js';

interface Render3DResult {
  id: string;
  type: Overlay3DConfig['type'];
  worldTransform: TransformMatrix;
}

export class Overlay3DEngine {
  private overlays: Map<string, Overlay3DConfig> = new Map();

  addOverlay(config: Overlay3DConfig): void {
    this.overlays.set(config.id, config);
  }

  removeOverlay(id: string): boolean {
    return this.overlays.delete(id);
  }

  render(faces: FaceDetection[]): Render3DResult[] {
    const results: Render3DResult[] = [];

    for (const overlay of this.overlays.values()) {
      for (const face of faces) {
        const anchorPositions = overlay.anchorLandmarks
          .map((idx) => face.landmarks[idx])
          .filter((lm) => lm !== undefined);

        if (anchorPositions.length === 0) continue;

        const centroid = this.computeCentroid(anchorPositions.map((lm) => lm.position));
        const worldTransform = this.computeWorldTransform(centroid, overlay.transform);

        results.push({
          id: `${overlay.id}:${face.id}`,
          type: overlay.type,
          worldTransform,
        });
      }
    }

    return results;
  }

  deformMesh(face: FaceDetection, overlay: Overlay3DConfig): Float32Array | null {
    if (overlay.type !== 'mesh_deform' || !overlay.meshData) return null;

    const deformed = new Float32Array(overlay.meshData.length);
    for (let i = 0; i < overlay.meshData.length; i += 3) {
      const baseX = overlay.meshData[i] ?? 0;
      const baseY = overlay.meshData[i + 1] ?? 0;
      const baseZ = overlay.meshData[i + 2] ?? 0;

      const landmarkIdx = Math.floor(i / 3) % face.landmarks.length;
      const landmark = face.landmarks[landmarkIdx];
      if (!landmark) {
        // Preserve the undeformed vertex rather than collapsing it to (0,0,0).
        deformed[i] = baseX;
        deformed[i + 1] = baseY;
        deformed[i + 2] = baseZ;
        continue;
      }

      deformed[i] = baseX + landmark.position.x * 0.1;
      deformed[i + 1] = baseY + landmark.position.y * 0.1;
      deformed[i + 2] = baseZ + landmark.position.z * 0.1;
    }

    return deformed;
  }

  private computeCentroid(points: Point3D[]): Point3D {
    if (points.length === 0) return { x: 0, y: 0, z: 0 };

    const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y, z: acc.z + p.z }), {
      x: 0,
      y: 0,
      z: 0,
    });

    return {
      x: sum.x / points.length,
      y: sum.y / points.length,
      z: sum.z / points.length,
    };
  }

  private computeWorldTransform(centroid: Point3D, local: TransformMatrix): TransformMatrix {
    return {
      position: {
        x: centroid.x + local.position.x,
        y: centroid.y + local.position.y,
        z: centroid.z + local.position.z,
      },
      rotation: local.rotation,
      scale: local.scale,
    };
  }

  getOverlayCount(): number {
    return this.overlays.size;
  }
}
