'use client';

import React, { useState, useEffect, useId, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { nextRovingIndex, rovingTabIndex } from '@quant/shared-ui';
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

/**
 * The three views, hoisted out of the markup.
 *
 * A `tablist` needs the strip and the arrow arithmetic to agree on an order, and
 * three buttons written out by hand cannot be indexed — so the list is the source
 * of truth for both, the same shape the settings page uses for its six panes.
 */
const STUDIO_TABS = [
  { key: 'designer', label: 'Postcard Designer' },
  { key: 'templates', label: 'Vintage Presets Gallery' },
  { key: 'my-cards', label: 'My Custom Postcards' },
] as const;

type StudioTab = (typeof STUDIO_TABS)[number]['key'];

/**
 * The two card pickers' options.
 *
 * Hoisted for the same reason as the tabs — a radiogroup's arrows need an
 * indexable list — and typed as the unions they set, which retires the
 * `as PostcardPaperTexture` casts the inline literals needed.
 */
const PAPER_TEXTURES: readonly { key: PostcardPaperTexture; label: string }[] = [
  { key: 'antique-map', label: 'Antique Map' },
  { key: 'vintage-parchment', label: 'Aged Parchment' },
  { key: 'botanical-linen', label: 'Botanical Linen' },
  { key: 'obsidian-matte', label: 'Obsidian 24K Gold' },
  { key: 'clean-ivory', label: 'Clean Ivory' },
];

const POSTCARD_FONTS: readonly { key: PostcardFont; label: string }[] = [
  { key: 'typewriter', label: 'Typewriter Mono' },
  { key: 'serif', label: 'Classic Serif' },
  { key: 'handwriting', label: 'Handwritten Cursive' },
  { key: 'classic', label: 'Clean Sans' },
];

export function PostcardStudio() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StudioTab>('designer');
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

  /*
    One base for every id this panel hands to `htmlFor`, `aria-labelledby` and
    `aria-controls`.

    `useId` rather than literals because nothing stops a second studio mounting in
    the same document — a route and a preview modal — and two tablists pointing
    `aria-controls` at the same panel id is a worse defect than the one being
    fixed here. Six visible labels in this panel used to name nothing at all: a
    `<label>` with no `htmlFor` over an input with no `id` is decoration, so the
    title field, the postmark city, the stamp value and both file inputs reached a
    screen reader as unnamed edit boxes.
  */
  const studioId = useId();
  const tabId = (key: StudioTab) => `${studioId}-tab-${key}`;
  const panelId = (key: StudioTab) => `${studioId}-panel-${key}`;
  const tabListRef = useRef<HTMLDivElement>(null);

  /**
   * Arrows across the view strip, selecting as they go.
   *
   * Automatic activation — focus and selection move together — because switching
   * view here costs nothing: no panel fetches anything, so making someone press
   * Enter after arriving would be ceremony.
   *
   * Left/Right and Home/End only, which is `nextRovingIndex`'s default and the
   * reason it takes an orientation: a horizontal strip that also swallowed Up/Down
   * would take page scrolling away from anyone whose focus lands on it. The
   * settings page's older copy of this does claim the vertical pair; the shared
   * helper's rule is the newer one, and this is not an inconsistency to "fix" in
   * the other direction.
   */
  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = STUDIO_TABS.findIndex((tab) => tab.key === activeTab);
    const next = nextRovingIndex(event.key, index, STUDIO_TABS.length);
    if (next === null) return;
    // The engine's own arrow bindings scroll the list behind this otherwise.
    event.preventDefault();
    const target = STUDIO_TABS[next];
    if (!target) return;
    setActiveTab(target.key);
    tabListRef.current?.querySelector<HTMLButtonElement>(`[data-tab="${target.key}"]`)?.focus();
  };

  /**
   * Arrows across a card picker, which is a radiogroup and therefore selects too.
   *
   * `both`, unlike the tab strip: these are two-column grids, so ArrowDown from
   * the top-left card visually lands on the one below it and refusing that key
   * would be pedantry. Focus is moved by querying the group's own live DOM — the
   * buttons render from the same array the arithmetic indexes, so position N in
   * the list is position N in the grid.
   */
  const onCardPickerKeyDown = <T extends string>(
    event: React.KeyboardEvent<HTMLDivElement>,
    options: readonly { key: T; label: string }[],
    current: T,
    select: (key: T) => void,
  ) => {
    const index = options.findIndex((option) => option.key === current);
    const next = nextRovingIndex(event.key, index, options.length, 'both');
    if (next === null) return;
    event.preventDefault();
    const target = options[next];
    if (!target) return;
    select(target.key);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

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

        {/*
          Tab Navigation — and now actually a tablist.

          Three buttons wearing an orange top border were three separate Tab stops,
          and the only thing telling anyone which view was live was that border: no
          `aria-selected`, no owned panels, nothing a screen reader could read. It
          is the same contract the inbox lens and the settings panes already went
          through, unapplied here.

          One tab stop, arrows to move, and each panel below is owned by its tab.
        */}
        <div
          ref={tabListRef}
          role="tablist"
          aria-label="Postcard studio views"
          aria-orientation="horizontal"
          onKeyDown={onTabKeyDown}
          className="flex items-center gap-2 border-b border-[#282C35] mb-6"
        >
          {STUDIO_TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                id={tabId(tab.key)}
                type="button"
                role="tab"
                /* How `onTabKeyDown` finds the button it has to focus. */
                data-tab={tab.key}
                aria-selected={isActive}
                /*
                  Gated: only the selected panel is mounted, so an IDREF from the
                  other two would point at nothing at all.
                */
                aria-controls={isActive ? panelId(tab.key) : undefined}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                className={`min-h-11 px-4 py-2 text-xs font-semibold rounded-t-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 ${
                  isActive
                    ? 'bg-[#111318] text-[#FF8C42] border-t-2 border-[#FF8C42]'
                    : 'text-[#A1A4AC] hover:text-[#F5F5F5]'
                }`}
              >
                {tab.key === 'my-cards' ? `${tab.label} (${customCards.length})` : tab.label}
              </button>
            );
          })}
        </div>

        {/* ============================================================= */}
        {/* TAB 1: DESIGNER & LIVE CANVAS                                  */}
        {/* ============================================================= */}
        {activeTab === 'designer' && (
          <div
            role="tabpanel"
            /*
              No `tabIndex={0}`: a tabpanel only needs to be focusable when it
              holds nothing focusable, and all three of these open onto controls.
            */
            id={panelId('designer')}
            aria-labelledby={tabId('designer')}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
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
                <label
                  htmlFor={`${studioId}-title`}
                  className="block text-xs font-semibold text-[#A1A4AC] mb-1.5"
                >
                  Postcard Title
                </label>
                <input
                  id={`${studioId}-title`}
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
                {/*
                  Five cards, exactly one of them live: that is a radiogroup, not
                  five unrelated buttons, and the difference was audible — the
                  orange fill was the only thing saying which texture was chosen,
                  so a screen reader heard five identical unpressed buttons.

                  The `<label>` that used to sit here labelled nothing (a label
                  with no control is inert markup), so the text carries an id and
                  the group points at it — which keeps the accessible name and the
                  visible name the same string by construction.

                  Not `aria-pressed`: a toggle state on a one-of-five control is
                  precisely the mismatch this is fixing.
                */}
                <div
                  id={`${studioId}-texture-label`}
                  className="block text-xs font-semibold text-[#A1A4AC] mb-1.5"
                >
                  Aged Paper Texture
                </div>
                <div
                  role="radiogroup"
                  aria-labelledby={`${studioId}-texture-label`}
                  onKeyDown={(event) =>
                    onCardPickerKeyDown(
                      event,
                      PAPER_TEXTURES,
                      currentTemplate.paperTexture,
                      (key) => setCurrentTemplate((prev) => ({ ...prev, paperTexture: key })),
                    )
                  }
                  className="grid grid-cols-2 gap-2 text-xs"
                >
                  {PAPER_TEXTURES.map((tex, index) => {
                    const isChosen = currentTemplate.paperTexture === tex.key;
                    return (
                      <button
                        key={tex.key}
                        type="button"
                        role="radio"
                        aria-checked={isChosen}
                        /*
                          `rovingTabIndex`, not `isChosen ? 0 : -1`: a saved card
                          could carry a texture that is no longer in this list, and
                          then nothing would hold the group's single tab stop and
                          the whole picker would be unreachable.
                        */
                        tabIndex={rovingTabIndex(
                          index,
                          PAPER_TEXTURES.findIndex((t) => t.key === currentTemplate.paperTexture),
                        )}
                        onClick={() =>
                          setCurrentTemplate((prev) => ({ ...prev, paperTexture: tex.key }))
                        }
                        className={`min-h-11 rounded-lg border px-3 py-2 text-left font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 ${
                          isChosen
                            ? 'bg-[#2B1A11] border-[#5C3016] text-[#FF8C42]'
                            : 'bg-[#16181D] border-[#282C35] text-[#A1A4AC] hover:border-[#3E434D]'
                        }`}
                      >
                        {tex.label}
                      </button>
                    );
                  })}
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
                {/* Same shape as the texture picker above, for the same reason. */}
                <div
                  id={`${studioId}-font-label`}
                  className="block text-xs font-semibold text-[#A1A4AC] mb-1.5"
                >
                  Typography Style
                </div>
                <div
                  role="radiogroup"
                  aria-labelledby={`${studioId}-font-label`}
                  onKeyDown={(event) =>
                    onCardPickerKeyDown(event, POSTCARD_FONTS, currentTemplate.fontFamily, (key) =>
                      setCurrentTemplate((prev) => ({ ...prev, fontFamily: key })),
                    )
                  }
                  className="grid grid-cols-2 gap-2 text-xs"
                >
                  {POSTCARD_FONTS.map((font, index) => {
                    const isChosen = currentTemplate.fontFamily === font.key;
                    return (
                      <button
                        key={font.key}
                        type="button"
                        role="radio"
                        aria-checked={isChosen}
                        tabIndex={rovingTabIndex(
                          index,
                          POSTCARD_FONTS.findIndex((f) => f.key === currentTemplate.fontFamily),
                        )}
                        onClick={() =>
                          setCurrentTemplate((prev) => ({ ...prev, fontFamily: font.key }))
                        }
                        className={`min-h-11 rounded-lg border px-3 py-2 text-left font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8C42] sm:min-h-0 ${
                          isChosen
                            ? 'bg-[#2B1A11] border-[#5C3016] text-[#FF8C42]'
                            : 'bg-[#16181D] border-[#282C35] text-[#A1A4AC] hover:border-[#3E434D]'
                        }`}
                      >
                        {font.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Postage Stamp & Cancellation Seal Controls */}
              <div className="border-t border-[#282C35] pt-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-[#FF8C42] font-mono">
                  Postage Stamp & Rubber Seal
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor={`${studioId}-postmark-city`}
                      className="block text-[11px] font-medium text-[#A1A4AC] mb-1"
                    >
                      Postmark City
                    </label>
                    <input
                      id={`${studioId}-postmark-city`}
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
                    <label
                      htmlFor={`${studioId}-stamp-value`}
                      className="block text-[11px] font-medium text-[#A1A4AC] mb-1"
                    >
                      Stamp Value
                    </label>
                    <input
                      id={`${studioId}-stamp-value`}
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
                  <label
                    htmlFor={`${studioId}-stamp-photo`}
                    className="block text-[11px] font-medium text-[#A1A4AC] mb-1"
                  >
                    Upload Custom Photo for Stamp (PNG / JPG)
                  </label>
                  {/* `min-h-11` grows the control, but on a file input the only
                   * part you can actually tap is the `file:` button, and that
                   * sizes itself from its own padding — hence the coarse-pointer
                   * `file:py-3` as well. */}
                  <input
                    id={`${studioId}-stamp-photo`}
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
                  <div
                    id={`${studioId}-stickers-label`}
                    className="text-xs font-bold uppercase tracking-wider text-[#FF8C42] font-mono"
                  >
                    Add Custom PNG Stickers
                  </div>
                  <span className="text-[11px] text-[#A1A4AC]">
                    {currentTemplate.stickers.length} active
                  </span>
                </div>

                {/*
                  `aria-labelledby` rather than a new `<label>`: the section
                  heading above already reads as this control's name, and adding a
                  second visible label to say the same thing twice would be worse
                  than the nameless input it replaces. The count beside it is
                  deliberately outside the reference — it is status, not a name.
                */}
                <input
                  aria-labelledby={`${studioId}-stickers-label`}
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
          <div
            role="tabpanel"
            id={panelId('templates')}
            aria-labelledby={tabId('templates')}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
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
          <div role="tabpanel" id={panelId('my-cards')} aria-labelledby={tabId('my-cards')}>
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
