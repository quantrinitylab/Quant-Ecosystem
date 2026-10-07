// ============================================================================
// AI Services - Image Generation
// ============================================================================
//
// Dual-mode service:
//   - When an image-generation provider is configured (IMAGE_GEN_PROVIDER /
//     OPENAI_API_KEY), real images are produced via the provider SDK.
//   - Otherwise (or on provider error) a deterministic placeholder result is
//     returned so local development and tests keep working. Errors falling back
//     to the placeholder are logged as warnings (never silently swallowed).

import OpenAI from 'openai';
import { isFailClosedMode } from '../config/runtime';
import { AIProviderUnavailableError } from '../core/errors';

export type ImageSize = '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
export type ImageStyle = 'natural' | 'vivid' | 'digital-art' | 'photographic' | 'anime';
export type ImageQuality = 'standard' | 'hd';

export interface ImageGenerationRequest {
  prompt: string;
  size?: ImageSize;
  style?: ImageStyle;
  quality?: ImageQuality;
  n?: number;
}

export interface ImageGenerationResult {
  id: string;
  url: string;
  revisedPrompt: string;
  size: ImageSize;
  style: ImageStyle;
  quality: ImageQuality;
  model: string;
  latencyMs: number;
}

export interface ImageEditRequest {
  prompt: string;
  imageUrl: string;
  maskUrl?: string;
  size?: ImageSize;
}

/** Normalized image output returned by a backend (before service-level metadata). */
export interface BackendImage {
  url: string;
  revisedPrompt?: string;
}

/**
 * Pluggable image-generation backend. A real implementation talks to an
 * external provider; tests can supply a fake to exercise the real-mode path.
 */
export interface ImageGenerationBackend {
  readonly model: string;
  generate(request: ImageGenerationRequest): Promise<BackendImage[]>;
  edit(request: ImageEditRequest): Promise<BackendImage[]>;
  createVariation(imageUrl: string, n: number): Promise<BackendImage[]>;
}

/** DALL-E sizes only support a subset; map unsupported sizes to the nearest valid one. */
const DALLE3_SIZES: ReadonlySet<ImageSize> = new Set(['1024x1024', '1792x1024', '1024x1792']);

/** Sizes accepted by the dall-e-2 edit/variation endpoints. */
type EditSize = '256x256' | '512x512' | '1024x1024';
function toEditSize(size: ImageSize | undefined): EditSize {
  if (size === '256x256' || size === '512x512' || size === '1024x1024') return size;
  return '1024x1024';
}

/**
 * Real OpenAI Images backend. Uses dall-e-3 for the larger landscape/portrait
 * sizes and dall-e-2 for the smaller square sizes that dall-e-3 does not accept.
 */
export class OpenAIImageBackend implements ImageGenerationBackend {
  readonly model = 'dall-e-3';
  private readonly client: OpenAI;

  constructor(apiKey: string, client?: OpenAI) {
    this.client = client ?? new OpenAI({ apiKey });
  }

  private resolveModel(size: ImageSize): 'dall-e-3' | 'dall-e-2' {
    return DALLE3_SIZES.has(size) ? 'dall-e-3' : 'dall-e-2';
  }

  async generate(request: ImageGenerationRequest): Promise<BackendImage[]> {
    const size = request.size ?? '1024x1024';
    const model = this.resolveModel(size);
    const response = await this.client.images.generate({
      model,
      prompt: request.prompt,
      size,
      // dall-e-3 only supports n=1; dall-e-2 supports multiple.
      n: model === 'dall-e-3' ? 1 : (request.n ?? 1),
      ...(model === 'dall-e-3' ? { quality: request.quality ?? 'standard' } : {}),
    });
    return this.mapImages(response.data);
  }

  async edit(request: ImageEditRequest): Promise<BackendImage[]> {
    const image = await fetchAsFile(request.imageUrl, 'image.png');
    const mask = request.maskUrl ? await fetchAsFile(request.maskUrl, 'mask.png') : undefined;
    const response = await this.client.images.edit({
      model: 'dall-e-2',
      image,
      prompt: request.prompt,
      size: toEditSize(request.size),
      ...(mask ? { mask } : {}),
    });
    return this.mapImages(response.data);
  }

  async createVariation(imageUrl: string, n: number): Promise<BackendImage[]> {
    const image = await fetchAsFile(imageUrl, 'image.png');
    const response = await this.client.images.createVariation({
      model: 'dall-e-2',
      image,
      n,
    });
    return this.mapImages(response.data);
  }

  private mapImages(data: OpenAI.Images.Image[] | undefined): BackendImage[] {
    if (!data || data.length === 0) {
      throw new Error('Image provider returned no images');
    }
    return data
      .filter((d): d is OpenAI.Images.Image & { url: string } => Boolean(d.url))
      .map((d) => ({ url: d.url, revisedPrompt: d.revised_prompt }));
  }
}

/** Fetch a remote image into a File suitable for the OpenAI SDK uploads. */
async function fetchAsFile(url: string, filename: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch image (${res.status}) from ${url}`);
  }
  const buffer = await res.arrayBuffer();
  return new File([new Uint8Array(buffer)], filename, {
    type: res.headers.get('content-type') ?? 'image/png',
  });
}

export class ImageGenerationService {
  private readonly apiKey: string | undefined;
  private readonly backend: ImageGenerationBackend | null;

  /**
   * @param backend Optional explicit backend (primarily for tests). When
   *   omitted, a real backend is constructed from environment configuration.
   */
  constructor(backend?: ImageGenerationBackend) {
    this.apiKey = process.env['OPENAI_API_KEY'];
    this.backend = backend ?? this.createBackendFromEnv();
  }

  private createBackendFromEnv(): ImageGenerationBackend | null {
    const provider = (process.env['IMAGE_GEN_PROVIDER'] ?? 'openai').toLowerCase();
    if (provider === 'openai' && this.apiKey) {
      return new OpenAIImageBackend(this.apiKey);
    }
    return null;
  }

  isAvailable(): boolean {
    return this.backend !== null;
  }

  /**
   * Guard the placeholder/stub fallback. In production (or failClosed mode) the
   * service must not silently return a simulated image; it raises an explicit
   * typed error instead (Requirements 3.1, 3.3).
   */
  private assertStubAllowed(op: string): void {
    if (isFailClosedMode()) {
      throw new AIProviderUnavailableError(
        `${op} cannot complete: no image-generation provider is configured and the ` +
          `placeholder fallback is disabled in production. Set IMAGE_GEN_PROVIDER / ` +
          `OPENAI_API_KEY to run against a real provider.`,
      );
    }
  }

  async generate(request: ImageGenerationRequest, userId: string): Promise<ImageGenerationResult> {
    const startTime = Date.now();

    if (this.backend) {
      try {
        const images = await this.backend.generate(request);
        const first = images[0];
        if (first) {
          return this.toResult(first, request, startTime, this.backend.model);
        }
      } catch (error) {
        if (isFailClosedMode()) throw toImageUnavailable('generate', error);
        warnFallback('generate', error);
      }
    }

    this.assertStubAllowed('image generation');
    return this.generateStubResult(request, userId, startTime);
  }

  async edit(request: ImageEditRequest, userId: string): Promise<ImageGenerationResult> {
    const startTime = Date.now();

    if (this.backend) {
      try {
        const images = await this.backend.edit(request);
        const first = images[0];
        if (first) {
          return this.toResult(
            first,
            { prompt: request.prompt, size: request.size },
            startTime,
            this.backend.model,
          );
        }
      } catch (error) {
        if (isFailClosedMode()) throw toImageUnavailable('edit', error);
        warnFallback('edit', error);
      }
    }

    this.assertStubAllowed('image edit');
    return {
      id: `img_edit_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      url: `https://placeholder.quant.ai/images/edit/${userId}/${Date.now()}.png`,
      revisedPrompt: request.prompt,
      size: request.size || '1024x1024',
      style: 'natural',
      quality: 'standard',
      model: 'dall-e-3-stub',
      latencyMs: Date.now() - startTime,
    };
  }

  async createVariation(
    imageUrl: string,
    userId: string,
    n: number = 1,
  ): Promise<ImageGenerationResult[]> {
    const startTime = Date.now();

    if (this.backend) {
      try {
        const images = await this.backend.createVariation(imageUrl, n);
        if (images.length > 0) {
          return images.map((img, i) => ({
            id: `img_var_${Date.now().toString(36)}_${i}`,
            url: img.url,
            revisedPrompt: img.revisedPrompt ?? `Variation ${i + 1} of source image`,
            size: '1024x1024' as const,
            style: 'natural' as const,
            quality: 'standard' as const,
            model: this.backend!.model,
            latencyMs: Date.now() - startTime,
          }));
        }
      } catch (error) {
        if (isFailClosedMode()) throw toImageUnavailable('createVariation', error);
        warnFallback('createVariation', error);
      }
    }

    this.assertStubAllowed('image variation');
    const results: ImageGenerationResult[] = [];
    for (let i = 0; i < n; i++) {
      results.push({
        id: `img_var_${Date.now().toString(36)}_${i}`,
        url: `https://placeholder.quant.ai/images/variation/${userId}/${Date.now()}_${i}.png`,
        revisedPrompt: `Variation ${i + 1} of source image`,
        size: '1024x1024',
        style: 'natural',
        quality: 'standard',
        model: 'dall-e-3-stub',
        latencyMs: 50,
      });
    }
    return results;
  }

  getSupportedSizes(): ImageSize[] {
    return ['256x256', '512x512', '1024x1024', '1792x1024', '1024x1792'];
  }

  getSupportedStyles(): ImageStyle[] {
    return ['natural', 'vivid', 'digital-art', 'photographic', 'anime'];
  }

  private toResult(
    image: BackendImage,
    request: ImageGenerationRequest,
    startTime: number,
    model: string,
  ): ImageGenerationResult {
    return {
      id: `img_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      url: image.url,
      revisedPrompt: image.revisedPrompt ?? request.prompt,
      size: request.size || '1024x1024',
      style: request.style || 'natural',
      quality: request.quality || 'standard',
      model,
      latencyMs: Date.now() - startTime,
    };
  }

  private generateStubResult(
    request: ImageGenerationRequest,
    userId: string,
    startTime: number,
  ): ImageGenerationResult {
    return {
      id: `img_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
      url: `https://placeholder.quant.ai/images/${userId}/${Date.now()}.png`,
      revisedPrompt: request.prompt,
      size: request.size || '1024x1024',
      style: request.style || 'natural',
      quality: request.quality || 'standard',
      model: 'dall-e-3-stub',
      latencyMs: Date.now() - startTime,
    };
  }
}

function warnFallback(op: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.warn(`[image-generation] real backend ${op} failed, using placeholder: ${message}`);
}

/** Wrap a backend failure as an explicit fail-closed error for production. */
function toImageUnavailable(op: string, error: unknown): AIProviderUnavailableError {
  if (error instanceof AIProviderUnavailableError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AIProviderUnavailableError(`image ${op} failed: ${message}`);
}
