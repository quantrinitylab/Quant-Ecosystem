'use client';

// ============================================================================
// PlanSection — expandable dark card section used by the /plan link rows.
// ============================================================================

import React, { useState } from 'react';

interface PlanSectionProps {
  icon: string;
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function PlanSection({ icon, title, subtitle, badge, defaultOpen, children }: PlanSectionProps) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className="overflow-hidden rounded-3xl bg-[#1C1C1E]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="text-[22px]" aria-hidden="true">{icon}</span>
        <span className="flex-1">
          <span className="block text-[17px] text-white">{title}</span>
          {subtitle && <span className="block text-[13px] text-white/50">{subtitle}</span>}
        </span>
        {badge && (
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] text-white/60">{badge}</span>
        )}
        <span className={`text-white/40 transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden="true">›</span>
      </button>
      {open && <div className="border-t border-white/10 px-5 py-4">{children}</div>}
    </section>
  );
}
