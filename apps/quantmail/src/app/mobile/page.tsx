'use client';

import { useEffect, useState } from 'react';
import { MobileInboxFlowSuite } from '../../components/MobileInboxFlowSuite';

export default function MobilePreviewPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    try {
      if (!localStorage.getItem('quantmail_access_token')) {
        localStorage.setItem('quantmail_access_token', 'live-demo-token');
      }
      if (!localStorage.getItem('quantmail_user')) {
        localStorage.setItem(
          'quantmail_user',
          JSON.stringify({
            id: 'usr_demo_01',
            email: 'alexsmith@quantrinity.in',
            username: 'alexsmith',
            displayName: 'Alex Smith',
          })
        );
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return (
    <div className={`min-h-screen w-full transition-colors ${theme === 'dark' ? 'bg-[#090A0E] text-white' : 'bg-[#F8FAFC] text-slate-900'}`}>
      {/* Top Floating Control Capsule */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-[var(--quant-border)] bg-[var(--quant-card)]/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-[#0078D4] text-xs font-bold text-white shadow-sm">
            Q
          </span>
          <div>
            <h1 className="text-xs font-bold tracking-tight">QuantMail Mobile</h1>
            <p className="text-[10px] text-[var(--quant-muted-foreground)]">Native Production Mobile Experience</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Switcher */}
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--quant-surface-hover)] transition-colors"
          >
            <span>{theme === 'light' ? '☀️ Light' : '🌙 Dark'}</span>
          </button>
        </div>
      </header>

      {/* Main Container: Full-screen production mobile web application / PWA */}
      <main className="w-full min-h-screen flex flex-col">
        <MobileInboxFlowSuite />
      </main>
    </div>
  );
}
