// ============================================================================
// QuantAI - DeviceCard Component
// Smart device control card with status, toggle, slider, schedule
// ============================================================================

import React, { useState, useCallback, useMemo } from 'react';

interface DeviceSchedule {
  id: string;
  time: string;
  action: 'on' | 'off';
  repeat: string[];
  isActive: boolean;
}

interface DeviceCardProps {
  id: string;
  name: string;
  type: 'light' | 'thermostat' | 'camera' | 'lock' | 'speaker' | 'blind' | 'plug';
  isOnline: boolean;
  isOn: boolean;
  value?: number;
  unit?: string;
  min?: number;
  max?: number;
  schedules?: DeviceSchedule[];
  lastUpdated?: string;
  onToggle: (id: string) => void;
  onValueChange: (id: string, value: number) => void;
  onScheduleAdd?: (id: string, schedule: Omit<DeviceSchedule, 'id'>) => void;
  onScheduleRemove?: (id: string, scheduleId: string) => void;
}

const DEVICE_ICONS: Record<string, string> = {
  light: '💡',
  thermostat: '🌡️',
  camera: '📷',
  lock: '🔐',
  speaker: '🔊',
  blind: '🪟',
  plug: '🔌',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function DeviceCard({
  id,
  name,
  type,
  isOnline,
  isOn,
  value,
  unit = '%',
  min = 0,
  max = 100,
  schedules = [],
  lastUpdated,
  onToggle,
  onValueChange,
  onScheduleAdd,
  onScheduleRemove,
}: DeviceCardProps): JSX.Element {
  const [showSchedule, setShowSchedule] = useState<boolean>(false);
  const [newTime, setNewTime] = useState<string>('08:00');
  const [newAction, setNewAction] = useState<'on' | 'off'>('on');
  const [newDays, setNewDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

  const statusText = useMemo(() => {
    if (!isOnline) return 'Offline';
    if (!isOn) return 'Off';
    if (value !== undefined) {
      if (type === 'thermostat') return `${value}°C`;
      return `${value}${unit}`;
    }
    return 'On';
  }, [isOnline, isOn, value, unit, type]);

  const handleToggle = useCallback(() => {
    if (isOnline) onToggle(id);
  }, [id, isOnline, onToggle]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange(id, Number(e.target.value));
  }, [id, onValueChange]);

  const handleAddSchedule = useCallback(() => {
    if (onScheduleAdd) {
      onScheduleAdd(id, {
        time: newTime,
        action: newAction,
        repeat: newDays,
        isActive: true,
      });
    }
    setShowSchedule(false);
  }, [id, newTime, newAction, newDays, onScheduleAdd]);

  const handleDayToggle = useCallback((day: string) => {
    setNewDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  }, []);

  return (
    <div className={`device-card-component ${type} ${isOn ? 'is-on' : 'is-off'} ${!isOnline ? 'offline' : ''}`}>
      <div className="card-top">
        <span className="device-icon">{DEVICE_ICONS[type] || '📱'}</span>
        <div className="device-details">
          <h4 className="device-name">{name}</h4>
          <span className={`device-status ${isOnline ? 'online' : 'offline'}`}>
            {statusText}
          </span>
        </div>
        <button
          className={`toggle-btn ${isOn ? 'on' : 'off'}`}
          onClick={handleToggle}
          disabled={!isOnline}
          aria-label={`Toggle ${name}`}
        >
          <span className="toggle-indicator" />
        </button>
      </div>

      {isOnline && isOn && value !== undefined && (
        <div className="card-slider">
          <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={handleSliderChange}
            className="device-slider"
          />
          <div className="slider-labels">
            <span>{min}{unit}</span>
            <span className="current-value">{value}{unit}</span>
            <span>{max}{unit}</span>
          </div>
        </div>
      )}

      {schedules.length > 0 && (
        <div className="card-schedules">
          {schedules.map(schedule => (
            <div key={schedule.id} className={`schedule-item ${schedule.isActive ? 'active' : ''}`}>
              <span className="schedule-time">{schedule.time}</span>
              <span className="schedule-action">{schedule.action}</span>
              <span className="schedule-days">{schedule.repeat.join(', ')}</span>
              {onScheduleRemove && (
                <button
                  className="btn-remove-schedule"
                  onClick={() => onScheduleRemove(id, schedule.id)}
                >
                  x
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="card-footer">
        {lastUpdated && (
          <span className="last-updated">
            Updated {new Date(lastUpdated).toLocaleTimeString()}
          </span>
        )}
        <button
          className="btn-schedule"
          onClick={() => setShowSchedule(!showSchedule)}
        >
          ⏰
        </button>
      </div>

      {showSchedule && (
        <div className="schedule-form">
          <h5>Add Schedule</h5>
          <div className="schedule-row">
            <input
              type="time"
              value={newTime}
              onChange={e => setNewTime(e.target.value)}
              className="time-input"
            />
            <select value={newAction} onChange={e => setNewAction(e.target.value as 'on' | 'off')}>
              <option value="on">Turn On</option>
              <option value="off">Turn Off</option>
            </select>
          </div>
          <div className="days-selector">
            {DAYS.map(day => (
              <button
                key={day}
                className={`day-btn ${newDays.includes(day) ? 'selected' : ''}`}
                onClick={() => handleDayToggle(day)}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="schedule-actions">
            <button className="btn-add" onClick={handleAddSchedule}>Add</button>
            <button className="btn-cancel" onClick={() => setShowSchedule(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
