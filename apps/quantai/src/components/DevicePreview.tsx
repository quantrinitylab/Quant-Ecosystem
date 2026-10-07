// ============================================================================
// QuantAI - Device Preview Component
// Device screen mirror and control interface
// ============================================================================

import type { Device } from '../types';

interface DevicePreviewProps {
  device: Device;
  screenCapture: string | null;
  onTap: (x: number, y: number) => void;
  onSwipe: (direction: string) => void;
  onType: (text: string) => void;
}

export function DevicePreview({
  device,
  screenCapture,
  onTap,
  onSwipe,
  // TODO: wire up handler
  onType: _onType,
}: DevicePreviewProps) {
  return (
    <div
      className="flex flex-col items-center gap-4 p-4"
      aria-label={`Device preview for ${device.name}`}
    >
      {/* Device Frame */}
      <div
        className={`relative rounded-3xl border-4 border-gray-700 bg-black overflow-hidden shadow-xl ${
          device.type === 'phone'
            ? 'w-[300px]'
            : device.type === 'tablet'
              ? 'w-[400px]'
              : 'w-[500px]'
        }`}
      >
        {/* Status Bar */}
        <div className="flex items-center justify-between px-4 py-1 bg-gray-900 text-xs text-gray-400">
          <span>{device.name}</span>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                device.status === 'online'
                  ? 'bg-green-400'
                  : device.status === 'busy'
                    ? 'bg-yellow-400'
                    : 'bg-gray-500'
              }`}
              aria-label={`Status: ${device.status}`}
            />
            {device.battery !== undefined && (
              <span aria-label={`Battery: ${device.battery}%`}>{device.battery}%</span>
            )}
          </div>
        </div>

        {/* Screen Area */}
        <div
          className="w-full bg-gray-950"
          style={{
            height: device.screenResolution?.height
              ? Math.min(
                  600,
                  device.screenResolution.height * (300 / (device.screenResolution.width || 300)),
                )
              : 600,
          }}
        >
          {screenCapture ? (
            <img
              src={screenCapture}
              alt={`Screen capture of ${device.name}`}
              className="w-full h-full object-contain"
            />
          ) : (
            <div className="flex items-center justify-center w-full h-full text-gray-500 text-sm">
              No capture available
            </div>
          )}
        </div>
      </div>

      {/* Device Info */}
      <div className="text-center text-sm text-gray-400">
        <span>
          {device.os} {device.osVersion}
        </span>
        {device.screenResolution && (
          <span className="ml-2">
            ({device.screenResolution.width}x{device.screenResolution.height})
          </span>
        )}
      </div>

      {/* Device Actions */}
      <div className="flex items-center gap-2" role="toolbar" aria-label="Device controls">
        <button
          type="button"
          onClick={() => onTap(150, 580)}
          className="min-w-[44px] min-h-[44px] px-4 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-600 transition-colors"
          aria-label="Home button"
        >
          Home
        </button>
        <button
          type="button"
          onClick={() => onSwipe('right')}
          className="min-w-[44px] min-h-[44px] px-4 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-600 transition-colors"
          aria-label="Back button"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onSwipe('up')}
          className="min-w-[44px] min-h-[44px] px-4 py-2 rounded-lg bg-gray-800 text-gray-200 hover:bg-gray-700 border border-gray-600 transition-colors"
          aria-label="Recent apps button"
        >
          Recent
        </button>
      </div>
    </div>
  );
}

export default DevicePreview;
