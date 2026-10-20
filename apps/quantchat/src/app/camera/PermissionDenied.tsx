'use client';

/**
 * Camera failure surface (QC-F-427): every getUserMedia failure lands in
 * exactly one honest terminal kind — denied / no-camera / busy /
 * unsupported / error — with its true reason copy and a real "Try again"
 * retry that re-calls initializeCamera. No kind borrows another kind's
 * diagnosis: a device with no camera never sees permission copy or the
 * permission help link.
 */
export type CameraFailureKind = 'denied' | 'no-camera' | 'busy' | 'unsupported' | 'error';

const FAILURE_COPY: Record<
  CameraFailureKind,
  { title: string; body: string; showHelpLink: boolean }
> = {
  denied: {
    title: 'Camera access is required',
    body: 'QuantChat needs camera and microphone access to take photos and record videos. Please enable camera permissions in your browser settings.',
    showHelpLink: true,
  },
  'no-camera': {
    title: 'No camera found',
    body: "We couldn't find a camera on this device. Connect a camera, then try again.",
    showHelpLink: false,
  },
  busy: {
    title: 'Camera is busy',
    body: 'Your camera is being used by another app or tab. Close it there, then try again.',
    showHelpLink: false,
  },
  unsupported: {
    title: "Camera isn't available here",
    body: "This browser or page doesn't provide camera access. Try a secure (HTTPS) page in a browser with camera support, then try again.",
    showHelpLink: false,
  },
  error: {
    title: "Couldn't start the camera",
    body: 'Something went wrong while starting the camera. Please try again.',
    showHelpLink: false,
  },
};

export function PermissionDenied({
  failure,
  onRetry,
}: {
  failure: CameraFailureKind;
  onRetry: () => void;
}) {
  const copy = FAILURE_COPY[failure];
  return (
    <div
      role="alert"
      className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 px-8"
    >
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
      <h2 className="text-white text-lg font-semibold mb-2 text-center">{copy.title}</h2>
      <p className="text-gray-400 text-sm text-center mb-6 max-w-xs">{copy.body}</p>

      {/* Retry — re-calls initializeCamera with the current facing mode */}
      <button
        type="button"
        onClick={onRetry}
        className="min-h-[44px] px-5 mb-4 rounded-full bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-400 transition-colors"
      >
        Try again
      </button>

      {/* Learn how link — denied only: the remedy is a permission setting */}
      {copy.showHelpLink && (
        <a
          href="https://support.google.com/chrome/answer/2693767"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 text-sm font-medium underline underline-offset-2 hover:text-emerald-300 transition-colors"
        >
          Learn how to enable
        </a>
      )}
    </div>
  );
}
