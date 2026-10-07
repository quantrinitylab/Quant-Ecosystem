/**
 * Face mesh detection interface and simulated implementation.
 *
 * This module provides a simulated face mesh detector that returns
 * face landmark coordinates based on canvas frame analysis. The interface
 * is designed to be swapped for real MediaPipe/TF.js later.
 *
 * The simulated detector uses the center-third of the frame as the face
 * bounding box and generates plausible landmark positions within it.
 */

export interface FaceMeshResult {
  /** Array of facial landmark coordinates (normalized 0-1 range) */
  landmarks: { x: number; y: number }[];
  /** Bounding box of the detected face in pixel coordinates */
  boundingBox: { x: number; y: number; width: number; height: number };
  /** Confidence score 0-1 */
  confidence: number;
}

/**
 * Generates simulated face landmarks within a bounding box.
 * Creates 68 landmarks loosely corresponding to a face outline,
 * eyes, nose, and mouth regions.
 */
function generateSimulatedLandmarks(
  bbox: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number }[] {
  const landmarks: { x: number; y: number }[] = [];
  const cx = (bbox.x + bbox.width / 2) / canvasWidth;
  const cy = (bbox.y + bbox.height / 2) / canvasHeight;
  const hw = bbox.width / 2 / canvasWidth;
  const hh = bbox.height / 2 / canvasHeight;

  // Face outline (17 points)
  for (let i = 0; i < 17; i++) {
    const angle = Math.PI + (Math.PI * i) / 16;
    landmarks.push({
      x: cx + hw * 0.9 * Math.cos(angle),
      y: cy + hh * 0.9 * Math.sin(angle) + hh * 0.1,
    });
  }

  // Left eyebrow (5 points)
  for (let i = 0; i < 5; i++) {
    landmarks.push({
      x: cx - hw * 0.5 + (hw * 0.4 * i) / 4,
      y: cy - hh * 0.35,
    });
  }

  // Right eyebrow (5 points)
  for (let i = 0; i < 5; i++) {
    landmarks.push({
      x: cx + hw * 0.1 + (hw * 0.4 * i) / 4,
      y: cy - hh * 0.35,
    });
  }

  // Nose bridge (4 points)
  for (let i = 0; i < 4; i++) {
    landmarks.push({
      x: cx,
      y: cy - hh * 0.2 + (hh * 0.4 * i) / 3,
    });
  }

  // Nose bottom (5 points)
  for (let i = 0; i < 5; i++) {
    landmarks.push({
      x: cx - hw * 0.15 + (hw * 0.3 * i) / 4,
      y: cy + hh * 0.1,
    });
  }

  // Left eye (6 points)
  for (let i = 0; i < 6; i++) {
    const angle = (2 * Math.PI * i) / 6;
    landmarks.push({
      x: cx - hw * 0.3 + hw * 0.12 * Math.cos(angle),
      y: cy - hh * 0.15 + hh * 0.06 * Math.sin(angle),
    });
  }

  // Right eye (6 points)
  for (let i = 0; i < 6; i++) {
    const angle = (2 * Math.PI * i) / 6;
    landmarks.push({
      x: cx + hw * 0.3 + hw * 0.12 * Math.cos(angle),
      y: cy - hh * 0.15 + hh * 0.06 * Math.sin(angle),
    });
  }

  // Outer lip (12 points)
  for (let i = 0; i < 12; i++) {
    const angle = (2 * Math.PI * i) / 12;
    landmarks.push({
      x: cx + hw * 0.25 * Math.cos(angle),
      y: cy + hh * 0.4 + hh * 0.08 * Math.sin(angle),
    });
  }

  // Inner lip (8 points)
  for (let i = 0; i < 8; i++) {
    const angle = (2 * Math.PI * i) / 8;
    landmarks.push({
      x: cx + hw * 0.15 * Math.cos(angle),
      y: cy + hh * 0.4 + hh * 0.04 * Math.sin(angle),
    });
  }

  return landmarks;
}

/**
 * Analyzes the canvas to check if there's likely a face-like region.
 * Uses a simple brightness/contrast heuristic on the center-third of the frame.
 *
 * Returns true if the center region has sufficient variance (likely a face present),
 * false if it's uniform (likely no face / blank / covered).
 */
function hasLikelyFace(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const w = canvas.width;
  const h = canvas.height;

  // Sample the center-third region
  const sampleX = Math.floor(w / 3);
  const sampleY = Math.floor(h / 4);
  const sampleW = Math.floor(w / 3);
  const sampleH = Math.floor(h / 2);

  try {
    const imageData = ctx.getImageData(sampleX, sampleY, sampleW, sampleH);
    const data = imageData.data;

    if (data.length === 0) return false;

    // Calculate mean and variance of brightness
    let sum = 0;
    let sumSq = 0;
    const pixelCount = data.length / 4;

    // Sample every 16th pixel for performance
    const step = 16;
    let sampledCount = 0;

    for (let i = 0; i < data.length; i += 4 * step) {
      const brightness = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      sum += brightness;
      sumSq += brightness * brightness;
      sampledCount++;
    }

    if (sampledCount === 0) return false;

    const mean = sum / sampledCount;
    const variance = sumSq / sampledCount - mean * mean;

    // A face typically has brightness variance > 200 (skin tones, shadows, features)
    // A blank/uniform frame has low variance
    // We set a low threshold since even a dimly lit face has some variance
    return variance > 100 && mean > 20 && mean < 240;
  } catch {
    // getImageData may fail on tainted canvases
    // In that case, assume a face is present (optimistic)
    return true;
  }
}

/**
 * Detects a face mesh from a canvas frame.
 *
 * This is a SIMULATED implementation that:
 * 1. Checks if the center region likely contains a face (brightness variance check)
 * 2. If yes, returns a FaceMeshResult with the center-third bounding box and simulated landmarks
 * 3. If no, returns null (no face detected)
 *
 * This will be replaced by real MediaPipe/TF.js face mesh detection later.
 * The interface remains stable.
 */
export async function detectFaceMesh(canvas: HTMLCanvasElement): Promise<FaceMeshResult | null> {
  const w = canvas.width;
  const h = canvas.height;

  // Quick guard: canvas must have non-zero dimensions
  if (w === 0 || h === 0) return null;

  // Check if there's likely a face in the frame
  if (!hasLikelyFace(canvas)) {
    return null;
  }

  // Use center-third of frame as face bounding box
  const boundingBox = {
    x: Math.floor(w / 3),
    y: Math.floor(h / 4),
    width: Math.floor(w / 3),
    height: Math.floor(h / 2),
  };

  const landmarks = generateSimulatedLandmarks(boundingBox, w, h);

  return {
    landmarks,
    boundingBox,
    confidence: 0.85, // Simulated confidence
  };
}
