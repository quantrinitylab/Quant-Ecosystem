// ============================================================================
// QuantAI - Image Generation Service
// Image generation pipeline: prompt parsing, generation, upscale, variations
// ============================================================================

interface GenerationRequest {
  prompt: string;
  negativePrompt?: string;
  style: string;
  aspectRatio: string;
  seed?: number;
  steps?: number;
  guidanceScale?: number;
}

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  negativePrompt: string;
  style: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  guidanceScale: number;
  createdAt: Date;
  userId: string;
}

interface UpscaleResult {
  id: string;
  originalId: string;
  url: string;
  width: number;
  height: number;
  factor: number;
}

interface InpaintRequest {
  imageId: string;
  mask: Array<{ x: number; y: number; radius: number }>;
  prompt: string;
}

const ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '4:3': { width: 1024, height: 768 },
  '3:2': { width: 1536, height: 1024 },
};

export class ImageGenService {
  private images: Map<string, GeneratedImage> = new Map();
  private generationQueue: string[] = [];

  async generate(userId: string, request: GenerationRequest): Promise<GeneratedImage> {
    const dimensions = ASPECT_RATIOS[request.aspectRatio] || ASPECT_RATIOS['1:1'];
    const seed = request.seed || Math.floor(Math.random() * 999999);
    const steps = request.steps || 30;
    const guidanceScale = request.guidanceScale || 7.5;

    const parsedPrompt = this.parsePrompt(request.prompt);
    const qualityModifiers = this.getStyleModifiers(request.style);
    const fullPrompt = `${parsedPrompt}, ${qualityModifiers}`;

    const image: GeneratedImage = {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: `/api/images/generated/${Date.now()}.png`,
      prompt: fullPrompt,
      negativePrompt: request.negativePrompt || 'blurry, low quality, distorted',
      style: request.style,
      width: dimensions.width,
      height: dimensions.height,
      seed,
      steps,
      guidanceScale,
      createdAt: new Date(),
      userId,
    };

    this.images.set(image.id, image);
    return image;
  }

  async generateVariations(imageId: string, count: number = 4): Promise<GeneratedImage[]> {
    const original = this.images.get(imageId);
    if (!original) throw new Error('Image not found');

    const variations: GeneratedImage[] = [];
    for (let i = 0; i < count; i++) {
      const variation: GeneratedImage = {
        ...original,
        id: `img-var-${Date.now()}-${i}`,
        url: `/api/images/generated/var-${Date.now()}-${i}.png`,
        seed: original.seed + i + 1,
        createdAt: new Date(),
      };
      this.images.set(variation.id, variation);
      variations.push(variation);
    }
    return variations;
  }

  async upscale(imageId: string, factor: 2 | 4): Promise<UpscaleResult> {
    const image = this.images.get(imageId);
    if (!image) throw new Error('Image not found');

    const result: UpscaleResult = {
      id: `upscale-${Date.now()}`,
      originalId: imageId,
      url: `/api/images/upscaled/${Date.now()}.png`,
      width: image.width * factor,
      height: image.height * factor,
      factor,
    };

    const upscaledImage: GeneratedImage = {
      ...image,
      id: result.id,
      url: result.url,
      width: result.width,
      height: result.height,
    };
    this.images.set(result.id, upscaledImage);

    return result;
  }

  async inpaint(userId: string, request: InpaintRequest): Promise<GeneratedImage> {
    const original = this.images.get(request.imageId);
    if (!original) throw new Error('Image not found');

    const inpainted: GeneratedImage = {
      ...original,
      id: `img-inpaint-${Date.now()}`,
      url: `/api/images/inpainted/${Date.now()}.png`,
      prompt: `${original.prompt}, inpainted: ${request.prompt}`,
      createdAt: new Date(),
      userId,
    };

    this.images.set(inpainted.id, inpainted);
    return inpainted;
  }

  async getImage(imageId: string): Promise<GeneratedImage | null> {
    return this.images.get(imageId) || null;
  }

  async listImages(userId: string, limit: number = 50): Promise<GeneratedImage[]> {
    return Array.from(this.images.values())
      .filter(img => img.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async deleteImage(imageId: string, userId: string): Promise<boolean> {
    const image = this.images.get(imageId);
    if (!image || image.userId !== userId) return false;
    this.images.delete(imageId);
    return true;
  }

  private parsePrompt(prompt: string): string {
    return prompt
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s,.-]/g, '');
  }

  private getStyleModifiers(style: string): string {
    const modifiers: Record<string, string> = {
      realistic: 'photorealistic, 8k, detailed, professional photography, sharp focus',
      anime: 'anime style, cel-shaded, vibrant colors, studio quality',
      'oil-painting': 'oil painting style, classical art, rich textures, canvas texture',
      'pixel-art': 'pixel art style, 16-bit, retro game aesthetic, clean pixels',
      '3d-render': '3D render, octane render, ray tracing, global illumination, cinema 4d',
    };
    return modifiers[style] || 'high quality, detailed';
  }
}

export default new ImageGenService();
