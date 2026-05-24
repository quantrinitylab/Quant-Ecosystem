// ============================================================================
// QuantAI - Device Control Panel Page
// ============================================================================

import type { Device, DeviceCommand } from '../types';

interface DevicePageProps { devices: Device[]; selectedDevice: Device | null; commandHistory: DeviceCommand[]; onSelectDevice: (id: string) => void; onSendCommand: (type: string, params: any) => void; onRegisterDevice: () => void; }

export function DevicePage({ devices, selectedDevice, commandHistory, onSelectDevice, onSendCommand, onRegisterDevice }: DevicePageProps) {
  return { type: 'div', className: 'device-page', children: [
    { type: 'aside', className: 'device-list', children: [
      { type: 'h2', text: 'Devices' },
      ...devices.map(d => ({ type: 'div', className: `device-item ${d.id === selectedDevice?.id ? 'active' : ''}`, onClick: () => onSelectDevice(d.id), children: [{ type: 'span', className: `status-${d.status}` }, { type: 'span', text: d.name }, { type: 'small', text: `${d.type} - ${d.os}` }, d.battery !== undefined ? { type: 'span', text: `${d.battery}%` } : null] })),
      { type: 'button', text: '+ Add Device', onClick: onRegisterDevice },
    ]},
    selectedDevice ? { type: 'main', className: 'device-control', children: [
      { type: 'h2', text: selectedDevice.name },
      { type: 'div', className: 'device-info', children: [{ type: 'span', text: `${selectedDevice.os} ${selectedDevice.osVersion}` }, { type: 'span', text: `Status: ${selectedDevice.status}` }] },
      { type: 'div', className: 'quick-actions', children: [
        { type: 'button', text: 'Screenshot', onClick: () => onSendCommand('screenshot', {}) },
        { type: 'button', text: 'Open App', onClick: () => onSendCommand('open-app', { appId: '' }) },
        { type: 'button', text: 'Type', onClick: () => onSendCommand('type', { text: '' }) },
        { type: 'button', text: 'Click', onClick: () => onSendCommand('click', { x: 0, y: 0 }) },
      ]},
      { type: 'div', className: 'capabilities', children: selectedDevice.capabilities.map(c => ({ type: 'span', className: `cap ${c.enabled ? 'enabled' : 'disabled'}`, text: c.name })) },
      { type: 'div', className: 'command-history', children: [
        { type: 'h3', text: 'History' },
        ...commandHistory.slice(-10).map(cmd => ({ type: 'div', className: `cmd-item ${cmd.status}`, children: [{ type: 'span', text: cmd.type }, { type: 'span', text: cmd.status }] })),
      ]},
    ]} : { type: 'div', className: 'no-device', text: 'Select a device to control' },
  ]};
}

export default DevicePage;
