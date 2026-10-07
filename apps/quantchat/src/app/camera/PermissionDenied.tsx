'use client';

/**
 * PermissionDenied renders a graceful inline message when
 * getUserMedia throws NotAllowedError. No crash, no blank screen.
 */
export function PermissionDenied() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 px-8">
      {/* Camera icon */}
      <div className="w-20 h-20 rounded-full bg-gray-800 flex items-center justify-center mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-10 h-10 text-gray-400"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      </div>

      {/* Message */}
      <h2 className="text-white text-lg font-semibold mb-2 text-center">
        Camera access is required
      </h2>
      <p className="text-gray-400 text-sm text-center mb-6 max-w-xs">
        QuantChat needs camera access to take photos and record videos. Please enable camera
        permissions in your browser settings.
      </p>

      {/* Learn how link */}
      <a
        href="https://support.google.com/chrome/answer/2693767"
        target="_blank"
        rel="noopener noreferrer"
        className="text-emerald-400 text-sm font-medium underline underline-offset-2 hover:text-emerald-300 transition-colors"
      >
        Learn how to enable
      </a>
    </div>
  );
}
