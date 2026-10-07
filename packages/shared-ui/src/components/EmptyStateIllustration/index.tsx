// ============================================================================
// Shared UI - EmptyStateIllustration Component
// ============================================================================

import React from 'react';

export type EmptyStateVariant = 'no-data' | 'no-results' | 'no-connection' | 'first-time';

export interface EmptyStateIllustrationProps {
  variant: EmptyStateVariant;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const defaultCopy: Record<EmptyStateVariant, { title: string; description: string }> = {
  'no-data': {
    title: 'Nothing here yet',
    description: 'Start adding items and they will show up here. You are all set to begin!',
  },
  'no-results': {
    title: 'No results found',
    description:
      'We could not find what you were looking for. Try adjusting your search or filters.',
  },
  'no-connection': {
    title: 'Connection lost',
    description:
      'It looks like your internet connection dropped. Please check your network and try again.',
  },
  'first-time': {
    title: 'Welcome aboard!',
    description:
      'Great to have you here. Let us get you started with a quick walkthrough of the essentials.',
  },
};

function NoDataSvg() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <rect x="20" y="30" width="80" height="60" rx="8" stroke="currentColor" strokeWidth="2" />
      <line
        x1="40"
        y1="55"
        x2="80"
        y2="55"
        stroke="var(--app-color, currentColor)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="40"
        y1="65"
        x2="70"
        y2="65"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <line
        x1="40"
        y1="75"
        x2="60"
        y2="75"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.3"
      />
      <circle cx="60" cy="45" r="5" stroke="var(--app-color, currentColor)" strokeWidth="2" />
    </svg>
  );
}

function NoResultsSvg() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="55" cy="55" r="25" stroke="currentColor" strokeWidth="2" />
      <line
        x1="73"
        y1="73"
        x2="95"
        y2="95"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="45"
        y1="50"
        x2="65"
        y2="50"
        stroke="var(--app-color, currentColor)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <line
        x1="45"
        y1="60"
        x2="60"
        y2="60"
        stroke="var(--app-color, currentColor)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

function NoConnectionSvg() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <path
        d="M30 80 L60 40 L90 80"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="90" r="4" fill="var(--app-color, currentColor)" />
      <line
        x1="60"
        y1="55"
        x2="60"
        y2="75"
        stroke="var(--app-color, currentColor)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line
        x1="20"
        y1="95"
        x2="100"
        y2="95"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}

function FirstTimeSvg() {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <circle cx="60" cy="60" r="35" stroke="currentColor" strokeWidth="2" />
      <path
        d="M60 35 L60 60 L78 68"
        stroke="var(--app-color, currentColor)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="60" r="3" fill="var(--app-color, currentColor)" />
      <path
        d="M45 95 Q60 105 75 95"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
    </svg>
  );
}

const illustrations: Record<EmptyStateVariant, React.FC> = {
  'no-data': NoDataSvg,
  'no-results': NoResultsSvg,
  'no-connection': NoConnectionSvg,
  'first-time': FirstTimeSvg,
};

export const EmptyStateIllustration: React.FC<EmptyStateIllustrationProps> = ({
  variant,
  title,
  description,
  actionLabel,
  onAction,
}) => {
  const Illustration = illustrations[variant];
  const copy = defaultCopy[variant];
  const displayTitle = title || copy.title;
  const displayDescription = description || copy.description;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        gap: '16px',
      }}
      role="status"
    >
      <div style={{ color: 'var(--quant-muted-foreground, #64748b)' }}>
        <Illustration />
      </div>
      <h3
        style={{
          fontSize: '18px',
          fontWeight: 600,
          color: 'var(--quant-foreground, #0f172a)',
          margin: 0,
        }}
      >
        {displayTitle}
      </h3>
      <p
        style={{
          fontSize: '14px',
          color: 'var(--quant-muted-foreground, #64748b)',
          maxWidth: '320px',
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {displayDescription}
      </p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          type="button"
          style={{
            marginTop: '8px',
            padding: '8px 16px',
            fontSize: '14px',
            fontWeight: 500,
            borderRadius: 'var(--quant-radius, 0.5rem)',
            border: 'none',
            backgroundColor: 'var(--brand-primary, #4F46E5)',
            color: '#ffffff',
            cursor: 'pointer',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};
