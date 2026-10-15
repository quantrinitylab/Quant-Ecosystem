'use client';

// ============================================================================
// QuantGit — Developer Appearance & Accessibility Settings (Screens 39–52, 81–84)
// ============================================================================
// Persistence: settings are stored in localStorage under DEV_APPEARANCE_KEY
// (device-local). State initializes to defaults for SSR/hydration safety and
// is rehydrated from localStorage on mount. The Save button writes the full
// settings object and then calls onSave — the page's saved-toast only fires on
// a real save, never on toggle alone.
// ============================================================================

import React, { useEffect, useState } from 'react';

export const DEV_APPEARANCE_STORAGE_KEY = 'quantgit.devAppearance.v1';

export interface DevAppearanceSettings {
  themeMode: 'system' | 'light' | 'dark';
  activeAccent: number;
  increaseContrast: boolean;
  selectedEmojiTone: number;
  tabSize: number;
  useMonospaceMarkdown: boolean;
  enableCharacterKeys: boolean;
  showHovercards: boolean;
  motionPreference: 'sync' | 'enabled' | 'disabled';
}

const DEFAULT_SETTINGS: DevAppearanceSettings = {
  themeMode: 'system',
  activeAccent: 3, // Dark default
  increaseContrast: false,
  selectedEmojiTone: 0,
  tabSize: 4,
  useMonospaceMarkdown: true,
  enableCharacterKeys: true,
  showHovercards: true,
  motionPreference: 'sync',
};

function loadSettings(): DevAppearanceSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(DEV_APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export interface DeveloperAppearanceSettingsProps {
  onSave?: (settings: DevAppearanceSettings) => void;
}

export const DeveloperAppearanceSettings: React.FC<DeveloperAppearanceSettingsProps> = ({
  onSave,
}) => {
  const [settings, setSettings] = useState<DevAppearanceSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Hydration-safe rehydrate: defaults render on the server, localStorage wins on the client.
  useEffect(() => {
    setSettings(loadSettings());
    setLoaded(true);
  }, []);

  const update = <K extends keyof DevAppearanceSettings>(key: K, value: DevAppearanceSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
  };

  const handleSave = () => {
    try {
      window.localStorage.setItem(DEV_APPEARANCE_STORAGE_KEY, JSON.stringify(settings));
      setSaveError(null);
      onSave?.(settings);
    } catch {
      setSaveError('Could not save settings on this device.');
    }
  };

  const skinTones = ['👋', '👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿'];
  const accents = [
    { id: 0, name: 'Light default', bg: '#ffffff', border: '#d0d7de' },
    { id: 1, name: 'Light colorblind', bg: '#f6f8fa', border: '#0969da' },
    { id: 2, name: 'Light high contrast', bg: '#ffffff', border: 'var(--quant-background)' },
    { id: 3, name: 'Dark default', bg: '#0d1117', border: '#30363d' },
    { id: 4, name: 'Dark dimmed', bg: '#22272e', border: '#444c56' },
    { id: 5, name: 'Dark high contrast', bg: '#010409', border: '#ffffff' },
  ];

  // Roadmap items only: none of these ship yet, so there is nothing to toggle.
  const roadmapFeatures = [
    { id: 'commandPalette', name: 'Command Palette (Cmd+K / Ctrl+K)' },
    { id: 'jupyterDiffs', name: 'Rich Jupyter Notebook Diffs' },
    { id: 'slashCommands', name: 'Slash Commands (/plan, /goal, /debug)' },
    { id: 'colorblind', name: 'Colorblind accessible diff themes' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8 text-xs text-[#E6EDF3] py-4">
      {/* Header */}
 <div className="pb-4">
        <h2 className="text-xl font-bold text-[#E6EDF3]">Appearance & Accessibility</h2>
        <p className="text-[#8D96A0] pt-1">
          Customize how QuantGit looks and responds to your workflow.
        </p>
      </div>

      {/* Section 1: Theme Preferences (Screens 45–47) */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-[#E6EDF3]">Theme preferences</h3>
        <p className="text-[#8D96A0]">
          Choose how Quant looks to you. Select a single theme, or sync with your system and
          automatically switch between day and night themes.
        </p>

        {/* Theme mode selector */}
        <div className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => update('themeMode', mode)}
              className={`px-4 py-2 rounded-lg font-medium capitalize border transition-all ${
                settings.themeMode === mode
                  ? 'bg-[#21262D] border-[#58A6FF] text-[#58A6FF] shadow-sm'
                  : 'bg-[var(--quant-surface-elevated)] border-[#30363D] text-[#8D96A0] hover:text-[#E6EDF3]'
              }`}
            >
              {mode === 'system' ? 'Sync with system' : `${mode} mode`}
            </button>
          ))}
        </div>

        {/* Accent Color Swatches */}
        <div className="pt-2">
          <label className="text-[11px] font-medium text-[#8D96A0] block mb-2">
            Color theme palette
          </label>
          <div className="flex items-center gap-3">
            {accents.map((accent) => (
              <button
                key={accent.id}
                onClick={() => update('activeAccent', accent.id)}
                style={{ backgroundColor: accent.bg, borderColor: accent.border }}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${
                  settings.activeAccent === accent.id
                    ? 'ring-2 ring-[#58A6FF] scale-110'
                    : 'opacity-80 hover:opacity-100'
                }`}
                title={accent.name}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Section 2: Editor Settings (Screens 44–45) */}
 <div className="pt-6 space-y-4">
        <h3 className="text-sm font-semibold text-[#E6EDF3]">Editor settings</h3>

        {/* Tab Size Preference */}
        <div className="space-y-1.5">
          <label htmlFor="dev-tab-size" className="font-semibold text-xs text-[#E6EDF3] block">Tab size preference</label>
          <p className="text-[#8D96A0]">
            Choose the number of spaces a tab is equal to when rendering code.
          </p>
          <select
            id="dev-tab-size" value={settings.tabSize}
            onChange={(e) => update('tabSize', Number(e.target.value))}
            className="bg-[var(--quant-surface-elevated)] border border-[#30363D] rounded-md py-1.5 px-3 text-xs text-[#E6EDF3] outline-none"
          >
            <option value={2}>2 spaces</option>
            <option value={4}>4 spaces (Default)</option>
            <option value={8}>8 spaces</option>
          </select>
        </div>

        {/* Monospace Markdown Toggle */}
        <div className="pt-2">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.useMonospaceMarkdown}
              onChange={(e) => update('useMonospaceMarkdown', e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded bg-[var(--quant-surface-elevated)] border-[#30363D] text-[#58A6FF] focus:ring-0"
            />
            <div>
              <span className="font-semibold text-xs text-[#E6EDF3]">
                Use a fixed-width (monospace) font when editing Markdown
              </span>
              <p className="text-[#8D96A0] pt-0.5">
                Font preference for plain text editors that support Markdown styling (PRs, issues,
                comments).
              </p>
            </div>
          </label>
        </div>

        {/* Emoji Skin Tone Preference */}
        <div className="pt-2 space-y-1.5">
          <label className="font-semibold text-xs text-[#E6EDF3] block">
            Emoji skin tone preference
          </label>
          <div className="flex items-center gap-2">
            {skinTones.map((tone, idx) => (
              <button
                key={idx}
                onClick={() => update('selectedEmojiTone', idx)}
                className={`p-2 rounded-lg text-base border transition-all ${
                  settings.selectedEmojiTone === idx
                    ? 'bg-[#21262D] border-[#58A6FF] scale-110'
                    : 'bg-[var(--quant-surface-elevated)] border-[#30363D] hover:bg-[#21262D]'
                }`}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3: Keyboard Shortcuts & Hovercards (Screens 39–43) */}
 <div className="pt-6 space-y-4">
        <h3 className="text-sm font-semibold text-[#E6EDF3]">Accessibility & Navigation</h3>

        {/* Character Keys */}
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.enableCharacterKeys}
            onChange={(e) => update('enableCharacterKeys', e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded bg-[var(--quant-surface-elevated)] border-[#30363D] text-[#58A6FF] focus:ring-0"
          />
          <div>
            <span className="font-semibold text-xs text-[#E6EDF3]">Character keys</span>
            <p className="text-[#8D96A0] pt-0.5">
              Enable GitHub shortcuts that don't use modifier keys in their activation (e.g.{' '}
              <span className="font-mono px-1 bg-[#21262D] rounded">g n</span> to navigate
              notifications, or <span className="font-mono px-1 bg-[#21262D] rounded">?</span> to
              view context relevant shortcuts).
            </p>
          </div>
        </label>

        {/* Hovercards */}
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.showHovercards}
            onChange={(e) => update('showHovercards', e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded bg-[var(--quant-surface-elevated)] border-[#30363D] text-[#58A6FF] focus:ring-0"
          />
          <div>
            <span className="font-semibold text-xs text-[#E6EDF3]">Show hovercards</span>
            <p className="text-[#8D96A0] pt-0.5">
              Enable previewing link content via mouse hover or keyboard focus before navigation.
            </p>
          </div>
        </label>
      </div>

      {/* Section 4: Feature Roadmap (Screen 48) — honest labeling: planned, not available. */}
 <div className="pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#E6EDF3]">Feature Roadmap</h3>
            <p className="text-[#8D96A0]">
              Planned features — not available yet. Nothing to enable here.
            </p>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Planned
          </span>
        </div>

 <div className="rounded-xl bg-[var(--quant-surface-elevated)] border border-[#30363D] overflow-hidden">
          {roadmapFeatures.map((feat) => (
            <div key={feat.id} className="p-3.5 flex items-center justify-between gap-4">
              <h5 className="font-semibold text-xs text-[#E6EDF3]">{feat.name}</h5>
              <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#30363D]/60 text-[#8D96A0] border border-[#30363D]">
                Planned — not available
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Save — real save path: writes localStorage, then notifies the parent. */}
 <div className="pt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          className="px-4 py-1.5 rounded-md bg-[var(--app-accent)] hover:bg-[var(--app-accent-hover)] text-black font-bold transition-colors"
        >
          Save Settings
        </button>
        <p className="text-[11px] text-[#8D96A0]">
          {loaded ? 'Saved on this device only.' : 'Loading saved settings…'}
        </p>
        {saveError && <p className="text-[11px] text-[#F85149]">{saveError}</p>}
      </div>
    </div>
  );
};
