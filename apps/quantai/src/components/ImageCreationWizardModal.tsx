// ============================================================================
// QuantAI — 3-Step Guided Image Creation Wizard Modal (Task W39-A06)
// Guided Prompt Synthesis: Idea -> Visual Style -> Mood & Lighting + Templates
// ============================================================================

import React, { useState, useMemo, useEffect, useCallback } from 'react';

export type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3';

export interface StyleOption {
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

export interface MoodOption {
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

export interface AspectRatioOption {
  ratio: AspectRatio;
  label: string;
  description: string;
  dimensions: { width: number; height: number };
  iconEmoji: string;
}

export interface TemplateItem {
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
  aspectRatio: AspectRatio;
  customKeywords: string[];
  thumbnailEmoji: string;
  previewGradient: string;
  popularityScore: number;
  tags: string[];
  synthesizedPrompt: string;
}

export const STYLES_LIST: StyleOption[] = [
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
    ],
    recommendedModel: 'Flux.1 Schnell',
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
    ],
    negativeModifiers: ['western comic', '3d render', 'claymation', 'low poly', 'amateur sketch'],
    recommendedModel: 'SDXL Turbo',
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
    negativeModifiers: ['pastoral', 'rural', 'sepia', 'sunny day', 'low contrast'],
    recommendedModel: 'Flux.1 Schnell',
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
    ],
    negativeModifiers: ['cluttered', 'noisy textures', 'harsh contrast', 'dirty surfaces'],
    recommendedModel: 'SDXL Turbo',
    iconEmoji: '🧊',
    previewGradient: 'from-teal-900 to-slate-950',
  },
  {
    id: 'cinematic-macro',
    name: 'Cinematic Macro',
    tagline: 'Microscopic optical depth & extreme detail',
    description:
      'Extreme close-up with shallow depth-of-field, glowing light refractions, and stunning biological geometry.',
    modifiers: [
      'cinematic macro photography',
      'extreme close-up detail',
      'shallow depth of field with creamy bokeh',
      'microscopic textures',
      'crystal-clear optical focus',
      '100mm macro f/2.8 lens',
      'refracted light caustics',
    ],
    negativeModifiers: ['wide angle', 'zoomed out', 'flat focus', 'low resolution'],
    recommendedModel: 'Flux.1 Schnell',
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
    ],
    negativeModifiers: ['blurry antialiasing', 'vector art', 'photorealism', 'modern 3d'],
    recommendedModel: 'SDXL Turbo',
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
    ],
    negativeModifiers: ['sharp digital lines', 'vector flat', '3d computer graphics'],
    recommendedModel: 'Flux.1 Schnell',
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
    ],
    negativeModifiers: ['sketchy pencil', 'noisy photography', 'grunge textures'],
    recommendedModel: 'SDXL Turbo',
    iconEmoji: '📐',
    previewGradient: 'from-violet-900 to-gray-950',
  },
];

export const MOODS_LIST: MoodOption[] = [
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
      'moody cinematic presence',
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

export const ASPECT_RATIOS_LIST: AspectRatioOption[] = [
  {
    ratio: '1:1',
    label: 'Square (1:1)',
    description: 'Avatars, profile icons, and social posts',
    dimensions: { width: 1080, height: 1080 },
    iconEmoji: '⏹️',
  },
  {
    ratio: '16:9',
    label: 'Widescreen (16:9)',
    description: 'Cinematic widescreen & desktop wallpapers',
    dimensions: { width: 1920, height: 1080 },
    iconEmoji: '🖥️',
  },
  {
    ratio: '9:16',
    label: 'Reels / Portrait (9:16)',
    description: 'QuantGram Reels, TikTok & mobile stories',
    dimensions: { width: 1080, height: 1920 },
    iconEmoji: '📱',
  },
  {
    ratio: '4:3',
    label: 'Standard (4:3)',
    description: 'Digital art & retro presentation format',
    dimensions: { width: 1440, height: 1080 },
    iconEmoji: '🖼️',
  },
];

export const SUGGESTIONS_LIST: string[] = [
  'Futuristic quantum server room with neon conduits',
  'Cyberpunk street food vendor in holographic Tokyo',
  'Majestic mechanical eagle soaring over snow peaks',
  'Cozy rainy coffee shop with neon window reflections',
  'Hyperrealistic portrait of an astronaut looking at Earth',
  'Mythical crystal dragon sleeping in an enchanted forest',
  'Minimalist glass architecture in Nordic mist',
  'Vintage electric sports car on coastal cliff highway',
];

export const TEMPLATES_GALLERY: TemplateItem[] = [
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
    customKeywords: ['holographic signs', 'rain puddles', 'steam vents'],
    thumbnailEmoji: '🌆',
    previewGradient: 'from-cyan-900 via-indigo-950 to-purple-950',
    popularityScore: 98,
    tags: ['cyberpunk', 'neon', 'sci-fi', 'metropolis'],
    synthesizedPrompt:
      'Futuristic narrow cyber alley with noodle stall and wet neon reflections, cyberpunk aesthetic, dense futuristic metropolis, holographic kanji projections, rain-slicked asphalt with chromatic reflections, neon cyan and electric magenta glow, volumetric fog shafts, blade runner 2049 cinematography, octane render 8k, vibrant neon illumination, dual-tone magenta and cyan lights, holographic signs, rain puddles, steam vents, --ar 16:9 --v 6.0 --style raw',
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
    customKeywords: ['translucent jellyfish', 'cyan bioluminescence', 'deep ocean'],
    thumbnailEmoji: '🪼',
    previewGradient: 'from-emerald-950 via-teal-900 to-blue-950',
    popularityScore: 95,
    tags: ['underwater', 'bioluminescent', 'fantasy', 'deep ocean'],
    synthesizedPrompt:
      'Ancient sunken crystal cathedral overgrown with glowing sea anemones and swimming neon manta rays, cinematic macro photography, extreme close-up detail, shallow depth of field with creamy bokeh, microscopic textures, crystal-clear optical focus, magical bioluminescent turquoise glow, pulsing soft blue-green organic light, translucent jellyfish, cyan bioluminescence, deep ocean, --ar 16:9 --v 6.0 --style raw',
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
    ],
    thumbnailEmoji: '⌚',
    previewGradient: 'from-zinc-900 via-neutral-900 to-stone-950',
    popularityScore: 93,
    tags: ['product', 'luxury', 'commercial', 'studio'],
    synthesizedPrompt:
      'Matte black ceramic luxury chronograph watch resting on a wet slate plinth, photorealistic, 8k resolution, highly detailed, master photograph, shot on Hasselblad H6D-100c, 85mm portrait lens, f/1.8 aperture, professional commercial studio lighting, large softbox key light, luxury watch, subsurface scattering, commercial lighting, slate plinth, --ar 1:1 --v 6.0 --style raw',
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
    customKeywords: ['studio ghibli aesthetic', 'fluffy clouds', 'flying airship', 'green ivy'],
    thumbnailEmoji: '🏰',
    previewGradient: 'from-sky-900 via-blue-950 to-indigo-950',
    popularityScore: 97,
    tags: ['anime', 'ghibli', 'floating castle', 'clouds'],
    synthesizedPrompt:
      'Floating medieval stone castle supported by ancient tree roots adrift in summer clouds, anime aesthetic, makoto shinkai style, kyoto animation quality, crisp cel shaded contours, vibrant atmospheric lighting, painterly cloud scapes, bathed in warm golden hour sunlight, low angle sun rays, soft amber glow, studio ghibli aesthetic, fluffy clouds, flying airship, green ivy, --ar 16:9 --v 6.0',
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
    customKeywords: ['auburn hair', 'flowing linen dress', 'mountain peaks', 'sun flares'],
    thumbnailEmoji: '🌾',
    previewGradient: 'from-amber-900 via-orange-950 to-stone-950',
    popularityScore: 96,
    tags: ['portrait', 'golden hour', 'nature', 'alpine', 'reels'],
    synthesizedPrompt:
      'Young woman with flowing auburn hair standing in an alpine meadow surrounded by blooming edelweiss, photorealistic, 8k resolution, highly detailed, master photograph, shot on Hasselblad H6D-100c, 85mm portrait lens, f/1.8 aperture, bathed in warm golden hour sunlight, low angle sun rays, soft amber glow, auburn hair, flowing linen dress, mountain peaks, sun flares, --ar 9:16 --v 6.0 --style raw',
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
    customKeywords: ['isometric', 'clay render', 'scandinavian desk', 'floating holographic orb'],
    thumbnailEmoji: '🧊',
    previewGradient: 'from-teal-950 via-slate-900 to-zinc-950',
    popularityScore: 92,
    tags: ['isometric', '3d', 'minimalist', 'workspace', 'clean'],
    synthesizedPrompt:
      'Sleek Scandinavian isometric workspace with curved glass monitor, bonsai tree, and hovering AI orb, minimalist 3d render, clean isometric composition, soft clay and matte ceramic materials, subtle ambient occlusion, scandinavian architectural symmetry, professional commercial studio lighting, large softbox key light, isometric, clay render, scandinavian desk, floating holographic orb, --ar 1:1 --v 6.0',
  },
];

export interface ImageCreationWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate?: (config: {
    prompt: string;
    negativePrompt: string;
    style: string;
    mood: string;
    aspectRatio: AspectRatio;
    dimensions: { width: number; height: number };
    model: string;
  }) => void;
  initialIdea?: string;
  initialStyle?: string;
  initialMood?: string;
  initialAspectRatio?: AspectRatio;
  defaultTab?: 'wizard' | 'templates';
}

export function ImageCreationWizardModal({
  isOpen,
  onClose,
  onGenerate,
  initialIdea = '',
  initialStyle = 'Photorealistic',
  initialMood = 'Golden Hour',
  initialAspectRatio = '1:1',
  defaultTab = 'wizard',
}: ImageCreationWizardModalProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'wizard' | 'templates'>(defaultTab);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Form states
  const [idea, setIdea] = useState<string>(initialIdea);
  const [selectedStyle, setSelectedStyle] = useState<string>(initialStyle);
  const [selectedMood, setSelectedMood] = useState<string>(initialMood);
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<AspectRatio>(initialAspectRatio);
  const [customKeywords, setCustomKeywords] = useState<string>('');
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);

  // Template marketplace states
  const [templateCategory, setTemplateCategory] = useState<string>('all');
  const [templateSearch, setTemplateSearch] = useState<string>('');

  useEffect(() => {
    if (initialIdea) setIdea(initialIdea);
  }, [initialIdea]);

  useEffect(() => {
    if (defaultTab) setActiveTab(defaultTab);
  }, [defaultTab]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Find active style, mood, and aspect ratio objects
  const activeStyleObj = useMemo(() => {
    return (
      STYLES_LIST.find(
        (s) =>
          s.id === selectedStyle.toLowerCase() ||
          s.name.toLowerCase() === selectedStyle.toLowerCase(),
      ) ?? STYLES_LIST[0]
    );
  }, [selectedStyle]);

  const activeMoodObj = useMemo(() => {
    return (
      MOODS_LIST.find(
        (m) =>
          m.id === selectedMood.toLowerCase() ||
          m.name.toLowerCase() === selectedMood.toLowerCase(),
      ) ?? MOODS_LIST[0]
    );
  }, [selectedMood]);

  const activeAspectObj = useMemo(() => {
    return ASPECT_RATIOS_LIST.find((a) => a.ratio === selectedAspectRatio) ?? ASPECT_RATIOS_LIST[0];
  }, [selectedAspectRatio]);

  // Synthesize rich prompt
  const synthesizedResult = useMemo(() => {
    const cleanIdea = idea.trim() || 'A surreal futuristic landscape';
    const parts: string[] = [cleanIdea];

    if (activeStyleObj?.modifiers) {
      parts.push(...activeStyleObj.modifiers);
    }
    if (activeMoodObj) {
      parts.push(...activeMoodObj.lightingModifiers);
      parts.push(...activeMoodObj.atmosphereModifiers);
    }
    if (customKeywords.trim()) {
      const extra = customKeywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean);
      parts.push(...extra);
    }

    const flags: string[] = [`--ar ${activeAspectObj.ratio}`];
    if (activeStyleObj.id === 'photorealistic' || activeStyleObj.id === 'cinematic-macro') {
      flags.push('--v 6.0', '--style raw');
    } else {
      flags.push('--v 6.0');
    }

    const fullPrompt = `${parts.join(', ')}, ${flags.join(' ')}`.trim();

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
    ];
    if (activeStyleObj?.negativeModifiers) {
      baseNegative.push(...activeStyleObj.negativeModifiers);
    }

    return {
      prompt: fullPrompt,
      negativePrompt: Array.from(new Set(baseNegative)).join(', '),
      dimensions: activeAspectObj.dimensions,
      model: activeStyleObj.recommendedModel,
    };
  }, [idea, activeStyleObj, activeMoodObj, activeAspectObj, customKeywords]);

  const handleCopyPrompt = useCallback(() => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(synthesizedResult.prompt);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  }, [synthesizedResult.prompt]);

  const handleGenerate = useCallback(() => {
    if (onGenerate) {
      onGenerate({
        prompt: synthesizedResult.prompt,
        negativePrompt: synthesizedResult.negativePrompt,
        style: activeStyleObj.name,
        mood: activeMoodObj.name,
        aspectRatio: activeAspectObj.ratio,
        dimensions: synthesizedResult.dimensions,
        model: synthesizedResult.model,
      });
    }
    onClose();
  }, [onGenerate, synthesizedResult, activeStyleObj, activeMoodObj, activeAspectObj, onClose]);

  const handleUseTemplate = useCallback((tpl: TemplateItem) => {
    setIdea(tpl.idea);
    setSelectedStyle(tpl.style);
    setSelectedMood(tpl.mood);
    setSelectedAspectRatio(tpl.aspectRatio);
    setCustomKeywords(tpl.customKeywords.join(', '));
    setActiveTab('wizard');
    setCurrentStep(3);
  }, []);

  const filteredTemplates = useMemo(() => {
    return TEMPLATES_GALLERY.filter((tpl) => {
      const matchCat = templateCategory === 'all' || tpl.category === templateCategory;
      const matchSearch =
        !templateSearch.trim() ||
        tpl.title.toLowerCase().includes(templateSearch.toLowerCase()) ||
        tpl.description.toLowerCase().includes(templateSearch.toLowerCase()) ||
        tpl.tags.some((t) => t.toLowerCase().includes(templateSearch.toLowerCase()));
      return matchCat && matchSearch;
    });
  }, [templateCategory, templateSearch]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-wizard-title"
    >
      <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-[#0D1117] border border-[#30363D] rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363D] bg-[#161B22]/80">
          <div className="flex items-center gap-3">
            <span className="text-2xl p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
              🪄
            </span>
            <div>
              <h2
                id="image-wizard-title"
                className="text-lg font-bold tracking-tight text-white flex items-center gap-2"
              >
                Image Creation Wizard
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  QuantAI Diffusion
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Synthesize production-grade visual prompts in 3 guided steps or pick from curated
                templates.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Tab Switcher */}
            <div className="flex bg-[#090A0C] p-1 rounded-lg border border-[#30363D]">
              <button
                type="button"
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'wizard'
                    ? 'bg-[#FF8C42] text-[#090A0C] font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setActiveTab('wizard')}
              >
                Guided Wizard
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === 'templates'
                    ? 'bg-[#FF8C42] text-[#090A0C] font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                onClick={() => setActiveTab('templates')}
              >
                Templates ({TEMPLATES_GALLERY.length})
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              onClick={onClose}
              aria-label="Close image creation wizard"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Stepper Progress Bar (Only visible in Wizard tab) */}
        {activeTab === 'wizard' && (
          <div className="px-6 py-3 bg-[#0D1117] border-b border-[#30363D]/60">
            <div className="grid grid-cols-3 gap-2">
              {/* Step 1 */}
              <button
                type="button"
                className={`flex items-center gap-2 p-2 rounded-lg transition-all text-left ${
                  currentStep === 1
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                    : currentStep > 1
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-slate-900/40 border border-[#30363D]/40 text-slate-500'
                }`}
                onClick={() => setCurrentStep(1)}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    currentStep === 1
                      ? 'bg-amber-500 text-black'
                      : currentStep > 1
                        ? 'bg-emerald-500 text-black'
                        : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {currentStep > 1 ? '✓' : '1'}
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold">1. Idea & Subject</div>
                  <div className="text-[10px] text-slate-400 truncate">
                    {idea || 'Describe concept'}
                  </div>
                </div>
              </button>

              {/* Step 2 */}
              <button
                type="button"
                className={`flex items-center gap-2 p-2 rounded-lg transition-all text-left ${
                  currentStep === 2
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                    : currentStep > 2
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-slate-900/40 border border-[#30363D]/40 text-slate-500'
                }`}
                onClick={() => setCurrentStep(2)}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    currentStep === 2
                      ? 'bg-amber-500 text-black'
                      : currentStep > 2
                        ? 'bg-emerald-500 text-black'
                        : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {currentStep > 2 ? '✓' : '2'}
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold">2. Visual Style</div>
                  <div className="text-[10px] text-slate-400 truncate">{activeStyleObj.name}</div>
                </div>
              </button>

              {/* Step 3 */}
              <button
                type="button"
                className={`flex items-center gap-2 p-2 rounded-lg transition-all text-left ${
                  currentStep === 3
                    ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                    : 'bg-slate-900/40 border border-[#30363D]/40 text-slate-500'
                }`}
                onClick={() => setCurrentStep(3)}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    currentStep === 3 ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  3
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold">3. Mood & Lighting</div>
                  <div className="text-[10px] text-slate-400 truncate">{activeMoodObj.name}</div>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'wizard' ? (
            <>
              {/* STEP 1: Idea & Subject */}
              {currentStep === 1 && (
                <div className="space-y-5 animate-fadeIn">
                  <div>
                    <label
                      htmlFor="idea-input"
                      className="block text-sm font-semibold text-slate-200 mb-1"
                    >
                      What do you want to create? <span className="text-amber-400">*</span>
                    </label>
                    <p className="text-xs text-slate-400 mb-2">
                      Describe your core subject, scene, character, or object in natural language.
                    </p>
                    <textarea
                      id="idea-input"
                      value={idea}
                      onChange={(e) => setIdea(e.target.value)}
                      placeholder="e.g. A cyberpunk street food vendor preparing glowing ramen in holographic Tokyo..."
                      rows={3}
                      className="w-full px-4 py-3 bg-[#161B22] border border-[#30363D] rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-colors resize-none"
                    />
                  </div>

                  {/* Suggestion Chips */}
                  <div>
                    <span className="text-xs font-medium text-slate-400 mb-2 block">
                      ✨ Or try a popular creative starter:
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTIONS_LIST.map((chip, idx) => (
                        <button
                          key={idx}
                          type="button"
                          className="px-3 py-1.5 text-xs rounded-full bg-[#161B22] hover:bg-slate-800 border border-[#30363D] text-slate-300 hover:text-white transition-all text-left"
                          onClick={() => setIdea(chip)}
                        >
                          {chip}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Aspect Ratio Selector */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-200 mb-1">
                      Aspect Ratio & Dimensions
                    </label>
                    <p className="text-xs text-slate-400 mb-3">
                      Select canvas proportions tailored to your target platform.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {ASPECT_RATIOS_LIST.map((aspect) => (
                        <button
                          key={aspect.ratio}
                          type="button"
                          className={`p-3 rounded-xl border text-left transition-all ${
                            selectedAspectRatio === aspect.ratio
                              ? 'bg-amber-500/10 border-amber-500 shadow-md shadow-amber-500/10 ring-1 ring-amber-500'
                              : 'bg-[#161B22] border-[#30363D] hover:border-slate-500 text-slate-300'
                          }`}
                          onClick={() => setSelectedAspectRatio(aspect.ratio)}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xl">{aspect.iconEmoji}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                              {aspect.dimensions.width}x{aspect.dimensions.height}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-white">{aspect.label}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">
                            {aspect.description}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: Visual Style */}
              {currentStep === 2 && (
                <div className="space-y-4 animate-fadeIn">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      Choose an Art & Visual Style
                    </h3>
                    <p className="text-xs text-slate-400">
                      Style modifiers dictate camera optics, rendering engine, brushwork, and
                      surface texture.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {STYLES_LIST.map((style) => {
                      const isSelected =
                        selectedStyle.toLowerCase() === style.id ||
                        selectedStyle.toLowerCase() === style.name.toLowerCase();

                      return (
                        <button
                          key={style.id}
                          type="button"
                          className={`relative p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                            isSelected
                              ? 'bg-gradient-to-br from-amber-500/15 via-[#161B22] to-amber-500/5 border-amber-500 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500'
                              : 'bg-[#161B22] border-[#30363D] hover:border-slate-500 text-slate-300'
                          }`}
                          onClick={() => setSelectedStyle(style.name)}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-2xl p-1.5 rounded-lg bg-slate-800/80 border border-slate-700">
                                {style.iconEmoji}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                                {style.recommendedModel}
                              </span>
                            </div>
                            <div className="text-sm font-bold text-white">{style.name}</div>
                            <div className="text-[11px] text-amber-400/90 font-medium mt-0.5">
                              {style.tagline}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                              {style.description}
                            </p>
                          </div>

                          {isSelected && (
                            <div className="mt-2 text-right">
                              <span className="text-xs font-bold text-amber-400">✓ Selected</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3: Mood & Lighting + Synthesizer Preview */}
              {currentStep === 3 && (
                <div className="space-y-5 animate-fadeIn">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      Mood, Lighting & Atmosphere
                    </h3>
                    <p className="text-xs text-slate-400">
                      Set emotional lighting, color grading, shadow dynamics, and volumetric
                      highlights.
                    </p>
                  </div>

                  {/* Mood Chips Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {MOODS_LIST.map((mood) => {
                      const isSelected =
                        selectedMood.toLowerCase() === mood.id ||
                        selectedMood.toLowerCase() === mood.name.toLowerCase();

                      return (
                        <button
                          key={mood.id}
                          type="button"
                          className={`p-2.5 rounded-xl border text-center transition-all ${
                            isSelected
                              ? 'bg-amber-500/15 border-amber-500 text-amber-300 ring-1 ring-amber-500 shadow-md'
                              : 'bg-[#161B22] border-[#30363D] hover:border-slate-500 text-slate-400 hover:text-white'
                          }`}
                          onClick={() => setSelectedMood(mood.name)}
                        >
                          <div className="text-xl mb-1">{mood.iconEmoji}</div>
                          <div className="text-xs font-bold truncate">{mood.name}</div>
                          <div className="text-[9px] text-slate-400 mt-0.5 truncate">
                            {mood.colorTemperature}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom Keywords / Extras */}
                  <div>
                    <label
                      htmlFor="custom-keywords-input"
                      className="block text-xs font-semibold text-slate-300 mb-1"
                    >
                      Custom Keywords & Modifiers (Optional)
                    </label>
                    <input
                      id="custom-keywords-input"
                      type="text"
                      value={customKeywords}
                      onChange={(e) => setCustomKeywords(e.target.value)}
                      placeholder="e.g. volumetric fog, chromatic aberration, rim lighting, 85mm bokeh"
                      className="w-full px-3.5 py-2 bg-[#161B22] border border-[#30363D] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {/* Synthesized Live Prompt Preview Box */}
                  <div className="p-4 rounded-xl bg-[#090A0C] border border-[#30363D] space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                          ⚡ Synthesized Prompt
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          {activeAspectObj.dimensions.width}x{activeAspectObj.dimensions.height}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                          {synthesizedResult.model}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="text-xs px-2.5 py-1 rounded bg-[#161B22] hover:bg-slate-800 border border-[#30363D] text-slate-300 hover:text-white transition-colors"
                        onClick={handleCopyPrompt}
                      >
                        {copyFeedback ? '✓ Copied!' : '📋 Copy Prompt'}
                      </button>
                    </div>

                    <div className="p-3 rounded-lg bg-[#161B22]/90 border border-slate-800 text-xs font-mono text-slate-300 leading-relaxed max-h-32 overflow-y-auto select-all">
                      {synthesizedResult.prompt}
                    </div>

                    {/* Negative Prompt Preview */}
                    <div className="text-[11px] text-slate-400">
                      <span className="text-slate-500 font-semibold">Negative: </span>
                      {synthesizedResult.negativePrompt}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* TEMPLATES MARKETPLACE TAB */
            <div className="space-y-4 animate-fadeIn">
              {/* Filter and Search Bar */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                {/* Search */}
                <input
                  type="text"
                  value={templateSearch}
                  onChange={(e) => setTemplateSearch(e.target.value)}
                  placeholder="Search templates (e.g. cyberpunk, anime, watch, portrait)..."
                  className="w-full sm:w-72 px-3.5 py-2 bg-[#161B22] border border-[#30363D] rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />

                {/* Categories */}
                <div className="flex flex-wrap gap-1.5 self-start sm:self-auto">
                  {['all', 'scifi', 'fantasy', 'portrait', 'product', 'anime', 'architecture'].map(
                    (cat) => (
                      <button
                        key={cat}
                        type="button"
                        className={`px-2.5 py-1 text-xs rounded-lg capitalize transition-colors ${
                          templateCategory === cat
                            ? 'bg-amber-500 text-black font-semibold'
                            : 'bg-[#161B22] border border-[#30363D] text-slate-400 hover:text-slate-200'
                        }`}
                        onClick={() => setTemplateCategory(cat)}
                      >
                        {cat}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {/* Gallery Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {filteredTemplates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="p-4 rounded-xl bg-[#161B22] border border-[#30363D] hover:border-slate-500 transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl p-1.5 rounded-lg bg-slate-900 border border-slate-700">
                          {tpl.thumbnailEmoji}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                            🔥 {tpl.popularityScore}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                            {tpl.aspectRatio}
                          </span>
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-white mb-1">{tpl.title}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2 mb-3">{tpl.description}</p>

                      <div className="flex flex-wrap gap-1 mb-4">
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-300">
                          {tpl.style}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800/80 text-slate-300">
                          {tpl.mood}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="w-full py-2 px-3 rounded-lg bg-[#FF8C42] hover:bg-[#FF9B58] text-[#090A0C] font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                      onClick={() => handleUseTemplate(tpl)}
                    >
                      <span>⚡ Use Template</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#30363D] bg-[#161B22]/80">
          {activeTab === 'wizard' ? (
            <>
              <div>
                {currentStep > 1 && (
                  <button
                    type="button"
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                    onClick={() =>
                      setCurrentStep((prev: 1 | 2 | 3) =>
                        prev > 1 ? ((prev - 1) as 1 | 2 | 3) : 1,
                      )
                    }
                  >
                    ← Back
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {currentStep < 3 ? (
                  <button
                    type="button"
                    className="px-5 py-2 text-xs font-bold rounded-xl bg-[#FF8C42] hover:bg-[#FF9B58] text-[#090A0C] transition-all shadow-md flex items-center gap-1.5"
                    onClick={() =>
                      setCurrentStep((prev: 1 | 2 | 3) =>
                        prev < 3 ? ((prev + 1) as 1 | 2 | 3) : 3,
                      )
                    }
                  >
                    <span>Next Step →</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="px-6 py-2.5 text-xs font-bold rounded-xl bg-[#FF8C42] hover:bg-[#FF9B58] text-[#090A0C] transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2 hover:scale-[1.02]"
                    onClick={handleGenerate}
                  >
                    <span>✨ Generate Image</span>
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-end w-full">
              <button
                type="button"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                onClick={() => setActiveTab('wizard')}
              >
                Back to Guided Wizard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ImageCreationWizardModal;
