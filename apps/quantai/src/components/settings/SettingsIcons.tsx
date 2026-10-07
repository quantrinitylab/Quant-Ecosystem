// ============================================================================
// SettingsIcons — inline SVG line icons for the Quanty Settings screen.
// Muse-style: 1.5px stroke, round caps, currentColor.
// ============================================================================
import React from 'react';

function Base({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const LockIcon = () => (
  <Base>
    <rect x="4" y="10" width="16" height="10" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Base>
);

export const AssistantIcon = () => (
  <Base>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
  </Base>
);

export const HomePlusIcon = () => (
  <Base>
    <path d="M3 10.5L12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
    <path d="M12 13v6M9 16h6" />
  </Base>
);

export const GiftIcon = () => (
  <Base>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v8h14v-8M12 8v12M12 8s-4.5.3-5.5-1.5C5.7 4.9 7 4 8 4.5 9.5 5.2 12 8 12 8zM12 8s4.5.3 5.5-1.5C18.3 4.9 17 4 16 4.5 14.5 5.2 12 8 12 8z" />
  </Base>
);

export const DataIcon = () => (
  <Base>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
  </Base>
);

export const ReportIcon = () => (
  <Base>
    <path d="M4 21V4" />
    <path d="M4 4h12l-2 4 2 4H4" />
  </Base>
);

export const HelpIcon = () => (
  <Base>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.3c-.8.3-.9 1-.9 1.7" />
    <circle cx="12" cy="17" r="0.5" fill="currentColor" />
  </Base>
);

export const LegalIcon = () => (
  <Base>
    <path d="M12 3v18M5 6l7-3 7 3M5 6l-2 6a3.5 3.5 0 0 0 7 0L8 6M19 6l2 6a3.5 3.5 0 0 1-7 0l2-6M8 21h8" />
  </Base>
);

export const UserIcon = () => (
  <Base>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.5-6.5 8-6.5s8 2.5 8 6.5" />
  </Base>
);

export const LogoutIcon = () => (
  <Base>
    <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Base>
);

export const ChevronRightIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4 text-white/30"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const CloseIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const BackIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
    aria-hidden="true"
  >
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

export const CheckIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4"
    aria-hidden="true"
  >
    <path d="M4 12.5l5 5L20 6.5" />
  </svg>
);
