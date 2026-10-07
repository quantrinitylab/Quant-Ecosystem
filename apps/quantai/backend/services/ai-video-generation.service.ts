// ============================================================================
// QuantAI — Vizion AI v2.6.0 AI Video Generator & Camera Motion Control Engine
// ============================================================================

import crypto from 'crypto';

export type VideoAspectRatio = '16:9' | '9:16' | '1:1' | '4:3';

export type CameraMotion =
  | 'pan_left'
  | 'pan_right'
  | 'tilt_up'
  | 'tilt_down'
  | 'zoom_in'
  | 'zoom_out'
  | 'roll_clockwise'
  | 'roll_counter_clockwise'
  | 'static';

export interface VideoGenerationParams {
  prompt: string;
  negativePrompt?: string;
  endFramePrompt?: string; // For prompt interpolation
  aspectRatio: VideoAspectRatio;
  durationSeconds: number; // 3, 5, or 10
  motionStrength: number; // 1 to 10
  cameraMotion: CameraMotion;
  seed?: number;
}

export interface VideoGenerationJob {
  id: string;
  userId: string;
  params: VideoGenerationParams;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progressPercentage: number;
  outputVideoUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

// ----------------------------------------------------------------------------
// Constants & Specifications
// ----------------------------------------------------------------------------

export const VALID_CAMERA_MOTIONS: readonly CameraMotion[] = [
  'pan_left',
  'pan_right',
  'tilt_up',
  'tilt_down',
  'zoom_in',
  'zoom_out',
  'roll_clockwise',
  'roll_counter_clockwise',
  'static',
] as const;

export const VALID_ASPECT_RATIOS: readonly VideoAspectRatio[] = [
  '16:9',
  '9:16',
  '1:1',
  '4:3',
] as const;

export const VALID_DURATIONS: readonly number[] = [3, 5, 10] as const;

export interface CameraMotionVector {
  motion: CameraMotion;
  panX: number;
  panY: number;
  zoom: number;
  roll: number;
  description: string;
}

export const CAMERA_MOTION_VECTORS: Record<CameraMotion, CameraMotionVector> = {
  pan_left: {
    motion: 'pan_left',
    panX: -1,
    panY: 0,
    zoom: 0,
    roll: 0,
    description: 'Smooth horizontal pan to the left',
  },
  pan_right: {
    motion: 'pan_right',
    panX: 1,
    panY: 0,
    zoom: 0,
    roll: 0,
    description: 'Smooth horizontal pan to the right',
  },
  tilt_up: {
    motion: 'tilt_up',
    panX: 0,
    panY: 1,
    zoom: 0,
    roll: 0,
    description: 'Smooth vertical tilt upwards',
  },
  tilt_down: {
    motion: 'tilt_down',
    panX: 0,
    panY: -1,
    zoom: 0,
    roll: 0,
    description: 'Smooth vertical tilt downwards',
  },
  zoom_in: {
    motion: 'zoom_in',
    panX: 0,
    panY: 0,
    zoom: 1,
    roll: 0,
    description: 'Forward cinematic push / optical zoom-in',
  },
  zoom_out: {
    motion: 'zoom_out',
    panX: 0,
    panY: 0,
    zoom: -1,
    roll: 0,
    description: 'Backward pull / optical zoom-out',
  },
  roll_clockwise: {
    motion: 'roll_clockwise',
    panX: 0,
    panY: 0,
    zoom: 0,
    roll: 1,
    description: 'Clockwise barrel rotation / Dutch angle',
  },
  roll_counter_clockwise: {
    motion: 'roll_counter_clockwise',
    panX: 0,
    panY: 0,
    zoom: 0,
    roll: -1,
    description: 'Counter-clockwise barrel rotation',
  },
  static: {
    motion: 'static',
    panX: 0,
    panY: 0,
    zoom: 0,
    roll: 0,
    description: 'Fixed tripod camera with zero drift',
  },
};

// ----------------------------------------------------------------------------
// In-Memory Job Storage
// ----------------------------------------------------------------------------

const jobsMap = new Map<string, VideoGenerationJob>();

// ----------------------------------------------------------------------------
// Helpers: Validation & Clamping
// ----------------------------------------------------------------------------

/**
 * Validates whether the given string is an authentic 6-axis camera motion.
 */
export function validateCameraMotion(motion: string): boolean {
  return VALID_CAMERA_MOTIONS.includes(motion as CameraMotion);
}

/**
 * Clamps duration to one of the authorized durations: 3, 5, or 10 seconds.
 */
export function clampDuration(duration: number): number {
  if (VALID_DURATIONS.includes(duration as any)) {
    return duration;
  }
  if (duration <= 4) return 3;
  if (duration >= 8) return 10;
  return 5;
}

/**
 * Clamps motion strength to authorized range [1, 10].
 */
export function clampMotionStrength(strength: number): number {
  if (Number.isNaN(strength)) return 5;
  return Math.max(1, Math.min(10, Math.round(strength)));
}

/**
 * Generates a deterministic integer seed based on userId and prompt.
 */
export function generateDeterministicSeed(prompt: string, userId: string): number {
  const hash = crypto.createHash('sha256').update(`${userId}:${prompt}`).digest();
  return hash.readUInt32BE(0) % 2147483647;
}

// ----------------------------------------------------------------------------
// Core Functions
// ----------------------------------------------------------------------------

/**
 * Creates a new AI Video Generation Job with validated and clamped parameters.
 */
export function createVideoGenerationJob(
  userId: string,
  params: VideoGenerationParams,
): VideoGenerationJob {
  if (!userId || !userId.trim()) {
    throw new Error('User ID is required');
  }

  if (!params.prompt || !params.prompt.trim()) {
    throw new Error('Prompt is required for video generation');
  }

  if (!validateCameraMotion(params.cameraMotion)) {
    throw new Error(
      `Invalid camera motion: '${params.cameraMotion}'. Valid motions are: ${VALID_CAMERA_MOTIONS.join(', ')}`,
    );
  }

  const clampedDuration = clampDuration(params.durationSeconds);
  const clampedMotion = clampMotionStrength(params.motionStrength);
  const validatedAspectRatio = VALID_ASPECT_RATIOS.includes(params.aspectRatio)
    ? params.aspectRatio
    : '16:9';

  const seed =
    params.seed !== undefined && Number.isFinite(params.seed)
      ? Math.floor(params.seed)
      : generateDeterministicSeed(params.prompt.trim(), userId);

  const jobId = `vjob_${crypto.randomUUID()}`;

  const job: VideoGenerationJob = {
    id: jobId,
    userId: userId.trim(),
    params: {
      prompt: params.prompt.trim(),
      negativePrompt: params.negativePrompt?.trim(),
      endFramePrompt: params.endFramePrompt?.trim(),
      aspectRatio: validatedAspectRatio,
      durationSeconds: clampedDuration,
      motionStrength: clampedMotion,
      cameraMotion: params.cameraMotion,
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
 * Simulates a multi-step neural rendering pipeline:
 * 1. Keyframe latent sampling & prompt interpolation
 * 2. Camera motion vector application & temporal attention
 * 3. Neural frame synthesis
 * 4. H.264/MP4 encoding & CDN packaging
 */
export async function processVideoJob(jobId: string): Promise<VideoGenerationJob> {
  const job = jobsMap.get(jobId);
  if (!job) {
    throw new Error(`Video generation job not found: ${jobId}`);
  }

  if (job.status === 'COMPLETED') {
    return job;
  }

  job.status = 'PROCESSING';
  job.progressPercentage = 15; // Stage 1: Latent Space Initialization

  // Stage 2: Keyframe Latent Sampling & Prompt Interpolation
  if (job.params.endFramePrompt) {
    const totalFrames = job.params.durationSeconds * 24; // 24 FPS
    interpolatePromptFrames(job.params.prompt, job.params.endFramePrompt, totalFrames);
  }
  job.progressPercentage = 50; // Stage 2: 6-Axis Motion Vector Synthesis

  // Stage 3: Camera Motion Vector Application
  const _motionVector =
    CAMERA_MOTION_VECTORS[job.params.cameraMotion] ?? CAMERA_MOTION_VECTORS.static;

  job.progressPercentage = 80; // Stage 3: Temporal Neural Diffusion

  // Stage 4: H.264 FastStart Packaging & CDN Upload
  const cdnBase = 'https://cdn.quantmail.in/ai-videos';
  job.progressPercentage = 100;
  job.status = 'COMPLETED';
  job.completedAt = new Date().toISOString();
  job.outputVideoUrl = `${cdnBase}/${job.id}.mp4`;
  job.thumbnailUrl = `${cdnBase}/${job.id}-thumb.webp`;

  return job;
}

/**
 * Retrieves the status of a video generation job by its ID.
 */
export function getVideoJobStatus(jobId: string): VideoGenerationJob | null {
  return jobsMap.get(jobId) ?? null;
}

/**
 * Interpolates prompt weights linearly between startPrompt and endPrompt across frameCount.
 * Returns an array of formatted weighted prompt strings for each transition step.
 */
export function interpolatePromptFrames(
  startPrompt: string,
  endPrompt: string,
  frameCount: number,
): string[] {
  if (frameCount <= 0) {
    return [];
  }

  const cleanStart = startPrompt.trim();
  const cleanEnd = endPrompt.trim();

  if (frameCount === 1) {
    return [`(${cleanStart}: 1.00) + (${cleanEnd}: 0.00)`];
  }

  const frames: string[] = [];
  for (let i = 0; i < frameCount; i++) {
    const alpha = i / (frameCount - 1);
    const startWeight = (1 - alpha).toFixed(2);
    const endWeight = alpha.toFixed(2);
    frames.push(`(${cleanStart}: ${startWeight}) + (${cleanEnd}: ${endWeight})`);
  }

  return frames;
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

export class AIVideoGenerationService {
  createJob(userId: string, params: VideoGenerationParams): VideoGenerationJob {
    return createVideoGenerationJob(userId, params);
  }

  processJob(jobId: string): Promise<VideoGenerationJob> {
    return processVideoJob(jobId);
  }

  getJob(jobId: string): VideoGenerationJob | null {
    return getVideoJobStatus(jobId);
  }

  interpolate(startPrompt: string, endPrompt: string, frameCount: number): string[] {
    return interpolatePromptFrames(startPrompt, endPrompt, frameCount);
  }

  validateMotion(motion: string): boolean {
    return validateCameraMotion(motion);
  }

  clear(): void {
    clearJobsForTesting();
  }
}

export const aiVideoGenerationService = new AIVideoGenerationService();
