export type LoraStyleId =
  | 'photorealistic'
  | 'anime_cel'
  | 'cyberpunk'
  | 'pixar_3d'
  | 'oil_painting'
  | 'synthwave'
  | 'dark_fantasy'
  | 'vector_flat';

export interface LoraStylePreset {
  id: LoraStyleId;
  name: string;
  description: string;
  promptPrefix: string;
  promptSuffix: string;
  recommendedNegativePrompt: string;
  recommendedAspectRatio: '1:1' | '16:9' | '9:16' | '4:3';
  sampleImageUrl?: string;
}

export interface EnhancedPromptResult {
  originalPrompt: string;
  enhancedPrompt: string;
  appliedStyle?: LoraStylePreset;
  negativePrompt: string;
  aspectRatio: string;
  targetWidth: number;
  targetHeight: number;
}

const defaultNegativePrompt =
  'ugly, deformed, blurry, low res, bad anatomy, text, watermark, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, jpeg artifacts, signature, username';

let stylesCatalog: LoraStylePreset[] = [
  {
    id: 'photorealistic',
    name: 'Photorealistic',
    description: 'High quality photorealistic style mimicking expensive camera lenses',
    promptPrefix: 'A hyper-realistic photograph of ',
    promptSuffix:
      ', 8k resolution, highly detailed, professional lighting, shot on 35mm lens, sharp focus, cinematic lighting',
    recommendedNegativePrompt:
      defaultNegativePrompt + ', illustration, painting, drawing, cartoon, anime, 3d render',
    recommendedAspectRatio: '16:9',
  },
  {
    id: 'anime_cel',
    name: 'Anime Cel Shading',
    description: 'Classic 2D anime style with clean lines and flat colors',
    promptPrefix: 'Studio Ghibli style, 90s anime, ',
    promptSuffix:
      ', cel shaded, vivid colors, masterfully drawn, 2d animation, flat shading, clear lines',
    recommendedNegativePrompt:
      defaultNegativePrompt + ', 3d, realistic, photorealistic, CGI, render',
    recommendedAspectRatio: '16:9',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon-lit futuristic sci-fi aesthetic',
    promptPrefix: 'Cyberpunk 2077 style, neon lights, futuristic, ',
    promptSuffix:
      ', neon glow, rainy city streets, high tech low life, ray tracing, unreal engine 5, 4k',
    recommendedNegativePrompt:
      defaultNegativePrompt + ', bright daylight, nature, rustic, historical',
    recommendedAspectRatio: '16:9',
  },
  {
    id: 'pixar_3d',
    name: 'Pixar 3D',
    description: 'Cute, vibrant 3D animation style similar to Pixar movies',
    promptPrefix: '3D animated render, Pixar style, Disney style, ',
    promptSuffix:
      ', octane render, subsurface scattering, global illumination, cute, vibrant, detailed 3d',
    recommendedNegativePrompt: defaultNegativePrompt + ', scary, realistic, 2d, drawing, sketch',
    recommendedAspectRatio: '16:9',
  },
  {
    id: 'oil_painting',
    name: 'Oil Painting',
    description: 'Classical fine art style with visible brushstrokes',
    promptPrefix: 'A beautiful classical oil painting of ',
    promptSuffix:
      ', visible brushstrokes, canvas texture, museum quality, masterpiece, chiaroscuro',
    recommendedNegativePrompt: defaultNegativePrompt + ', digital, modern, photo, realistic',
    recommendedAspectRatio: '4:3',
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: '80s retro-futurism with grid lines and sunset colors',
    promptPrefix: '80s Synthwave style, retrowave, ',
    promptSuffix:
      ', neon grid, digital sunset, vibrant magenta and cyan, VHS aesthetic, glowing lines',
    recommendedNegativePrompt: defaultNegativePrompt + ', modern, realistic, drab, monochrome',
    recommendedAspectRatio: '16:9',
  },
  {
    id: 'dark_fantasy',
    name: 'Dark Fantasy',
    description: 'Grim, moody, and intricate fantasy style',
    promptPrefix: 'Dark fantasy art, grimdark, ',
    promptSuffix:
      ', gothic, highly detailed, moody lighting, ominous, intricate armor, dramatic shadows, concept art',
    recommendedNegativePrompt: defaultNegativePrompt + ', bright, happy, cute, cartoon',
    recommendedAspectRatio: '4:3',
  },
  {
    id: 'vector_flat',
    name: 'Minimalist Vector',
    description: 'Clean, flat vector illustration style',
    promptPrefix: 'Flat vector illustration, minimalist, ',
    promptSuffix: ', clean lines, bold colors, dribbble style, corporate memphis, simple shapes',
    recommendedNegativePrompt: defaultNegativePrompt + ', 3d, realistic, textured, messy, detailed',
    recommendedAspectRatio: '1:1',
  },
];

export function listLoraStyles(): LoraStylePreset[] {
  return [...stylesCatalog];
}

export function getLoraStyle(id: LoraStyleId): LoraStylePreset | null {
  return stylesCatalog.find((s) => s.id === id) || null;
}

export function computeDimensions(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '1:1':
      return { width: 1024, height: 1024 };
    case '16:9':
      return { width: 1280, height: 720 };
    case '9:16':
      return { width: 720, height: 1280 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '3:4':
      return { width: 768, height: 1024 };
    default:
      return { width: 1024, height: 1024 };
  }
}

export function enhancePrompt(
  prompt: string,
  options?: { styleId?: LoraStyleId; aspectRatio?: string; creativity?: number },
): EnhancedPromptResult {
  const style = options?.styleId ? getLoraStyle(options.styleId) : null;
  const targetAspectRatio = options?.aspectRatio || style?.recommendedAspectRatio || '1:1';
  const { width, height } = computeDimensions(targetAspectRatio);

  let enhanced = prompt;

  if (!style) {
    enhanced = `${prompt}, highly detailed, masterpiece, best quality`;
  } else {
    enhanced = `${style.promptPrefix}${prompt}${style.promptSuffix}`;
  }

  const negative = style ? style.recommendedNegativePrompt : defaultNegativePrompt;

  return {
    originalPrompt: prompt,
    enhancedPrompt: enhanced,
    appliedStyle: style || undefined,
    negativePrompt: negative,
    aspectRatio: targetAspectRatio,
    targetWidth: width,
    targetHeight: height,
  };
}

export function clearStylesForTesting(): void {
  stylesCatalog = [];
}

export const fluxStylesService = {
  listLoraStyles,
  getLoraStyle,
  computeDimensions,
  enhancePrompt,
  clearStylesForTesting,
};
