'use client';

import React from 'react';

export function InsightsTab() {
  return (
    <div className="space-y-6 text-xs">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded bg-[#161B22] border border-[#30363D]">
          <h4 className="font-bold text-white text-sm">48 Commits</h4>
          <p className="text-[#7D8590] text-[11px]">Pushed to main in the last week</p>
        </div>
        <div className="p-4 rounded bg-[#161B22] border border-[#30363D]">
          <h4 className="font-bold text-white text-sm">2 Pull Requests</h4>
          <p className="text-[#7D8590] text-[11px]">Merged without regression</p>
        </div>
        <div className="p-4 rounded bg-[#161B22] border border-[#30363D]">
          <h4 className="font-bold text-white text-sm">100% CI Health</h4>
          <p className="text-[#7D8590] text-[11px]">11 GitHub Actions workflows green</p>
        </div>
      </div>

      <div className="p-4 rounded bg-[#161B22] border border-[#30363D] space-y-3">
        <h4 className="font-bold text-white">Commit Frequency & Activity</h4>
        <div className="h-32 flex items-end gap-2 border-b border-[#30363D] pb-2">
          {[12, 18, 24, 45, 60, 32, 48].map((val, idx) => (
            <div key={idx} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t bg-[#3FB950] hover:bg-[#2EA043] transition-all"
                style={{ height: `${val * 1.8}px` }}
              />
              <span className="text-[10px] text-[#7D8590]">Day {idx + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
