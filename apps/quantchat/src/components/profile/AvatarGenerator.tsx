// ============================================================================
// QuantChat - AvatarGenerator (Task 5.1)
//
// Avatar setup flow:
//   1. Capture a face photo from the camera (getUserMedia) OR upload one
//   2. Pick a preferred alien style (Crystalline / Bioluminescent / Cybernetic)
//   3. Generate → backend returns 3 distinct variants
//   4. Preview the 3 variants and select one to save as the primary avatar
//
// On a no-face response the backend's user-facing error is surfaced inline
// (Task 5.3). Saving invalidates the shared avatar query so the new avatar
// propagates to every surface (Task 5.8) via useSelectAvatar.
// ============================================================================
'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGenerateAvatar, useSelectAvatar, AvatarGenerationError } from '../../hooks/useAvatar';
import {
  ALIEN_STYLES,
  ALIEN_STYLE_LABELS,
  type AlienStyle,
  type AvatarVariant,
} from '../../types/avatar';
import { BRAND_SPRINGS, scaleIn } from '../../lib/motion-tokens';

export interface AvatarGeneratorProps {
  userId: string;
  /** Called after a variant is successfully saved. */
  onSaved?: (variant: AvatarVariant) => void;
  className?: string;
}

type Phase = 'capture' | 'preview';

export function AvatarGenerator({ userId, onSaved, className = '' }: AvatarGeneratorProps) {
  const [phase, setPhase] = useState<Phase>('capture');
  const [imageDataUri, setImageDataUri] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [preferredStyle, setPreferredStyle] = useState<AlienStyle>('crystalline');
  const [variants, setVariants] = useState<AvatarVariant[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<AlienStyle | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const generate = useGenerateAvatar();
  const select = useSelectAvatar(userId);

  // ---- Camera lifecycle ---------------------------------------------------
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraActive(true);
    } catch {
      setErrorMessage('Camera access was blocked. Upload a photo instead.');
    }
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const captureFromCamera = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 480;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setImageDataUri(canvas.toDataURL('image/jpeg', 0.9));
    stopCamera();
  }, [stopCamera]);

  const onFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = () => setImageDataUri(typeof reader.result === 'string' ? reader.result : null);
    reader.readAsDataURL(file);
  }, []);

  // ---- Generate -----------------------------------------------------------
  const handleGenerate = useCallback(async () => {
    if (!imageDataUri) return;
    setErrorMessage(null);
    try {
      const result = await generate.mutateAsync(imageDataUri);
      setVariants(result.variants);
      setSelectedStyle(preferredStyle);
      setPhase('preview');
    } catch (err) {
      if (err instanceof AvatarGenerationError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Something went wrong generating your avatar. Try again.');
      }
    }
  }, [imageDataUri, generate, preferredStyle]);

  // ---- Save selection -----------------------------------------------------
  const handleSelect = useCallback(
    async (variant: AvatarVariant) => {
      setSelectedStyle(variant.style);
      try {
        await select.mutateAsync(variant);
        onSaved?.(variant);
      } catch {
        setErrorMessage('Could not save your avatar. Please try again.');
      }
    },
    [select, onSaved],
  );

  const resetToCapture = useCallback(() => {
    setPhase('capture');
    setVariants([]);
    setSelectedStyle(null);
  }, []);

  // ---- Render -------------------------------------------------------------
  return (
    <div className={`mx-auto w-full max-w-md text-white ${className}`}>
      <h2 className="mb-1 text-xl font-bold">Create your alien avatar</h2>
      <p className="mb-4 text-sm text-white/60">
        Capture or upload a clear, well-lit face photo to generate your avatar.
      </p>

      {errorMessage && (
        <motion.div
          {...scaleIn}
          role="alert"
          className="mb-4 rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm text-red-200"
        >
          {errorMessage}
        </motion.div>
      )}

      {phase === 'capture' && (
        <div className="space-y-4">
          {/* Photo source */}
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-black/40 ring-1 ring-white/10">
            {imageDataUri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageDataUri} alt="Selected face" className="h-full w-full object-cover" />
            ) : cameraActive ? (
              <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-white/50">
                <span className="text-4xl">👽</span>
                <span className="text-sm">No photo yet</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {!cameraActive && !imageDataUri && (
              <button
                type="button"
                onClick={startCamera}
                className="flex-1 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold hover:bg-purple-500"
              >
                Open camera
              </button>
            )}
            {cameraActive && (
              <button
                type="button"
                onClick={captureFromCamera}
                className="flex-1 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold hover:bg-purple-500"
              >
                Capture
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
            >
              Upload photo
            </button>
            {imageDataUri && (
              <button
                type="button"
                onClick={() => {
                  setImageDataUri(null);
                  setErrorMessage(null);
                }}
                className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
              >
                Retake
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={onFileSelected}
              className="hidden"
            />
          </div>

          {/* Style picker */}
          <div>
            <p className="mb-2 text-sm font-medium text-white/80">Preferred style</p>
            <div className="grid grid-cols-3 gap-2">
              {ALIEN_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  aria-pressed={preferredStyle === style}
                  onClick={() => setPreferredStyle(style)}
                  className={`rounded-xl border px-2 py-3 text-xs font-semibold transition ${
                    preferredStyle === style
                      ? 'border-purple-400 bg-purple-500/20 text-white'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {ALIEN_STYLE_LABELS[style]}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!imageDataUri || generate.isPending}
            onClick={handleGenerate}
            className="w-full rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generate.isPending ? 'Generating…' : 'Generate avatar'}
          </button>
        </div>
      )}

      {phase === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-white/80">Pick your favorite variant</p>
          <div className="grid grid-cols-3 gap-3">
            <AnimatePresence>
              {variants.map((variant) => {
                const isSelected = selectedStyle === variant.style;
                return (
                  <motion.button
                    key={variant.style}
                    type="button"
                    {...scaleIn}
                    onClick={() => handleSelect(variant)}
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    transition={{ type: 'spring', ...BRAND_SPRINGS.bounce }}
                    className={`overflow-hidden rounded-2xl border-2 ${
                      isSelected ? 'border-cyan-400' : 'border-transparent'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={variant.imageUrl}
                      alt={`${ALIEN_STYLE_LABELS[variant.style]} variant`}
                      className="aspect-square w-full object-cover"
                    />
                    <span className="block bg-black/40 py-1 text-center text-[11px] font-semibold">
                      {ALIEN_STYLE_LABELS[variant.style]}
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={resetToCapture}
              className="flex-1 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20"
            >
              Start over
            </button>
            <div className="flex-1 rounded-xl bg-white/5 px-4 py-2 text-center text-sm font-semibold text-white/70">
              {select.isPending ? 'Saving…' : select.isSuccess ? 'Saved!' : 'Tap a variant to save'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AvatarGenerator;
