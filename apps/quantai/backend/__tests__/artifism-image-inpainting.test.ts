// ============================================================================
// QuantAI — Vitest Test Suite: Artifism AI Image Inpainting & Mask Brush
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import Fastify from 'fastify';
import imageInpaintingRoutes from '../routes/image-inpainting';
import {
  createInpaintingJob,
  processInpaintingJob,
  getInpaintingJobStatus,
  calculateMaskCoverage,
  clearJobsForTesting,
  clampFeatherRadius,
  clampBlendingStrength,
  validateBoundingBox,
  imageInpaintingService,
  DEFAULT_FEATHER_RADIUS_PX,
  DEFAULT_BLENDING_STRENGTH,
  type InpaintingJobParams,
  type MaskBoundingBox,
} from '../services/image-inpainting.service';

describe('Artifism v6.6.0 AI Image Inpainting & Mask Brush Engine', () => {
  beforeEach(() => {
    clearJobsForTesting();
  });

  // --------------------------------------------------------------------------
  // 1. Parameter Clamping & Validation Unit Tests
  // --------------------------------------------------------------------------
  describe('Parameter Clamping and Validation', () => {
    it('clamps feather radius within [1, 50] px range', () => {
      expect(clampFeatherRadius(undefined)).toBe(DEFAULT_FEATHER_RADIUS_PX);
      expect(clampFeatherRadius(NaN)).toBe(DEFAULT_FEATHER_RADIUS_PX);
      expect(clampFeatherRadius(-5)).toBe(1);
      expect(clampFeatherRadius(0)).toBe(1);
      expect(clampFeatherRadius(25)).toBe(25);
      expect(clampFeatherRadius(50)).toBe(50);
      expect(clampFeatherRadius(99)).toBe(50);
    });

    it('clamps blending strength within [0.1, 1.0] range', () => {
      expect(clampBlendingStrength(undefined)).toBe(DEFAULT_BLENDING_STRENGTH);
      expect(clampBlendingStrength(NaN)).toBe(DEFAULT_BLENDING_STRENGTH);
      expect(clampBlendingStrength(0.01)).toBe(0.1);
      expect(clampBlendingStrength(0.5)).toBe(0.5);
      expect(clampBlendingStrength(1.0)).toBe(1.0);
      expect(clampBlendingStrength(1.75)).toBe(1.0);
    });

    it('validates valid bounding box coordinates', () => {
      const validBox: MaskBoundingBox = {
        x: 10,
        y: 20,
        width: 100,
        height: 150,
        featherRadiusPx: 12,
      };
      expect(() => validateBoundingBox(validBox)).not.toThrow();
    });

    it('throws error for invalid bounding box coordinates', () => {
      expect(() => validateBoundingBox({ x: -1, y: 10, width: 100, height: 100 })).toThrowError(
        /coordinate x/i,
      );

      expect(() => validateBoundingBox({ x: 10, y: -5, width: 100, height: 100 })).toThrowError(
        /coordinate y/i,
      );

      expect(() => validateBoundingBox({ x: 10, y: 10, width: 0, height: 100 })).toThrowError(
        /width/i,
      );

      expect(() => validateBoundingBox({ x: 10, y: 10, width: 100, height: -10 })).toThrowError(
        /height/i,
      );

      expect(() => validateBoundingBox(null as any)).toThrowError(/required/i);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Job Creation Tests
  // --------------------------------------------------------------------------
  describe('createInpaintingJob', () => {
    const validParams: InpaintingJobParams = {
      originalImageUrl: 'https://cdn.quantmail.in/photos/landscape.png',
      maskBox: {
        x: 50,
        y: 60,
        width: 200,
        height: 150,
        featherRadiusPx: 20,
      },
      prompt: 'A vintage red sports car parked by the seaside',
      negativePrompt: 'blurry, low quality, artifacts',
      blendingStrength: 0.85,
      seed: 424242,
    };

    it('creates inpainting job with valid parameters in QUEUED status', () => {
      const job = createInpaintingJob('usr_777', validParams);

      expect(job.id).toMatch(/^inpaint_/);
      expect(job.userId).toBe('usr_777');
      expect(job.status).toBe('QUEUED');
      expect(job.progressPercentage).toBe(0);
      expect(job.params.originalImageUrl).toBe(validParams.originalImageUrl);
      expect(job.params.maskBox.x).toBe(50);
      expect(job.params.maskBox.y).toBe(60);
      expect(job.params.maskBox.width).toBe(200);
      expect(job.params.maskBox.height).toBe(150);
      expect(job.params.maskBox.featherRadiusPx).toBe(20);
      expect(job.params.prompt).toBe('A vintage red sports car parked by the seaside');
      expect(job.params.negativePrompt).toBe('blurry, low quality, artifacts');
      expect(job.params.blendingStrength).toBe(0.85);
      expect(job.params.seed).toBe(424242);
      expect(job.createdAt).toBeDefined();
      expect(job.outputImageUrl).toBeUndefined();
    });

    it('clamps out-of-range parameters and applies defaults', () => {
      const job = createInpaintingJob('usr_888', {
        originalImageUrl: 'https://cdn.quantmail.in/photos/nature.png',
        maskBox: {
          x: 0,
          y: 0,
          width: 300,
          height: 300,
          featherRadiusPx: 999, // Should clamp to 50
        },
        prompt: 'A snowy mountain peak under sunset',
        blendingStrength: 2.5, // Should clamp to 1.0
      });

      expect(job.params.maskBox.featherRadiusPx).toBe(50);
      expect(job.params.blendingStrength).toBe(1.0);
      expect(job.params.seed).toBeDefined();
      expect(typeof job.params.seed).toBe('number');
    });

    it('throws error when required fields are missing or empty', () => {
      expect(() => createInpaintingJob('', validParams)).toThrowError(/User ID is required/i);

      expect(() =>
        createInpaintingJob('usr_1', { ...validParams, originalImageUrl: '' }),
      ).toThrowError(/Original image URL is required/i);

      expect(() => createInpaintingJob('usr_1', { ...validParams, prompt: '   ' })).toThrowError(
        /Prompt is required/i,
      );
    });

    it('throws error when bounding box coordinates are invalid', () => {
      expect(() =>
        createInpaintingJob('usr_1', {
          ...validParams,
          maskBox: { x: -10, y: 0, width: 100, height: 100 },
        }),
      ).toThrowError(/coordinate x/i);

      expect(() =>
        createInpaintingJob('usr_1', {
          ...validParams,
          maskBox: { x: 0, y: -20, width: 100, height: 100 },
        }),
      ).toThrowError(/coordinate y/i);

      expect(() =>
        createInpaintingJob('usr_1', {
          ...validParams,
          maskBox: { x: 0, y: 0, width: 0, height: 100 },
        }),
      ).toThrowError(/width/i);

      expect(() =>
        createInpaintingJob('usr_1', {
          ...validParams,
          maskBox: { x: 0, y: 0, width: 100, height: -5 },
        }),
      ).toThrowError(/height/i);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Inpainting Pipeline Execution Tests
  // --------------------------------------------------------------------------
  describe('processInpaintingJob', () => {
    it('transitions job from QUEUED to COMPLETED with output image and mask URLs', async () => {
      const job = createInpaintingJob('usr_test', {
        originalImageUrl: 'https://cdn.quantmail.in/photos/room.png',
        maskBox: { x: 20, y: 30, width: 150, height: 180, featherRadiusPx: 10 },
        prompt: 'Modern leather armchair with wooden legs',
      });

      expect(job.status).toBe('QUEUED');
      expect(job.progressPercentage).toBe(0);

      const completed = await processInpaintingJob(job.id);

      expect(completed.id).toBe(job.id);
      expect(completed.status).toBe('COMPLETED');
      expect(completed.progressPercentage).toBe(100);
      expect(completed.maskOverlayUrl).toContain(`${job.id}-mask.png`);
      expect(completed.outputImageUrl).toContain(`${job.id}-result.webp`);
      expect(completed.completedAt).toBeDefined();

      // State is persistent in store
      const retrieved = getInpaintingJobStatus(job.id);
      expect(retrieved?.status).toBe('COMPLETED');
      expect(retrieved?.outputImageUrl).toBe(completed.outputImageUrl);
    });

    it('idempotently returns already completed job without error', async () => {
      const job = createInpaintingJob('usr_test', {
        originalImageUrl: 'https://cdn.quantmail.in/photos/test.png',
        maskBox: { x: 10, y: 10, width: 50, height: 50 },
        prompt: 'A wooden chair',
      });

      const firstPass = await processInpaintingJob(job.id);
      const secondPass = await processInpaintingJob(job.id);

      expect(secondPass.status).toBe('COMPLETED');
      expect(secondPass.completedAt).toBe(firstPass.completedAt);
    });

    it('throws error when attempting to process non-existent job ID', async () => {
      await expect(processInpaintingJob('inpaint_non_existent')).rejects.toThrowError(
        /Inpainting job not found: inpaint_non_existent/i,
      );
    });
  });

  // --------------------------------------------------------------------------
  // 4. Mask Coverage Calculation Tests
  // --------------------------------------------------------------------------
  describe('calculateMaskCoverage', () => {
    it('accurately calculates percentage of image covered by the mask', () => {
      // 1000x1000 image, 500x500 mask = 250,000 / 1,000,000 = 25%
      const coverage1 = calculateMaskCoverage(
        { x: 0, y: 0, width: 500, height: 500 },
        { width: 1000, height: 1000 },
      );
      expect(coverage1).toBe(25);

      // 1000x1000 image, 1000x1000 mask = 100%
      const coverage2 = calculateMaskCoverage(
        { x: 0, y: 0, width: 1000, height: 1000 },
        { width: 1000, height: 1000 },
      );
      expect(coverage2).toBe(100);

      // 800x600 image, 400x300 mask = (120,000 / 480,000) = 25%
      const coverage3 = calculateMaskCoverage(
        { x: 100, y: 100, width: 400, height: 300 },
        { width: 800, height: 600 },
      );
      expect(coverage3).toBe(25);

      // 1000x1000 image, 200x100 mask = 20,000 / 1,000,000 = 2%
      const coverage4 = calculateMaskCoverage(
        { x: 50, y: 50, width: 200, height: 100 },
        { width: 1000, height: 1000 },
      );
      expect(coverage4).toBe(2);
    });

    it('handles overlapping boundaries and clamped mask coverage', () => {
      // Mask extending beyond bottom-right edge:
      // image: 100x100, mask at (50, 50) of size 100x100
      // intersection is from 50 to 100 in both dimensions: 50x50 = 2500, image = 10000 -> 25%
      const coverage = calculateMaskCoverage(
        { x: 50, y: 50, width: 100, height: 100 },
        { width: 100, height: 100 },
      );
      expect(coverage).toBe(25);
    });

    it('returns 0% for out-of-bounds or zero/negative dimensions', () => {
      // Mask entirely outside image
      const coverageOutside = calculateMaskCoverage(
        { x: 200, y: 200, width: 50, height: 50 },
        { width: 100, height: 100 },
      );
      expect(coverageOutside).toBe(0);

      // Zero or negative mask size
      expect(
        calculateMaskCoverage({ x: 0, y: 0, width: 0, height: 50 }, { width: 100, height: 100 }),
      ).toBe(0);
      expect(
        calculateMaskCoverage({ x: 0, y: 0, width: 50, height: -10 }, { width: 100, height: 100 }),
      ).toBe(0);

      // Zero image dimension
      expect(
        calculateMaskCoverage({ x: 0, y: 0, width: 50, height: 50 }, { width: 0, height: 100 }),
      ).toBe(0);
      expect(
        calculateMaskCoverage({ x: 0, y: 0, width: 50, height: 50 }, { width: 100, height: 0 }),
      ).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Job Status & Testing Helpers
  // --------------------------------------------------------------------------
  describe('getInpaintingJobStatus & clearJobsForTesting', () => {
    it('retrieves existing job and returns null for non-existent job ID', () => {
      expect(getInpaintingJobStatus('inpaint_random_nonexistent')).toBeNull();

      const job = createInpaintingJob('usr_abc', {
        originalImageUrl: 'https://cdn.quantmail.in/photos/car.png',
        maskBox: { x: 10, y: 10, width: 40, height: 40 },
        prompt: 'A shiny silver bumper',
      });

      const found = getInpaintingJobStatus(job.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(job.id);
      expect(found?.userId).toBe('usr_abc');
    });

    it('clears all jobs when clearJobsForTesting is called', () => {
      const job1 = createInpaintingJob('usr_1', {
        originalImageUrl: 'https://cdn.quantmail.in/photos/1.png',
        maskBox: { x: 5, y: 5, width: 20, height: 20 },
        prompt: 'Prompt 1',
      });
      const job2 = createInpaintingJob('usr_2', {
        originalImageUrl: 'https://cdn.quantmail.in/photos/2.png',
        maskBox: { x: 10, y: 10, width: 30, height: 30 },
        prompt: 'Prompt 2',
      });

      expect(getInpaintingJobStatus(job1.id)).not.toBeNull();
      expect(getInpaintingJobStatus(job2.id)).not.toBeNull();

      clearJobsForTesting();

      expect(getInpaintingJobStatus(job1.id)).toBeNull();
      expect(getInpaintingJobStatus(job2.id)).toBeNull();
    });

    it('verifies imageInpaintingService singleton class wrapper', async () => {
      imageInpaintingService.clear();

      const job = imageInpaintingService.createJob('usr_wrapper', {
        originalImageUrl: 'https://cdn.quantmail.in/photos/flower.png',
        maskBox: { x: 0, y: 0, width: 50, height: 50 },
        prompt: 'A yellow sunflower',
      });

      expect(job.status).toBe('QUEUED');
      expect(imageInpaintingService.getJob(job.id)?.id).toBe(job.id);

      const coverage = imageInpaintingService.calculateCoverage(
        { x: 0, y: 0, width: 50, height: 50 },
        { width: 100, height: 100 },
      );
      expect(coverage).toBe(25);

      const processed = await imageInpaintingService.processJob(job.id);
      expect(processed.status).toBe('COMPLETED');
    });
  });

  // --------------------------------------------------------------------------
  // 6. Fastify HTTP Endpoints Integration Tests
  // --------------------------------------------------------------------------
  describe('Fastify REST Routes Integration', () => {
    let app: ReturnType<typeof Fastify>;

    beforeEach(async () => {
      clearJobsForTesting();
      app = Fastify();
      await app.register(imageInpaintingRoutes);
    });

    it('POST /image/inpaint creates inpainting job successfully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/image/inpaint',
        headers: {
          'x-user-id': 'usr_http_1',
        },
        payload: {
          originalImageUrl: 'https://cdn.quantmail.in/photos/cat.png',
          maskBox: {
            x: 20,
            y: 30,
            width: 100,
            height: 100,
            featherRadiusPx: 15,
          },
          prompt: 'A fluffy white kitten',
          blendingStrength: 0.8,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toMatch(/^inpaint_/);
      expect(body.data.status).toBe('QUEUED');
      expect(body.data.userId).toBe('usr_http_1');
    });

    it('POST /image/inpaint with autoProcess completes job immediately', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/image/inpaint',
        payload: {
          originalImageUrl: 'https://cdn.quantmail.in/photos/room.png',
          maskBox: {
            x: 10,
            y: 10,
            width: 80,
            height: 80,
          },
          prompt: 'A glowing futuristic neon lamp',
          autoProcess: true,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('COMPLETED');
      expect(body.data.progressPercentage).toBe(100);
      expect(body.data.outputImageUrl).toBeDefined();
    });

    it('POST /image/inpaint fails validation on invalid bounding box', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/image/inpaint',
        payload: {
          originalImageUrl: 'https://cdn.quantmail.in/photos/sample.png',
          maskBox: {
            x: -5,
            y: 0,
            width: 100,
            height: 100,
          },
          prompt: 'A red ball',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('GET /image/inpaint/jobs/:id retrieves job status', async () => {
      const job = createInpaintingJob('usr_query', {
        originalImageUrl: 'https://cdn.quantmail.in/photos/desk.png',
        maskBox: { x: 5, y: 5, width: 50, height: 50 },
        prompt: 'A wireless mouse',
      });

      const response = await app.inject({
        method: 'GET',
        url: `/image/inpaint/jobs/${job.id}`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.id).toBe(job.id);
      expect(body.data.status).toBe('QUEUED');
    });

    it('GET /image/inpaint/jobs/:id returns 404 for unknown job ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/image/inpaint/jobs/unknown_id_123',
      });

      expect(response.statusCode).toBe(404);
    });

    it('POST /image/inpaint/jobs/:id/process processes queued job', async () => {
      const job = createInpaintingJob('usr_proc', {
        originalImageUrl: 'https://cdn.quantmail.in/photos/park.png',
        maskBox: { x: 10, y: 10, width: 100, height: 100 },
        prompt: 'A playful golden retriever puppy',
      });

      const response = await app.inject({
        method: 'POST',
        url: `/image/inpaint/jobs/${job.id}/process`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data.status).toBe('COMPLETED');
      expect(body.data.progressPercentage).toBe(100);
      expect(body.data.outputImageUrl).toBeDefined();
    });

    it('POST /image/inpaint/coverage returns accurate mask coverage percentage', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/image/inpaint/coverage',
        payload: {
          box: {
            x: 0,
            y: 0,
            width: 250,
            height: 200,
          },
          imageDimensions: {
            width: 1000,
            height: 1000,
          },
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.coveragePercentage).toBe(5); // (50,000 / 1,000,000) * 100 = 5%
    });
  });
});
