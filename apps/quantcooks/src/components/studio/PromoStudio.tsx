// ============================================================================
// QuantCooks Studio — Promo Studio screen (spec §4.1–§4.6, checklist
// #31 home + composer, #32 format modal, #33 product panel, #34 presenter
// panel, #35 Link-to-Ad; G-9)
//
// Anatomy: the persistent DISH / PRODUCT + PRESENTER slots row first —
// the slots are this composer's memory: their state lives here, above the
// Create / Link-to-Ad views, so switching views (or formats, or anything
// else on this screen) never resets them, and a draft mirror keeps the
// same state across a reload. Below: the caller's real brand kits, the
// shared Composer, and a results rail + JobStrip.
//
// What is REAL on this screen today:
//  - The product slot: pick from the caller's READY assets or upload a
//    photo through the P0-3 three-step flow (page injects useAssetUpload).
//  - Brand kits: read live through the pre-Phase-0 brand-kit CRUD
//    (useBrandKit on the page); selecting one puts its real colours and
//    name on the brief. Nothing about a kit is invented here.
// What is NOT configured, and says so on the surface:
//  - Ad generation + Link-to-Ad extraction: quantcooks.create_food_ad is
//    registered (CP-1) but Tier B fail-closed, so Generate stays disabled
//    with the price still re-pricing live, and a submitted link lands on
//    NOT_CONFIGURED — never a fabricated product or ad.
//  - The presenter slot: Chef Personas landed with the Voice Studio
//    unit (G-5); shared-file batch #2 wired this slot to that library.
//    The slot reads the voice draft mirror (the personas' only home
//    today): an empty library keeps the honest empty state below, and a
//    draft persona can be recorded on the brief — with its status
//    stated on the surface ("Draft — training not configured"), never
//    as a trained, usable presenter. Personas are created and trained
//    in Voice Studio, not here. Shared-file batch #3 persists the
//    selection itself in this screen's draft mirror (presenterId), so
//    a reload keeps the pick.
// ============================================================================

import React, { useEffect, useRef, useState } from 'react';
import type { ServerAsset } from '../../services/api-client';
import type { StudioJob } from '../../lib/studio/jobs';
import {
  EMPTY_PROMO_DRAFT,
  LINK_AD_STYLES,
  PROMO_AD_TOOL,
  PROMO_ASSETS_TOOL,
  PROMO_BRAND_APPLY_TOOL,
  PROMO_BRAND_KIT_TOOL,
  PROMO_FORMATS,
  PROMO_HOOK_STYLES,
  PROMO_PERSONA_TOOL,
  PROMO_SETTING_OPTIONS,
  PROMO_VARY_TOOL,
  brandKitById,
  brandKitSwatches,
  parsePromoDraft,
  pickableProductAssets,
  productFromAsset,
  productUploadPhaseLabel,
  promoComposerSettings,
  promoFormatById,
  promoResultsFromJobs,
  runProductUpload,
  serializePromoDraft,
  submitLinkToAd,
  PROMO_DRAFT_KEY,
  type LinkToAdOutcome,
  type PromoBrandKit,
  type PromoFormat,
  type PromoProduct,
  type ProductUploadPhase,
} from '../../lib/studio/promo';
import {
  VOICE_DRAFT_KEY,
  parseVoiceDraft,
  type ChefPersona,
} from '../../lib/studio/voice';
import { Composer, defaultComposerSettings, type ComposerChip } from './Composer';
import type { ComposerSettings } from '../../lib/studio/pricing';
import { JobStrip } from './JobStrip';
import { PromoFormatModal } from './PromoFormatModal';

export type PromoDataState = 'loading' | 'ready' | 'error';
export type PromoView = 'create' | 'link';

export interface PromoStudioProps {
  /** Project uploads save into (uploads are project assets, P0-3). */
  projectId?: string | null;
  projectName?: string | null;
  /** The caller's assets, as listAssets returned them (unfiltered is fine). */
  assets?: ServerAsset[];
  assetsState: PromoDataState;
  assetsError?: string | null;
  onRetryAssets?: () => void;
  /** The caller's real brand kits (page wires useBrandKit). */
  brandKits?: PromoBrandKit[];
  brandKitsState?: PromoDataState;
  brandKitsError?: string | null;
  onRetryBrandKits?: () => void;
  /** The real P0-3 upload (page wires useAssetUpload). Omit = uploads off. */
  upload?: (file: File) => Promise<ServerAsset>;
  initialView?: PromoView;
  /** Pre-picked slot/brief state (deep links from Explore / tests). */
  initialProductAsset?: ServerAsset | null;
  initialFormatId?: string | null;
  initialHookStyle?: string | null;
  initialSetting?: string | null;
  initialBrandKitId?: string | null;
  /**
   * Chef Persona drafts from the Voice Studio library (the initial-*
   * seam: deep links / tests). When omitted, the component reads the
   * voice draft mirror itself — the personas' only home today.
   */
  initialPersonas?: ChefPersona[];
  /** Pre-selected presenter: a persona id from the library above. */
  initialPresenterId?: string | null;
  initialPrompt?: string;
  initialLinkUrl?: string;
  initialLinkStyle?: string | null;
  initialLinkSubmitted?: boolean;
  /** Real jobs for the strip/results (export-shaped today; [] is honest). */
  jobs?: StudioJob[];
}

function readDraftMirror() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return EMPTY_PROMO_DRAFT;
    return parsePromoDraft(window.localStorage.getItem(PROMO_DRAFT_KEY));
  } catch {
    return EMPTY_PROMO_DRAFT;
  }
}

/**
 * The Chef Persona library, read from the Voice Studio draft mirror —
 * read-only: personas are created, consented and trained in Voice
 * Studio. The mirror parser forces every persona's status to 'draft',
 * so what this returns can never claim a trained presenter.
 */
function readVoicePersonas(): ChefPersona[] {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return [];
    return parseVoiceDraft(window.localStorage.getItem(VOICE_DRAFT_KEY)).personas;
  } catch {
    return [];
  }
}

export const PromoStudio: React.FC<PromoStudioProps> = ({
  projectId,
  projectName,
  assets = [],
  assetsState,
  assetsError,
  onRetryAssets,
  brandKits = [],
  brandKitsState = 'ready',
  brandKitsError,
  onRetryBrandKits,
  upload,
  initialView = 'create',
  initialProductAsset,
  initialFormatId,
  initialHookStyle,
  initialSetting,
  initialBrandKitId,
  initialPersonas,
  initialPresenterId,
  initialPrompt = '',
  initialLinkUrl = '',
  initialLinkStyle,
  initialLinkSubmitted = false,
  jobs = [],
}) => {
  // The draft mirror is read once, lazily; explicit initial props (deep
  // links) always win over the mirror.
  const [mirror] = useState(readDraftMirror);
  const [view, setView] = useState<PromoView>(initialView);
  const [product, setProduct] = useState<PromoProduct | null>(() =>
    initialProductAsset ? productFromAsset(initialProductAsset) : mirror.product,
  );
  const [productPickerOpen, setProductPickerOpen] = useState<boolean>(() => !initialProductAsset && !mirror.product);
  const [formatId, setFormatId] = useState<string | null>(() => initialFormatId ?? mirror.formatId);
  const [formatModalOpen, setFormatModalOpen] = useState(false);
  const [hookStyle, setHookStyle] = useState<string | null>(() => initialHookStyle ?? mirror.hookStyle);
  const [hookPickerOpen, setHookPickerOpen] = useState(false);
  const [setting, setSetting] = useState<string | null>(() => initialSetting ?? mirror.setting);
  const [settingPickerOpen, setSettingPickerOpen] = useState(false);
  const [brandKitId, setBrandKitId] = useState<string | null>(() => initialBrandKitId ?? mirror.brandKitId);
  const [brandNoteOpen, setBrandNoteOpen] = useState(false);
  const [presenterNoteOpen, setPresenterNoteOpen] = useState(false);
  // The persona library is read once, lazily (the initial-* prop wins,
  // exactly as explicit props win over this screen's own mirror). The
  // selection is persisted in this screen's own draft mirror
  // (presenterId, batch #3), so a reload keeps the pick; the persona
  // record itself stays in Voice Studio's mirror, and an id that no
  // longer resolves against the library is no selection (see below).
  const [personas] = useState<ChefPersona[]>(() => initialPersonas ?? readVoicePersonas());
  const [presenterId, setPresenterId] = useState<string | null>(() => initialPresenterId ?? mirror.presenterId);
  const [presenterListOpen, setPresenterListOpen] = useState(false);
  const [prompt, setPrompt] = useState<string>(() => initialPrompt || mirror.prompt);
  const [linkUrl, setLinkUrl] = useState(initialLinkUrl);
  const [linkStyle, setLinkStyle] = useState<string | null>(initialLinkStyle ?? null);
  const [linkOutcome, setLinkOutcome] = useState<LinkToAdOutcome | null>(() =>
    initialLinkSubmitted && initialLinkUrl ? submitLinkToAd(initialLinkUrl) : null,
  );
  const [uploadPhase, setUploadPhase] = useState<ProductUploadPhase>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Draft mirror: slots + brief choices persist across a reload. The
  // mirror stores the product's assetId — identity is never a signed URL.
  // The presenter selection persists the same way (batch #3): the mirror
  // carries the persona's id only; the record stays in Voice Studio.
  useEffect(() => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(
        PROMO_DRAFT_KEY,
        serializePromoDraft({ product, formatId, hookStyle, setting, brandKitId, presenterId, prompt }),
      );
    } catch {
      // A mirror is a convenience; storage being unavailable changes nothing.
    }
  }, [product, formatId, hookStyle, setting, brandKitId, presenterId, prompt]);

  // F-U3-2: the Composer's settings are controlled from here. A format
  // choice writes its priced fields (ratio / duration / tier) into this
  // state — that write-back IS the re-price, with no remount; the user's
  // model/resolution picks survive a format change (the old remount
  // workaround reset them). Clearing the format restores the three
  // format-owned fields to the ad defaults, exactly what a remount with
  // no format used to produce for them.
  const [composerSettings, setComposerSettings] = useState<ComposerSettings>(() => ({
    ...defaultComposerSettings('ad'),
    ...promoComposerSettings(promoFormatById(formatId)),
  }));
  const clearFormat = () => {
    setFormatId(null);
    const defaults = defaultComposerSettings('ad');
    setComposerSettings((prev) => ({
      ...prev,
      ratio: defaults.ratio,
      durationSeconds: defaults.durationSeconds,
      stackedExtras: defaults.stackedExtras,
    }));
  };

  const format = promoFormatById(formatId);
  const brandKit = brandKitById(brandKits, brandKitId);
  // A selection that no longer resolves against the library (the draft
  // was deleted in Voice Studio) is no selection — never a stale ghost.
  const presenter = personas.find((p) => p.id === presenterId) ?? null;
  // A persona's references are asset ids; the thumbnail is the first
  // reference that resolves against the caller's real assets to a
  // minted URL. No resolvable reference → no thumbnail, never a
  // fabricated portrait.
  const personaThumbUrl = (persona: ChefPersona): string | null => {
    for (const id of persona.referenceAssetIds) {
      const found = assets.find((a) => a.id === id);
      if (found?.url) return found.url;
    }
    return null;
  };
  const presenterThumbUrl = presenter ? personaThumbUrl(presenter) : null;
  const pickable = pickableProductAssets(assets);
  const results = promoResultsFromJobs(jobs);
  const uploadsEnabled = Boolean(projectId && upload);
  const isEmpty = view === 'create' && !product && !format && prompt.trim() === '' && results.length === 0;

  const handleSelectFormat = (picked: PromoFormat) => {
    setFormatId(picked.id);
    setComposerSettings((prev) => ({ ...prev, ...promoComposerSettings(picked) }));
    setFormatModalOpen(false);
  };

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file || !upload) return;
    setUploadPhase('working');
    setUploadError(null);
    const outcome = await runProductUpload(file, (f) => upload(f as File));
    if (outcome.status === 'done') {
      setProduct(productFromAsset(outcome.asset));
      setProductPickerOpen(false);
      setUploadPhase('idle');
    } else {
      setUploadPhase('error');
      setUploadError(outcome.message);
    }
  };

  const chips: ComposerChip[] = [
    ...(product
      ? [
          {
            id: 'product',
            label: 'Dish / Product',
            value: product.filename,
            onPick: () => setProductPickerOpen(true),
            onClear: () => setProduct(null),
          } as ComposerChip,
        ]
      : []),
    {
      id: 'format',
      label: 'Format',
      value: format?.name,
      onPick: () => setFormatModalOpen(true),
      onClear: clearFormat,
    },
    {
      id: 'hook',
      label: 'Hook style',
      value: hookStyle ?? undefined,
      onPick: () => setHookPickerOpen((open) => !open),
      onClear: () => setHookStyle(null),
    },
    {
      id: 'setting',
      label: 'Setting',
      value: setting ?? undefined,
      onPick: () => setSettingPickerOpen((open) => !open),
      onClear: () => setSetting(null),
    },
    {
      id: 'presenter',
      label: 'Presenter',
      value: presenter?.name,
      onPick: () => setPresenterNoteOpen((open) => !open),
      onClear: presenter
        ? () => {
            setPresenterId(null);
            setPresenterListOpen(false);
          }
        : undefined,
    },
    {
      id: 'brand-kit',
      label: 'Brand kit',
      value: brandKit?.name,
      onPick: () => setBrandNoteOpen((open) => !open),
      onClear: () => setBrandKitId(null),
    },
  ];

  return (
    <section className="studio-promo" data-testid="promo-studio">
      <header className="studio-promo-head">
        <h1><span className="studio-title-accent">Promo</span> Studio</h1>
        <p>
          Turn any dish into an ad. Your dish and your presenter stay in their slots while you change formats,
          hooks and words — the slots are the brief&rsquo;s memory.
        </p>
      </header>

      {/* ------------------------------------------------ slots row */}
      <div className="studio-promo-slots" data-testid="promo-slots" aria-label="Your dish and presenter">
        <div className="studio-promo-slot" data-testid="promo-product-slot">
          <h2>Dish / Product</h2>
          {product ? (
            <div className="studio-promo-slot-card" data-testid="promo-product-selected">
              {product.url && <img src={product.url} alt={product.filename} />}
              <span className="studio-promo-slot-name">{product.filename}</span>
              <button type="button" data-testid="promo-product-replace" onClick={() => setProductPickerOpen(true)}>
                Replace
              </button>
              <button
                type="button"
                data-testid="promo-product-remove"
                onClick={() => {
                  setProduct(null);
                  setProductPickerOpen(true);
                }}
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="studio-promo-slot-empty" data-testid="promo-product-empty-slot">
              <p>Add your dish — a photo of the plate or the product you are selling.</p>
              <button type="button" data-testid="promo-product-open-picker" onClick={() => setProductPickerOpen(true)}>
                Pick or upload a dish
              </button>
            </div>
          )}
        </div>

        <div className="studio-promo-slot" data-testid="promo-presenter-slot">
          <h2>Presenter</h2>
          {personas.length === 0 ? (
            <div className="studio-promo-slot-empty" data-testid="promo-presenter-empty">
              <p>
                No presenter yet. Presenters are your saved Chef Personas ({PROMO_PERSONA_TOOL}) — they are
                created in Voice Studio, with an own-likeness consent gate before any training. Until one
                exists this slot stays empty rather than inventing a person.
              </p>
              <a href="/studio/voice" data-testid="promo-presenter-manage">
                Manage presenters
              </a>
              <p className="studio-promo-presenter-reason" role="note">
                There is nothing to pick for one plain reason: no persona exists in your library yet, and
                this screen will not fabricate one. Create one in Voice Studio and it will appear here.
              </p>
            </div>
          ) : presenter && !presenterListOpen ? (
            <>
              <div className="studio-promo-slot-card" data-testid="promo-presenter-selected">
                {presenterThumbUrl && <img src={presenterThumbUrl} alt={presenter.name} />}
                <span className="studio-promo-slot-name">{presenter.name}</span>
                <span className="studio-promo-presenter-status">Draft — training not configured</span>
                <button
                  type="button"
                  data-testid="promo-presenter-change"
                  onClick={() => setPresenterListOpen(true)}
                >
                  Change
                </button>
                <button
                  type="button"
                  data-testid="promo-presenter-remove"
                  onClick={() => setPresenterId(null)}
                >
                  Remove
                </button>
              </div>
              <p className="studio-promo-presenter-reason" role="note">
                Recorded on this brief as the presenter — a draft persona whose training has not run:
                training goes through {PROMO_PERSONA_TOOL}, whose engine is not configured yet, so this
                persona cannot present in an ad today and Generate stays off. Nothing will be charged.
              </p>
            </>
          ) : (
            <div className="studio-promo-presenter-list" data-testid="promo-presenter-list">
              <p>
                Your Chef Persona drafts from Voice Studio, saved on this device. Pick one and it is
                recorded on this brief — as a draft: training is not configured yet ({PROMO_PERSONA_TOOL}),
                so a picked presenter cannot present until its training has run over there.
              </p>
              <ul className="studio-promo-presenter-grid">
                {personas.map((persona) => {
                  const thumbUrl = personaThumbUrl(persona);
                  return (
                    <li key={persona.id}>
                      <button
                        type="button"
                        data-testid={`promo-presenter-pick-${persona.id}`}
                        aria-pressed={presenterId === persona.id}
                        onClick={() => {
                          setPresenterId(persona.id);
                          setPresenterListOpen(false);
                        }}
                      >
                        {thumbUrl && <img src={thumbUrl} alt={persona.name} />}
                        <span>{persona.name}</span>
                        <span>
                          {persona.presenterType} ·{' '}
                          <span className="studio-promo-presenter-status">Draft — training not configured</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <a href="/studio/voice" data-testid="promo-presenter-manage">
                Manage presenters
              </a>
              {presenter && (
                <button
                  type="button"
                  data-testid="promo-presenter-close-list"
                  onClick={() => setPresenterListOpen(false)}
                >
                  Keep {presenter.name}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --------------------------------------- product picker panel */}
      {productPickerOpen && (
        <div className="studio-promo-product-panel" data-testid="promo-product-panel" aria-label="Dish and product library">
          <h3>Your dishes &amp; products</h3>
          <p>
            Saved dishes are reusable across every ad — the same library {PROMO_ASSETS_TOOL} lists. Or upload
            a new photo and it joins the library for real.
          </p>

          <div
            className="studio-promo-dropzone"
            data-testid="promo-product-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (uploadsEnabled) void handleFiles(e.dataTransfer.files);
            }}
          >
            <p>Drop a dish photo here, or pick one — it uploads to your library and fills the slot.</p>
            <label>
              Choose a photo
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                data-testid="promo-product-file-input"
                disabled={!uploadsEnabled}
                onChange={(e) => {
                  if (e.target.files) void handleFiles(e.target.files);
                }}
              />
            </label>
          </div>

          {!uploadsEnabled && (
            <p className="studio-promo-upload-off" data-testid="promo-product-upload-unavailable" role="note">
              Uploads are saved into a project.
              {projectName
                ? ' This surface was opened without an upload connection, so picking a file is off for now.'
                : ' Open Promo Studio with a project chosen, or create one first — '}{' '}
              {!projectName && <a href="/projects">go to Projects</a>}
            </p>
          )}

          {uploadPhase !== 'idle' && (
            <p className="studio-promo-upload-state" data-testid="promo-product-upload-state" role="status">
              {productUploadPhaseLabel(uploadPhase)}
            </p>
          )}
          {uploadPhase === 'error' && uploadError && (
            <p className="studio-promo-upload-error" data-testid="promo-product-upload-error" role="alert">
              {uploadError}
            </p>
          )}

          {assetsState === 'loading' && (
            <div className="studio-promo-skeletons" data-testid="promo-product-loading" aria-label="Loading your dishes">
              <span className="studio-skeleton-tile" />
              <span className="studio-skeleton-tile" />
              <span className="studio-skeleton-tile" />
            </div>
          )}
          {assetsState === 'error' && (
            <div className="studio-promo-product-error" data-testid="promo-product-error" role="alert">
              <p>{assetsError ?? 'Your dishes could not be loaded.'}</p>
              <button type="button" onClick={() => onRetryAssets?.()}>
                Retry
              </button>
            </div>
          )}
          {assetsState === 'ready' && pickable.length === 0 && (
            <p data-testid="promo-product-empty">
              No dish added yet — upload a photo above, or add one by link in Link-to-Ad once that tool
              connects. Nothing saved here means nothing to pick; this panel will not invent a dish.
            </p>
          )}
          {assetsState === 'ready' && pickable.length > 0 && (
            <ul className="studio-promo-asset-grid" aria-label="Your dish photos">
              {pickable.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    data-testid={`promo-product-pick-${asset.id}`}
                    aria-pressed={product?.assetId === asset.id}
                    onClick={() => {
                      setProduct(productFromAsset(asset));
                      setProductPickerOpen(false);
                    }}
                  >
                    {asset.url && <img src={asset.url} alt={asset.filename} />}
                    <span>{asset.filename}</span>
                    <span>Fill the Dish / Product slot</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" data-testid="promo-product-close-panel" onClick={() => setProductPickerOpen(false)}>
            Close panel
          </button>
        </div>
      )}

      {/* ------------------------------------------------ brand kits */}
      <section className="studio-promo-brandkit" data-testid="promo-brandkit" aria-label="Brand kit">
        <h2>Brand kit</h2>
        {brandKitsState === 'loading' && (
          <p data-testid="promo-brandkit-loading">Loading your brand kits…</p>
        )}
        {brandKitsState === 'error' && (
          <div className="studio-promo-brandkit-error" data-testid="promo-brandkit-error" role="alert">
            <p>{brandKitsError ?? 'Your brand kits could not be loaded.'}</p>
            <button type="button" onClick={() => onRetryBrandKits?.()}>
              Retry
            </button>
          </div>
        )}
        {brandKitsState === 'ready' && brandKits.length === 0 && (
          <p data-testid="promo-brandkit-empty">
            No brand kit yet — a kit keeps your colours, fonts and logo rules in one place so every ad matches.{' '}
            <a href="/brand-kit">Create one in Brand Kit</a> and it will be selectable here. This brief will
            not invent one.
          </p>
        )}
        {brandKitsState === 'ready' && brandKits.length > 0 && (
          <>
            <ul className="studio-promo-brandkit-list">
              {brandKits.map((kit) => (
                <li key={kit.id}>
                  <button
                    type="button"
                    data-testid={`promo-brandkit-pick-${kit.id}`}
                    aria-pressed={brandKitId === kit.id}
                    onClick={() => setBrandKitId(kit.id)}
                  >
                    {kit.name}
                    {kit.isDefault ? ' · default' : ''}
                  </button>
                </li>
              ))}
            </ul>
            {brandKit && (
              <div className="studio-promo-brandkit-selected" data-testid="promo-brandkit-selected">
                <p>
                  <strong>{brandKit.name}</strong> rides on this brief — its colours come from your saved kit
                  ({PROMO_BRAND_KIT_TOOL}), and {PROMO_BRAND_APPLY_TOOL} checks the finished ad against them.
                </p>
                <ul className="studio-promo-swatches" aria-label={`${brandKit.name} colours`}>
                  {brandKitSwatches(brandKit).map((swatch) => (
                    <li key={swatch.role} data-testid={`promo-brandkit-swatch-${swatch.role}`}>
                      <span className="studio-promo-swatch" style={{ backgroundColor: swatch.hex }} />
                      {swatch.role} · {swatch.hex}
                    </li>
                  ))}
                </ul>
                {brandKit.fonts && (
                  <p>
                    Headings in {brandKit.fonts.heading}; body text in {brandKit.fonts.body}.
                  </p>
                )}
                <button type="button" data-testid="promo-brandkit-clear" onClick={() => setBrandKitId(null)}>
                  Drop the brand kit from this brief
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <div className="studio-promo-layout">
        {/* ------------------------------------------------ centre */}
        <div className="studio-promo-centre" data-testid="promo-composer-region">
          <div className="studio-promo-tabs" role="tablist" aria-label="Promo tools">
            <button
              type="button"
              role="tab"
              data-testid="promo-tab-create"
              aria-selected={view === 'create'}
              onClick={() => setView('create')}
            >
              Create Ad
            </button>
            <button
              type="button"
              role="tab"
              data-testid="promo-tab-link"
              aria-selected={view === 'link'}
              onClick={() => setView('link')}
            >
              Link-to-Ad
            </button>
          </div>

          <JobStrip jobs={jobs} />

          {view === 'create' && (
            <div data-testid="promo-create-panel">
              {isEmpty && (
                <div className="studio-promo-empty" data-testid="promo-empty-state">
                  <h2>Start from a format</h2>
                  <p>
                    Fill the dish slot, pick a format, describe what happens in the ad. The price sits on the
                    Generate button and moves the moment your choices do.
                  </p>
                </div>
              )}

              <div className="studio-promo-format-cards" data-testid="promo-format-cards" aria-label="Generate across formats">
                {PROMO_FORMATS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className="studio-promo-format-quick"
                    data-testid={`promo-format-quick-${f.id}`}
                    aria-pressed={formatId === f.id}
                    onClick={() => handleSelectFormat(f)}
                  >
                    <strong>{f.name}</strong>
                    <span>{f.description}</span>
                    <span>
                      {f.ratio} · {f.durationSeconds}s · for {f.platform}
                    </span>
                  </button>
                ))}
              </div>

              {hookPickerOpen && (
                <div className="studio-promo-picker" data-testid="promo-hook-picker" aria-label="Hook styles">
                  {PROMO_HOOK_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      data-testid={`promo-hook-${style.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      aria-pressed={hookStyle === style}
                      onClick={() => {
                        setHookStyle(style);
                        setHookPickerOpen(false);
                      }}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              )}

              {settingPickerOpen && (
                <div className="studio-promo-picker" data-testid="promo-setting-picker" aria-label="Settings">
                  {PROMO_SETTING_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      data-testid={`promo-setting-${option.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      aria-pressed={setting === option}
                      onClick={() => {
                        setSetting(option);
                        setSettingPickerOpen(false);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}

              {presenterNoteOpen && (
                <p className="studio-promo-presenter-note" data-testid="promo-presenter-chip-note" role="note">
                  {presenter ? (
                    <>
                      The Presenter chip and the slot above are the same choice: {presenter.name} is
                      recorded on this brief as a draft persona — training runs through{' '}
                      {PROMO_PERSONA_TOOL} and is not configured yet, so this presenter cannot appear in
                      an ad today and Generate stays off. Nothing will be charged.
                    </>
                  ) : personas.length > 0 ? (
                    <>
                      The Presenter chip and the slot above are the same choice: a saved Chef Persona,
                      created through {PROMO_PERSONA_TOOL}. Your library holds {personas.length}{' '}
                      draft{personas.length === 1 ? '' : 's'} — pick one in the slot above and it is
                      recorded here, with its draft status stated.
                    </>
                  ) : (
                    <>
                      The Presenter chip and the slot above are the same choice: a saved Chef Persona, created
                      through {PROMO_PERSONA_TOOL}. None exist yet, so the chip stays empty rather than casting
                      an invented face.
                    </>
                  )}
                </p>
              )}

              {brandNoteOpen && brandKit && (
                <p className="studio-promo-brand-note" data-testid="promo-brand-note" role="note">
                  Noted: {brandKit.name} supplies this ad&rsquo;s colours and logo rules through{' '}
                  {PROMO_BRAND_KIT_TOOL}; the choice is recorded on the brief and rides to {PROMO_AD_TOOL} as
                  its brand kit choice when generation connects.
                </p>
              )}

              {/*
                F-U3-2 landed: the Composer's settings are controlled
                from this screen (composerSettings above), so a format
                change re-prices Generate by writing the format's fields
                into that state — no remount, and the brief (held here)
                plus the user's model/resolution picks survive it.
              */}
              <Composer
                kind="ad"
                chips={chips}
                placeholder="Describe what happens in the ad… @ your dish or presenter, / your brand kit"
                initialPrompt={prompt}
                onPromptChange={setPrompt}
                settings={composerSettings}
                onSettingsChange={setComposerSettings}
                generation="not-configured"
                notConfiguredReason={`Ad generation is not connected yet — the ${PROMO_AD_TOOL} tool has no provider configured (NOT_CONFIGURED). Your dish, slots and brand kit are real; nothing will be charged.`}
              />
              <p className="studio-promo-tool-note" role="note">
                The slots ride on {PROMO_AD_TOOL} as its dish and presenter choices; the format chip is the
                same choice the format modal makes — they are one state, never two.
              </p>
            </div>
          )}

          {view === 'link' && (
            <div className="studio-promo-link" data-testid="promo-link-panel">
              <h2>Link-to-Ad</h2>
              <p>
                Drop a menu or product link — get an ad ready for Reels, Shorts and feeds. Or skip the link:
                your slotted dish{product ? ` (${product.filename})` : ''} is already a saved product this
                flow can start from.
              </p>
              <label>
                Menu or product link
                <input
                  type="url"
                  data-testid="promo-link-url"
                  placeholder="https://your-menu-or-product-page.example/"
                  value={linkUrl}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    setLinkOutcome(null);
                  }}
                />
              </label>

              <div className="studio-promo-link-styles" aria-label="Ad style">
                {LINK_AD_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    data-testid={`promo-link-style-${style.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                    aria-pressed={linkStyle === style}
                    onClick={() => setLinkStyle(style)}
                  >
                    {style}
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="studio-promo-link-build"
                data-testid="promo-link-build"
                disabled={linkUrl.trim() === ''}
                onClick={() => setLinkOutcome(submitLinkToAd(linkUrl))}
              >
                Build from link
              </button>

              {linkOutcome?.status === 'invalid' && (
                <p className="studio-promo-link-error" data-testid="promo-link-error" role="alert">
                  {linkOutcome.message}
                </p>
              )}
              {linkOutcome?.status === 'not-configured' && (
                <p className="studio-promo-link-notconfigured" data-testid="promo-link-notconfigured" role="note">
                  {linkOutcome.message}
                  {linkStyle ? ` Style noted for when it connects: ${linkStyle}.` : ''}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ------------------------------------------------ results */}
        <aside className="studio-promo-results" data-testid="promo-results-rail" aria-label="Results">
          <h2>Results</h2>
          {results.length === 0 ? (
            <p data-testid="promo-results-empty">
              No ads yet. Ad generation is not connected, so this rail stays honestly empty until a provider
              lands — no placeholder ads, ever. Finished ads will appear here and in Assets with their
              format, slots and cost attached.
            </p>
          ) : (
            <ul className="studio-promo-results-grid">
              {results.map((card) => (
                <li key={card.outputId} data-testid={`promo-result-${card.outputId}`}>
                  {card.url && <video src={card.url} controls preload="metadata" />}
                  <span>{card.label}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="studio-promo-vary-note" data-testid="promo-vary-note" role="note">
            Variations — swap the dish, hook, presenter or CTA on a finished ad — ride on {PROMO_VARY_TOOL}.
            They need a finished ad to vary, and generation is not connected yet, so there is nothing to
            vary today; the panel arrives with the first real ad.
          </p>
        </aside>
      </div>

      <PromoFormatModal
        open={formatModalOpen}
        selectedId={formatId}
        onSelect={handleSelectFormat}
        onClose={() => setFormatModalOpen(false)}
      />
    </section>
  );
};

export default PromoStudio;
