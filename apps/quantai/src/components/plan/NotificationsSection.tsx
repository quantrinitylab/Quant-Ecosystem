'use client';

// ============================================================================
// NotificationsSection — notification preferences.
// HONEST: no notification-preferences backend exists in QuantAI yet, so prefs
// are stored on this device (localStorage) and labeled as such.
// ============================================================================

import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'quanty-notification-prefs';

interface NotifPrefs {
  push: boolean;
  email: boolean;
  inApp: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
}

const DEFAULTS: NotifPrefs = {
  push: true,
  email: true,
  inApp: true,
  quietHours: false,
  quietStart: '22:00',
  quietEnd: '08:00',
};

function load(): NotifPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULTS;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-[#30D158]' : 'bg-white/20'}`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export default function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPrefs(load());
    setReady(true);
  }, []);

  const update = (patch: Partial<NotifPrefs>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  if (!ready) return <p className="text-[14px] text-white/50">Loading…</p>;

  return (
    <div>
      <p className="mb-3 text-[13px] text-white/50">
        Saved on this device. Server-side notification settings are coming soon.
      </p>
      <ul className="divide-y divide-white/10">
        {(
          [
            ['push', 'Push notifications'],
            ['email', 'Email notifications'],
            ['inApp', 'In-app notifications'],
          ] as const
        ).map(([key, label]) => (
          <li key={key} className="flex items-center justify-between py-3">
            <span className="text-[15px] text-white">{label}</span>
            <Toggle on={prefs[key]} onChange={(v) => update({ [key]: v })} label={label} />
          </li>
        ))}
        <li className="py-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-white">Quiet hours</span>
            <Toggle
              on={prefs.quietHours}
              onChange={(v) => update({ quietHours: v })}
              label="Quiet hours"
            />
          </div>
          {prefs.quietHours && (
            <div className="mt-3 flex items-center gap-3">
              <label className="text-[13px] text-white/50">
                From{' '}
                <input
                  type="time"
                  value={prefs.quietStart}
                  onChange={(e) => update({ quietStart: e.target.value })}
                  className="rounded-lg bg-white/10 px-2 py-1 text-[14px] text-white"
                />
              </label>
              <label className="text-[13px] text-white/50">
                To{' '}
                <input
                  type="time"
                  value={prefs.quietEnd}
                  onChange={(e) => update({ quietEnd: e.target.value })}
                  className="rounded-lg bg-white/10 px-2 py-1 text-[14px] text-white"
                />
              </label>
            </div>
          )}
        </li>
      </ul>
    </div>
  );
}
