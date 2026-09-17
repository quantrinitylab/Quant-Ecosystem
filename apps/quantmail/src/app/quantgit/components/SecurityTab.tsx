'use client';

import React from 'react';
import type { SecurityAlert } from '../types';

export interface SecurityTabProps {
  securityAlerts: SecurityAlert[];
  showToast: (message: string) => void;
}

export function SecurityTab({ securityAlerts, showToast }: SecurityTabProps) {
  return (
    <div className="space-y-4 text-xs">
      <div className="p-4 rounded-md bg-[#161B22] border border-[#30363D] flex items-center justify-between">
        <div>
          <h3 className="font-bold text-white text-sm">Security Overview</h3>
          <p className="text-[#7D8590] mt-0.5">
            Dependabot alerts, CodeQL static analysis & secret scanning.
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full bg-[#E3B341]/20 text-[#E3B341] font-bold">
          {securityAlerts.filter((s) => s.state === 'open').length} Open Alerts
        </span>
      </div>

      <div className="border border-[#30363D] rounded-md bg-[#0D1117] divide-y divide-[#21262D]">
        {securityAlerts.map((sec) => (
          <div
            key={sec.id}
            className="p-4 hover:bg-[#161B22] transition-colors flex items-center justify-between gap-4"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-white">
                <span
                  className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                    sec.severity === 'moderate'
                      ? 'bg-[#D29922]/20 text-[#D29922]'
                      : 'bg-[#7D8590]/20 text-[#7D8590]'
                  }`}
                >
                  {sec.severity}
                </span>
                <span>{sec.package}</span>
                <span className="font-mono text-[#58A6FF]">{sec.cve}</span>
              </div>
              <p className="text-[11px] text-[#7D8590]">{sec.title}</p>
            </div>
            <button
              type="button"
              onClick={() => showToast(`Remediation dispatched for ${sec.cve}`)}
              className="px-3 py-1 rounded bg-[#21262D] border border-[#30363D] text-[#58A6FF] font-semibold hover:bg-[#30363D]"
            >
              Create fix PR
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
