// ============================================================================
// QuantAI - Image Generation Page
// Prompt textarea, style selector, aspect ratio picker, generate with loading,
// result gallery, variations, upscale, download, edit regions with brush/inpaint
// ============================================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  style: string;
  ratio: string;
  timestamp: string;
  width: number;
  height: number;
  isUpscaled: boolean;
  seed: number;
}

interface StyleOption {
  id: string;
  name: string;
  description: string;
  preview: string;
}

interface AspectRatio {
  id: string;
  label: string;
  width: number;
  height: number;
}

const STYLES: StyleOption[] = [
  { id: 'realistic', name: 'Realistic', description: 'Photorealistic quality', preview: '📷' },
  { id: 'anime', name: 'Anime', description: 'Japanese animation style', preview: '🎌' },
  { id: 'oil-painting', name: 'Oil Painting', description: 'Classical oil paint look', preview: '🎨' },
  { id: 'pixel-art', name: 'Pixel Art', description: 'Retro pixel graphics', preview: '👾' },
  { id: '3d-render', name: '3D Render', description: 'Modern 3D rendering', preview: '🎮' },
];

const ASPECT_RATIOS: AspectRatio[] = [
  { id: '1:1', label: '1:1', width: 1024, height: 1024 },
  { id: '16:9', label: '16:9', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16', width: 1080, height: 1920 },
  { id: '4:3', label: '4:3', width: 1024, height: 768 },
];

const SAMPLE_IMAGES: GeneratedImage[] = [
  { id: 'img1', url: '/generated/sunset-mountains.png', prompt: 'A breathtaking sunset over mountain peaks with golden clouds', style: 'realistic', ratio: '16:9', timestamp: '2024-01-15T10:00:00Z', width: 1920, height: 1080, isUpscaled: false, seed: 42891 },
  { id: 'img2', url: '/generated/cyber-city.png', prompt: 'Futuristic cyberpunk city at night with neon lights', style: '3d-render', ratio: '16:9', timestamp: '2024-01-15T09:30:00Z', width: 1920, height: 1080, isUpscaled: false, seed: 73621 },
  { id: 'img3', url: '/generated/anime-warrior.png', prompt: 'Anime warrior with glowing sword in moonlit forest', style: 'anime', ratio: '1:1', timestamp: '2024-01-14T22:00:00Z', width: 1024, height: 1024, isUpscaled: true, seed: 15847 },
  { id: 'img4', url: '/generated/pixel-castle.png', prompt: 'Medieval castle on a hill pixel art style', style: 'pixel-art', ratio: '1:1', timestamp: '2024-01-14T20:00:00Z', width: 1024, height: 1024, isUpscaled: false, seed: 98234 },
];

export default function ImageGenPage(): JSX.Element {
  const [prompt, setPrompt] = useState<string>('');
  const [style, setStyle] = useState<string>('realistic');
  const [ratio, setRatio] = useState<string>('1:1');
  const [images, setImages] = useState<GeneratedImage[]>(SAMPLE_IMAGES);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [maskMode, setMaskMode] = useState<boolean>(false);
  const [maskPoints, setMaskPoints] = useState<Array<{ x: number; y: number }>>([]);
  const [brushSize, setBrushSize] = useState<number>(20);
  const [showUpscaleOptions, setShowUpscaleOptions] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<number>(0);
  const [negativePrompt, setNegativePrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef<number>(0);

  const selectedImageData = useMemo(() => {
    if (!selectedImage) return null;
    return images.find(img => img.id === selectedImage) || null;
  }, [selectedImage, images]);

  const currentRatio = useMemo(() => {
    return ASPECT_RATIOS.find(r => r.id === ratio) || ASPECT_RATIOS[0];
  }, [ratio]);

  const handleGenerate = useCallback(() => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setGenerationProgress(0);

    const interval = setInterval(() => {
      setGenerationProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);

    setTimeout(() => {
      clearInterval(interval);
      setGenerationProgress(100);
      const newImage: GeneratedImage = {
        id: `img${Date.now()}`,
        url: `/generated/${Date.now()}.png`,
        prompt: prompt,
        style: style,
        ratio: ratio,
        timestamp: new Date().toISOString(),
        width: currentRatio.width,
        height: currentRatio.height,
        isUpscaled: false,
        seed: Math.floor(Math.random() * 100000),
      };
      setImages(prev => [newImage, ...prev]);
      setSelectedImage(newImage.id);
      setIsGenerating(false);
      setGenerationProgress(0);
    }, 3000);
  }, [prompt, style, ratio, isGenerating, currentRatio]);

  const handleVariations = useCallback(() => {
    if (!selectedImageData || isGenerating) return;
    setIsGenerating(true);
    setTimeout(() => {
      const variations = Array.from({ length: 4 }).map((_, i) => ({
        id: `img${Date.now() + i}`,
        url: `/generated/variation-${Date.now()}-${i}.png`,
        prompt: selectedImageData.prompt + ` (variation ${i + 1})`,
        style: selectedImageData.style,
        ratio: selectedImageData.ratio,
        timestamp: new Date().toISOString(),
        width: selectedImageData.width,
        height: selectedImageData.height,
        isUpscaled: false,
        seed: Math.floor(Math.random() * 100000),
      }));
      setImages(prev => [...variations, ...prev]);
      setIsGenerating(false);
    }, 2500);
  }, [selectedImageData, isGenerating]);

  const handleUpscale = useCallback((factor: number) => {
    if (!selectedImageData) return;
    setImages(prev => prev.map(img =>
      img.id === selectedImageData.id
        ? { ...img, width: img.width * factor, height: img.height * factor, isUpscaled: true }
        : img
    ));
    setShowUpscaleOptions(false);
  }, [selectedImageData]);

  const handleDownload = useCallback(() => {
    if (!selectedImageData) return;
    const link = document.createElement('a');
    link.href = selectedImageData.url;
    link.download = `quantai-${selectedImageData.id}.png`;
    link.click();
  }, [selectedImageData]);

  const handleMaskToggle = useCallback(() => {
    setMaskMode(!maskMode);
    setMaskPoints([]);
  }, [maskMode]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!maskMode || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setMaskPoints(prev => [...prev, { x, y }]);
  }, [maskMode]);

  const handleInpaint = useCallback(() => {
    if (maskPoints.length === 0) return;
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      setMaskMode(false);
      setMaskPoints([]);
    }, 2000);
  }, [maskPoints]);

  if (error) {
    return (
      <div className="image-gen-page error-state">
        <h2>Generation Error</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)}>Retry</button>
      </div>
    );
  }

  return (
    <div className="image-gen-page">
      <header className="image-gen-header">
        <h1>Image Generation</h1>
      </header>

      <div className="image-gen-body">
        <section className="generation-controls">
          <div className="prompt-section">
            <label>Prompt</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              className="prompt-textarea"
              rows={4}
            />
            <div className="negative-prompt">
              <label>Negative Prompt (optional)</label>
              <input
                type="text"
                value={negativePrompt}
                onChange={e => setNegativePrompt(e.target.value)}
                placeholder="Things to exclude from the image..."
                className="negative-input"
              />
            </div>
          </div>

          <div className="style-section">
            <label>Style</label>
            <div className="style-options">
              {STYLES.map(s => (
                <label key={s.id} className={`style-radio ${style === s.id ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="style"
                    value={s.id}
                    checked={style === s.id}
                    onChange={e => setStyle(e.target.value)}
                  />
                  <span className="style-preview">{s.preview}</span>
                  <span className="style-name">{s.name}</span>
                  <span className="style-desc">{s.description}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="ratio-section">
            <label>Aspect Ratio</label>
            <div className="ratio-options">
              {ASPECT_RATIOS.map(r => (
                <button
                  key={r.id}
                  className={`ratio-btn ${ratio === r.id ? 'selected' : ''}`}
                  onClick={() => setRatio(r.id)}
                >
                  <div className="ratio-preview" style={{ aspectRatio: `${r.width}/${r.height}` }} />
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            className={`btn-generate ${isGenerating ? 'generating' : ''}`}
            onClick={handleGenerate}
            disabled={!prompt.trim() || isGenerating}
          >
            {isGenerating ? (
              <span>Generating... {Math.min(Math.round(generationProgress), 100)}%</span>
            ) : (
              <span>Generate Image</span>
            )}
          </button>
          {isGenerating && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(generationProgress, 100)}%` }} />
            </div>
          )}
        </section>

        <section className="results-section">
          {selectedImageData ? (
            <div className="image-viewer">
              <div className="viewer-header">
                <button className="btn-back-gallery" onClick={() => setSelectedImage(null)}>
                  ← Gallery
                </button>
                <div className="image-info">
                  <span>{selectedImageData.width}x{selectedImageData.height}</span>
                  <span>{selectedImageData.style}</span>
                  {selectedImageData.isUpscaled && <span className="upscaled-badge">Upscaled</span>}
                </div>
              </div>
              <div className="image-display">
                {maskMode ? (
                  <div className="mask-editor">
                    <canvas
                      ref={canvasRef}
                      width={512}
                      height={512}
                      onClick={handleCanvasClick}
                      className="mask-canvas"
                    />
                    <div className="mask-tools">
                      <label>Brush Size: {brushSize}px</label>
                      <input
                        type="range"
                        min="5"
                        max="50"
                        value={brushSize}
                        onChange={e => setBrushSize(Number(e.target.value))}
                      />
                      <button className="btn-inpaint" onClick={handleInpaint} disabled={maskPoints.length === 0}>
                        Inpaint Region
                      </button>
                      <button className="btn-clear-mask" onClick={() => setMaskPoints([])}>
                        Clear Mask
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="image-preview-large">
                    <div className="placeholder-image" style={{ aspectRatio: `${selectedImageData.width}/${selectedImageData.height}` }}>
                      <span className="placeholder-text">Generated Image</span>
                      <span className="placeholder-prompt">{selectedImageData.prompt}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="image-actions">
                <button className="btn-variations" onClick={handleVariations} disabled={isGenerating}>
                  🎲 Variations (4)
                </button>
                <div className="upscale-wrapper">
                  <button className="btn-upscale" onClick={() => setShowUpscaleOptions(!showUpscaleOptions)}>
                    🔎 Upscale
                  </button>
                  {showUpscaleOptions && (
                    <div className="upscale-options">
                      <button onClick={() => handleUpscale(2)}>2x</button>
                      <button onClick={() => handleUpscale(4)}>4x</button>
                    </div>
                  )}
                </div>
                <button className="btn-download" onClick={handleDownload}>
                  ⬇️ Download
                </button>
                <button className={`btn-edit-regions ${maskMode ? 'active' : ''}`} onClick={handleMaskToggle}>
                  ✏️ Edit Regions
                </button>
              </div>
              <div className="image-prompt-display">
                <strong>Prompt:</strong> {selectedImageData.prompt}
              </div>
            </div>
          ) : (
            <div className="gallery-grid">
              <h2>Generated Images</h2>
              {images.length === 0 ? (
                <div className="empty-gallery">
                  <p>No images generated yet. Enter a prompt and click Generate.</p>
                </div>
              ) : (
                <div className="gallery-items">
                  {images.map(img => (
                    <div
                      key={img.id}
                      className="gallery-item"
                      onClick={() => setSelectedImage(img.id)}
                    >
                      <div className="gallery-thumb" style={{ aspectRatio: `${img.width}/${img.height}` }}>
                        <span className="thumb-placeholder">{STYLES.find(s => s.id === img.style)?.preview || '🖼️'}</span>
                      </div>
                      <div className="gallery-item-info">
                        <span className="gallery-prompt">{img.prompt.slice(0, 40)}...</span>
                        <span className="gallery-meta">{img.style} | {img.ratio}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
