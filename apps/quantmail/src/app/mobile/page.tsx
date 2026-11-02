'use client';

import { useEffect, useState } from 'react';
import { MobileInboxFlowSuite } from '../../components/MobileInboxFlowSuite';

export default function MobilePreviewPage() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isFrameMode, setIsFrameMode] = useState<boolean>(true);

  useEffect(() => {
    // Populate demo local storage tokens so local mock views operate seamlessly
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
    <div className={`min-h-screen w-full transition-colors ${theme === 'dark' ? 'bg-[#0B0F17] text-white' : 'bg-[#F1F5F9] text-slate-900'}`}>
      {/* Top Banner & Quick Controls for Desktop Previewers */}
      <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--quant-border)] bg-[var(--quant-card)]/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <span className="grid size-7 place-items-center rounded-lg bg-[#0078D4] text-xs font-bold text-white shadow-sm">
            Q
          </span>
          <div>
            <h1 className="text-xs font-bold tracking-tight">QuantMail Mobile Suite</h1>
            <p className="text-[10px] text-[var(--quant-muted-foreground)]">110 Reverse-Engineered Flows • Live Interactive</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Switcher */}
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--quant-surface-hover)]"
          >
            <span>{theme === 'light' ? '☀️ Light' : '🌙 Dark'}</span>
          </button>

          {/* Device Frame Toggle */}
          <button
            type="button"
            onClick={() => setIsFrameMode((f) => !f)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--quant-border)] bg-[var(--quant-surface)] px-2.5 py-1 text-xs font-medium hover:bg-[var(--quant-surface-hover)]"
          >
            <span>{isFrameMode ? '📱 iPhone 15 Frame' : '🖥️ Fullscreen'}</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex w-full items-center justify-center p-0 md:py-6">
        {isFrameMode ? (
          <div className="relative mx-auto flex h-[844px] w-[390px] flex-col overflow-hidden rounded-[44px] border-[6px] border-slate-800 bg-[var(--quant-background)] shadow-2xl ring-1 ring-slate-900/10">
            {/* Dynamic Island Notch */}
            <div className="pointer-events-none absolute left-1/2 top-2.5 z-50 h-5 w-24 -translate-x-1/2 rounded-full bg-black shadow-inner" />

            {/* Mobile Inbox Flow Suite */}
            <div className="relative h-full w-full overflow-hidden">
              <MobileInboxFlowSuite />
            </div>
          </div>
        ) : (
          <div className="relative h-screen w-full overflow-hidden bg-[var(--quant-background)]">
            <MobileInboxFlowSuite />
          </div>
        )}
      </main>
    </div>
  );
}
