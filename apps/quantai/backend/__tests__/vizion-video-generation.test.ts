// ============================================================================
// QuantAI — Vitest Test Suite: Vizion AI Video Generation & Camera Controls
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import videoGenerationRoutes from '../routes/video-generation';
import {
  createVideoGenerationJob,
  processVideoJob,
  getVideoJobStatus,
  interpolatePromptFrames,
  validateCameraMotion,
  clearJobsForTesting,
  clampDuration,
  clampMotionStrength,
  generateDeterministicSeed,
  aiVideoGenerationService,
  VALID_CAMERA_MOTIONS,
  VALID_ASPECT_RATIOS,
  CAMERA_MOTION_VECTORS,
  type VideoGenerationParams,
  type CameraMotion,
} from '../services/ai-video-generation.service';

describe('Vizion AI v2.6.0 AI Video Generator & Camera Motion Control Engine', () => {
  beforeEach(() => {
    clearJobsForTesting();
  });

  // --------------------------------------------------------------------------
  // 1. Camera Motion Validation Tests
  // --------------------------------------------------------------------------
  describe('Camera Motion Validation', () => {
    it('accepts all 9 official Vizion 6-axis camera movements', () => {
      const motions: CameraMotion[] = [
        'pan_left',
        'pan_right',
        'tilt_up',
        'tilt_down',
        'zoom_in',
        'zoom_out',
        'roll_clockwise',
        'roll_counter_clockwise',
        'static',
      ];

      for (const motion of motions) {
        expect(validateCameraMotion(motion)).toBe(true);
        expect(VALID_CAMERA_MOTIONS).toContain(motion);
        expect(CAMERA_MOTION_VECTORS[motion]).toBeDefined();
        expect(CAMERA_MOTION_VECTORS[motion].motion).toBe(motion);
      }
    });

    it('rejects invalid camera motion types', () => {
      expect(validateCameraMotion('orbit_360')).toBe(false);
      expect(validateCameraMotion('fly_through')).toBe(false);
      expect(validateCameraMotion('teleport')).toBe(false);
      expect(validateCameraMotion('shaky_cam')).toBe(false);
      expect(validateCameraMotion('')).toBe(false);
      expect(validateCameraMotion('pan_up' as any)).toBe(false);
    });

    it('throws when creating a job with an invalid camera motion', () => {
      const invalidParams: VideoGenerationParams = {
        prompt: 'Futuristic quantum cybernetics lab in 8K',
        aspectRatio: '16:9',
        durationSeconds: 5,
        motionStrength: 5,
        cameraMotion: 'hyperspace_jump' as any,
      };

      expect(() => createVideoGenerationJob('user_123', invalidParams)).toThrow(
        /Invalid camera motion/i,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 2. Job Creation with Valid and Clamped Parameters
  // --------------------------------------------------------------------------
  describe('Job Creation & Parameter Clamping', () => {
    it('creates a job with valid parameters, QUEUED status, and 0% progress', () => {
      const params: VideoGenerationParams = {
        prompt: 'Cinematic drone shot flying through a glowing crystal canyon',
        negativePrompt: 'blurry, low resolution, distorted artifacts',
        aspectRatio: '16:9',
        durationSeconds: 5,
        motionStrength: 7,
        cameraMotion: 'zoom_in',
        seed: 424242,
      };

      const job = createVideoGenerationJob('user_alpha', params);

      expect(job).toBeDefined();
      expect(job.id).toMatch(/^vjob_/);
      expect(job.userId).toBe('user_alpha');
      expect(job.status).toBe('QUEUED');
      expect(job.progressPercentage).toBe(0);
      expect(job.params.prompt).toBe(params.prompt);
      expect(job.params.negativePrompt).toBe(params.negativePrompt);
      expect(job.params.aspectRatio).toBe('16:9');
      expect(job.params.durationSeconds).toBe(5);
      expect(job.params.motionStrength).toBe(7);
      expect(job.params.cameraMotion).toBe('zoom_in');
      expect(job.params.seed).toBe(424242);
      expect(job.createdAt).toBeDefined();
      expect(job.completedAt).toBeUndefined();
      expect(job.outputVideoUrl).toBeUndefined();

      // Ensure job is retrievable
      const retrieved = getVideoJobStatus(job.id);
      expect(retrieved).toEqual(job);
    });

    it('clamps motion strength to range [1, 10]', () => {
      expect(clampMotionStrength(0)).toBe(1);
      expect(clampMotionStrength(-5)).toBe(1);
      expect(clampMotionStrength(15)).toBe(10);
      expect(clampMotionStrength(100)).toBe(10);
      expect(clampMotionStrength(6.8)).toBe(7);

      const jobLow = createVideoGenerationJob('user_1', {
        prompt: 'Subtle ocean wave ripple',
        aspectRatio: '1:1',
        durationSeconds: 3,
        motionStrength: -2,
        cameraMotion: 'static',
      });
      expect(jobLow.params.motionStrength).toBe(1);

      const jobHigh = createVideoGenerationJob('user_1', {
        prompt: 'High speed hyperdrive starfield',
        aspectRatio: '9:16',
        durationSeconds: 10,
        motionStrength: 99,
        cameraMotion: 'pan_right',
      });
      expect(jobHigh.params.motionStrength).toBe(10);
    });

    it('clamps duration to nearest authorized durations (3, 5, 10 seconds)', () => {
      expect(clampDuration(1)).toBe(3);
      expect(clampDuration(3)).toBe(3);
      expect(clampDuration(4)).toBe(3);
      expect(clampDuration(5)).toBe(5);
      expect(clampDuration(7)).toBe(5);
      expect(clampDuration(9)).toBe(10);
      expect(clampDuration(10)).toBe(10);
      expect(clampDuration(60)).toBe(10);

      const jobClamped = createVideoGenerationJob('user_2', {
        prompt: 'Neon Tokyo street at night in rain',
        aspectRatio: '9:16',
        durationSeconds: 20,
        motionStrength: 5,
        cameraMotion: 'tilt_up',
      });
      expect(jobClamped.params.durationSeconds).toBe(10);
    });

    it('generates a deterministic seed if none is provided', () => {
      const prompt = 'Ancient temple covered in bioluminescent flora';
      const userId = 'user_deterministic';

      const seed1 = generateDeterministicSeed(prompt, userId);
      const seed2 = generateDeterministicSeed(prompt, userId);
      expect(seed1).toBe(seed2);
      expect(seed1).toBeGreaterThanOrEqual(0);

      const job1 = createVideoGenerationJob(userId, {
        prompt,
        aspectRatio: '16:9',
        durationSeconds: 5,
        motionStrength: 5,
        cameraMotion: 'pan_left',
      });

      const job2 = createVideoGenerationJob(userId, {
        prompt,
        aspectRatio: '16:9',
        durationSeconds: 5,
        motionStrength: 5,
        cameraMotion: 'pan_left',
      });

      expect(job1.params.seed).toBe(seed1);
      expect(job2.params.seed).toBe(seed1);
      expect(job1.params.seed).toBe(job2.params.seed);
    });

    it('validates and preserves custom seed when provided', () => {
      const job = createVideoGenerationJob('user_custom', {
        prompt: 'Cybernetic tiger roaring in neon forest',
        aspectRatio: '16:9',
        durationSeconds: 5,
        motionStrength: 5,
        cameraMotion: 'pan_right',
        seed: 777888,
      });

      expect(job.params.seed).toBe(777888);
    });

    it('validates supported aspect ratios (16:9, 9:16, 1:1, 4:3)', () => {
      for (const ratio of VALID_ASPECT_RATIOS) {
        const job = createVideoGenerationJob('user_ar', {
          prompt: `Testing aspect ratio ${ratio}`,
          aspectRatio: ratio,
          durationSeconds: 3,
          motionStrength: 4,
          cameraMotion: 'static',
        });
        expect(job.params.aspectRatio).toBe(ratio);
      }
    });

    it('throws error when user ID or prompt is empty', () => {
      expect(() =>
        createVideoGenerationJob('', {
          prompt: 'Valid prompt',
          aspectRatio: '16:9',
          durationSeconds: 5,
          motionStrength: 5,
          cameraMotion: 'static',
        }),
      ).toThrow(/User ID is required/i);

      expect(() =>
        createVideoGenerationJob('user_123', {
          prompt: '   ',
          aspectRatio: '16:9',
          durationSeconds: 5,
          motionStrength: 5,
          cameraMotion: 'static',
        }),
      ).toThrow(/Prompt is required/i);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Multi-Step Rendering Pipeline & Job Processing
  // --------------------------------------------------------------------------
  describe('Video Job Processing Pipeline', () => {
    it('transitions job from QUEUED to COMPLETED with output URLs and 100% progress', async () => {
      const job = createVideoGenerationJob('user_renderer', {
        prompt: 'A solar sail yacht skimming the rings of Saturn',
        endFramePrompt: 'A solar sail yacht approaching the atmosphere of Titan',
        aspectRatio: '16:9',
        durationSeconds: 5,
        motionStrength: 8,
        cameraMotion: 'pan_left',
      });

      expect(job.status).toBe('QUEUED');
      expect(job.progressPercentage).toBe(0);

      const processedJob = await processVideoJob(job.id);

      expect(processedJob.id).toBe(job.id);
      expect(processedJob.status).toBe('COMPLETED');
      expect(processedJob.progressPercentage).toBe(100);
      expect(processedJob.completedAt).toBeDefined();
      expect(processedJob.outputVideoUrl).toBe(`https://cdn.quantmail.in/ai-videos/${job.id}.mp4`);
      expect(processedJob.thumbnailUrl).toBe(
        `https://cdn.quantmail.in/ai-videos/${job.id}-thumb.webp`,
      );

      // Verify status cache reflects completed state
      const cached = getVideoJobStatus(job.id);
      expect(cached?.status).toBe('COMPLETED');
      expect(cached?.progressPercentage).toBe(100);
      expect(cached?.outputVideoUrl).toBe(processedJob.outputVideoUrl);
    });

    it('returns the existing job immediately if already completed', async () => {
      const job = createVideoGenerationJob('user_cached', {
        prompt: 'Deep sea bioluminescent jellyfish migration',
        aspectRatio: '1:1',
        durationSeconds: 3,
        motionStrength: 3,
        cameraMotion: 'zoom_out',
      });

      const firstProcess = await processVideoJob(job.id);
      const secondProcess = await processVideoJob(job.id);

      expect(secondProcess.completedAt).toBe(firstProcess.completedAt);
      expect(secondProcess.outputVideoUrl).toBe(firstProcess.outputVideoUrl);
    });

    it('throws error when processing a non-existent job ID', async () => {
      await expect(processVideoJob('vjob_non_existent_999')).rejects.toThrow(
        /Video generation job not found/i,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Prompt Interpolation & Keyframing Tests
  // --------------------------------------------------------------------------
  describe('Prompt Interpolation & Keyframing', () => {
    it('returns empty array when frameCount <= 0', () => {
      expect(interpolatePromptFrames('Start', 'End', 0)).toEqual([]);
      expect(interpolatePromptFrames('Start', 'End', -3)).toEqual([]);
    });

    it('returns single frame with 100% start weight when frameCount === 1', () => {
      const frames = interpolatePromptFrames('Sunrise over mountains', 'Sunset over ocean', 1);
      expect(frames).toHaveLength(1);
      expect(frames[0]).toBe('(Sunrise over mountains: 1.00) + (Sunset over ocean: 0.00)');
    });

    it('interpolates prompt weights linearly across 5 frames with exact step transitions', () => {
      const start = 'Cyberpunk city in neon dusk';
      const end = 'Ethereal floating solar citadel at dawn';
      const frames = interpolatePromptFrames(start, end, 5);

      expect(frames).toHaveLength(5);

      // Frame 0: 100% start, 0% end
      expect(frames[0]).toBe(`(${start}: 1.00) + (${end}: 0.00)`);

      // Frame 1: 75% start, 25% end
      expect(frames[1]).toBe(`(${start}: 0.75) + (${end}: 0.25)`);

      // Frame 2: 50% start, 50% end
      expect(frames[2]).toBe(`(${start}: 0.50) + (${end}: 0.50)`);

      // Frame 3: 25% start, 75% end
      expect(frames[3]).toBe(`(${start}: 0.25) + (${end}: 0.75)`);

      // Frame 4: 0% start, 100% end
      expect(frames[4]).toBe(`(${start}: 0.00) + (${end}: 1.00)`);
    });

    it('handles start and end prompts with whitespace gracefully', () => {
      const frames = interpolatePromptFrames('   Cozy cabin in snow   ', '  Sunny meadow  ', 2);
      expect(frames).toHaveLength(2);
      expect(frames[0]).toBe('(Cozy cabin in snow: 1.00) + (Sunny meadow: 0.00)');
      expect(frames[1]).toBe('(Cozy cabin in snow: 0.00) + (Sunny meadow: 1.00)');
    });
  });

  // --------------------------------------------------------------------------
  // 5. Service Class Wrapper Tests
  // --------------------------------------------------------------------------
  describe('AIVideoGenerationService Instance', () => {
    it('provides unified OOP service interface matching functional exports', async () => {
      const job = aiVideoGenerationService.createJob('user_oop', {
        prompt: 'Dragon flying through stormy clouds with lightning',
        aspectRatio: '16:9',
        durationSeconds: 5,
        motionStrength: 6,
        cameraMotion: 'tilt_down',
      });

      expect(job.id).toBeDefined();
      expect(aiVideoGenerationService.getJob(job.id)).toEqual(job);

      const processed = await aiVideoGenerationService.processJob(job.id);
      expect(processed.status).toBe('COMPLETED');

      const frames = aiVideoGenerationService.interpolate('Sky', 'Earth', 3);
      expect(frames).toHaveLength(3);

      expect(aiVideoGenerationService.validateMotion('roll_clockwise')).toBe(true);
      expect(aiVideoGenerationService.validateMotion('barrel_roll')).toBe(false);

      aiVideoGenerationService.clear();
      expect(aiVideoGenerationService.getJob(job.id)).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Fastify HTTP Routes Integration Tests
  // --------------------------------------------------------------------------
  describe('Fastify HTTP Video Generation Routes', () => {
    let fastifyApp: ReturnType<typeof Fastify>;

    beforeEach(async () => {
      fastifyApp = Fastify();
      await fastifyApp.register(videoGenerationRoutes, { prefix: '/api/ai' });
      await fastifyApp.ready();
    });

    it('POST /api/ai/video/generate creates a new video job', async () => {
      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/ai/video/generate',
        payload: {
          prompt: 'Macro shot of iridescent crystal butterfly opening wings',
          aspectRatio: '16:9',
          durationSeconds: 5,
          motionStrength: 6,
          cameraMotion: 'zoom_in',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toMatch(/^vjob_/);
      expect(body.data.status).toBe('QUEUED');
      expect(body.data.params.cameraMotion).toBe('zoom_in');
    });

    it('POST /api/ai/video/generate with autoProcess=true processes and returns completed job', async () => {
      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/ai/video/generate',
        payload: {
          prompt: 'Aurora borealis dancing over snowy pine forest',
          aspectRatio: '9:16',
          durationSeconds: 3,
          motionStrength: 4,
          cameraMotion: 'tilt_up',
          autoProcess: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('COMPLETED');
      expect(body.data.progressPercentage).toBe(100);
      expect(body.data.outputVideoUrl).toContain('.mp4');
    });

    it('GET /api/ai/video/jobs/:id retrieves job status', async () => {
      const created = createVideoGenerationJob('user_http', {
        prompt: 'Steampunk airship docking at Victorian skyport',
        aspectRatio: '4:3',
        durationSeconds: 5,
        motionStrength: 5,
        cameraMotion: 'static',
      });

      const response = await fastifyApp.inject({
        method: 'GET',
        url: `/api/ai/video/jobs/${created.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(created.id);
      expect(body.data.status).toBe('QUEUED');
    });

    it('POST /api/ai/video/jobs/:id/process processes queued job', async () => {
      const created = createVideoGenerationJob('user_http_proc', {
        prompt: 'Volcanic eruption on alien exoplanet',
        aspectRatio: '16:9',
        durationSeconds: 5,
        motionStrength: 7,
        cameraMotion: 'zoom_out',
      });

      const response = await fastifyApp.inject({
        method: 'POST',
        url: `/api/ai/video/jobs/${created.id}/process`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('COMPLETED');
      expect(body.data.outputVideoUrl).toBeDefined();
    });

    it('POST /api/ai/video/interpolate generates step transition frames', async () => {
      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/ai/video/interpolate',
        payload: {
          startPrompt: 'Lush green forest',
          endPrompt: 'Enchanted glowing crystal woods',
          frameCount: 3,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.frames).toHaveLength(3);
      expect(body.data.frames[0]).toContain('1.00');
      expect(body.data.frames[2]).toContain('1.00');
    });

    it('GET /api/ai/video/camera-motions returns motion catalog and vectors', async () => {
      const response = await fastifyApp.inject({
        method: 'GET',
        url: '/api/ai/video/camera-motions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.cameraMotions).toHaveLength(9);
      expect(body.data.motionVectors.pan_left.panX).toBe(-1);
      expect(body.data.aspectRatios).toContain('16:9');
    });

    it('rejects invalid camera motion via HTTP route with 400 status', async () => {
      const response = await fastifyApp.inject({
        method: 'POST',
        url: '/api/ai/video/generate',
        payload: {
          prompt: 'Testing invalid motion',
          cameraMotion: 'invalid_motion_twist',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
