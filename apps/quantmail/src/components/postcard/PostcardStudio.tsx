'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { AppShell } from '../AppShell';
import { AppSidebar } from '../AppSidebar';
import { PostcardCanvas } from './PostcardCanvas';
import { showToast } from '../InboxToast';
import { IconMailHeart } from '../icons';
import {
  DEFAULT_VINTAGE_PRESETS,
  type PostcardTemplate,
  type PostcardPaperTexture,
  type PostcardFont,
  type PostcardSticker,
} from '../../types/postcard';

const STORAGE_KEY = 'quantmail_custom_postcards';

export function PostcardStudio() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'templates' | 'designer' | 'my-cards'>('designer');
  const [customCards, setCustomCards] = useState<PostcardTemplate[]>([]);

  // Current Active Template being edited
  const [currentTemplate, setCurrentTemplate] = useState<PostcardTemplate>(
    DEFAULT_VINTAGE_PRESETS[0],
  );
  const [sampleMessage, setSampleMessage] = useState(
    'Wishing you radiant moments and infinite possibilities from across the quantum realm!\n\nEvery journey brings us closer to the signal.',
  );
  const [sampleRecipient, setSampleRecipient] = useState('Eleanor Vance');
  const [sampleLocation, setSampleLocation] = useState('Kyoto / New Delhi');

  // Load custom cards from storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setCustomCards(JSON.parse(saved));
      }
    } catch {
      // ignore
    }
  }, []);

  // Save card to collection
  const handleSaveCard = () => {
    const newCard: PostcardTemplate = {
      ...currentTemplate,
      id: `custom-${Date.now()}`,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };

    const updated = [newCard, ...customCards];
    setCustomCards(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    showToast({ text: `Postcard "${newCard.name}" saved to your collection!`, type: 'success' });
  };

  // Delete custom card
  const handleDeleteCustomCard = (id: string) => {
    const updated = customCards.filter((c) => c.id !== id);
    setCustomCards(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    showToast({ text: 'Postcard removed', type: 'info' });
  };

  // Handle PNG Image Upload as Sticker or Stamp
  const handleUploadSticker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const newSticker: PostcardSticker = {
        id: `stk-${Date.now()}`,
        src: base64,
        x: 30 + Math.random() * 40,
        y: 40 + Math.random() * 40,
        scale: 0.9,
        rotation: (Math.random() - 0.5) * 20,
        alt: file.name,
      };

      setCurrentTemplate((prev) => ({
        ...prev,
        stickers: [...prev.stickers, newSticker],
      }));
      showToast({ text: 'PNG Sticker placed on postcard!', type: 'success' });
    };
    reader.readAsDataURL(file);
  };

  // Handle Custom Stamp Photo Upload
  const handleUploadStampPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setCurrentTemplate((prev) => ({
        ...prev,
        stamp: {
          ...prev.stamp,
          customImageUrl: base64,
          type: 'custom',
        },
      }));
      showToast({ text: 'Custom Photo Stamp created!', type: 'success' });
    };
    reader.readAsDataURL(file);
  };

  return (
    <AppShell sidebar={<AppSidebar />} theme="dark" className="quantmail-shell">
      <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#0A0B0E] text-[#F5F5F5] p-4 sm:p-8">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#282C35]/80 pb-6 mb-8">
          <div>
            <div className="flex items-center gap-2.5 text-xs font-mono font-bold tracking-widest text-[#FF8C42] uppercase">
              <IconMailHeart size={14} />
              <span>QuantMail Creative Suite</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-black text-white mt-1">
              Vintage Postcard Studio
            </h1>
            <p className="text-xs sm:text-sm text-[#A1A4AC] mt-1 max-w-xl">
              Design handcrafted, authentic vintage postcards with custom stamps, PNG stickers, and
              paper textures. Send timeless letters to anyone.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={handleSaveCard}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#FF8C42] px-4 py-2 text-xs font-semibold text-[#111111] transition-all hover:bg-[#FF9B5A] active:bg-[#E8752F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111318] sm:min-h-0"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 stroke-[2.2]"
                fill="none"
                stroke="currentColor"
              >
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              <span>Save Postcard</span>
            </button>

            <button
              type="button"
              onClick={() => {
                sessionStorage.setItem(
                  'quantmail_active_postcard',
                  JSON.stringify(currentTemplate),
                );
                router.push('/compose');
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#282C35] bg-[#16181D] px-4 py-2 text-xs font-semibold text-[#F5F5F5] transition-all hover:bg-[#1C1F26] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 stroke-[2]"
                fill="none"
                stroke="currentColor"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
              <span>Use in Compose</span>
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-[#282C35] mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('designer')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              activeTab === 'designer'
                ? 'bg-[#111318] text-[#FF8C42] border-t-2 border-[#FF8C42]'
                : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
            }`}
          >
            Postcard Designer
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              activeTab === 'templates'
                ? 'bg-[#111318] text-[#FF8C42] border-t-2 border-[#FF8C42]'
                : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
            }`}
          >
            Vintage Presets Gallery
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my-cards')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors ${
              activeTab === 'my-cards'
                ? 'bg-[#111318] text-[#FF8C42] border-t-2 border-[#FF8C42]'
                : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
            }`}
          >
            My Custom Postcards ({customCards.length})
          </button>
        </div>

        {/* ============================================================= */}
        {/* TAB 1: DESIGNER & LIVE CANVAS                                  */}
        {/* ============================================================= */}
        {activeTab === 'designer' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left: 3D Interactive Canvas Preview */}
            <div className="lg:col-span-7 flex flex-col items-center bg-[#111318] border border-[#282C35] rounded-2xl p-6 sm:p-8">
              <div className="w-full flex items-center justify-between text-xs text-[#A1A4AC] font-mono mb-4">
                <span>LIVE 3D PREVIEW</span>
                <span>TILT & FLIP SUPPORTED</span>
              </div>

              <PostcardCanvas
                template={currentTemplate}
                message={sampleMessage}
                recipientName={sampleRecipient}
                locationString={sampleLocation}
                editable={true}
                onMessageChange={setSampleMessage}
                className="w-full"
              />

              <p className="text-[11px] text-[#A1A4AC] font-mono mt-4 text-center">
                Tip: Type directly onto the card above to test your message flow and letterpress
                layout.
              </p>
            </div>

            {/* Right: Customization Controls Panel */}
            <div className="lg:col-span-5 space-y-6 bg-[#111318] border border-[#282C35] rounded-2xl p-6">
              <h2 className="text-sm font-bold tracking-wide uppercase text-[#F5F5F5] font-mono">
                Postcard Controls
              </h2>

              {/* Template Name */}
              <div>
                <label className="block text-xs font-semibold text-[#A1A4AC] mb-1.5">
                  Postcard Title
                </label>
                <input
                  type="text"
                  value={currentTemplate.name}
                  onChange={(e) =>
                    setCurrentTemplate((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="min-h-11 w-full rounded-lg border border-[#282C35] bg-[#16181D] px-3 py-2 text-xs text-[#F5F5F5] focus:border-[#FF8C42] focus:outline-none sm:min-h-0"
                />
              </div>

              {/* Paper Texture Selection */}
              <div>
                <label className="block text-xs font-semibold text-[#A1A4AC] mb-1.5">
                  Aged Paper Texture
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { key: 'antique-map', label: 'Antique Map' },
                    { key: 'vintage-parchment', label: 'Aged Parchment' },
                    { key: 'botanical-linen', label: 'Botanical Linen' },
                    { key: 'obsidian-matte', label: 'Obsidian 24K Gold' },
                    { key: 'clean-ivory', label: 'Clean Ivory' },
                  ].map((tex) => (
                    <button
                      key={tex.key}
                      type="button"
                      onClick={() =>
                        setCurrentTemplate((prev) => ({
                          ...prev,
                          paperTexture: tex.key as PostcardPaperTexture,
                        }))
                      }
                      className={`min-h-11 rounded-lg border px-3 py-2 text-left font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 ${
                        currentTemplate.paperTexture === tex.key
                          ? 'bg-[#2B1A11] border-[#5C3016] text-[#FF8C42]'
                          : 'bg-[#16181D] border-[#282C35] text-[#A1A4AC] hover:border-[#3E434D]'
                      }`}
                    >
                      {tex.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filigree Corners Toggle */}
              {/* The label owns the hit area: the native box is 16px, so a tap
               * anywhere on this row is the only version of this control a
               * finger can actually use. */}
              <label className="flex min-h-11 cursor-pointer items-center justify-between border-t border-[#282C35] pt-4">
                <div>
                  <div className="text-xs font-semibold text-[#F5F5F5]">
                    Victorian Filigree Corners
                  </div>
                  <div className="text-[11px] text-[#A1A4AC]">
                    Ornate hand-drawn corner flourishes
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={currentTemplate.hasFiligree}
                  onChange={(e) =>
                    setCurrentTemplate((prev) => ({ ...prev, hasFiligree: e.target.checked }))
                  }
                  className="size-4 shrink-0 cursor-pointer rounded accent-[#FF8C42] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42]"
                />
              </label>

              {/* Font Style */}
              <div className="border-t border-[#282C35] pt-4">
                <label className="block text-xs font-semibold text-[#A1A4AC] mb-1.5">
                  Typography Style
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { key: 'typewriter', label: 'Typewriter Mono' },
                    { key: 'serif', label: 'Classic Serif' },
                    { key: 'handwriting', label: 'Handwritten Cursive' },
                    { key: 'classic', label: 'Clean Sans' },
                  ].map((font) => (
                    <button
                      key={font.key}
                      type="button"
                      onClick={() =>
                        setCurrentTemplate((prev) => ({
                          ...prev,
                          fontFamily: font.key as PostcardFont,
                        }))
                      }
                      className={`min-h-11 rounded-lg border px-3 py-2 text-left font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 ${
                        currentTemplate.fontFamily === font.key
                          ? 'bg-[#2B1A11] border-[#5C3016] text-[#FF8C42]'
                          : 'bg-[#16181D] border-[#282C35] text-[#A1A4AC] hover:border-[#3E434D]'
                      }`}
                    >
                      {font.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Postage Stamp & Cancellation Seal Controls */}
              <div className="border-t border-[#282C35] pt-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#FF8C42] font-mono">
                  Postage Stamp & Rubber Seal
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-medium text-[#A1A4AC] mb-1">
                      Postmark City
                    </label>
                    <input
                      type="text"
                      value={currentTemplate.stamp.postmarkCity || ''}
                      onChange={(e) =>
                        setCurrentTemplate((prev) => ({
                          ...prev,
                          stamp: { ...prev.stamp, postmarkCity: e.target.value },
                        }))
                      }
                      className="min-h-11 w-full rounded-lg border border-[#282C35] bg-[#16181D] px-2.5 py-1.5 text-xs text-[#F5F5F5] focus:border-[#FF8C42] focus:outline-none sm:min-h-0"
                      placeholder="e.g. TOKYO"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#A1A4AC] mb-1">
                      Stamp Value
                    </label>
                    <input
                      type="text"
                      value={currentTemplate.stamp.value}
                      onChange={(e) =>
                        setCurrentTemplate((prev) => ({
                          ...prev,
                          stamp: { ...prev.stamp, value: e.target.value },
                        }))
                      }
                      className="min-h-11 w-full rounded-lg border border-[#282C35] bg-[#16181D] px-2.5 py-1.5 text-xs text-[#F5F5F5] focus:border-[#FF8C42] focus:outline-none sm:min-h-0"
                      placeholder="e.g. 50¢ or ₹5"
                    />
                  </div>
                </div>

                {/* Custom Photo Stamp Upload */}
                <div>
                  <label className="block text-[11px] font-medium text-[#A1A4AC] mb-1">
                    Upload Custom Photo for Stamp (PNG / JPG)
                  </label>
                  {/* `min-h-11` grows the control, but on a file input the only
                   * part you can actually tap is the `file:` button, and that
                   * sizes itself from its own padding — hence the coarse-pointer
                   * `file:py-3` as well. */}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUploadStampPhoto}
                    className="min-h-11 w-full text-xs text-[#A1A4AC] file:mr-3 file:rounded-md file:border-0 file:bg-[#2B1A11] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#FF8C42] hover:file:bg-[#3D2214] sm:min-h-0 [@media(pointer:coarse)]:file:py-3"
                  />
                </div>
              </div>

              {/* PNG Stickers Layer */}
              <div className="border-t border-[#282C35] pt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#FF8C42] font-mono">
                    Add Custom PNG Stickers
                  </div>
                  <span className="text-[11px] text-[#A1A4AC]">
                    {currentTemplate.stickers.length} active
                  </span>
                </div>

                <input
                  type="file"
                  accept="image/png,image/webp,image/*"
                  onChange={handleUploadSticker}
                  className="min-h-11 w-full text-xs text-[#A1A4AC] file:mr-3 file:rounded-md file:border-0 file:bg-[#2B1A11] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#FF8C42] hover:file:bg-[#3D2214] sm:min-h-0 [@media(pointer:coarse)]:file:py-3"
                />

                {currentTemplate.stickers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentTemplate((prev) => ({ ...prev, stickers: [] }))}
                    className="text-[11px] text-rose-400 hover:underline"
                  >
                    Clear all stickers
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 2: PRESET GALLERY                                         */}
        {/* ============================================================= */}
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {DEFAULT_VINTAGE_PRESETS.map((preset) => (
              <div
                key={preset.id}
                className="bg-[#111318] border border-[#282C35] hover:border-[#FF8C42]/50 rounded-2xl p-5 flex flex-col justify-between transition-all group shadow-lg"
              >
                <div>
                  <div className="w-full aspect-[1.58/1] rounded-xl overflow-hidden mb-4 border border-[#282C35] bg-[#090A0C] p-2">
                    <PostcardCanvas
                      template={preset}
                      message="Greetings from across the postal timeline…"
                      editable={false}
                      allowFlip={false}
                    />
                  </div>

                  <h3 className="text-base font-serif font-bold text-[#F5F5F5] group-hover:text-[#FF8C42] transition-colors">
                    {preset.name}
                  </h3>
                  <p className="text-xs text-[#A1A4AC] mt-1">{preset.description}</p>
                </div>

                <div className="mt-5 pt-4 border-t border-[#282C35] flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#FF8C42] font-semibold uppercase">
                    {preset.category}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTemplate(preset);
                      setActiveTab('designer');
                      showToast({ text: `Loaded "${preset.name}" into designer!`, type: 'info' });
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#2B1A11] hover:bg-[#3D2214] text-[#FF8C42] border border-[#5C3016] transition-all"
                  >
                    Customize in Studio
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 3: MY CUSTOM POSTCARDS                                    */}
        {/* ============================================================= */}
        {activeTab === 'my-cards' && (
          <div>
            {customCards.length === 0 ? (
              <div className="text-center py-16 bg-[#111318]/40 border border-dashed border-[#282C35] rounded-2xl">
                <div className="size-12 rounded-full bg-[#16181D] border border-[#282C35] text-[#A1A4AC] flex items-center justify-center mx-auto mb-3">
                  <svg
                    className="size-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-[#F5F5F5]">
                  No custom postcards saved yet
                </h3>
                <p className="text-xs text-[#A1A4AC] max-w-sm mx-auto mt-1">
                  Design a postcard in the Studio and click &ldquo;Save Postcard&rdquo; to build
                  your personal postal collection.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('designer')}
                  className="mt-4 px-4 py-2 bg-[#2B1A11] text-[#FF8C42] border border-[#5C3016] rounded-lg text-xs font-semibold hover:bg-[#3D2214] transition-colors"
                >
                  Open Postcard Studio
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {customCards.map((card) => (
                  <div
                    key={card.id}
                    className="bg-[#111318] border border-[#282C35] rounded-2xl p-5 flex flex-col justify-between shadow-lg"
                  >
                    <div>
                      <div className="w-full aspect-[1.58/1] rounded-xl overflow-hidden mb-4 border border-[#282C35] bg-[#090A0C] p-2">
                        <PostcardCanvas
                          template={card}
                          message="My personalized postal stationery…"
                          editable={false}
                          allowFlip={false}
                        />
                      </div>
                      <h3 className="text-base font-serif font-bold text-[#F5F5F5]">{card.name}</h3>
                      <p className="text-xs text-[#A1A4AC] mt-1">
                        Created{' '}
                        {card.createdAt
                          ? new Date(card.createdAt).toLocaleDateString()
                          : 'recently'}
                      </p>
                    </div>

                    <div className="mt-5 pt-4 border-t border-[#282C35] flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomCard(card.id)}
                        className="text-xs text-rose-400 hover:underline"
                      >
                        Delete
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentTemplate(card);
                            setActiveTab('designer');
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#16181D] hover:bg-[#1C1F26] text-[#F5F5F5] border border-[#282C35]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            sessionStorage.setItem(
                              'quantmail_active_postcard',
                              JSON.stringify(card),
                            );
                            router.push('/compose');
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#FF8C42] hover:bg-[#FF9B5A] active:bg-[#E8752F] text-[#111111]"
                        >
                          Send Mail
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default PostcardStudio;
