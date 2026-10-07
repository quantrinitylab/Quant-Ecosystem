// ============================================================================
// QuantAI — 3-Step Guided Image Creation Wizard Service (Task W39-A06)
// Provides production prompt synthesis, style & mood presets, and templates
// ============================================================================

export interface ImageStylePreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  modifiers: string[];
  negativeModifiers: string[];
  recommendedModel: string;
  iconEmoji: string;
  previewGradient: string;
}

export interface ImageMoodPreset {
  id: string;
  name: string;
  tagline: string;
  description: string;
  lightingModifiers: string[];
  atmosphereModifiers: string[];
  colorTemperature: 'warm' | 'cool' | 'neutral' | 'vibrant' | 'dark';
  iconEmoji: string;
  previewGradient: string;
}

export interface ImageAspectRatioPreset {
  ratio: '1:1' | '16:9' | '9:16' | '4:3';
  label: string;
  description: string;
  dimensions: { width: number; height: number };
  iconEmoji: string;
}

export interface ImageTemplate {
  id: string;
  title: string;
  description: string;
  category:
    | 'portrait'
    | 'landscape'
    | 'scifi'
    | 'fantasy'
    | 'architecture'
    | 'product'
    | 'anime'
    | 'commercial';
  idea: string;
  style: string;
  mood: string;
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:3';
  customKeywords: string[];
  thumbnailEmoji: string;
  previewGradient: string;
  popularityScore: number;
  tags: string[];
  synthesizedPrompt: string;
}

export interface ImageSynthesizeInput {
  idea: string;
  style?: string;
  mood?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | string;
  customKeywords?: string[] | string;
}

export interface SynthesizedImagePrompt {
  prompt: string;
  negativePrompt: string;
  idea: string;
  style: string;
  mood: string;
  aspectRatio: string;
  dimensions: { width: number; height: number };
  modelRecommendation: string;
  recommendedSteps: number;
  cfgScale: number;
  sampler: string;
  tags: string[];
  estimatedInferenceTimeMs: number;
  createdAt: string;
}

export interface ImageWizardPresetsResponse {
  styles: ImageStylePreset[];
  moods: ImageMoodPreset[];
  aspectRatios: ImageAspectRatioPreset[];
  suggestionChips: string[];
  templates: ImageTemplate[];
}

export const STYLE_PRESETS: ImageStylePreset[] = [
  {
    id: 'photorealistic',
    name: 'Photorealistic',
    tagline: '8K Ultra-realistic studio photography',
    description:
      'Master photographic capture with authentic optical depth, natural skin textures, and Hasselblad fidelity.',
    modifiers: [
      'photorealistic',
      '8k resolution',
      'highly detailed',
      'master photograph',
      'shot on Hasselblad H6D-100c',
      '85mm portrait lens',
      'f/1.8 aperture',
      'natural skin micro-texture',
      'subsurface scattering',
      'uncompressed RAW',
    ],
    negativeModifiers: [
      'airbrushed',
      'plastic skin',
      'illustration',
      'cgi',
      'drawing',
      'blurry',
      'overexposed',
      'grainy artifacts',
    ],
    recommendedModel: 'flux-1-schnell',
    iconEmoji: '📷',
    previewGradient: 'from-zinc-800 to-zinc-950',
  },
  {
    id: 'anime-manga',
    name: 'Anime / Manga',
    tagline: 'Makoto Shinkai & Kyoto Animation fidelity',
    description:
      'Crisp cel-shading, expressive emotional line-art, vibrant atmospheric color grading, and Ghibli sky palettes.',
    modifiers: [
      'anime aesthetic',
      'makoto shinkai style',
      'kyoto animation quality',
      'crisp cel shaded contours',
      'vibrant atmospheric lighting',
      'painterly cloud scapes',
      'expressive details',
      'studio anime visual masterpiece',
    ],
    negativeModifiers: [
      'western comic',
      '3d render',
      'claymation',
      'low poly',
      'amateur sketch',
      'dull colors',
    ],
    recommendedModel: 'sdxl-turbo',
    iconEmoji: '🎨',
    previewGradient: 'from-pink-900 to-indigo-950',
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    tagline: 'High-tech low-life synthwave dystopia',
    description:
      'Drenched in electric magenta, cyan, and amber reflections, rain-slicked asphalt, and dense holographic signage.',
    modifiers: [
      'cyberpunk aesthetic',
      'dense futuristic metropolis',
      'holographic kanji projections',
      'rain-slicked asphalt with chromatic reflections',
      'neon cyan and electric magenta glow',
      'volumetric fog shafts',
      'blade runner 2049 cinematography',
      'octane render 8k',
    ],
    negativeModifiers: ['pastoral', 'rural', 'sepia', 'sunny day', 'low contrast', 'desaturated'],
    recommendedModel: 'flux-1-schnell',
    iconEmoji: '⚡',
    previewGradient: 'from-cyan-900 to-purple-950',
  },
  {
    id: 'minimalist-3d',
    name: 'Minimalist 3D',
    tagline: 'Clean isometric matte render & geometric elegance',
    description:
      'Pastel matte finishes, soft ambient occlusion, pure geometric composition, and Scandinavian architectural lighting.',
    modifiers: [
      'minimalist 3d render',
      'clean isometric composition',
      'soft clay and matte ceramic materials',
      'subtle ambient occlusion',
      'scandinavian architectural symmetry',
      'pastel color palette',
      'cinema4d redshift render',
      'curated negative space',
    ],
    negativeModifiers: [
      'cluttered',
      'noisy textures',
      'harsh contrast',
      'dirty surfaces',
      'grotesque details',
    ],
    recommendedModel: 'sdxl-turbo',
    iconEmoji: '🧊',
    previewGradient: 'from-teal-900 to-slate-950',
  },
  {
    id: 'cinematic-macro',
    name: 'Cinematic Macro',
    tagline: 'Microscopic optical depth & extreme detail',
    description:
      'Extreme close-up with shallow depth-of-field, glowing light refractions, and stunning biological or crystalline geometry.',
    modifiers: [
      'cinematic macro photography',
      'extreme close-up detail',
      'shallow depth of field with creamy bokeh',
      'microscopic textures',
      'crystal-clear optical focus',
      '100mm macro f/2.8 lens',
      'refracted light caustics',
      'national geographic award winning wildlife shot',
    ],
    negativeModifiers: [
      'wide angle',
      'zoomed out',
      'flat focus',
      'low resolution',
      'grainy sensor noise',
    ],
    recommendedModel: 'flux-1-schnell',
    iconEmoji: '🔬',
    previewGradient: 'from-emerald-900 to-zinc-950',
  },
  {
    id: 'retro-pixel-art',
    name: 'Retro Pixel Art',
    tagline: '16-bit SNES & PC-98 nostalgic masterwork',
    description:
      'Charming pixelated precision, limited indexed color palette, expressive dithering, and retro arcade warmth.',
    modifiers: [
      '16-bit pixel art',
      'masterpiece sprite art',
      'pc-98 aesthetic',
      'nostalgic indexed color palette',
      'handcrafted dithering and pixel-perfect contours',
      'snes jrpg visual style',
      'retro gaming masterpiece',
    ],
    negativeModifiers: [
      'blurry antialiasing',
      'vector art',
      'photorealism',
      'modern 3d',
      'high poly render',
    ],
    recommendedModel: 'sdxl-turbo',
    iconEmoji: '👾',
    previewGradient: 'from-amber-900 to-stone-950',
  },
  {
    id: 'watercolor-ink',
    name: 'Watercolor & Ink',
    tagline: 'Traditional Sumi-e & bleeding pigments',
    description:
      'Fluid watercolor bleeds, organic wet-on-wet pigments, delicate ink brushstrokes, and heavy cold-press cotton paper texture.',
    modifiers: [
      'traditional watercolor and indian ink',
      'sumi-e brush technique',
      'organic wet-on-wet pigment bleeding',
      'splattered color blooms',
      'cold-press rough cotton paper texture',
      'expressive calligraphic strokes',
      'delicate gouache accents',
      'museum art gallery exhibition piece',
    ],
    negativeModifiers: [
      'sharp digital lines',
      'vector flat',
      '3d computer graphics',
      'harsh plastic lighting',
    ],
    recommendedModel: 'flux-1-schnell',
    iconEmoji: '🖌️',
    previewGradient: 'from-sky-900 to-slate-950',
  },
  {
    id: 'vector-illustration',
    name: 'Vector Illustration',
    tagline: 'Sleek editorial flat design & bold shapes',
    description:
      'Crisp mathematical curves, clean gradients, modern tech-editorial proportions, and crisp SVG aesthetics.',
    modifiers: [
      'modern vector illustration',
      'clean flat design with subtle gradient mesh',
      'crisp mathematical bezier curves',
      'tech editorial aesthetic',
      'bold harmonious color blocking',
      'behance trending vector artwork',
      'dribbble featured illustration',
    ],
    negativeModifiers: [
      'sketchy pencil',
      'noisy photography',
      'grunge textures',
      'oil paint',
      'raster artifacts',
    ],
    recommendedModel: 'sdxl-turbo',
    iconEmoji: '📐',
    previewGradient: 'from-violet-900 to-gray-950',
  },
];

export const MOOD_PRESETS: ImageMoodPreset[] = [
  {
    id: 'golden-hour',
    name: 'Golden Hour',
    tagline: 'Warm amber glow & long cinematic shadows',
    description:
      'Low-slanting afternoon sunlight casting serene amber rays, glowing rims, and idyllic warmth.',
    lightingModifiers: [
      'bathed in warm golden hour sunlight',
      'low angle sun rays',
      'soft amber glow',
      'delicate rim lighting',
    ],
    atmosphereModifiers: [
      'gentle long shadows',
      'dust motes floating in sunbeams',
      'serene tranquil atmosphere',
    ],
    colorTemperature: 'warm',
    iconEmoji: '🌅',
    previewGradient: 'from-amber-600 to-orange-950',
  },
  {
    id: 'cyberpunk-neon',
    name: 'Cyberpunk Neon',
    tagline: 'Electric cyan, magenta & violet luminance',
    description:
      'Saturated neon sign reflections, futuristic light conduits, deep shadows, and high-energy luminescent glow.',
    lightingModifiers: [
      'vibrant neon illumination',
      'dual-tone magenta and cyan lights',
      'bright glowing conduits',
      'specular wet reflections',
    ],
    atmosphereModifiers: [
      'thick futuristic atmospheric haze',
      'electric night energy',
      'contrasty deep obsidian shadows',
    ],
    colorTemperature: 'vibrant',
    iconEmoji: '⚡',
    previewGradient: 'from-fuchsia-600 to-cyan-950',
  },
  {
    id: 'studio-softbox',
    name: 'Studio Softbox',
    tagline: 'Diffused commercial lighting & balanced falloff',
    description:
      'Professional multi-point studio strobe setup, large diffusion octaboxes, and ultra-smooth shadow gradients.',
    lightingModifiers: [
      'professional commercial studio lighting',
      'large softbox key light',
      'subtle fill bounce',
      'gentle hair kicker light',
    ],
    atmosphereModifiers: [
      'clean neutral backdrop',
      'flawless exposure balance',
      'zero harsh glare',
      'controlled specular falloff',
    ],
    colorTemperature: 'neutral',
    iconEmoji: '💡',
    previewGradient: 'from-zinc-500 to-slate-900',
  },
  {
    id: 'dramatic-volumetric',
    name: 'Dramatic Volumetric',
    tagline: 'God rays through misty cathedral atmosphere',
    description:
      'Thick atmospheric haze illuminated by piercing shafts of light, cinematic depth, and emotional tension.',
    lightingModifiers: [
      'dramatic volumetric god rays',
      'piercing light beams cutting through mist',
      'strong chiaroscuro lighting',
      'high contrast rim lights',
    ],
    atmosphereModifiers: [
      'epic cinematic scale',
      'lingering atmospheric fog',
      'moody moody cinematic presence',
    ],
    colorTemperature: 'cool',
    iconEmoji: '🌫️',
    previewGradient: 'from-blue-700 to-slate-950',
  },
  {
    id: 'dark-noir',
    name: 'Dark Noir',
    tagline: 'High contrast monochrome & moody venetian shadows',
    description:
      'Venetian blind slatted shadows, solitary streetlamps in midnight fog, stark obsidian shadows, and mystery.',
    lightingModifiers: [
      'low-key chiaroscuro lighting',
      'harsh directional single-source light',
      'venetian blind cast shadows',
      'distant glowing streetlight in fog',
    ],
    atmosphereModifiers: [
      'moody detective noir atmosphere',
      'mysterious midnight urban solitude',
      'deep impenetrable blacks',
    ],
    colorTemperature: 'dark',
    iconEmoji: '🕵️',
    previewGradient: 'from-neutral-700 to-black',
  },
  {
    id: 'ethereal-bioluminescent',
    name: 'Ethereal Bioluminescent',
    tagline: 'Deep abyss turquoise & fungal spore glow',
    description:
      'Mystical organic luminescence, glowing deep-sea flora, floating spores, and an enchanted twilight ambiance.',
    lightingModifiers: [
      'magical bioluminescent turquoise glow',
      'pulsing soft blue-green organic light',
      'luminous fungal spore particles',
      'radiant self-illuminated flora',
    ],
    atmosphereModifiers: [
      'enchanted twilight serenity',
      'otherworldly alien ecosystem',
      'dreamlike mystical ambiance',
    ],
    colorTemperature: 'cool',
    iconEmoji: '✨',
    previewGradient: 'from-emerald-600 to-teal-950',
  },
  {
    id: 'warm-sunset',
    name: 'Warm Sunset',
    tagline: 'Rich crimson, violet & tangerine horizon',
    description:
      'Rich sunset horizon blending tangerine, lavender, and deep crimson with peaceful evening calm.',
    lightingModifiers: [
      'rich crimson and tangerine sunset glow',
      'radiant horizon backlighting',
      'soft lavender ambient sky bounce',
      'diffused warm highlights',
    ],
    atmosphereModifiers: [
      'peaceful twilight transition',
      'majestic evening stillness',
      'calming emotional horizon',
    ],
    colorTemperature: 'warm',
    iconEmoji: '🌇',
    previewGradient: 'from-rose-600 to-amber-950',
  },
];

export const ASPECT_RATIOS: ImageAspectRatioPreset[] = [
  {
    ratio: '1:1',
    label: 'Square (1:1)',
    description: 'Best for avatars, profile tiles, product grids, and Instagram posts',
    dimensions: { width: 1080, height: 1080 },
    iconEmoji: '⏹️',
  },
  {
    ratio: '16:9',
    label: 'Widescreen (16:9)',
    description: 'Cinematic widescreen for desktop wallpapers, YouTube banners, and web heroes',
    dimensions: { width: 1920, height: 1080 },
    iconEmoji: '🖥️',
  },
  {
    ratio: '9:16',
    label: 'Reels / Portrait (9:16)',
    description:
      'Vertical format designed for QuantGram Reels, TikTok, stories, and mobile screens',
    dimensions: { width: 1080, height: 1920 },
    iconEmoji: '📱',
  },
  {
    ratio: '4:3',
    label: 'Standard (4:3)',
    description: 'Classic format for digital illustrations, presentations, and retro cameras',
    dimensions: { width: 1440, height: 1080 },
    iconEmoji: '🖼️',
  },
];

export const SUGGESTION_CHIPS: string[] = [
  'Futuristic quantum server room with neon conduits',
  'Cyberpunk street food vendor in holographic Tokyo',
  'Majestic mechanical eagle soaring over snow peaks',
  'Cozy rainy coffee shop with neon window reflections',
  'Hyperrealistic portrait of an astronaut looking at Earth',
  'Mythical crystal dragon sleeping in an enchanted forest',
  'Minimalist glass architecture in Nordic mist',
  'Vintage electric sports car on coastal cliff highway',
  'Bioluminescent underwater coral city at twilight',
  'Steampunk airship docking at a floating sky fortress',
  'Artisan ceramic pottery wheel in sunlit studio',
  'Cybernetic samurai standing beneath blooming cherry blossoms',
];

export const TEMPLATES: ImageTemplate[] = [
  {
    id: 'cyber-rain-alley',
    title: 'Cyberpunk Rain-Slicked Alleyway',
    description:
      'Dystopian futuristic alley with glowing holographic Kanji, steam exhausts, and reflections.',
    category: 'scifi',
    idea: 'Futuristic narrow cyber alley with noodle stall and wet neon reflections',
    style: 'Cyberpunk Neon',
    mood: 'Cyberpunk Neon',
    aspectRatio: '16:9',
    customKeywords: ['holographic signs', 'rain puddles', 'steam vents', 'cybernetic wires'],
    thumbnailEmoji: '🌆',
    previewGradient: 'from-cyan-900 via-indigo-950 to-purple-950',
    popularityScore: 98,
    tags: ['cyberpunk', 'neon', 'sci-fi', 'metropolis', 'dystopian'],
    synthesizedPrompt:
      'Futuristic narrow cyber alley with noodle stall and wet neon reflections, cyberpunk aesthetic, dense futuristic metropolis, holographic kanji projections, rain-slicked asphalt with chromatic reflections, neon cyan and electric magenta glow, volumetric fog shafts, blade runner 2049 cinematography, octane render 8k, vibrant neon illumination, dual-tone magenta and cyan lights, bright glowing conduits, specular wet reflections, thick futuristic atmospheric haze, electric night energy, holographic signs, rain puddles, steam vents, cybernetic wires, --ar 16:9 --v 6.0 --style raw',
  },
  {
    id: 'bioluminescent-sanctuary',
    title: 'Bioluminescent Deep Sea Sanctuary',
    description:
      'Glowing abyssal underwater kingdom with ethereal translucent jellyfish and coral spires.',
    category: 'fantasy',
    idea: 'Ancient sunken crystal cathedral overgrown with glowing sea anemones and swimming neon manta rays',
    style: 'Cinematic Macro',
    mood: 'Ethereal Bioluminescent',
    aspectRatio: '16:9',
    customKeywords: [
      'translucent jellyfish',
      'cyan bioluminescence',
      'deep ocean trench',
      'glowing spores',
    ],
    thumbnailEmoji: '🪼',
    previewGradient: 'from-emerald-950 via-teal-900 to-blue-950',
    popularityScore: 95,
    tags: ['underwater', 'bioluminescent', 'fantasy', 'deep ocean', 'crystal'],
    synthesizedPrompt:
      'Ancient sunken crystal cathedral overgrown with glowing sea anemones and swimming neon manta rays, cinematic macro photography, extreme close-up detail, shallow depth of field with creamy bokeh, microscopic textures, crystal-clear optical focus, 100mm macro f/2.8 lens, magical bioluminescent turquoise glow, pulsing soft blue-green organic light, luminous fungal spore particles, radiant self-illuminated flora, enchanted twilight serenity, translucent jellyfish, cyan bioluminescence, deep ocean trench, glowing spores, --ar 16:9 --v 6.0 --style raw',
  },
  {
    id: 'studio-luxury-watch',
    title: 'Studio Product Shot - Luxury Ceramic Watch',
    description:
      'Flawless commercial product photography of an obsidian ceramic timepiece with gold dials.',
    category: 'product',
    idea: 'Matte black ceramic luxury chronograph watch resting on a wet slate plinth',
    style: 'Photorealistic',
    mood: 'Studio Softbox',
    aspectRatio: '1:1',
    customKeywords: [
      'luxury watch',
      'subsurface scattering',
      'commercial lighting',
      'slate plinth',
      'sapphire crystal',
    ],
    thumbnailEmoji: '⌚',
    previewGradient: 'from-zinc-900 via-neutral-900 to-stone-950',
    popularityScore: 93,
    tags: ['product', 'luxury', 'commercial', 'studio', 'photorealistic'],
    synthesizedPrompt:
      'Matte black ceramic luxury chronograph watch resting on a wet slate plinth, photorealistic, 8k resolution, highly detailed, master photograph, shot on Hasselblad H6D-100c, 85mm portrait lens, f/1.8 aperture, professional commercial studio lighting, large softbox key light, subtle fill bounce, gentle hair kicker light, clean neutral backdrop, luxury watch, subsurface scattering, commercial lighting, slate plinth, sapphire crystal, --ar 1:1 --v 6.0 --style raw',
  },
  {
    id: 'ghibli-cloud-castle',
    title: 'Ghibli-Style Floating Cloud Castle',
    description: 'Whimsical anime fortress adrift among billowing cumulus clouds at daytime.',
    category: 'anime',
    idea: 'Floating medieval stone castle supported by ancient tree roots adrift in summer clouds',
    style: 'Anime / Manga',
    mood: 'Golden Hour',
    aspectRatio: '16:9',
    customKeywords: [
      'studio ghibli aesthetic',
      'fluffy clouds',
      'flying airship',
      'green ivy',
      'whimsical',
    ],
    thumbnailEmoji: '🏰',
    previewGradient: 'from-sky-900 via-blue-950 to-indigo-950',
    popularityScore: 97,
    tags: ['anime', 'ghibli', 'floating castle', 'clouds', 'whimsical'],
    synthesizedPrompt:
      'Floating medieval stone castle supported by ancient tree roots adrift in summer clouds, anime aesthetic, makoto shinkai style, kyoto animation quality, crisp cel shaded contours, vibrant atmospheric lighting, painterly cloud scapes, bathed in warm golden hour sunlight, low angle sun rays, soft amber glow, gentle long shadows, studio ghibli aesthetic, fluffy clouds, flying airship, green ivy, whimsical, --ar 16:9 --v 6.0',
  },
  {
    id: 'noir-detective-fog',
    title: 'Dark Noir Detective in Midnight Fog',
    description:
      'Monochromatic moody scene of a detective in trench coat under a foggy city lamppost.',
    category: 'portrait',
    idea: 'Mysterious detective in fedora and trench coat standing on wet cobblestones beneath a single flickering streetlamp',
    style: 'Photorealistic',
    mood: 'Dark Noir',
    aspectRatio: '4:3',
    customKeywords: [
      'fedora hat',
      'trench coat',
      'cigarette smoke',
      'wet cobblestones',
      '1940s vintage',
    ],
    thumbnailEmoji: '🕵️',
    previewGradient: 'from-neutral-900 via-stone-950 to-black',
    popularityScore: 91,
    tags: ['noir', 'detective', 'black and white', 'mystery', 'cinematic'],
    synthesizedPrompt:
      'Mysterious detective in fedora and trench coat standing on wet cobblestones beneath a single flickering streetlamp, photorealistic, 8k resolution, highly detailed, master photograph, shot on Hasselblad H6D-100c, low-key chiaroscuro lighting, harsh directional single-source light, venetian blind cast shadows, distant glowing streetlight in fog, moody detective noir atmosphere, mysterious midnight urban solitude, fedora hat, trench coat, cigarette smoke, wet cobblestones, 1940s vintage, --ar 4:3 --v 6.0 --style raw',
  },
  {
    id: 'golden-meadow-portrait',
    title: 'Golden Hour Alpine Meadow Portrait',
    description: 'Serene vertical portrait bathed in setting sun rays with wildflower background.',
    category: 'portrait',
    idea: 'Young woman with flowing auburn hair standing in an alpine meadow surrounded by blooming edelweiss',
    style: 'Photorealistic',
    mood: 'Golden Hour',
    aspectRatio: '9:16',
    customKeywords: [
      'auburn hair',
      'flowing linen dress',
      'mountain peaks',
      'sun flares',
      'windblown',
    ],
    thumbnailEmoji: '🌾',
    previewGradient: 'from-amber-900 via-orange-950 to-stone-950',
    popularityScore: 96,
    tags: ['portrait', 'golden hour', 'nature', 'alpine', 'reels'],
    synthesizedPrompt:
      'Young woman with flowing auburn hair standing in an alpine meadow surrounded by blooming edelweiss, photorealistic, 8k resolution, highly detailed, master photograph, shot on Hasselblad H6D-100c, 85mm portrait lens, f/1.8 aperture, natural skin micro-texture, bathed in warm golden hour sunlight, low angle sun rays, soft amber glow, delicate rim lighting, gentle long shadows, dust motes floating in sunbeams, auburn hair, flowing linen dress, mountain peaks, sun flares, windblown, --ar 9:16 --v 6.0 --style raw',
  },
  {
    id: 'minimalist-quantum-desk',
    title: 'Minimalist 3D Isometric Quantum Workstation',
    description:
      'Clean isometric matte render of a futuristic creator desk with floating holographic widgets.',
    category: 'architecture',
    idea: 'Sleek Scandinavian isometric workspace with curved glass monitor, bonsai tree, and hovering AI orb',
    style: 'Minimalist 3D',
    mood: 'Studio Softbox',
    aspectRatio: '1:1',
    customKeywords: [
      'isometric',
      'clay render',
      'scandinavian desk',
      'floating holographic orb',
      'matte ceramic',
    ],
    thumbnailEmoji: '🧊',
    previewGradient: 'from-teal-950 via-slate-900 to-zinc-950',
    popularityScore: 92,
    tags: ['isometric', '3d', 'minimalist', 'workspace', 'clean'],
    synthesizedPrompt:
      'Sleek Scandinavian isometric workspace with curved glass monitor, bonsai tree, and hovering AI orb, minimalist 3d render, clean isometric composition, soft clay and matte ceramic materials, subtle ambient occlusion, scandinavian architectural symmetry, pastel color palette, professional commercial studio lighting, large softbox key light, subtle fill bounce, clean neutral backdrop, isometric, clay render, scandinavian desk, floating holographic orb, matte ceramic, --ar 1:1 --v 6.0',
  },
  {
    id: 'retro-arcade-city',
    title: 'Retro 16-Bit Cyber City Arcade',
    description: 'Charming pixel-art cityscape with CRT monitor glow and busy 90s shopping street.',
    category: 'scifi',
    idea: 'Vibrant 16-bit retro arcade storefront in Akihabara with pixel art patrons and game cabinets',
    style: 'Retro Pixel Art',
    mood: 'Cyberpunk Neon',
    aspectRatio: '16:9',
    customKeywords: [
      'pixel art',
      'arcade cabinets',
      'crt glow',
      '16-bit sprites',
      'dithered gradients',
    ],
    thumbnailEmoji: '👾',
    previewGradient: 'from-purple-950 via-fuchsia-950 to-stone-950',
    popularityScore: 94,
    tags: ['pixel art', 'arcade', 'retro', '16-bit', 'nostalgia'],
    synthesizedPrompt:
      'Vibrant 16-bit retro arcade storefront in Akihabara with pixel art patrons and game cabinets, 16-bit pixel art, masterpiece sprite art, pc-98 aesthetic, nostalgic indexed color palette, handcrafted dithering and pixel-perfect contours, vibrant neon illumination, dual-tone magenta and cyan lights, bright glowing conduits, thick futuristic atmospheric haze, pixel art, arcade cabinets, crt glow, 16-bit sprites, dithered gradients, --ar 16:9',
  },
  {
    id: 'butterfly-dewdrop-macro',
    title: 'Cinematic Macro Dewdrop on Butterfly Wing',
    description:
      'Stunning optical magnification revealing iridescent microscopic scales and water drop caustics.',
    category: 'landscape',
    idea: 'Clear glistening water dewdrop resting on the iridescent turquoise scales of an emerald swallowtail wing',
    style: 'Cinematic Macro',
    mood: 'Dramatic Volumetric',
    aspectRatio: '1:1',
    customKeywords: [
      'dewdrop',
      'butterfly wing scales',
      'iridescent green',
      'water refraction',
      'extreme bokeh',
    ],
    thumbnailEmoji: '🦋',
    previewGradient: 'from-emerald-950 via-teal-950 to-zinc-950',
    popularityScore: 90,
    tags: ['macro', 'wildlife', 'nature', 'butterfly', 'dewdrop'],
    synthesizedPrompt:
      'Clear glistening water dewdrop resting on the iridescent turquoise scales of an emerald swallowtail wing, cinematic macro photography, extreme close-up detail, shallow depth of field with creamy bokeh, microscopic textures, crystal-clear optical focus, 100mm macro f/2.8 lens, dramatic volumetric god rays, piercing light beams cutting through mist, strong chiaroscuro lighting, dewdrop, butterfly wing scales, iridescent green, water refraction, extreme bokeh, --ar 1:1 --v 6.0 --style raw',
  },
  {
    id: 'watercolor-mount-fuji',
    title: 'Traditional Watercolor Mount Fuji at Dawn',
    description:
      'Sumi-e inspired wash of snowy Mount Fuji with blooming pink cherry branches in foreground.',
    category: 'landscape',
    idea: 'Snowy peak of Mount Fuji reflected in Lake Kawaguchi framed by flowering cherry blossom branches',
    style: 'Watercolor & Ink',
    mood: 'Warm Sunset',
    aspectRatio: '16:9',
    customKeywords: ['sumi-e', 'sakura cherry blossoms', 'mount fuji', 'paper grain', 'ink wash'],
    thumbnailEmoji: '🗻',
    previewGradient: 'from-rose-950 via-pink-950 to-slate-950',
    popularityScore: 93,
    tags: ['watercolor', 'japan', 'mount fuji', 'ink', 'traditional'],
    synthesizedPrompt:
      'Snowy peak of Mount Fuji reflected in Lake Kawaguchi framed by flowering cherry blossom branches, traditional watercolor and indian ink, sumi-e brush technique, organic wet-on-wet pigment bleeding, splattered color blooms, cold-press rough cotton paper texture, rich crimson and tangerine sunset glow, radiant horizon backlighting, soft lavender ambient sky bounce, sumi-e, sakura cherry blossoms, mount fuji, paper grain, ink wash, --ar 16:9 --v 6.0',
  },
  {
    id: 'vector-ai-mascot',
    title: 'Geometric Tech Startup Vector Mascot',
    description:
      'Crisp flat vector illustration of an energetic friendly AI robot companion with gradient accents.',
    category: 'commercial',
    idea: 'Friendly geometric AI robot mascot floating with a glowing tablet presenting ecosystem analytics',
    style: 'Vector Illustration',
    mood: 'Studio Softbox',
    aspectRatio: '1:1',
    customKeywords: [
      'vector art',
      'clean flat',
      'ai robot mascot',
      'dribbble style',
      'gradient mesh',
    ],
    thumbnailEmoji: '🤖',
    previewGradient: 'from-violet-950 via-indigo-950 to-zinc-950',
    popularityScore: 89,
    tags: ['vector', 'mascot', 'robot', 'flat design', 'commercial'],
    synthesizedPrompt:
      'Friendly geometric AI robot mascot floating with a glowing tablet presenting ecosystem analytics, modern vector illustration, clean flat design with subtle gradient mesh, crisp mathematical bezier curves, tech editorial aesthetic, bold harmonious color blocking, professional commercial studio lighting, clean neutral backdrop, vector art, clean flat, ai robot mascot, dribbble style, gradient mesh, --ar 1:1',
  },
  {
    id: 'warm-desert-caravan',
    title: 'Warm Sunset Desert Dune Caravan',
    description:
      'Sweeping orange desert sand dunes with a silhouetted nomadic caravan under radiant skies.',
    category: 'landscape',
    idea: 'Nomadic camel caravan trekking along the crest of sweeping Saharan sand dunes at golden twilight',
    style: 'Photorealistic',
    mood: 'Warm Sunset',
    aspectRatio: '16:9',
    customKeywords: [
      'sand dunes',
      'desert caravan',
      'golden twilight',
      'long shadows',
      'rippled sand',
    ],
    thumbnailEmoji: '🐪',
    previewGradient: 'from-orange-950 via-amber-950 to-stone-950',
    popularityScore: 92,
    tags: ['desert', 'sunset', 'landscape', 'caravan', 'cinematic'],
    synthesizedPrompt:
      'Nomadic camel caravan trekking along the crest of sweeping Saharan sand dunes at golden twilight, photorealistic, 8k resolution, highly detailed, master photograph, shot on Hasselblad H6D-100c, rich crimson and tangerine sunset glow, radiant horizon backlighting, soft lavender ambient sky bounce, peaceful twilight transition, majestic evening stillness, sand dunes, desert caravan, golden twilight, long shadows, rippled sand, --ar 16:9 --v 6.0 --style raw',
  },
];

export class ImageWizardService {
  private styles: ImageStylePreset[] = STYLE_PRESETS;
  private moods: ImageMoodPreset[] = MOOD_PRESETS;
  private aspectRatios: ImageAspectRatioPreset[] = ASPECT_RATIOS;
  private suggestionChips: string[] = SUGGESTION_CHIPS;
  private templates: ImageTemplate[] = TEMPLATES;

  public getStyles(): ImageStylePreset[] {
    return this.styles;
  }

  public getMoods(): ImageMoodPreset[] {
    return this.moods;
  }

  public getAspectRatios(): ImageAspectRatioPreset[] {
    return this.aspectRatios;
  }

  public getSuggestionChips(): string[] {
    return this.suggestionChips;
  }

  public getTemplates(category?: string, search?: string): ImageTemplate[] {
    let result = this.templates;
    if (category && category !== 'all') {
      const catLower = category.toLowerCase();
      result = result.filter((t) => t.category.toLowerCase() === catLower);
    }
    if (search && search.trim().length > 0) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          t.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          t.style.toLowerCase().includes(q),
      );
    }
    return result;
  }

  public getTemplateById(id: string): ImageTemplate | undefined {
    return this.templates.find((t) => t.id === id);
  }

  public getAllPresets(): ImageWizardPresetsResponse {
    return {
      styles: this.styles,
      moods: this.moods,
      aspectRatios: this.aspectRatios,
      suggestionChips: this.suggestionChips,
      templates: this.templates,
    };
  }

  /**
   * Synthesizes a high-fidelity diffusion model prompt from user idea, visual style, mood, and aspect ratio.
   * Generates rich descriptive modifiers, negative prompts, technical parameters, and dimensions.
   */
  public synthesizePrompt(
    ideaOrOptions: string | ImageSynthesizeInput,
    styleParam?: string,
    moodParam?: string,
    aspectRatioParam?: string,
    customKeywordsParam?: string[] | string,
  ): SynthesizedImagePrompt {
    let idea: string;
    let style: string;
    let mood: string;
    let aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' | string;
    let customKeywords: string[] = [];

    if (typeof ideaOrOptions === 'object' && ideaOrOptions !== null) {
      idea = ideaOrOptions.idea || '';
      style = ideaOrOptions.style || 'Photorealistic';
      mood = ideaOrOptions.mood || 'Golden Hour';
      aspectRatio = ideaOrOptions.aspectRatio || '1:1';
      if (Array.isArray(ideaOrOptions.customKeywords)) {
        customKeywords = ideaOrOptions.customKeywords;
      } else if (typeof ideaOrOptions.customKeywords === 'string') {
        customKeywords = ideaOrOptions.customKeywords
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } else {
      idea = ideaOrOptions || '';
      style = styleParam || 'Photorealistic';
      mood = moodParam || 'Golden Hour';
      aspectRatio = aspectRatioParam || '1:1';
      if (Array.isArray(customKeywordsParam)) {
        customKeywords = customKeywordsParam;
      } else if (typeof customKeywordsParam === 'string') {
        customKeywords = customKeywordsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }

    const cleanIdea = idea.trim() || 'A surreal futuristic landscape';

    // Match style preset (or fallback to photorealistic)
    const matchedStyle =
      this.styles.find(
        (s) => s.id === style.toLowerCase() || s.name.toLowerCase() === style.toLowerCase(),
      ) ?? this.styles[0];

    // Match mood preset (or fallback to golden hour)
    const matchedMood =
      this.moods.find(
        (m) => m.id === mood.toLowerCase() || m.name.toLowerCase() === mood.toLowerCase(),
      ) ?? this.moods[0];

    // Match aspect ratio
    const matchedAspect =
      this.aspectRatios.find((a) => a.ratio === aspectRatio) ?? this.aspectRatios[0];

    // Combine positive prompt modifiers
    const promptSegments: string[] = [cleanIdea];

    // Add style modifiers
    if (matchedStyle && matchedStyle.modifiers.length > 0) {
      promptSegments.push(...matchedStyle.modifiers);
    }

    // Add mood lighting and atmospheric modifiers
    if (matchedMood) {
      if (matchedMood.lightingModifiers.length > 0) {
        promptSegments.push(...matchedMood.lightingModifiers);
      }
      if (matchedMood.atmosphereModifiers.length > 0) {
        promptSegments.push(...matchedMood.atmosphereModifiers);
      }
    }

    // Add custom keywords if provided
    if (customKeywords.length > 0) {
      promptSegments.push(...customKeywords);
    }

    // Append technical flags (e.g. Midjourney / SDXL parameters)
    const technicalFlags: string[] = [];
    technicalFlags.push(`--ar ${matchedAspect.ratio}`);
    if (matchedStyle.id === 'photorealistic' || matchedStyle.id === 'cinematic-macro') {
      technicalFlags.push('--v 6.0', '--style raw');
    } else if (matchedStyle.id === 'retro-pixel-art' || matchedStyle.id === 'vector-illustration') {
      // simpler render flags
    } else {
      technicalFlags.push('--v 6.0');
    }

    const finalPrompt = `${promptSegments.join(', ')}, ${technicalFlags.join(' ')}`.trim();

    // Construct tailored negative prompt
    const baseNegative = [
      'blurry',
      'low quality',
      'distorted anatomy',
      'bad hands',
      'missing fingers',
      'extra limbs',
      'watermark',
      'signature',
      'text',
      'out of focus',
      'jpeg artifacts',
      'poorly drawn face',
    ];

    if (matchedStyle.negativeModifiers) {
      baseNegative.push(...matchedStyle.negativeModifiers);
    }

    const uniqueNegative = Array.from(new Set(baseNegative)).join(', ');

    // Collect tags
    const tags = Array.from(
      new Set([
        matchedStyle.id,
        matchedMood.id,
        matchedAspect.ratio,
        ...customKeywords.map((k) => k.toLowerCase()),
      ]),
    );

    return {
      prompt: finalPrompt,
      negativePrompt: uniqueNegative,
      idea: cleanIdea,
      style: matchedStyle.name,
      mood: matchedMood.name,
      aspectRatio: matchedAspect.ratio,
      dimensions: matchedAspect.dimensions,
      modelRecommendation: matchedStyle.recommendedModel,
      recommendedSteps: matchedStyle.id === 'flux-1-schnell' ? 4 : 28,
      cfgScale: matchedStyle.id === 'photorealistic' ? 6.5 : 7.5,
      sampler: 'Euler a / DPM++ 2M Karras',
      tags,
      estimatedInferenceTimeMs: matchedStyle.recommendedModel === 'flux-1-schnell' ? 850 : 1600,
      createdAt: new Date().toISOString(),
    };
  }
}
