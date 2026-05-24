// ============================================================================
// QuantAI - Device Preview Component
// Device screen mirror and control interface
// ============================================================================

import type { Device } from '../types';

interface DevicePreviewProps { device: Device; screenCapture: string | null; onTap: (x: number, y: number) => void; onSwipe: (direction: string) => void; onType: (text: string) => void; }

export function DevicePreview({ device, screenCapture, onTap, onSwipe, onType }: DevicePreviewProps) {
  return { type: 'div', className: 'device-preview', children: [
    { type: 'div', className: `device-frame device-${device.type}`, children: [
      { type: 'div', className: 'screen', style: { width: device.screenResolution?.width ? 300 : 300, height: device.screenResolution?.height ? 600 : 600 }, children: [
        screenCapture ? { type: 'img', src: screenCapture, className: 'screen-capture' } : { type: 'div', className: 'screen-placeholder', text: 'No capture available' },
      ]},
    ]},
    { type: 'div', className: 'device-actions', children: [
      { type: 'button', text: 'Home', onClick: () => onTap(150, 580) },
      { type: 'button', text: 'Back', onClick: () => onSwipe('right') },
      { type: 'button', text: 'Recent', onClick: () => onSwipe('up') },
    ]},
  ]};
}

export default DevicePreview;
