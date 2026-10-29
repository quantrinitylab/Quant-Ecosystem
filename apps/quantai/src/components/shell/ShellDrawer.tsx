'use client';

import React from 'react';
import Link from 'next/link';

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/feed', label: 'Feed' },
  { href: '/ideas', label: 'Ideas' },
  { href: '/goals', label: 'Goals' },
  { href: '/plan', label: 'Plan' },
  { href: '/voice', label: 'Voice' },
  { href: '/settings', label: 'Settings' },
];

export function ShellDrawer(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  if (!open) {
    return null;
  }
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        display: 'flex',
      }}
    >
      <div
        data-testid="shell-drawer-backdrop"
        aria-hidden="true"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
        }}
      />
      <aside
        aria-label="Navigation"
        style={{
          position: 'relative',
          width: '16rem',
          maxWidth: '80vw',
          height: '100%',
          background: '#0F0F14',
          color: '#f8fafc',
          borderRight: '1px solid #1e293b',
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {/* Original geometric Q motif: a ring with a short tail. No
                competitor mark — no orb, slash, starburst, or knot. */}
            <svg
              aria-hidden="true"
              width="28"
              height="28"
              viewBox="0 0 28 28"
              fill="none"
            >
              <circle
                cx="12"
                cy="12"
                r="9"
                stroke="#8B5CF6"
                strokeWidth="2.5"
              />
              <line
                x1="18"
                y1="18"
                x2="24"
                y2="24"
                stroke="#8B5CF6"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
            <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>
              QuantAI
            </span>
          </div>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={onClose}
            style={{
              background: '#1a1a24',
              color: '#f8fafc',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              width: '2rem',
              height: '2rem',
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1,
            }}
          >
            X
          </button>
        </div>
        <nav>
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
            }}
          >
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  style={{
                    display: 'block',
                    padding: '0.625rem 0.75rem',
                    borderRadius: '0.5rem',
                    background: '#1a1a24',
                    color: '#f8fafc',
                    textDecoration: 'none',
                    fontSize: '0.9375rem',
                  }}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
