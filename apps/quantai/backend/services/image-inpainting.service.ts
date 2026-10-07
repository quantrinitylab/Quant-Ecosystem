// ============================================================================
// QuantAI — Artifism v6.6.0 AI Image Inpainting & Mask Brush Engine
// ============================================================================

import crypto from 'crypto';

export interface MaskBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  featherRadiusPx?: number; // 1 to 50
}

export interface InpaintingJobParams {
  originalImageUrl: string;
  maskBox: MaskBoundingBox;
  prompt: string;
  negativePrompt?: string;
  blendingStrength?: number; // 0.1 to 1.0, default 0.75
  seed?: number;
}

export interface InpaintingJob {
  id: string;
  userId: string;
  params: InpaintingJobParams;
  status: 'QUEUED' | 'DIFFUSING' | 'BLENDED' | 'COMPLETED' | 'FAILED';
  progressPercentage: number;
  outputImageUrl?: string;
  maskOverlayUrl?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

// ----------------------------------------------------------------------------
// Constants & Specifications
// ----------------------------------------------------------------------------

export const DEFAULT_FEATHER_RADIUS_PX = 10;
export const MIN_FEATHER_RADIUS_PX = 1;
export const MAX_FEATHER_RADIUS_PX = 50;

export const DEFAULT_BLENDING_STRENGTH = 0.75;
export const MIN_BLENDING_STRENGTH = 0.1;
export const MAX_BLENDING_STRENGTH = 1.0;

// ----------------------------------------------------------------------------
// In-Memory Storage
// ----------------------------------------------------------------------------

const jobsMap = new Map<string, InpaintingJob>();

// ----------------------------------------------------------------------------
// Helpers: Validation & Clamping
// ----------------------------------------------------------------------------

/**
 * Clamps brush feathering radius to allowed range [1, 50] px.
 */
export function clampFeatherRadius(radius?: number): number {
  if (radius === undefined || Number.isNaN(radius)) {
    return DEFAULT_FEATHER_RADIUS_PX;
  }
  return Math.max(MIN_FEATHER_RADIUS_PX, Math.min(MAX_FEATHER_RADIUS_PX, Math.round(radius)));
}

/**
 * Clamps prompt blending strength to allowed range [0.1, 1.0].
 */
export function clampBlendingStrength(strength?: number): number {
  if (strength === undefined || Number.isNaN(strength)) {
    return DEFAULT_BLENDING_STRENGTH;
  }
  const clamped = Math.max(MIN_BLENDING_STRENGTH, Math.min(MAX_BLENDING_STRENGTH, strength));
  return Math.round(clamped * 100) / 100;
}

/**
 * Validates inpainting mask bounding box coordinates.
 */
export function validateBoundingBox(box: MaskBoundingBox): void {
  if (!box || typeof box !== 'object') {
    throw new Error('Bounding box is required');
  }
  if (typeof box.x !== 'number' || Number.isNaN(box.x) || box.x < 0) {
    throw new Error('Invalid bounding box coordinate x: must be a number >= 0');
  }
  if (typeof box.y !== 'number' || Number.isNaN(box.y) || box.y < 0) {
    throw new Error('Invalid bounding box coordinate y: must be a number >= 0');
  }
  if (typeof box.width !== 'number' || Number.isNaN(box.width) || box.width <= 0) {
    throw new Error('Invalid bounding box width: must be a number > 0');
  }
  if (typeof box.height !== 'number' || Number.isNaN(box.height) || box.height <= 0) {
    throw new Error('Invalid bounding box height: must be a number > 0');
  }
}

/**
 * Generates a deterministic integer seed based on userId and prompt.
 */
export function generateDeterministicSeed(prompt: string, userId: string): number {
  const hash = crypto.createHash('sha256').update(`${userId}:${prompt}`).digest();
  return hash.readUInt32BE(0) % 2147483647;
}

// ----------------------------------------------------------------------------
// Core Inpainting Functions
// ----------------------------------------------------------------------------

/**
 * Creates a new Image Inpainting Job with validated and clamped parameters.
 */
export function createInpaintingJob(userId: string, params: InpaintingJobParams): InpaintingJob {
  if (!userId || !userId.trim()) {
    throw new Error('User ID is required');
  }
  if (!params.originalImageUrl || !params.originalImageUrl.trim()) {
    throw new Error('Original image URL is required');
  }
  if (!params.prompt || !params.prompt.trim()) {
    throw new Error('Prompt is required');
  }

  validateBoundingBox(params.maskBox);

  const featherRadius = clampFeatherRadius(params.maskBox.featherRadiusPx);
  const blendingStrength = clampBlendingStrength(params.blendingStrength);
  const seed =
    params.seed !== undefined && Number.isFinite(params.seed)
      ? Math.floor(params.seed)
      : generateDeterministicSeed(params.prompt.trim(), userId);

  const jobId = `inpaint_${crypto.randomUUID()}`;

  const job: InpaintingJob = {
    id: jobId,
    userId: userId.trim(),
    params: {
      originalImageUrl: params.originalImageUrl.trim(),
      maskBox: {
        x: params.maskBox.x,
        y: params.maskBox.y,
        width: params.maskBox.width,
        height: params.maskBox.height,
        featherRadiusPx: featherRadius,
      },
      prompt: params.prompt.trim(),
      negativePrompt: params.negativePrompt?.trim(),
      blendingStrength,
      seed,
    },
    status: 'QUEUED',
    progressPercentage: 0,
    createdAt: new Date().toISOString(),
  };

  jobsMap.set(job.id, job);
  return job;
}

/**
 * Simulates a multi-step diffusion inpainting pipeline:
 * 1. Generates mask overlay bitmap and feathered boundary
 * 2. Inpainting replacement texture generation based on prompt
 * 3. Alpha blending with feathering radius
 * 4. Outputs final composite image URL
 */
export async function processInpaintingJob(jobId: string): Promise<InpaintingJob> {
  const job = jobsMap.get(jobId);
  if (!job) {
    throw new Error(`Inpainting job not found: ${jobId}`);
  }

  if (job.status === 'COMPLETED') {
    return job;
  }

  const cdnBase = 'https://cdn.quantmail.in/ai-inpainting';

  // Stage 1: Generate Mask Overlay
  job.status = 'DIFFUSING';
  job.progressPercentage = 30;
  job.maskOverlayUrl = `${cdnBase}/${job.id}-mask.png`;

  // Stage 2: Latent Diffusion Object Inpainting
  job.progressPercentage = 65;

  // Stage 3: Alpha Blending with Feathering
  job.status = 'BLENDED';
  job.progressPercentage = 90;

  // Stage 4: Output Synthesis & Finalization
  job.status = 'COMPLETED';
  job.progressPercentage = 100;
  job.completedAt = new Date().toISOString();
  job.outputImageUrl = `${cdnBase}/${job.id}-result.webp`;

  return job;
}

/**
 * Retrieves the status of an inpainting job by ID.
 */
export function getInpaintingJobStatus(jobId: string): InpaintingJob | null {
  return jobsMap.get(jobId) ?? null;
}

/**
 * Calculates the percentage of image covered by the mask (0% to 100%).
 */
export function calculateMaskCoverage(
  box: MaskBoundingBox,
  imageDimensions: { width: number; height: number },
): number {
  if (!imageDimensions || imageDimensions.width <= 0 || imageDimensions.height <= 0) {
    return 0;
  }
  if (!box || box.width <= 0 || box.height <= 0) {
    return 0;
  }

  const intersectX1 = Math.max(0, box.x);
  const intersectY1 = Math.max(0, box.y);
  const intersectX2 = Math.min(imageDimensions.width, box.x + box.width);
  const intersectY2 = Math.min(imageDimensions.height, box.y + box.height);

  const intersectWidth = Math.max(0, intersectX2 - intersectX1);
  const intersectHeight = Math.max(0, intersectY2 - intersectY1);

  const maskArea = intersectWidth * intersectHeight;
  const imageArea = imageDimensions.width * imageDimensions.height;

  const coverage = (maskArea / imageArea) * 100;
  return Math.max(0, Math.min(100, Math.round(coverage * 100) / 100));
}

/**
 * Clears in-memory jobs store for testing isolation.
 */
export function clearJobsForTesting(): void {
  jobsMap.clear();
}

// ----------------------------------------------------------------------------
// Service Class Instance
// ----------------------------------------------------------------------------

export class ImageInpaintingService {
  createJob(userId: string, params: InpaintingJobParams): InpaintingJob {
    return createInpaintingJob(userId, params);
  }

  processJob(jobId: string): Promise<InpaintingJob> {
    return processInpaintingJob(jobId);
  }

  getJob(jobId: string): InpaintingJob | null {
    return getInpaintingJobStatus(jobId);
  }

  calculateCoverage(box: MaskBoundingBox, dimensions: { width: number; height: number }): number {
    return calculateMaskCoverage(box, dimensions);
  }

  clear(): void {
    clearJobsForTesting();
  }
}

export const imageInpaintingService = new ImageInpaintingService();
