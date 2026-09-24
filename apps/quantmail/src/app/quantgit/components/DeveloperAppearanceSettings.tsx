'use client';

// ============================================================================
// QuantGit — Developer Appearance & Accessibility Settings (Screens 39–52, 81–84)
// ============================================================================

import React, { useState } from 'react';

export interface DeveloperAppearanceSettingsProps {
  onSave?: (settings: any) => void;
}

export const DeveloperAppearanceSettings: React.FC<DeveloperAppearanceSettingsProps> = ({
  onSave,
}) => {
  const [themeMode, setThemeMode] = useState<'system' | 'light' | 'dark'>('system');
  const [activeAccent, setActiveAccent] = useState<number>(3); // Dark default
  const [increaseContrast, setIncreaseContrast] = useState(false);
  const [selectedEmojiTone, setSelectedEmojiTone] = useState(0);
  const [tabSize, setTabSize] = useState<number>(4);
  const [useMonospaceMarkdown, setUseMonospaceMarkdown] = useState(true);
  const [enableCharacterKeys, setEnableCharacterKeys] = useState(true);
  const [showHovercards, setShowHovercards] = useState(true);
  const [motionPreference, setMotionPreference] = useState<'sync' | 'enabled' | 'disabled'>('sync');

  // Feature previews state
  const [featurePreviews, setFeaturePreviews] = useState<Record<string, boolean>>({
    colorblind: false,
    commandPalette: true,
    customInstructions: true,
    jupyterDiffs: true,
    slashCommands: true,
  });

  const skinTones = ['👋', '👋🏻', '👋🏼', '👋🏽', '👋🏾', '👋🏿'];
  const accents = [
    { id: 0, name: 'Light default', bg: '#ffffff', border: '#d0d7de' },
    { id: 1, name: 'Light colorblind', bg: '#f6f8fa', border: '#0969da' },
    { id: 2, name: 'Light high contrast', bg: '#ffffff', border: '#000000' },
    { id: 3, name: 'Dark default', bg: '#0d1117', border: '#30363d' },
    { id: 4, name: 'Dark dimmed', bg: '#22272e', border: '#444c56' },
    { id: 5, name: 'Dark high contrast', bg: '#010409', border: '#ffffff' },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto space-y-8 text-xs text-[#E6EDF3] py-4">
      {/* Header */}
      <div className="border-b border-[#30363D] pb-4">
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
              onClick={() => setThemeMode(mode)}
              className={`px-4 py-2 rounded-lg font-medium capitalize border transition-all ${
                themeMode === mode
                  ? 'bg-[#21262D] border-[#58A6FF] text-[#58A6FF] shadow-sm'
                  : 'bg-[#161B22] border-[#30363D] text-[#8D96A0] hover:text-[#E6EDF3]'
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
                onClick={() => setActiveAccent(accent.id)}
                style={{ backgroundColor: accent.bg, borderColor: accent.border }}
                className={`w-8 h-8 rounded-full border-2 transition-transform ${
                  activeAccent === accent.id
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
      <div className="pt-6 border-t border-[#30363D] space-y-4">
        <h3 className="text-sm font-semibold text-[#E6EDF3]">Editor settings</h3>

        {/* Tab Size Preference */}
        <div className="space-y-1.5">
          <label className="font-semibold text-xs text-[#E6EDF3] block">Tab size preference</label>
          <p className="text-[#8D96A0]">
            Choose the number of spaces a tab is equal to when rendering code.
          </p>
          <select
            value={tabSize}
            onChange={(e) => setTabSize(Number(e.target.value))}
            className="bg-[#161B22] border border-[#30363D] rounded-md py-1.5 px-3 text-xs text-[#E6EDF3] outline-none"
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
              checked={useMonospaceMarkdown}
              onChange={(e) => setUseMonospaceMarkdown(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded bg-[#161B22] border-[#30363D] text-[#58A6FF] focus:ring-0"
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
                onClick={() => setSelectedEmojiTone(idx)}
                className={`p-2 rounded-lg text-base border transition-all ${
                  selectedEmojiTone === idx
                    ? 'bg-[#21262D] border-[#58A6FF] scale-110'
                    : 'bg-[#161B22] border-[#30363D] hover:bg-[#21262D]'
                }`}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Section 3: Keyboard Shortcuts & Hovercards (Screens 39–43) */}
      <div className="pt-6 border-t border-[#30363D] space-y-4">
        <h3 className="text-sm font-semibold text-[#E6EDF3]">Accessibility & Navigation</h3>

        {/* Character Keys */}
        <label className="flex items-start gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={enableCharacterKeys}
            onChange={(e) => setEnableCharacterKeys(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded bg-[#161B22] border-[#30363D] text-[#58A6FF] focus:ring-0"
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
            checked={showHovercards}
            onChange={(e) => setShowHovercards(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded bg-[#161B22] border-[#30363D] text-[#58A6FF] focus:ring-0"
          />
          <div>
            <span className="font-semibold text-xs text-[#E6EDF3]">Show hovercards</span>
            <p className="text-[#8D96A0] pt-0.5">
              Enable previewing link content via mouse hover or keyboard focus before navigation.
            </p>
          </div>
        </label>
      </div>

      {/* Section 4: Feature Previews (Screen 48) */}
      <div className="pt-6 border-t border-[#30363D] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[#E6EDF3]">Feature Preview</h3>
            <p className="text-[#8D96A0]">Get early access to new features and give feedback.</p>
          </div>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
            Beta Labs
          </span>
        </div>

        <div className="divide-y divide-[#21262D] rounded-xl bg-[#161B22] border border-[#30363D] overflow-hidden">
          {[
            {
              id: 'commandPalette',
              name: 'Command Palette (Cmd+K / Ctrl+K)',
              desc: 'Fast global command center across all ecosystem entities',
            },
            {
              id: 'jupyterDiffs',
              name: 'Rich Jupyter Notebook Diffs',
              desc: 'Rendered cell-by-cell visual diffs for .ipynb data science files',
            },
            {
              id: 'slashCommands',
              name: 'Slash Commands (/plan, /goal, /debug)',
              desc: 'Instant developer agent macros inside issue and PR comments',
            },
            {
              id: 'colorblind',
              name: 'Colorblind accessible diff themes',
              desc: 'Enhanced contrast red-green alternate diff visualization',
            },
          ].map((feat) => (
            <div key={feat.id} className="p-3.5 flex items-center justify-between gap-4">
              <div>
                <h5 className="font-semibold text-xs text-[#E6EDF3]">{feat.name}</h5>
                <p className="text-[11px] text-[#8D96A0]">{feat.desc}</p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setFeaturePreviews({
                    ...featurePreviews,
                    [feat.id]: !featurePreviews[feat.id],
                  })
                }
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  featurePreviews[feat.id] ? 'bg-[#238636]' : 'bg-[#30363D]'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    featurePreviews[feat.id] ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
