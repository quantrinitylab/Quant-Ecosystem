import React from 'react';
import { motion } from 'framer-motion';

export interface HeroPromptBentoProps {
  onSelectPrompt: (prompt: string) => void;
  onStartVoice: () => void;
  onOpenCanvas: () => void;
  onAttachFile: () => void;
}

export function HeroPromptBento({
  onSelectPrompt,
  onStartVoice,
  onOpenCanvas,
  onAttachFile,
}: HeroPromptBentoProps) {
  const cards = [
    {
      id: 'visuals',
      title: 'Generate Visual Concepts',
      subtext: 'Craft hyper-detailed prompts to describe any visual',
      badge: 'Image Generation',
      onClick: () => {
        onSelectPrompt(
          'Create a photorealistic cinematic render of a futuristic quantum supercomputer in a glass laboratory --ar 16:9',
        );
      },
    },
    {
      id: 'docs',
      title: 'Synthesize Documents & Code',
      subtext: 'Draft technical specs, markdown docs & code in split Work Canvas',
      badge: 'Work Canvas',
      onClick: () => {
        onSelectPrompt(
          'Design an architecture document for a distributed real-time messaging pipeline',
        );
        onOpenCanvas();
      },
    },
    {
      id: 'voice',
      title: 'Start Real-Time Voice Mode',
      subtext: 'Fluid real-time conversational voice session',
      badge: 'Voice Mode',
      onClick: onStartVoice,
    },
    {
      id: 'vision',
      title: 'Vision Analysis & Document OCR',
      subtext: 'Extract tables, structured data & scene captions from uploaded documents',
      badge: 'Document OCR',
      onClick: () => {
        onSelectPrompt('Extract all key entities, dates, and tables from an uploaded invoice');
        onAttachFile();
      },
    },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 w-full mt-8 md:mt-0">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl space-y-8"
      >
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-center text-[var(--foreground)]">
          What can I help with?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {cards.map((card) => (
            <motion.div
              key={card.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="relative p-5 rounded-2xl border border-[var(--quant-border)] bg-[var(--quant-surface)] hover:bg-[var(--quant-surface-hover)] transition-all cursor-pointer group hover:border-[var(--quant-accent)] hover:shadow-md hover:shadow-[var(--quant-accent)]/10"
              tabIndex={0}
              onClick={card.onClick}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  card.onClick();
                }
              }}
            >
              <div className="flex flex-col h-full space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-semibold bg-[var(--quant-surface-hover)] text-[var(--foreground-secondary)] group-hover:bg-[var(--quant-accent)]/10 group-hover:text-[var(--quant-accent)] transition-colors">
                    {card.badge}
                  </span>
                </div>
                <h3 className="font-semibold text-[var(--foreground)] group-hover:text-[var(--quant-accent)] transition-colors">
                  {card.title}
                </h3>
                <p className="text-xs text-[var(--foreground-secondary)] leading-relaxed flex-1">
                  {card.subtext}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
