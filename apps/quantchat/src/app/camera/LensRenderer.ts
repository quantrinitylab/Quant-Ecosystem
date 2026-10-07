/**
 * LensRenderer — applies AR lens overlays to the canvas.
 *
 * Takes canvas context + FaceMeshResult + active lens config and applies
 * visual effects (color tints, particle effects, distortions, beauty filters).
 * Must complete within 200ms of lens selection.
 */

import type { FaceMeshResult } from '../../lib/face-detection';
import type { ARLensConfig } from './ARLensCarousel';

/**
 * Apply the active lens effect to the canvas.
 *
 * @param ctx - The 2D rendering context of the viewfinder canvas
 * @param faceMesh - Face mesh detection result, or null if no face detected
 * @param lens - The active AR lens configuration
 *
 * If faceMesh is null and the lens requires face tracking, the lens
 * is applied at the fallback position (center of frame) without crashing.
 */
export function applyLens(
  ctx: CanvasRenderingContext2D,
  faceMesh: FaceMeshResult | null,
  lens: ARLensConfig,
): void {
  const { width, height } = ctx.canvas;

  // Determine the target region for face-based effects
  const targetBox = faceMesh
    ? faceMesh.boundingBox
    : {
        // Fallback: center of frame
        x: width * lens.fallbackPosition.x - width * lens.fallbackPosition.scale * 0.3,
        y: height * lens.fallbackPosition.y - height * lens.fallbackPosition.scale * 0.4,
        width: width * lens.fallbackPosition.scale * 0.6,
        height: height * lens.fallbackPosition.scale * 0.8,
      };

  switch (lens.type) {
    case 'face_distortion':
      applyFaceWarp(ctx, targetBox, width, height);
      break;
    case 'color_overlay':
      applyColorOverlay(ctx, lens, targetBox, width, height);
      break;
    case 'particle':
      applyParticleStars(ctx, width, height);
      break;
    case 'alien_theme':
      applyAlienTheme(ctx, lens, targetBox, width, height);
      break;
    case 'beauty':
      applyBeautyMode(ctx, targetBox, width, height);
      break;
  }
}

/**
 * Face Warp: applies a bulge/distortion effect to the face region.
 * Simulated via a slight zoom on the face region for real-time performance.
 */
function applyFaceWarp(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): void {
  // Save the face region
  const padding = 10;
  const sx = Math.max(0, Math.floor(box.x - padding));
  const sy = Math.max(0, Math.floor(box.y - padding));
  const sw = Math.min(canvasWidth - sx, Math.floor(box.width + padding * 2));
  const sh = Math.min(canvasHeight - sy, Math.floor(box.height + padding * 2));

  if (sw <= 0 || sh <= 0) return;

  try {
    // Get image data for the face region
    const imageData = ctx.getImageData(sx, sy, sw, sh);

    // Apply a subtle color shift to simulate warp distortion visually
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      // Slight red-shift and contrast boost for warp feel
      data[i] = Math.min(255, data[i]! + 15); // R
      data[i + 2] = Math.max(0, data[i + 2]! - 10); // B
    }

    ctx.putImageData(imageData, sx, sy);

    // Draw scaled version slightly zoomed for bulge effect
    ctx.save();
    ctx.globalAlpha = 0.3;
    const zoomFactor = 1.08;
    const dx = box.x - (box.width * (zoomFactor - 1)) / 2;
    const dy = box.y - (box.height * (zoomFactor - 1)) / 2;
    ctx.drawImage(ctx.canvas, sx, sy, sw, sh, dx, dy, sw * zoomFactor, sh * zoomFactor);
    ctx.restore();
  } catch {
    // Tainted canvas - apply a visual overlay instead
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#FF6B6B';
    ctx.beginPath();
    ctx.ellipse(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width / 2,
      box.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Color Overlay: applies a colored tint to the frame or face region.
 * For 'neon-outline' lens, draws a glowing outline around the face.
 */
function applyColorOverlay(
  ctx: CanvasRenderingContext2D,
  lens: ARLensConfig,
  box: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.save();

  if (lens.id === 'neon-outline') {
    // Neon glow outline around face
    ctx.strokeStyle = lens.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = lens.color;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.ellipse(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width / 2 + 5,
      box.height / 2 + 5,
      0,
      0,
      Math.PI * 2,
    );
    ctx.stroke();

    // Second glow layer
    ctx.shadowBlur = 30;
    ctx.globalAlpha = 0.5;
    ctx.stroke();
  } else {
    // Color Pop: full-frame rainbow tint
    ctx.globalAlpha = 0.12;
    const gradient = ctx.createLinearGradient(0, 0, canvasWidth, canvasHeight);
    gradient.addColorStop(0, '#FF6B6B');
    gradient.addColorStop(0.25, '#FFD93D');
    gradient.addColorStop(0.5, '#6BCB77');
    gradient.addColorStop(0.75, '#4D96FF');
    gradient.addColorStop(1, '#9B59B6');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Boost saturation of the entire frame
    ctx.globalCompositeOperation = 'saturation';
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = 'hsl(0, 100%, 50%)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  ctx.restore();
}

/**
 * Particle Stars: draws animated sparkle particles across the frame.
 * Uses time-based positioning for animation illusion.
 */
function applyParticleStars(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.save();
  const time = Date.now() / 1000;
  const particleCount = 20;

  for (let i = 0; i < particleCount; i++) {
    // Deterministic-ish but animated positions
    const seed = i * 137.508; // Golden angle
    const x = (seed + time * 30 * ((i % 3) + 1)) % canvasWidth;
    const y = (seed * 2.3 + time * 20 * ((i % 2) + 1)) % canvasHeight;
    const size = 2 + (i % 4) * 1.5;
    const alpha = 0.4 + 0.6 * Math.abs(Math.sin(time * 2 + i));

    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#FFD700';
    ctx.shadowColor = '#FFD700';
    ctx.shadowBlur = 8;

    // Draw 4-point star
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.lineTo(x + size * 0.3, y);
    ctx.lineTo(x, y + size);
    ctx.lineTo(x - size * 0.3, y);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x, y + size * 0.3);
    ctx.lineTo(x + size, y);
    ctx.lineTo(x, y - size * 0.3);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Alien Theme: applies an otherworldly glow and color shift.
 * 'alien-glow' = green bioluminescent aura
 * 'cybernetic-mask' = purple circuit-like overlay
 */
function applyAlienTheme(
  ctx: CanvasRenderingContext2D,
  lens: ARLensConfig,
  box: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.save();

  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  if (lens.id === 'alien-glow') {
    // Bioluminescent green glow around face
    const gradient = ctx.createRadialGradient(cx, cy, box.width * 0.2, cx, cy, box.width * 0.8);
    gradient.addColorStop(0, 'rgba(46, 213, 115, 0.0)');
    gradient.addColorStop(0.5, 'rgba(46, 213, 115, 0.15)');
    gradient.addColorStop(1, 'rgba(46, 213, 115, 0.0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Pulsing inner glow
    const pulse = 0.1 + 0.05 * Math.sin(Date.now() / 500);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#2ED573';
    ctx.beginPath();
    ctx.ellipse(cx, cy, box.width / 2, box.height / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Cybernetic Mask: circuit-line overlay
    ctx.strokeStyle = lens.color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = lens.color;
    ctx.shadowBlur = 10;
    ctx.globalAlpha = 0.6;

    // Draw geometric lines suggesting a circuit pattern
    const lines = [
      // Horizontal forehead lines
      [cx - box.width * 0.3, cy - box.height * 0.3, cx + box.width * 0.3, cy - box.height * 0.3],
      [cx - box.width * 0.2, cy - box.height * 0.35, cx + box.width * 0.2, cy - box.height * 0.35],
      // Cheek accents
      [cx - box.width * 0.4, cy, cx - box.width * 0.2, cy + box.height * 0.2],
      [cx + box.width * 0.4, cy, cx + box.width * 0.2, cy + box.height * 0.2],
      // Jaw lines
      [cx - box.width * 0.15, cy + box.height * 0.3, cx + box.width * 0.15, cy + box.height * 0.3],
    ];

    for (const [x1, y1, x2, y2] of lines) {
      ctx.beginPath();
      ctx.moveTo(x1!, y1!);
      ctx.lineTo(x2!, y2!);
      ctx.stroke();
    }

    // Node dots at line intersections
    ctx.fillStyle = lens.color;
    const nodes = [
      [cx - box.width * 0.3, cy - box.height * 0.3],
      [cx + box.width * 0.3, cy - box.height * 0.3],
      [cx, cy - box.height * 0.35],
      [cx - box.width * 0.4, cy],
      [cx + box.width * 0.4, cy],
    ];

    for (const [nx, ny] of nodes) {
      ctx.beginPath();
      ctx.arc(nx!, ny!, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

/**
 * Beauty Mode: applies soft gaussian blur to the skin region and slight
 * exposure brightening. Uses the face bounding box to target the skin area.
 */
function applyBeautyMode(
  ctx: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): void {
  const sx = Math.max(0, Math.floor(box.x));
  const sy = Math.max(0, Math.floor(box.y));
  const sw = Math.min(canvasWidth - sx, Math.floor(box.width));
  const sh = Math.min(canvasHeight - sy, Math.floor(box.height));

  if (sw <= 0 || sh <= 0) return;

  try {
    // Get the face region image data
    const imageData = ctx.getImageData(sx, sy, sw, sh);
    const data = imageData.data;

    // Apply a simple box blur (3x3 kernel approximation) for skin smoothing
    // For performance, we do a single-pass averaging with neighbors
    const copy = new Uint8ClampedArray(data);
    const stride = sw * 4;

    for (let y = 1; y < sh - 1; y++) {
      for (let x = 1; x < sw - 1; x++) {
        const idx = (y * sw + x) * 4;

        for (let c = 0; c < 3; c++) {
          // 3x3 weighted average (center-heavy for subtle smoothing)
          const center = copy[idx + c]!;
          const top = copy[idx - stride + c]!;
          const bottom = copy[idx + stride + c]!;
          const left = copy[idx - 4 + c]!;
          const right = copy[idx + 4 + c]!;

          // Weighted: center=4, neighbors=1 each => /8 for subtle smoothing
          data[idx + c] = Math.round((center * 4 + top + bottom + left + right) / 8);
        }

        // Slight exposure brightening (+8 to each channel, clamped)
        data[idx] = Math.min(255, data[idx]! + 8);
        data[idx + 1] = Math.min(255, data[idx + 1]! + 8);
        data[idx + 2] = Math.min(255, data[idx + 2]! + 8);
      }
    }

    ctx.putImageData(imageData, sx, sy);

    // Add a very subtle warm glow overlay on the face for the beauty look
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#FFEAA7';
    ctx.beginPath();
    ctx.ellipse(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width / 2,
      box.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  } catch {
    // Tainted canvas fallback: just add a soft glow overlay
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#FFEAA7';
    ctx.beginPath();
    ctx.ellipse(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width / 2,
      box.height / 2,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
}
