'use client';

import React from 'react';

export interface SettingsTabProps {
  settingsName: string;
  setSettingsName: (val: string) => void;
  settingsDesc: string;
  setSettingsDesc: (val: string) => void;
  settingsBranch: string;
  setSettingsBranch: (val: string) => void;
  settingsVisibility: 'public' | 'private';
  setSettingsVisibility: (val: 'public' | 'private') => void;
  isSavingSettings: boolean;
  handleSaveSettings: () => void;
  handleDeleteRepo: () => void;
}

export function SettingsTab({
  settingsName,
  setSettingsName,
  settingsDesc,
  setSettingsDesc,
  settingsBranch,
  setSettingsBranch,
  settingsVisibility,
  setSettingsVisibility,
  isSavingSettings,
  handleSaveSettings,
  handleDeleteRepo,
}: SettingsTabProps) {
  return (
    <div className="max-w-2xl space-y-6 text-xs">
      <div className="p-4 rounded bg-[#161B22] border border-[#30363D] space-y-4">
        <h4 className="font-bold text-white text-sm">General Repository Settings</h4>
        <div className="space-y-1.5">
          <label className="text-[#7D8590] font-semibold">Repository name</label>
          <input
            type="text"
            value={settingsName}
            onChange={(e) => setSettingsName(e.target.value)}
            className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-white focus:outline-none focus:border-[#58A6FF]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[#7D8590] font-semibold">Description</label>
          <textarea
            value={settingsDesc}
            onChange={(e) => setSettingsDesc(e.target.value)}
            rows={2}
            className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-white focus:outline-none focus:border-[#58A6FF]"
            placeholder="Short description of this repository..."
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[#7D8590] font-semibold">Default branch</label>
          <input
            type="text"
            value={settingsBranch}
            onChange={(e) => setSettingsBranch(e.target.value)}
            className="w-full bg-[#0D1117] border border-[#30363D] rounded px-3 py-1.5 text-white focus:outline-none focus:border-[#58A6FF]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[#7D8590] font-semibold">Visibility</label>
          <select
            value={settingsVisibility}
            onChange={(e) => setSettingsVisibility(e.target.value as 'public' | 'private')}
            className="w-full bg-[#0D1117] border border-[#30363D] rounded px-2.5 py-1.5 text-white focus:outline-none focus:border-[#58A6FF]"
          >
            <option value="public">Public (Anyone on the internet can see this repository)</option>
            <option value="private">
              Private (You choose who can see and commit to this repository)
            </option>
          </select>
        </div>
        <button
          type="button"
          disabled={isSavingSettings}
          onClick={handleSaveSettings}
          className="px-4 py-1.5 rounded bg-[#238636] hover:bg-[#2EA043] font-bold text-white transition-colors shadow-sm disabled:opacity-50"
        >
          {isSavingSettings ? 'Saving changes...' : 'Save changes'}
        </button>
      </div>

      <div className="p-4 rounded bg-[#161B22] border border-[#DA3633] space-y-3">
        <h4 className="font-bold text-[#F85149] text-sm">Danger Zone</h4>
        <p className="text-[#7D8590]">
          Once deleted, this repository will be archived with a tombstone timestamp.
        </p>
        <button
          type="button"
          onClick={handleDeleteRepo}
          className="px-3.5 py-1.5 rounded border border-[#DA3633] text-[#F85149] font-bold hover:bg-[#DA3633] hover:text-white transition-colors"
        >
          Delete this repository
        </button>
      </div>
    </div>
  );
}
